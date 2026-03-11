import './ledger-polyfills';
import Sui from '@mysten/ledgerjs-hw-app-sui';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import { Buffer } from 'buffer';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { toSerializedSignature } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';

import { createSuiClient, formatSuiAmount, type SuiNetwork } from './index';

export const SUI_LEDGER_ACCOUNT_SCAN_BATCH_SIZE = 12;

export type SuiLedgerDiscoveredAccount = {
  index: number;
  publicKey: string;
  derivationPath: string;
  balanceMist: string;
  balanceLabel: string;
  label: string;
};

export async function requestSuiLedgerAccounts(input: {
  network: SuiNetwork;
  startIndex?: number;
  count?: number;
  customRpcUrl?: string | null;
}): Promise<SuiLedgerDiscoveredAccount[]> {
  ensureLedgerRuntimeGlobals();
  const startIndex = input.startIndex ?? 0;
  const count = input.count ?? SUI_LEDGER_ACCOUNT_SCAN_BATCH_SIZE;
  const transport = await TransportWebHID.request();

  try {
    const sui = new Sui(transport as never);
    const client = createSuiClient(input.network, input.customRpcUrl);
    const discovered = await Promise.all(
      Array.from({ length: count }, (_, offset) => startIndex + offset).map(async (index) => {
        const derivationPath = toSuiLedgerDerivationPath(index);
        const result = await sui.getPublicKey(derivationPath, false);
        const publicKey = new Ed25519PublicKey(result.publicKey);
        const address = publicKey.toSuiAddress();
        const balance = await client.getBalance({
          owner: normalizeSuiAddress(address)
        });

        return {
          index,
          publicKey: address,
          derivationPath,
          balanceMist: balance.totalBalance,
          balanceLabel: `${formatSuiAmount(balance.totalBalance, 9)} SUI`,
          label: `Ledger account ${index + 1}`
        } satisfies SuiLedgerDiscoveredAccount;
      })
    );

    return discovered.sort((left, right) => {
      const leftBalance = BigInt(left.balanceMist);
      const rightBalance = BigInt(right.balanceMist);
      if (leftBalance === rightBalance) {
        return left.index - right.index;
      }
      return leftBalance > rightBalance ? -1 : 1;
    });
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function sendSuiWithLedger(
  network: SuiNetwork,
  derivationPath: string,
  input: { recipient: string; amountMist: bigint; customRpcUrl?: string | null }
): Promise<string> {
  return executeSuiLedgerTransaction(network, derivationPath, input.customRpcUrl, (transaction, sender) => {
    transaction.setSender(sender);
    const [coin] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(input.amountMist.toString())]);
    transaction.transferObjects([coin], transaction.pure.address(normalizeSuiAddress(input.recipient)));
  });
}

export async function sendSuiCoinWithLedger(
  network: SuiNetwork,
  derivationPath: string,
  input: { recipient: string; amountBaseUnits: bigint; coinType: string; customRpcUrl?: string | null }
): Promise<string> {
  return executeSuiLedgerTransaction(network, derivationPath, input.customRpcUrl, async (transaction, sender, client) => {
    transaction.setSender(sender);
    const coins = await client.getCoins({
      owner: normalizeSuiAddress(sender),
      coinType: input.coinType.trim()
    });

    if (!coins.data.length) {
      throw new Error('No coin objects were found for the selected token.');
    }

    const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    if (totalBalance < input.amountBaseUnits) {
      throw new Error('Insufficient token balance.');
    }

    const primaryCoin = transaction.object(coins.data[0].coinObjectId);
    if (coins.data.length > 1) {
      transaction.mergeCoins(
        primaryCoin,
        coins.data.slice(1).map((coin) => transaction.object(coin.coinObjectId))
      );
    }
    const [coin] = transaction.splitCoins(primaryCoin, [transaction.pure.u64(input.amountBaseUnits.toString())]);
    transaction.transferObjects([coin], transaction.pure.address(normalizeSuiAddress(input.recipient)));
  });
}

function toSuiLedgerDerivationPath(index: number) {
  return `44'/784'/${index}'/0'/0'`;
}

async function executeSuiLedgerTransaction(
  network: SuiNetwork,
  derivationPath: string,
  customRpcUrl: string | null | undefined,
  build: (transaction: Transaction, sender: string, client: ReturnType<typeof createSuiClient>) => void | Promise<void>
) {
  ensureLedgerRuntimeGlobals();
  const transport = await TransportWebHID.openConnected();
  if (!transport) {
    throw new Error('Ledger device not found. Connect it and authorize Grape first.');
  }

  try {
    const sui = new Sui(transport as never);
    const client = createSuiClient(network, customRpcUrl);
    const keyResult = await sui.getPublicKey(derivationPath, false);
    const publicKey = new Ed25519PublicKey(keyResult.publicKey);
    const sender = publicKey.toSuiAddress();
    const transaction = new Transaction();

    await build(transaction, sender, client);

    const transactionBytes = await transaction.build({ client });
    const signature = await sui.signTransaction(derivationPath, transactionBytes);
    const serializedSignature = toSerializedSignature({
      signatureScheme: 'ED25519',
      signature: signature.signature,
      publicKey
    });
    const response = await client.executeTransactionBlock({
      transactionBlock: transactionBytes,
      signature: serializedSignature
    });

    if (!response.digest) {
      throw new Error('Sui transaction did not return a digest.');
    }

    return response.digest;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

function ensureLedgerRuntimeGlobals() {
  if (typeof globalThis.Buffer === 'undefined') {
    (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.window.Buffer === 'undefined') {
    (globalThis.window as Window & typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
}

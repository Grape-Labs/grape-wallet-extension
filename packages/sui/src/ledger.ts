import './ledger-polyfills';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import { Buffer } from 'buffer';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { toSerializedSignature } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';

import { createSuiClient, formatSuiAmount, type SuiNetwork } from './index';

export const SUI_LEDGER_ACCOUNT_SCAN_BATCH_SIZE = 12;

type LedgerTransport = Pick<TransportWebHID, 'send' | 'close'>;

enum LedgerToHost {
  RESULT_ACCUMULATING = 0,
  RESULT_FINAL = 1,
  GET_CHUNK = 2,
  PUT_CHUNK = 3
}

enum HostToLedger {
  START = 0,
  GET_CHUNK_RESPONSE_SUCCESS = 1,
  GET_CHUNK_RESPONSE_FAILURE = 2,
  PUT_CHUNK_RESPONSE = 3,
  RESULT_ACCUMULATING_RESPONSE = 4
}

class SuiLedgerApp {
  constructor(private readonly transport: LedgerTransport) {}

  async getPublicKey(path: string, displayOnDevice = false): Promise<{ publicKey: Uint8Array; address: Uint8Array }> {
    const response = await this.sendChunks(0x00, displayOnDevice ? 0x01 : 0x02, 0x00, 0x00, buildBip32KeyPayload(path));
    const keySize = response[0] ?? 0;
    const publicKey = response.slice(1, keySize + 1);
    const addressSize = response[keySize + 1] ?? 0;
    const address = response.slice(keySize + 2, keySize + 2 + addressSize);

    return {
      publicKey: new Uint8Array(publicKey),
      address: new Uint8Array(address)
    };
  }

  async signTransaction(path: string, transactionBytes: Uint8Array): Promise<{ signature: Uint8Array }> {
    const rawTransaction = Buffer.from(transactionBytes);
    const transactionSize = Buffer.alloc(4);
    transactionSize.writeUInt32LE(rawTransaction.length, 0);

    const signature = await this.sendChunks(0x00, 0x03, 0x00, 0x00, [
      Buffer.concat([transactionSize, rawTransaction]),
      buildBip32KeyPayload(path)
    ]);

    return {
      signature: new Uint8Array(signature)
    };
  }

  private async sendChunks(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    payload: Buffer | Buffer[],
    extraData = new Map<string, Buffer>()
  ): Promise<Buffer> {
    const chunkSize = 180;
    const payloadItems = Array.isArray(payload) ? payload : [payload];
    const parameterList: Buffer[] = [];
    let data = new Map<string, Buffer>(extraData);

    for (const item of payloadItems) {
      const chunks: Buffer[] = [];
      for (let offset = 0; offset < item.length; offset += chunkSize) {
        chunks.push(item.slice(offset, offset + chunkSize));
      }

      let lastHash = Buffer.alloc(32);
      for (let index = chunks.length - 1; index >= 0; index -= 1) {
        const linkedChunk = Buffer.concat([lastHash, chunks[index]]);
        lastHash = Buffer.from(await sha256Bytes(linkedChunk));
        data.set(lastHash.toString('hex'), linkedChunk);
      }

      parameterList.push(lastHash);
    }

    return this.handleBlocksProtocol(
      cla,
      ins,
      p1,
      p2,
      Buffer.concat([Buffer.from([HostToLedger.START]), ...parameterList]),
      data
    );
  }

  private async handleBlocksProtocol(
    cla: number,
    ins: number,
    p1: number,
    p2: number,
    initialPayload: Buffer,
    data: Map<string, Buffer>
  ): Promise<Buffer> {
    let payload = initialPayload;
    let result = Buffer.alloc(0);
    let instruction = LedgerToHost.RESULT_ACCUMULATING;

    do {
      const response = Buffer.from(await this.transport.send(cla, ins, p1, p2, payload));
      instruction = response[0] ?? LedgerToHost.RESULT_FINAL;
      const responsePayload = response.slice(1, response.length - 2);

      switch (instruction) {
        case LedgerToHost.RESULT_ACCUMULATING:
        case LedgerToHost.RESULT_FINAL:
          result = Buffer.concat([result, responsePayload]);
          payload = Buffer.from([HostToLedger.RESULT_ACCUMULATING_RESPONSE]);
          break;
        case LedgerToHost.GET_CHUNK: {
          const chunk = data.get(responsePayload.toString('hex'));
          payload = chunk
            ? Buffer.concat([Buffer.from([HostToLedger.GET_CHUNK_RESPONSE_SUCCESS]), chunk])
            : Buffer.from([HostToLedger.GET_CHUNK_RESPONSE_FAILURE]);
          break;
        }
        case LedgerToHost.PUT_CHUNK:
          data.set(Buffer.from(await sha256Bytes(responsePayload)).toString('hex'), responsePayload);
          payload = Buffer.from([HostToLedger.PUT_CHUNK_RESPONSE]);
          break;
        default:
          throw new Error('Unknown response returned from Ledger.');
      }
    } while (instruction !== LedgerToHost.RESULT_FINAL);

    return result;
  }
}

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
  promptForPermission?: boolean;
}): Promise<SuiLedgerDiscoveredAccount[]> {
  ensureLedgerRuntimeGlobals();
  const startIndex = input.startIndex ?? 0;
  const count = input.count ?? SUI_LEDGER_ACCOUNT_SCAN_BATCH_SIZE;
  const transport = await openSuiLedgerTransport(input.promptForPermission ?? true);

  try {
    const sui = new SuiLedgerApp(transport);
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
          balanceMist: balance.balance.balance,
          balanceLabel: `${formatSuiAmount(balance.balance.balance, 9)} SUI`,
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

export async function authorizeSuiLedgerTransport(): Promise<void> {
  const transport = await openSuiLedgerTransport(true);
  await transport.close().catch(() => undefined);
}

export async function signSuiTransactionBytesWithLedger(
  derivationPath: string,
  transactionBytes: Uint8Array
): Promise<{ address: string; bytes: string; signature: string }> {
  ensureLedgerRuntimeGlobals();
  const transport = await TransportWebHID.openConnected();
  if (!transport) {
    throw new Error('Ledger device not found. Connect it and authorize Grape first.');
  }

  try {
    const sui = new SuiLedgerApp(transport);
    const keyResult = await sui.getPublicKey(derivationPath, false);
    const publicKey = new Ed25519PublicKey(keyResult.publicKey);
    const signature = await sui.signTransaction(derivationPath, transactionBytes);

    return {
      address: publicKey.toSuiAddress(),
      bytes: Buffer.from(transactionBytes).toString('base64'),
      signature: toSerializedSignature({
        signatureScheme: 'ED25519',
        signature: signature.signature,
        publicKey
      })
    };
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
    const coins = await client.listCoins({
      owner: normalizeSuiAddress(sender),
      coinType: input.coinType.trim()
    });

    if (!coins.objects.length) {
      throw new Error('No coin objects were found for the selected token.');
    }

    const totalBalance = coins.objects.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    if (totalBalance < input.amountBaseUnits) {
      throw new Error('Insufficient token balance.');
    }

    const primaryCoin = transaction.object(coins.objects[0].objectId);
    if (coins.objects.length > 1) {
      transaction.mergeCoins(
        primaryCoin,
        coins.objects.slice(1).map((coin) => transaction.object(coin.objectId))
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
    const sui = new SuiLedgerApp(transport);
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
    const response = await client.executeTransaction({
      transaction: transactionBytes,
      signatures: [serializedSignature]
    });

    const digest = response.Transaction?.digest ?? response.FailedTransaction?.digest;
    if (!digest) {
      throw new Error('Sui transaction did not return a digest.');
    }

    return digest;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

async function openSuiLedgerTransport(promptForPermission: boolean) {
  ensureLedgerRuntimeGlobals();
  if (promptForPermission) {
    return TransportWebHID.request();
  }

  const transport = await TransportWebHID.openConnected();
  if (!transport) {
    throw new Error('Ledger device not found. Connect it and authorize Grape first.');
  }

  return transport;
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const normalized = Uint8Array.from(input);
  const digest = await crypto.subtle.digest('SHA-256', normalized);
  return new Uint8Array(digest);
}

function buildBip32KeyPayload(path: string): Buffer {
  const parts = splitPath(path);
  const payload = Buffer.alloc(1 + parts.length * 4);
  payload[0] = parts.length;
  parts.forEach((part, index) => {
    payload.writeUInt32LE(part, 1 + index * 4);
  });
  return payload;
}

function splitPath(path: string): number[] {
  const parts: number[] = [];

  for (const segment of path.split('/')) {
    let value = Number.parseInt(segment, 10);
    if (Number.isNaN(value)) {
      continue;
    }
    if (segment.endsWith("'")) {
      value += 0x80000000;
    }
    parts.push(value);
  }

  return parts;
}

function ensureLedgerRuntimeGlobals() {
  if (typeof globalThis.Buffer === 'undefined') {
    (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
  if (typeof globalThis.window !== 'undefined' && typeof globalThis.window.Buffer === 'undefined') {
    (globalThis.window as Window & typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
}

import { base64ToBytes, type VaultSecret } from '@grape/core';
import {
  SuiJsonRpcClient,
  type SuiJsonRpcClientOptions,
  type CoinBalance
} from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, MIST_PER_SUI, normalizeSuiAddress, SUI_TYPE_ARG } from '@mysten/sui/utils';

export const SUI_DERIVATION_PATH = `m/44'/784'/0'/0'/0'`;
export const DEFAULT_SUI_NETWORK = 'mainnet';

export type SuiNetwork = 'mainnet' | 'devnet';

export type DerivedSuiAccount = {
  mnemonic: string;
  derivationPath: string;
  keypair: Ed25519Keypair;
  address: string;
};

export type ImportedSuiPrivateKeyAccount = {
  secretKey: string;
  derivationPath: 'imported-private-key';
  keypair: Ed25519Keypair;
  address: string;
};

export type SuiCoinHolding = {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  rawAmount: string;
  logoUri?: string;
};

export function deriveSuiAccount0(mnemonic: string): DerivedSuiAccount {
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, SUI_DERIVATION_PATH);
  return {
    mnemonic,
    derivationPath: SUI_DERIVATION_PATH,
    keypair,
    address: keypair.toSuiAddress()
  };
}

export function validateSuiPrivateKey(privateKey: string): boolean {
  try {
    importSuiPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

export function importSuiPrivateKey(privateKey: string): ImportedSuiPrivateKeyAccount {
  const normalizedPrivateKey = privateKey.trim();
  const keypair = normalizedPrivateKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(normalizedPrivateKey)
    : Ed25519Keypair.fromSecretKey(decodeSuiRawPrivateKey(normalizedPrivateKey));

  return {
    secretKey: keypair.getSecretKey(),
    derivationPath: 'imported-private-key',
    keypair,
    address: keypair.toSuiAddress()
  };
}

export function resolveSuiVaultSecret(secret: VaultSecret): Ed25519Keypair {
  if (secret.kind === 'mnemonic') {
    return deriveSuiAccount0(secret.mnemonic).keypair;
  }

  if (secret.kind === 'private-key') {
    return importSuiPrivateKey(secret.secretKey).keypair;
  }

  throw new Error('Auth tokens cannot be used as Sui software signers.');
}

export function getSuiRpcUrl(network: SuiNetwork, customRpcUrl?: string | null): string {
  const trimmed = customRpcUrl?.trim();
  if (trimmed) {
    return trimmed;
  }

  return network === 'devnet' ? 'https://fullnode.devnet.sui.io:443' : 'https://fullnode.mainnet.sui.io:443';
}

export function createSuiClient(network: SuiNetwork, customRpcUrl?: string | null): SuiJsonRpcClient {
  const options: SuiJsonRpcClientOptions = {
    network,
    url: getSuiRpcUrl(network, customRpcUrl)
  };

  return new SuiJsonRpcClient(options);
}

export function validateSuiAddress(address: string): boolean {
  try {
    return isValidSuiAddress(normalizeSuiAddress(address));
  } catch {
    return false;
  }
}

export async function getSuiHoldings(
  client: SuiJsonRpcClient,
  owner: string
): Promise<{
  totalMist: string;
  coins: SuiCoinHolding[];
}> {
  const balances = await client.getAllBalances({ owner: normalizeSuiAddress(owner) });
  const coinResults: Array<SuiCoinHolding | null> = await Promise.all(
    balances.map(async (balance: CoinBalance) => {
      if (isNativeSuiCoinType(balance.coinType)) {
        return null;
      }

      const metadata = await client.getCoinMetadata({ coinType: balance.coinType }).catch(() => null);
      const decimals = metadata?.decimals ?? 0;
      const rawAmount = balance.totalBalance;
      const amount = formatSuiAmount(rawAmount, decimals);

      return {
        coinType: balance.coinType,
        symbol: metadata?.symbol ?? formatSuiCoinSymbol(balance.coinType),
        name: metadata?.name ?? formatSuiCoinSymbol(balance.coinType),
        decimals,
        amount,
        rawAmount,
        logoUri: metadata?.iconUrl ?? undefined
      } satisfies SuiCoinHolding;
    })
  );

  const suiBalance = balances.find((balance: CoinBalance) => isNativeSuiCoinType(balance.coinType));

  return {
    totalMist: suiBalance?.totalBalance ?? '0',
    coins: coinResults.filter((coin): coin is SuiCoinHolding => coin !== null)
  };
}

export async function sendSui(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  input: { recipient: string; amountMist: bigint }
): Promise<string> {
  const transaction = new Transaction();
  transaction.setSender(keypair.toSuiAddress());
  const [coin] = transaction.splitCoins(transaction.gas, [transaction.pure.u64(input.amountMist.toString())]);
  transaction.transferObjects([coin], transaction.pure.address(normalizeSuiAddress(input.recipient)));

  const response = await client.signAndExecuteTransaction({
    transaction,
    signer: keypair,
    options: {
      showEffects: true
    }
  });

  if (!response.digest) {
    throw new Error('Sui transaction did not return a digest.');
  }

  return response.digest;
}

export async function sendSuiCoin(
  client: SuiJsonRpcClient,
  keypair: Ed25519Keypair,
  input: { recipient: string; amountBaseUnits: bigint; coinType: string }
): Promise<string> {
  const owner = keypair.toSuiAddress();
  const coinType = input.coinType.trim();
  const normalizedRecipient = normalizeSuiAddress(input.recipient);
  const coins = await client.getCoins({
    owner: normalizeSuiAddress(owner),
    coinType
  });

  if (!coins.data.length) {
    throw new Error('No coin objects were found for the selected token.');
  }

  const totalBalance = coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
  if (totalBalance < input.amountBaseUnits) {
    throw new Error('Insufficient token balance.');
  }

  const transaction = new Transaction();
  transaction.setSender(owner);
  const primaryCoin = transaction.object(coins.data[0].coinObjectId);
  if (coins.data.length > 1) {
    transaction.mergeCoins(
      primaryCoin,
      coins.data.slice(1).map((coin) => transaction.object(coin.coinObjectId))
    );
  }
  const [coin] = transaction.splitCoins(primaryCoin, [transaction.pure.u64(input.amountBaseUnits.toString())]);
  transaction.transferObjects([coin], transaction.pure.address(normalizedRecipient));

  const response = await client.signAndExecuteTransaction({
    transaction,
    signer: keypair,
    options: {
      showEffects: true
    }
  });

  if (!response.digest) {
    throw new Error('Sui token transaction did not return a digest.');
  }

  return response.digest;
}

export function formatSuiAmount(rawAmount: string, decimals: number): string {
  const numeric = BigInt(rawAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = numeric / divisor;
  const fraction = numeric % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionString = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionString}`;
}

export function mistToSui(mist: string | number | bigint): number {
  return Number(BigInt(mist) * 1_000_000n / (MIST_PER_SUI / 1_000_000n)) / 1_000_000;
}

function formatSuiCoinSymbol(coinType: string): string {
  const parts = coinType.split('::');
  return parts[parts.length - 1] ?? 'COIN';
}

function isNativeSuiCoinType(coinType: string): boolean {
  return normalizeSuiCoinType(coinType) === normalizeSuiCoinType(SUI_TYPE_ARG);
}

function normalizeSuiCoinType(coinType: string): string {
  const parts = coinType.trim().split('::');
  if (parts.length !== 3) {
    return coinType.trim().toLowerCase();
  }

  return `${normalizeSuiAddress(parts[0])}::${parts[1].toLowerCase()}::${parts[2].toUpperCase()}`;
}

function decodeSuiRawPrivateKey(privateKey: string): Uint8Array {
  if (!privateKey.trim()) {
    throw new Error('Private key is required.');
  }

  if (privateKey.trim().startsWith('[')) {
    const parsed = JSON.parse(privateKey) as unknown;
    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error('Private key array is invalid.');
    }
    const bytes = Uint8Array.from(parsed);
    if (bytes.length !== 32) {
      throw new Error('Sui private key must decode to 32 bytes.');
    }
    return bytes;
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(privateKey.trim())) {
    return decodeHex(privateKey.trim().slice(2));
  }

  if (/^[0-9a-fA-F]{64}$/.test(privateKey.trim())) {
    return decodeHex(privateKey.trim());
  }

  try {
    const bytes = base64ToBytes(privateKey.trim());
    if (bytes.length === 32) {
      return bytes;
    }
  } catch {
    // Fall through to the final error.
  }

  throw new Error('Private key must be a Sui bech32 key, base64 string, hex string, or JSON byte array.');
}

function decodeHex(value: string): Uint8Array {
  const normalized = value.trim();
  if (normalized.length % 2 !== 0) {
    throw new Error('Hex private key must have an even number of characters.');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    const byte = Number.parseInt(normalized.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Hex private key is invalid.');
    }
    bytes[index / 2] = byte;
  }
  return bytes;
}

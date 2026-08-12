import { base64ToBytes, type VaultSecret } from '@grape/core';
import {
  SuiGrpcClient,
  type SuiGrpcClientOptions
} from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { isValidSuiAddress, MIST_PER_SUI, normalizeSuiAddress, SUI_TYPE_ARG } from '@mysten/sui/utils';
import { AggregatorClient, type RouterDataV3 } from '@cetusprotocol/aggregator-sdk';

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

export type SuiSwapQuote = {
  fromCoinType: string;
  toCoinType: string;
  amountIn: string;
  amountOut: string;
  providers: string[];
  router: RouterDataV3;
};

export async function getSuiSwapQuote(
  client: SuiGrpcClient,
  input: { fromCoinType: string; toCoinType: string; amountIn: bigint }
): Promise<SuiSwapQuote> {
  if (input.fromCoinType.trim() === input.toCoinType.trim()) throw new Error('Choose a different output token.');
  if (input.amountIn <= 0n) throw new Error('Enter an amount greater than zero.');
  const aggregator = new AggregatorClient({ client });
  const router = await aggregator.findRouters({
    from: input.fromCoinType.trim(),
    target: input.toCoinType.trim(),
    amount: input.amountIn,
    byAmountIn: true
  });
  if (!router || router.insufficientLiquidity || router.error) throw new Error('No Sui swap route is available for this amount.');
  return {
    fromCoinType: input.fromCoinType.trim(),
    toCoinType: input.toCoinType.trim(),
    amountIn: String(router.amountIn),
    amountOut: String(router.amountOut),
    providers: Array.from(new Set(router.paths.map((path) => path.provider))),
    router
  };
}

export async function executeSuiSwap(
  client: SuiGrpcClient,
  keypair: Ed25519Keypair,
  input: { quote: SuiSwapQuote; slippageBps: number }
): Promise<string> {
  const aggregator = new AggregatorClient({ client, signer: keypair.toSuiAddress() });
  const transaction = new Transaction();
  transaction.setSender(keypair.toSuiAddress());
  await aggregator.fastRouterSwap({
    router: input.quote.router,
    txb: transaction,
    slippage: Math.max(0, input.slippageBps) / 10_000
  });
  const response = await client.signAndExecuteTransaction({ transaction, signer: keypair, include: { effects: true } });
  const digest = response.Transaction?.digest ?? response.FailedTransaction?.digest;
  if (!digest) throw new Error('Sui swap did not return a transaction digest.');
  return digest;
}

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

export function createSuiClient(network: SuiNetwork, customRpcUrl?: string | null): SuiGrpcClient {
  const options: SuiGrpcClientOptions = {
    network,
    baseUrl: getSuiRpcUrl(network, customRpcUrl)
  };

  return new SuiGrpcClient(options);
}

export function validateSuiAddress(address: string): boolean {
  try {
    return isValidSuiAddress(normalizeSuiAddress(address));
  } catch {
    return false;
  }
}

export async function getSuiHoldings(
  client: SuiGrpcClient,
  owner: string
): Promise<{
  totalMist: string;
  coins: SuiCoinHolding[];
}> {
  const normalizedOwner = normalizeSuiAddress(owner);
  const balances: Awaited<ReturnType<SuiGrpcClient['listBalances']>>['balances'] = [];
  let cursor: string | null = null;
  do {
    const page = await client.listBalances({ owner: normalizedOwner, cursor, limit: 1000 });
    balances.push(...page.balances);
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  const coinResults: Array<SuiCoinHolding | null> = await Promise.all(
    balances.map(async (balance) => {
      if (isNativeSuiCoinType(balance.coinType)) {
        return null;
      }

      const metadata = (await client.getCoinMetadata({ coinType: balance.coinType }).catch(() => null))?.coinMetadata;
      const decimals = metadata?.decimals ?? 0;
      const rawAmount = balance.balance;
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

  const suiBalance = balances.find((balance) => isNativeSuiCoinType(balance.coinType));

  return {
    totalMist: suiBalance?.balance ?? '0',
    coins: coinResults.filter((coin): coin is SuiCoinHolding => coin !== null)
  };
}

export async function sendSui(
  client: SuiGrpcClient,
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
    include: { effects: true }
  });

  const digest = response.Transaction?.digest ?? response.FailedTransaction?.digest;
  if (!digest) {
    throw new Error('Sui transaction did not return a digest.');
  }

  return digest;
}

export async function sendSuiCoin(
  client: SuiGrpcClient,
  keypair: Ed25519Keypair,
  input: { recipient: string; amountBaseUnits: bigint; coinType: string }
): Promise<string> {
  const owner = keypair.toSuiAddress();
  const coinType = input.coinType.trim();
  const normalizedRecipient = normalizeSuiAddress(input.recipient);
  const coins = await client.listCoins({
    owner: normalizeSuiAddress(owner),
    coinType
  });

  if (!coins.objects.length) {
    throw new Error('No coin objects were found for the selected token.');
  }

  const totalBalance = coins.objects.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
  if (totalBalance < input.amountBaseUnits) {
    throw new Error('Insufficient token balance.');
  }

  const transaction = new Transaction();
  transaction.setSender(owner);
  const primaryCoin = transaction.object(coins.objects[0].objectId);
  if (coins.objects.length > 1) {
    transaction.mergeCoins(
      primaryCoin,
      coins.objects.slice(1).map((coin) => transaction.object(coin.objectId))
    );
  }
  const [coin] = transaction.splitCoins(primaryCoin, [transaction.pure.u64(input.amountBaseUnits.toString())]);
  transaction.transferObjects([coin], transaction.pure.address(normalizedRecipient));

  const response = await client.signAndExecuteTransaction({
    transaction,
    signer: keypair,
    include: { effects: true }
  });

  const digest = response.Transaction?.digest ?? response.FailedTransaction?.digest;
  if (!digest) {
    throw new Error('Sui token transaction did not return a digest.');
  }

  return digest;
}

export async function resolveSuiTransactionBytes(
  transaction: string,
  client: SuiGrpcClient,
  sender: string
): Promise<Uint8Array> {
  const trimmed = transaction.trim();
  if (trimmed.startsWith('{')) {
    const nextTransaction = Transaction.from(trimmed);
    nextTransaction.setSenderIfNotSet(sender);
    return nextTransaction.build({ client });
  }

  return base64ToBytes(transaction);
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

export * from './wallet-standard';

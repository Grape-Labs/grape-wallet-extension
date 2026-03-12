import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { MIST_PER_SUI, SUI_TYPE_ARG, normalizeSuiAddress } from '@mysten/sui/utils';

const DEFAULT_SUI_NETWORK = 'mainnet';
const SUI_DERIVATION_PATH = `m/44'/784'/0'/0'/0'`;

type SuiBalanceResponse = {
  coinType: string;
  totalBalance: string;
};

type SuiCoinMetadataResponse = {
  decimals?: number;
  symbol?: string;
  name?: string;
  iconUrl?: string | null;
};

export type MobileSuiHolding = {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  rawAmount: string;
  logoUri?: string;
};

export function deriveMobileSuiAccount0(mnemonic: string) {
  const keypair = Ed25519Keypair.deriveKeypair(mnemonic, SUI_DERIVATION_PATH);
  return {
    address: keypair.toSuiAddress(),
    derivationPath: SUI_DERIVATION_PATH
  };
}

export async function getMobileSuiHoldings(owner: string) {
  const normalizedOwner = normalizeSuiAddress(owner);
  const balances = await callSuiRpc<SuiBalanceResponse[]>('suix_getAllBalances', [normalizedOwner]);
  const coins: MobileSuiHolding[] = [];
  let totalMist = '0';

  for (const balance of balances) {
    if (isNativeSuiCoinType(balance.coinType)) {
      totalMist = balance.totalBalance ?? '0';
      continue;
    }

    const metadata = await callSuiRpc<SuiCoinMetadataResponse | null>('suix_getCoinMetadata', [balance.coinType]).catch(
      () => null
    );
    const decimals = metadata?.decimals ?? 0;
    const amount = formatSuiAmount(balance.totalBalance ?? '0', decimals);

    coins.push({
      coinType: balance.coinType,
      symbol: metadata?.symbol ?? formatSuiCoinSymbol(balance.coinType),
      name: metadata?.name ?? formatSuiCoinSymbol(balance.coinType),
      decimals,
      amount,
      rawAmount: balance.totalBalance ?? '0',
      logoUri: metadata?.iconUrl ?? undefined
    });
  }

  return { totalMist, coins };
}

export function formatMobileSuiAmount(rawAmount: string, decimals: number) {
  return formatSuiAmount(rawAmount, decimals);
}

export function getMobileSuiNetwork() {
  return DEFAULT_SUI_NETWORK;
}

export function mistToSuiLabel(mist: string) {
  return `${formatSuiAmount(mist, 9)} SUI`;
}

export function getMobileSuiSendUnsupportedMessage() {
  return 'Sui send is not available on mobile yet.';
}

async function callSuiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(getSuiRpcUrl(DEFAULT_SUI_NETWORK), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `grape-mobile-${Date.now()}`,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`Sui RPC request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: {
      message?: string;
    };
  };

  if (payload.error) {
    throw new Error(payload.error.message || 'Sui RPC request failed.');
  }

  return payload.result as T;
}

function getSuiRpcUrl(network: string) {
  return network === 'devnet' ? 'https://fullnode.devnet.sui.io:443' : 'https://fullnode.mainnet.sui.io:443';
}

function formatSuiAmount(rawAmount: string, decimals: number): string {
  const numeric = BigInt(rawAmount || '0');
  const divisor = 10n ** BigInt(decimals);
  const whole = numeric / divisor;
  const fraction = numeric % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionString = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionString}`;
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

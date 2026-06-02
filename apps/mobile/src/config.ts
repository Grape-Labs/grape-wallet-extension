import Constants from 'expo-constants';

export const MOBILE_SOLANA_DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const MOBILE_SOLANA_DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const MOBILE_SUI_MAINNET_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
export const MOBILE_SUI_DEVNET_RPC_URL = 'https://fullnode.devnet.sui.io:443';
export const MOBILE_ETHEREUM_MAINNET_RPC_URL = 'https://ethereum-rpc.publicnode.com';
export const MOBILE_ETHEREUM_SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
export const MOBILE_MONAD_MAINNET_RPC_URL = 'https://rpc.monad.xyz';
export const MOBILE_MONAD_TESTNET_RPC_URL = 'https://testnet-rpc.monad.xyz';

export const MOBILE_JUPITER_SOL_MINT = 'So11111111111111111111111111111111111111112';

export type MobileShyftWalletToken = {
  mint: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
  decimals?: number;
  balanceUi?: number;
  balanceLabel?: string;
};

type MobileShyftWalletTokenPayload = {
  result?: unknown;
  data?: unknown;
};

export type MobileShyftActivity = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  timestamp: number;
  signature: string;
  status: 'success' | 'failed' | 'unknown';
  source: 'shyft';
};

function normalizeRemoteImageUri(uri?: string) {
  const trimmed = uri?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return encodeURI(trimmed);
  } catch {
    return trimmed;
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function fetchJsonWithRetry(url: string, init: RequestInit, maxAttempts = 3) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }

        throw new Error(`Request failed with ${response.status}.`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed.');
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error('Request failed.');
}

function getShyftResultArray(payload: MobileShyftWalletTokenPayload) {
  if (Array.isArray(payload.result)) {
    return payload.result;
  }

  if (
    payload.result &&
    typeof payload.result === 'object' &&
    Array.isArray((payload.result as { result?: unknown }).result)
  ) {
    return (payload.result as { result: unknown[] }).result;
  }

  if (
    payload.result &&
    typeof payload.result === 'object' &&
    Array.isArray((payload.result as { data?: unknown }).data)
  ) {
    return (payload.result as { data: unknown[] }).data;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  return [];
}

const inlineExpoPublicEnv = {
  EXPO_PUBLIC_SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL,
  EXPO_PUBLIC_SUI_RPC_URL: process.env.EXPO_PUBLIC_SUI_RPC_URL,
  EXPO_PUBLIC_ETHEREUM_RPC_URL: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  EXPO_PUBLIC_MONAD_RPC_URL: process.env.EXPO_PUBLIC_MONAD_RPC_URL,
  EXPO_PUBLIC_SHYFT_API_KEY: process.env.EXPO_PUBLIC_SHYFT_API_KEY,
  EXPO_PUBLIC_JUP_API_KEY: process.env.EXPO_PUBLIC_JUP_API_KEY,
  EXPO_PUBLIC_LIFI_API_KEY: process.env.EXPO_PUBLIC_LIFI_API_KEY
} as const;

function readPublicEnv(key: keyof typeof inlineExpoPublicEnv) {
  const inlineValue = inlineExpoPublicEnv[key];
  if (typeof inlineValue === 'string') {
    const trimmed = inlineValue.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  const expoEnv =
    (Constants.expoConfig?.extra as { env?: Partial<Record<keyof typeof inlineExpoPublicEnv, string | undefined>> } | undefined)
      ?.env?.[key] ??
    (Constants.manifest2?.extra as { env?: Partial<Record<keyof typeof inlineExpoPublicEnv, string | undefined>> } | undefined)
      ?.env?.[key];

  if (typeof expoEnv !== 'string') {
    return undefined;
  }

  const trimmed = expoEnv.trim();
  return trimmed || undefined;
}

export function getMobileShyftApiKey() {
  return readPublicEnv('EXPO_PUBLIC_SHYFT_API_KEY');
}

export function getMobileJupiterApiKey() {
  return readPublicEnv('EXPO_PUBLIC_JUP_API_KEY');
}

export function getMobileLifiApiKey() {
  return readPublicEnv('EXPO_PUBLIC_LIFI_API_KEY');
}

export function getMobileSolanaRpcUrl(network: 'mainnet-beta' | 'devnet' = 'mainnet-beta') {
  const custom = readPublicEnv('EXPO_PUBLIC_SOLANA_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'devnet' ? MOBILE_SOLANA_DEVNET_RPC_URL : MOBILE_SOLANA_DEFAULT_RPC_URL;
}

export function getMobileSuiRpcUrl(network: 'mainnet' | 'devnet' = 'mainnet') {
  const custom = readPublicEnv('EXPO_PUBLIC_SUI_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'devnet' ? MOBILE_SUI_DEVNET_RPC_URL : MOBILE_SUI_MAINNET_RPC_URL;
}

export function getMobileEthereumRpcUrl(network: 'mainnet' | 'sepolia' = 'mainnet') {
  const custom = readPublicEnv('EXPO_PUBLIC_ETHEREUM_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'sepolia' ? MOBILE_ETHEREUM_SEPOLIA_RPC_URL : MOBILE_ETHEREUM_MAINNET_RPC_URL;
}

export function getMobileMonadRpcUrl(network: 'mainnet' | 'testnet' = 'mainnet') {
  const custom = readPublicEnv('EXPO_PUBLIC_MONAD_RPC_URL');
  if (custom) {
    return custom;
  }

  return network === 'testnet' ? MOBILE_MONAD_TESTNET_RPC_URL : MOBILE_MONAD_MAINNET_RPC_URL;
}

export async function fetchMobileJupiterPrices(ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {} as Record<string, { usdPrice: number | null; priceChange24h: number | null }>;
  }

  const apiKey = getMobileJupiterApiKey();
  const baseUrl = apiKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
  const url = new URL(`${baseUrl}/price/v3`);
  url.searchParams.set('ids', uniqueIds.join(','));

  const response = await fetch(url.toString(), {
    headers: apiKey ? { 'x-api-key': apiKey } : undefined
  });

  if (!response.ok) {
    throw new Error(`Jupiter pricing request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as Record<
    string,
    {
      usdPrice?: number;
      price?: number;
      priceChange24h?: number;
    }
  >;

  return Object.fromEntries(
    Object.entries(payload).map(([id, value]) => [
      id,
      {
        usdPrice:
          typeof value?.usdPrice === 'number'
            ? value.usdPrice
            : typeof value?.price === 'number'
              ? value.price
              : null,
        priceChange24h: typeof value?.priceChange24h === 'number' ? value.priceChange24h : null
      }
    ])
  );
}

export type MobileJupiterQuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps: number;
  priceImpactPct?: string;
  routePlan?: Array<{ swapInfo?: { label?: string } }>;
  [key: string]: unknown;
};

export async function fetchMobileJupiterQuote(input: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  onlyDirectRoutes?: boolean;
}) {
  const apiKey = getMobileJupiterApiKey();
  const baseUrl = apiKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
  const url = new URL(`${baseUrl}/swap/v1/quote`);
  url.searchParams.set('inputMint', input.inputMint);
  url.searchParams.set('outputMint', input.outputMint);
  url.searchParams.set('amount', input.amount);
  url.searchParams.set('slippageBps', String(input.slippageBps));
  url.searchParams.set('swapMode', 'ExactIn');
  url.searchParams.set('restrictIntermediateTokens', 'true');
  if (input.onlyDirectRoutes) {
    url.searchParams.set('onlyDirectRoutes', 'true');
  }

  const response = await fetch(url.toString(), {
    headers: apiKey ? { 'x-api-key': apiKey } : undefined
  });

  if (!response.ok) {
    throw new Error(`Jupiter quote request failed with ${response.status}.`);
  }

  return (await response.json()) as MobileJupiterQuoteResponse;
}

export async function createMobileJupiterSwapTransaction(input: {
  quoteResponse: MobileJupiterQuoteResponse;
  userPublicKey: string;
}) {
  const apiKey = getMobileJupiterApiKey();
  const baseUrl = apiKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
  const response = await fetch(`${baseUrl}/swap/v1/swap`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {})
    },
    body: JSON.stringify({
      quoteResponse: input.quoteResponse,
      userPublicKey: input.userPublicKey,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true
    })
  });

  if (!response.ok) {
    throw new Error(`Jupiter swap request failed with ${response.status}.`);
  }

  return (await response.json()) as { swapTransaction: string };
}

export async function fetchMobileShyftWalletTokens(wallet: string, network: 'mainnet-beta' | 'devnet' = 'mainnet-beta') {
  const apiKey = getMobileShyftApiKey();
  if (!apiKey) {
    return [] as MobileShyftWalletToken[];
  }

  const url = new URL('https://api.shyft.to/sol/v1/wallet/all_tokens');
  url.searchParams.set('network', network);
  url.searchParams.set('wallet', wallet);

  const payload = (await fetchJsonWithRetry(
    url.toString(),
    {
      headers: {
        'x-api-key': apiKey
      }
    },
    3
  )) as MobileShyftWalletTokenPayload;

  const entries = getShyftResultArray(payload) as Array<{
    address?: string;
    token_address?: string;
    mint?: string;
    balance?: number | string;
    amount?: number | string;
    ui_amount?: number | string;
    name?: string;
    symbol?: string;
    image?: string;
    logoURI?: string;
    info?: {
      decimals?: number;
      name?: string;
      symbol?: string;
      image?: string;
      balance?: number | string;
      amount?: number | string;
      ui_amount?: number | string;
    };
  }>;
  const normalizedEntries: MobileShyftWalletToken[] = [];
  entries.forEach((entry) => {
      const mint = entry.address?.trim() || entry.token_address?.trim() || entry.mint?.trim();
      if (!mint) {
        return;
      }

      const rawBalance =
        entry.balance ??
        entry.ui_amount ??
        entry.amount ??
        entry.info?.balance ??
        entry.info?.ui_amount ??
        entry.info?.amount;
      const numericBalance =
        typeof rawBalance === 'number'
          ? rawBalance
          : typeof rawBalance === 'string'
            ? Number(rawBalance)
            : NaN;
      const balanceUi = Number.isFinite(numericBalance) ? numericBalance : 0;
      const decimals = typeof entry.info?.decimals === 'number' ? entry.info.decimals : undefined;
      const symbol = entry.info?.symbol?.trim() || entry.symbol?.trim() || undefined;

      if (balanceUi <= 0) {
        return;
      }

      normalizedEntries.push({
        mint,
        name: entry.info?.name?.trim() || entry.name?.trim() || undefined,
        symbol,
        logoUri: normalizeRemoteImageUri(entry.info?.image?.trim() || entry.image?.trim() || entry.logoURI?.trim() || undefined),
        decimals,
        balanceUi,
        balanceLabel: symbol ? `${balanceUi} ${symbol}` : `${balanceUi}`
      });
    });

  return normalizedEntries.sort((left, right) => (right.balanceUi ?? 0) - (left.balanceUi ?? 0));
}

type MobileLifiQuoteResponse = {
  estimate?: {
    fromAmount?: string;
    toAmount?: string;
    toAmountMin?: string;
    fromToken?: {
      symbol?: string;
      decimals?: number;
    };
    toToken?: {
      symbol?: string;
      decimals?: number;
    };
    feeCosts?: Array<{
      amountUSD?: string;
      amountUsd?: string;
    }>;
    gasCosts?: Array<{
      amountUSD?: string;
      amountUsd?: string;
    }>;
  };
  includedSteps?: Array<{
    toolDetails?: {
      name?: string;
    };
  }>;
  steps?: Array<{
    toolDetails?: {
      name?: string;
    };
    transactionRequest?: {
      to?: string;
      data?: string;
      value?: string;
    };
  }>;
  toolDetails?: {
    name?: string;
  };
  transactionRequest?: {
    to?: string;
    data?: string;
    value?: string;
  };
  [key: string]: unknown;
};

type MobileLifiChainResponse = {
  chains?: Array<{
    id?: string | number;
    key?: string;
    name?: string;
  }>;
};

export type MobileBridgeQuoteSummary = {
  fromChain: 'solana' | 'ethereum' | 'monad';
  toChain: 'solana' | 'ethereum' | 'monad' | 'sui';
  selectedRouteId: string;
  routes: Array<{
    id: string;
    label: string;
    quoteResponse: Record<string, unknown>;
    fromAmountUi: string;
    toAmountUi: string;
    fromSymbol: string;
    toSymbol: string;
    minimumReceivedUi?: string | null;
    feeUsd?: string | null;
    routeLabels: string[];
  }>;
};

const MOBILE_LIFI_BASE_URL = 'https://li.quest/v1';
const MOBILE_LIFI_CHAIN_ALIASES = {
  solana: ['solana'],
  sui: ['sui'],
  monad: ['monad'],
  ethereum: ['eth', 'ethereum']
} as const;
const MOBILE_LIFI_FALLBACK_CHAIN_IDS = {
  solana: '1151111081099710',
  sui: '784',
  monad: '143',
  ethereum: '1'
} as const;
const MOBILE_LIFI_NATIVE_TOKEN_ADDRESS = {
  solana: '11111111111111111111111111111111',
  sui: '0x2::sui::SUI',
  monad: '0x0000000000000000000000000000000000000000',
  ethereum: '0x0000000000000000000000000000000000000000'
} as const;
const MOBILE_LIFI_NATIVE_SYMBOL = {
  solana: 'SOL',
  sui: 'SUI',
  monad: 'MON',
  ethereum: 'ETH'
} as const;
const MOBILE_LIFI_NATIVE_DECIMALS = {
  solana: 9,
  sui: 9,
  monad: 18,
  ethereum: 18
} as const;
const MOBILE_SUPPORTED_BRIDGE_DESTINATIONS = {
  solana: ['ethereum', 'monad', 'sui'] as const,
  ethereum: ['solana', 'monad', 'sui'] as const,
  monad: ['solana', 'ethereum'] as const,
  sui: [] as const
} as const;

function createMobileLifiHeaders() {
  const apiKey = getMobileLifiApiKey();
  return apiKey ? { 'x-lifi-api-key': apiKey } : {};
}

async function fetchMobileLifiJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = `${MOBILE_LIFI_BASE_URL}${path}${params && params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: createMobileLifiHeaders()
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    if (message.includes('"code":1011') || message.includes('/toChain must be equal to one of the allowed values')) {
      throw new Error('This bridge route is not supported yet.');
    }

    throw new Error(message || `LI.FI request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function getMobileSupportedBridgeDestinations(fromChain: keyof typeof MOBILE_SUPPORTED_BRIDGE_DESTINATIONS) {
  return [...MOBILE_SUPPORTED_BRIDGE_DESTINATIONS[fromChain]];
}

export function isMobileBridgeRouteSupported(
  fromChain: keyof typeof MOBILE_SUPPORTED_BRIDGE_DESTINATIONS,
  toChain: keyof typeof MOBILE_LIFI_NATIVE_TOKEN_ADDRESS
) {
  return MOBILE_SUPPORTED_BRIDGE_DESTINATIONS[fromChain].includes(toChain as never);
}

async function fetchMobileLifiChains() {
  const response = await fetchMobileLifiJson<MobileLifiChainResponse>('/chains');
  return response.chains ?? [];
}

async function resolveMobileLifiChainId(chain: keyof typeof MOBILE_LIFI_CHAIN_ALIASES) {
  const chains = await fetchMobileLifiChains().catch(() => []);
  const aliases = MOBILE_LIFI_CHAIN_ALIASES[chain];
  const match = chains.find((candidate) => {
    const key = candidate.key?.trim().toLowerCase();
    const name = candidate.name?.trim().toLowerCase();
    return aliases.some((alias) => alias === key || alias === name);
  });

  if (match?.id !== undefined && match.id !== null) {
    return String(match.id);
  }

  return MOBILE_LIFI_FALLBACK_CHAIN_IDS[chain];
}

function formatBaseUnits(rawAmount: string, decimals: number): string {
  const normalized = rawAmount.trim();
  if (!normalized) {
    return '0';
  }

  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const padded = unsigned.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const fraction = decimals > 0 ? padded.slice(-decimals).replace(/0+$/, '') : '';
  const result = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${result}` : result;
}

export async function fetchMobileNativeBridgeQuote(input: {
  fromChain: 'solana' | 'ethereum' | 'monad';
  toChain: 'solana' | 'ethereum' | 'monad' | 'sui';
  amountRaw: string;
  fromAddress: string;
  toAddress: string;
}) {
  if (!isMobileBridgeRouteSupported(input.fromChain, input.toChain)) {
    throw new Error(`Bridging from ${input.fromChain} to ${input.toChain} is not supported yet.`);
  }

  const [fromChainId, toChainId] = await Promise.all([
    resolveMobileLifiChainId(input.fromChain),
    resolveMobileLifiChainId(input.toChain)
  ]);

  const params = new URLSearchParams({
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken: MOBILE_LIFI_NATIVE_TOKEN_ADDRESS[input.fromChain],
    toToken: MOBILE_LIFI_NATIVE_TOKEN_ADDRESS[input.toChain],
    fromAmount: input.amountRaw,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    integrator: 'grape'
  });

  const orderVariants = [
    { id: 'cheapest', label: 'Cheapest route', order: 'CHEAPEST' },
    { id: 'fastest', label: 'Fastest route', order: 'FASTEST' }
  ] as const;
  const quoteErrors: Error[] = [];

  const quotes = await Promise.all(
    orderVariants.map(async (variant) => {
      const nextParams = new URLSearchParams(params);
      nextParams.set('order', variant.order);
      const quote = await fetchMobileLifiJson<MobileLifiQuoteResponse>('/quote', nextParams).catch((error) => {
        if (error instanceof Error) {
          quoteErrors.push(error);
        }
        return null;
      });
      if (!quote) {
        return null;
      }

      const fromSymbol = quote.estimate?.fromToken?.symbol ?? MOBILE_LIFI_NATIVE_SYMBOL[input.fromChain];
      const toSymbol = quote.estimate?.toToken?.symbol ?? MOBILE_LIFI_NATIVE_SYMBOL[input.toChain];
      const fromDecimals = quote.estimate?.fromToken?.decimals ?? MOBILE_LIFI_NATIVE_DECIMALS[input.fromChain];
      const toDecimals = quote.estimate?.toToken?.decimals ?? MOBILE_LIFI_NATIVE_DECIMALS[input.toChain];
      const routeSteps = (quote.includedSteps ?? quote.steps ?? [])
        .map((step) => step.toolDetails?.name?.trim())
        .filter((label): label is string => Boolean(label));
      const feeUsd =
        quote.estimate?.feeCosts?.[0]?.amountUSD ??
        quote.estimate?.feeCosts?.[0]?.amountUsd ??
        quote.estimate?.gasCosts?.[0]?.amountUSD ??
        quote.estimate?.gasCosts?.[0]?.amountUsd ??
        null;

      return {
        id: variant.id,
        label: variant.label,
        quoteResponse: quote as Record<string, unknown>,
        fromAmountUi: formatBaseUnits(quote.estimate?.fromAmount ?? input.amountRaw, fromDecimals),
        toAmountUi: formatBaseUnits(quote.estimate?.toAmount ?? '0', toDecimals),
        minimumReceivedUi: quote.estimate?.toAmountMin
          ? formatBaseUnits(quote.estimate.toAmountMin, toDecimals)
          : null,
        fromSymbol,
        toSymbol,
        feeUsd,
        routeLabels: Array.from(new Set(routeSteps.length > 0 ? routeSteps : quote.toolDetails?.name ? [quote.toolDetails.name] : []))
      };
    })
  );

  const routes = quotes
    .filter((route): route is NonNullable<(typeof quotes)[number]> => !!route)
    .filter((route, index, allRoutes) => {
      return (
        allRoutes.findIndex((candidate) => {
          return (
            candidate.toAmountUi === route.toAmountUi &&
            candidate.minimumReceivedUi === route.minimumReceivedUi &&
            candidate.routeLabels.join('|') === route.routeLabels.join('|')
          );
        }) === index
      );
    });

  if (routes.length === 0) {
    throw quoteErrors[0] ?? new Error('Unable to fetch a bridge quote right now.');
  }

  return {
    fromChain: input.fromChain,
    toChain: input.toChain,
    selectedRouteId: routes[0].id,
    routes
  } satisfies MobileBridgeQuoteSummary;
}

export async function fetchMobileShyftTokenMetadata(wallet: string, network: 'mainnet-beta' | 'devnet' = 'mainnet-beta') {
  const tokens = await fetchMobileShyftWalletTokens(wallet, network);
  return Object.fromEntries(tokens.map((token) => [token.mint, token]));
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parseNumberish(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function formatTypeLabel(value: string | undefined): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    return 'Activity';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return parseTimestampMs(numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function normalizeStatus(value: unknown): MobileShyftActivity['status'] {
  if (typeof value === 'boolean') {
    return value ? 'success' : 'failed';
  }

  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return 'unknown';
  }

  if (normalized.includes('success')) {
    return 'success';
  }

  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'failed';
  }

  return 'unknown';
}

function extractStringFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = normalizeString(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractAmountFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toLocaleString(undefined, {
        maximumFractionDigits: value >= 1 ? 4 : 6
      });
    }
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric.toLocaleString(undefined, {
          maximumFractionDigits: numeric >= 1 ? 4 : 6
        });
      }
      return value.trim();
    }
  }

  return null;
}

function extractActionAsset(record: Record<string, unknown>) {
  return extractStringFromRecord(record, [
    'symbol',
    'token_symbol',
    'tokenSymbol',
    'asset_symbol',
    'assetSymbol',
    'currency',
    'currency_symbol',
    'currencySymbol',
    'mint_symbol',
    'mintSymbol',
    'name'
  ]);
}

function extractTransactionEntries(payload: {
  result?: unknown;
}) {
  if (Array.isArray(payload.result)) {
    return payload.result as Array<Record<string, unknown>>;
  }

  const result = payload.result as
    | {
        transactions?: unknown;
        history?: unknown;
        txs?: unknown;
        result?: {
          transactions?: unknown;
          history?: unknown;
          txs?: unknown;
        };
      }
    | undefined;

  if (Array.isArray(result?.transactions)) {
    return result.transactions as Array<Record<string, unknown>>;
  }

  if (Array.isArray(result?.history)) {
    return result.history as Array<Record<string, unknown>>;
  }

  if (Array.isArray(result?.txs)) {
    return result.txs as Array<Record<string, unknown>>;
  }

  if (Array.isArray(result?.result?.transactions)) {
    return result.result.transactions as Array<Record<string, unknown>>;
  }

  if (Array.isArray(result?.result?.history)) {
    return result.result.history as Array<Record<string, unknown>>;
  }

  if (Array.isArray(result?.result?.txs)) {
    return result.result.txs as Array<Record<string, unknown>>;
  }

  return [];
}

function normalizeMobileShyftActivity(entry: Record<string, unknown>): MobileShyftActivity | null {
  const signature =
    normalizeString(entry.signature) ??
    (Array.isArray(entry.signatures) ? normalizeString(entry.signatures[0]) : null);
  if (!signature) {
    return null;
  }

  const type = normalizeString(entry.type) ?? 'activity';
  const actions = Array.isArray(entry.actions) ? (entry.actions as Array<Record<string, unknown>>) : [];
  const primaryActionInfo =
    actions.length > 0 && typeof actions[0]?.info === 'object' && actions[0]?.info
      ? (actions[0].info as Record<string, unknown>)
      : {};
  const amountLabel = (() => {
    const amount = extractAmountFromRecord(primaryActionInfo, [
      'amount',
      'amount_in',
      'amount_out',
      'in_amount',
      'out_amount',
      'deposit_amount',
      'withdraw_amount',
      'payment_amount',
      'value',
      'ui_amount',
      'uiAmount'
    ]);
    const asset = extractActionAsset(primaryActionInfo);
    if (amount && asset) {
      return `${amount} ${asset}`;
    }
    return amount ?? asset ?? formatTypeLabel(type);
  })();
  const subtitle =
    normalizeString((entry.protocol as { name?: unknown } | undefined)?.name) ??
    extractStringFromRecord(primaryActionInfo, [
      'receiver',
      'recipient',
      'destination',
      'to',
      'to_address',
      'toAddress',
      'mint',
      'token_address',
      'tokenAddress'
    ]) ??
    formatTypeLabel(type);

  return {
    id: signature,
    type,
    title: formatTypeLabel(type),
    subtitle,
    amountLabel,
    timestamp: parseTimestampMs(entry.timestamp),
    signature,
    status: normalizeStatus(entry.status),
    source: 'shyft'
  };
}

export async function fetchMobileShyftTransactionHistory(
  wallet: string,
  network: 'mainnet-beta' | 'devnet' = 'mainnet-beta',
  limit = 30
) {
  const apiKey = getMobileShyftApiKey();
  if (!apiKey) {
    return [] as MobileShyftActivity[];
  }

  const url = new URL('https://api.shyft.to/sol/v1/transaction/history');
  url.searchParams.set('network', network);
  url.searchParams.set('account', wallet);
  url.searchParams.set('tx_num', String(limit));
  url.searchParams.set('enable_raw', 'false');
  url.searchParams.set('enable_events', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Shyft activity request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as { result?: unknown };
  return extractTransactionEntries(payload)
    .map((entry) => normalizeMobileShyftActivity(entry))
    .filter((entry): entry is MobileShyftActivity => !!entry)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, limit);
}

export function formatUsdValue(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

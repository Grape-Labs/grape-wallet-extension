import type { GrapeChain } from '@grape/core';

const LIFI_BASE_URL = 'https://li.quest/v1';
const LIFI_API_KEY = import.meta.env.VITE_GRAPE_LIFI_API_KEY?.trim();

const CHAIN_ALIASES: Record<GrapeChain, string[]> = {
  solana: ['solana'],
  sui: ['sui'],
  monad: ['monad'],
  ethereum: ['eth', 'ethereum']
};

const FALLBACK_CHAIN_IDS: Partial<Record<GrapeChain, string>> = {
  solana: '1151111081099710',
  sui: '784',
  monad: '143',
  ethereum: '1'
};

export const LIFI_NATIVE_TOKEN_ADDRESS: Record<GrapeChain, string> = {
  solana: '11111111111111111111111111111111',
  sui: '0x2::sui::SUI',
  monad: '0x0000000000000000000000000000000000000000',
  ethereum: '0x0000000000000000000000000000000000000000'
};

export const LIFI_NATIVE_SYMBOL: Record<GrapeChain, string> = {
  solana: 'SOL',
  sui: 'SUI',
  monad: 'MON',
  ethereum: 'ETH'
};

export const LIFI_NATIVE_DECIMALS: Record<GrapeChain, number> = {
  solana: 9,
  sui: 9,
  monad: 18,
  ethereum: 18
};

type LifiChainResponse = {
  chains?: Array<{
    id?: string | number;
    key?: string;
    name?: string;
  }>;
};

type LifiStep = {
  toolDetails?: {
    name?: string;
  };
};

type LifiQuoteResponse = {
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
      name?: string;
      token?: {
        symbol?: string;
      };
    }>;
    gasCosts?: Array<{
      amountUSD?: string;
      amountUsd?: string;
      name?: string;
      token?: {
        symbol?: string;
      };
    }>;
  };
  action?: {
    fromChainId?: string | number;
    toChainId?: string | number;
  };
  includedSteps?: LifiStep[];
  steps?: LifiStep[];
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

export type BridgeQuoteSummary = {
  quoteResponse: Record<string, unknown>;
  fromChain: GrapeChain;
  toChain: GrapeChain;
  fromAmountUi: string;
  toAmountUi: string;
  fromSymbol: string;
  toSymbol: string;
  minimumReceivedUi?: string | null;
  feeUsd?: string | null;
  routeLabels: string[];
};

function createHeaders(): Record<string, string> {
  return LIFI_API_KEY ? { 'x-lifi-api-key': LIFI_API_KEY } : {};
}

async function fetchLifiJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = `${LIFI_BASE_URL}${path}${params && params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: createHeaders()
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `LI.FI request failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function fetchLifiChains(): Promise<NonNullable<LifiChainResponse['chains']>> {
  const response = await fetchLifiJson<LifiChainResponse>('/chains');
  return response.chains ?? [];
}

export async function resolveLifiChainId(chain: GrapeChain): Promise<string> {
  const chains = await fetchLifiChains().catch(() => []);
  const aliases = CHAIN_ALIASES[chain];
  const match = chains.find((candidate) => {
    const key = candidate.key?.trim().toLowerCase();
    const name = candidate.name?.trim().toLowerCase();
    return aliases.some((alias) => alias === key || alias === name);
  });

  if (match?.id !== undefined && match.id !== null) {
    return String(match.id);
  }

  const fallback = FALLBACK_CHAIN_IDS[chain];
  if (!fallback) {
    throw new Error(`LI.FI does not support ${chain} in this build.`);
  }

  return fallback;
}

export async function fetchNativeBridgeQuote(input: {
  fromChain: GrapeChain;
  toChain: GrapeChain;
  amountRaw: string;
  fromAddress: string;
  toAddress: string;
}): Promise<BridgeQuoteSummary> {
  const [fromChainId, toChainId] = await Promise.all([
    resolveLifiChainId(input.fromChain),
    resolveLifiChainId(input.toChain)
  ]);

  const params = new URLSearchParams({
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken: LIFI_NATIVE_TOKEN_ADDRESS[input.fromChain],
    toToken: LIFI_NATIVE_TOKEN_ADDRESS[input.toChain],
    fromAmount: input.amountRaw,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    integrator: 'grape'
  });

  const quote = await fetchLifiJson<LifiQuoteResponse>('/quote', params);
  const fromSymbol = quote.estimate?.fromToken?.symbol ?? LIFI_NATIVE_SYMBOL[input.fromChain];
  const toSymbol = quote.estimate?.toToken?.symbol ?? LIFI_NATIVE_SYMBOL[input.toChain];
  const fromDecimals = quote.estimate?.fromToken?.decimals ?? LIFI_NATIVE_DECIMALS[input.fromChain];
  const toDecimals = quote.estimate?.toToken?.decimals ?? LIFI_NATIVE_DECIMALS[input.toChain];
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
    quoteResponse: quote as Record<string, unknown>,
    fromChain: input.fromChain,
    toChain: input.toChain,
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

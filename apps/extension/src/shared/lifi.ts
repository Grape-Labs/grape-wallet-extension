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

const SUPPORTED_BRIDGE_DESTINATIONS: Record<GrapeChain, GrapeChain[]> = {
  solana: ['ethereum', 'monad', 'sui'],
  sui: [],
  monad: ['solana', 'ethereum'],
  ethereum: ['solana', 'monad', 'sui']
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

export function getSupportedBridgeDestinations(fromChain: GrapeChain): GrapeChain[] {
  return SUPPORTED_BRIDGE_DESTINATIONS[fromChain];
}

export function isBridgeRouteSupported(fromChain: GrapeChain, toChain: GrapeChain): boolean {
  return SUPPORTED_BRIDGE_DESTINATIONS[fromChain].includes(toChain);
}

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
  fromChain: GrapeChain;
  toChain: GrapeChain;
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
    if (message.includes('"code":1011') || message.includes('/toChain must be equal to one of the allowed values')) {
      throw new Error('This bridge route is not supported yet.');
    }
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
  if (!isBridgeRouteSupported(input.fromChain, input.toChain)) {
    throw new Error(`Bridging from ${input.fromChain} to ${input.toChain} is not supported yet.`);
  }

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

  const orderVariants = [
    { id: 'cheapest', label: 'Cheapest route', order: 'CHEAPEST' },
    { id: 'fastest', label: 'Fastest route', order: 'FASTEST' }
  ] as const;
  const quoteErrors: Error[] = [];

  const quotes = await Promise.all(
    orderVariants.map(async (variant) => {
      const nextParams = new URLSearchParams(params);
      nextParams.set('order', variant.order);
      const quote = await fetchLifiJson<LifiQuoteResponse>('/quote', nextParams).catch((error) => {
        if (error instanceof Error) {
          quoteErrors.push(error);
        }
        return null;
      });
      if (!quote) {
        return null;
      }

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

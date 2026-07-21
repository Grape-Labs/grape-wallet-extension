export const JUPITER_SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_PRICE_BATCH_SIZE = 50;
const JUPITER_API_KEY = import.meta.env.VITE_GRAPE_JUP_API_KEY?.trim();
export const JUPITER_BASE_URL = JUPITER_API_KEY ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
const JUPITER_PRICE_URL = `${JUPITER_BASE_URL}/price/v3`;
const JUPITER_QUOTE_URL = `${JUPITER_BASE_URL}/swap/v1/quote`;
const JUPITER_SWAP_URL = `${JUPITER_BASE_URL}/swap/v1/swap`;
const JUPITER_STOCKS_URL = JUPITER_API_KEY
  ? `${JUPITER_BASE_URL}/tokens/v2/tag?query=stocks`
  : `${JUPITER_BASE_URL}/tokens/v1/tagged/stocks`;
let stockMintCache: { expiresAt: number; mints: Set<string> } | null = null;

type JupiterPriceResponseEntry = {
  usdPrice?: number;
  price?: number;
  priceChange24h?: number;
};

type JupiterPriceResponse = Record<string, JupiterPriceResponseEntry>;

export type JupiterPriceQuote = {
  usdPrice: number | null;
  priceChange24h: number | null;
};
export type JupiterTokenSearchResult = {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string | null;
  tokenProgram?: string;
  usdPrice?: number | null;
  tags?: string[] | null;
  isVerified?: boolean | null;
};
let stockTokenCache: { expiresAt: number; tokens: JupiterTokenSearchResult[] } | null = null;

export type JupiterQuoteResponse = {
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

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += JUPITER_PRICE_BATCH_SIZE) {
    chunks.push(ids.slice(index, index + JUPITER_PRICE_BATCH_SIZE));
  }
  return chunks;
}

export async function fetchJupiterPrices(ids: string[]): Promise<Record<string, JupiterPriceQuote>> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {};
  }

  const responses = await Promise.all(
    chunkIds(uniqueIds).map(async (batch) => {
      const url = new URL(JUPITER_PRICE_URL);
      url.searchParams.set('ids', batch.join(','));
      const response = await fetch(url, {
        headers: JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : undefined
      });
      if (!response.ok) {
        throw new Error(`Jupiter pricing request failed with ${response.status}.`);
      }
      return (await response.json()) as JupiterPriceResponse;
    })
  );

  return Object.assign(
    {},
    ...responses.map((response) =>
      Object.fromEntries(
        Object.entries(response).map(([id, value]) => [
          id,
          {
            usdPrice: typeof value?.usdPrice === 'number' ? value.usdPrice : typeof value?.price === 'number' ? value.price : null,
            priceChange24h: typeof value?.priceChange24h === 'number' ? value.priceChange24h : null
          }
        ])
      )
    )
  );
}

export function getJupiterHeaders(): Record<string, string> | undefined {
  return JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : undefined;
}

export async function fetchJupiterStockMints(): Promise<Set<string>> {
  if (stockMintCache && stockMintCache.expiresAt > Date.now()) {
    return new Set(stockMintCache.mints);
  }
  const tokens = await fetchJupiterStockTokens();
  const mints = new Set(tokens.map((token) => token.id));
  stockMintCache = { expiresAt: Date.now() + 15 * 60 * 1000, mints };
  return new Set(mints);
}

export async function fetchJupiterStockTokens(): Promise<JupiterTokenSearchResult[]> {
  if (stockTokenCache && stockTokenCache.expiresAt > Date.now()) {
    return stockTokenCache.tokens.map((token) => ({ ...token }));
  }
  let response = await fetch(JUPITER_STOCKS_URL, { headers: getJupiterHeaders() });
  let rawPayload = response.ok ? await response.json() : null;
  // Jupiter's stocks tag has intermittently returned an embedded 400 payload with HTTP 200.
  // Search is the supported fallback and still exposes the official xstocks/stocks tags.
  if (!Array.isArray(rawPayload)) {
    const searchUrl = JUPITER_API_KEY
      ? `${JUPITER_BASE_URL}/tokens/v2/search?query=xStock`
      : `${JUPITER_BASE_URL}/tokens/v1/search?query=xStock`;
    response = await fetch(searchUrl, { headers: getJupiterHeaders() });
    rawPayload = response.ok ? await response.json() : null;
  }
  if (!response.ok || !Array.isArray(rawPayload)) {
    throw new Error(`Jupiter stock catalog request failed with ${response.status}.`);
  }
  const payload = rawPayload as Array<JupiterTokenSearchResult & { address?: string }>;
  const tokens = payload
    .map((token) => ({ ...token, id: token.id?.trim() || token.address?.trim() || '' }))
    .filter((token) =>
      token.id &&
      token.symbol &&
      Number.isInteger(token.decimals) &&
      (token.tags?.includes('stocks') || token.tags?.includes('xstocks'))
    );
  stockTokenCache = { expiresAt: Date.now() + 15 * 60 * 1000, tokens };
  stockMintCache = { expiresAt: Date.now() + 15 * 60 * 1000, mints: new Set(tokens.map((token) => token.id)) };
  return tokens.map((token) => ({ ...token }));
}

export async function searchJupiterTokens(query: string): Promise<JupiterTokenSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const url = JUPITER_API_KEY
    ? new URL(`${JUPITER_BASE_URL}/tokens/v2/search`)
    : new URL(`${JUPITER_BASE_URL}/tokens/v1/search`);
  url.searchParams.set('query', normalized);
  let response = await fetch(url, { headers: getJupiterHeaders() });
  if (!response.ok && !JUPITER_API_KEY && normalized.length >= 32) {
    response = await fetch(`${JUPITER_BASE_URL}/tokens/v1/token/${encodeURIComponent(normalized)}`);
    if (response.ok) {
      const token = (await response.json()) as JupiterTokenSearchResult & { address?: string };
      response = new Response(JSON.stringify([token]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  }
  if (!response.ok) throw new Error(`Jupiter token search failed with ${response.status}.`);
  const payload = (await response.json()) as Array<JupiterTokenSearchResult & { address?: string }>;
  return payload
    .map((token) => ({ ...token, id: token.id?.trim() || token.address?.trim() || '' }))
    .filter((token) => token.id && token.symbol && Number.isInteger(token.decimals));
}

export async function fetchJupiterQuote(input: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  onlyDirectRoutes?: boolean;
}): Promise<JupiterQuoteResponse> {
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set('inputMint', input.inputMint);
  url.searchParams.set('outputMint', input.outputMint);
  url.searchParams.set('amount', input.amount);
  url.searchParams.set('slippageBps', String(input.slippageBps));
  url.searchParams.set('swapMode', 'ExactIn');
  url.searchParams.set('restrictIntermediateTokens', 'true');
  if (input.onlyDirectRoutes) {
    url.searchParams.set('onlyDirectRoutes', 'true');
  }

  const response = await fetch(url, {
    headers: getJupiterHeaders()
  });

  if (!response.ok) {
    throw new Error(`Jupiter quote request failed with ${response.status}.`);
  }

  return (await response.json()) as JupiterQuoteResponse;
}

export async function createJupiterSwapTransaction(input: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
}): Promise<{ swapTransaction: string }> {
  const response = await fetch(JUPITER_SWAP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(getJupiterHeaders() ?? {})
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

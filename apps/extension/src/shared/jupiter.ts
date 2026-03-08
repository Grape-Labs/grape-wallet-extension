export const JUPITER_SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_PRICE_BATCH_SIZE = 50;
const JUPITER_API_KEY = import.meta.env.VITE_GRAPE_JUP_API_KEY?.trim();
export const JUPITER_BASE_URL = JUPITER_API_KEY ? 'https://api.jup.ag' : 'https://lite-api.jup.ag';
const JUPITER_PRICE_URL = `${JUPITER_BASE_URL}/price/v3`;
const JUPITER_QUOTE_URL = `${JUPITER_BASE_URL}/swap/v1/quote`;
const JUPITER_SWAP_URL = `${JUPITER_BASE_URL}/swap/v1/swap`;

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

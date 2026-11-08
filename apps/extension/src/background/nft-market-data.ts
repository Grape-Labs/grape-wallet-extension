import type { NftMarketData } from '../shared/tensor-types';

const BASE = 'https://api-mainnet.magiceden.dev/v2';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const cache = new Map<string, NftMarketData>();
const positiveNumber = (value: unknown) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function getJson(path: string) {
  const response = await fetch(BASE + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Market data request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

/** Only completed sales of this mint count; listings and transfers are not sales. */
export function latestIndexedSale(activities: unknown[], mint: string): NftMarketData['lastSale'] {
  const sales = activities.flatMap(value => {
    const row = record(value);
    if (row.tokenMint !== mint || !['buyNow', 'acceptBid', 'buy'].includes(String(row.type))) return [];
    const payment = record(record(row.priceInfo).tokenPrice);
    const currency = row.paymentMint ?? row.currencyMint ?? payment.address;
    if (currency && currency !== SOL_MINT && currency !== '11111111111111111111111111111111') return [];
    const priceSol = positiveNumber(row.price);
    const timestamp = positiveNumber(row.blockTime);
    if (priceSol === null || timestamp === null || timestamp > Date.now() / 1000 + 300) return [];
    return [{ priceSol, timestamp, signature: typeof row.signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(row.signature) ? row.signature : null }];
  });
  return sales.sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

export async function fetchNftMarketData(mint: string, forceRefresh = false): Promise<NftMarketData> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error('Invalid NFT mint.');
  const cached = cache.get(mint);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < 60000) return cached;
  const result: NftMarketData = { source: 'Magic Eden', fetchedAt: Date.now(), floorPriceSol: null, lastSale: null, warnings: [] };
  const floor = async () => {
    const token = record(await getJson(`/tokens/${encodeURIComponent(mint)}`));
    // Resolve the indexed collection by mint, never by an NFT's unverified symbol.
    if (typeof token.collection !== 'string' || !token.collection) return;
    const stats = record(await getJson(`/collections/${encodeURIComponent(token.collection)}/stats`));
    const floorLamports = positiveNumber(stats.floorPrice);
    result.floorPriceSol = floorLamports === null ? null : floorLamports / 1e9;
    result.collectionName = typeof token.collectionName === 'string' ? token.collectionName : token.collection;
  };
  const lastSale = async () => {
    const activities: unknown[] = [];
    for (let page = 0; page < 3; page++) {
      const rows = await getJson(`/tokens/${encodeURIComponent(mint)}/activities?offset=${page * 100}&limit=100`);
      if (!Array.isArray(rows)) throw new Error('Invalid market activity response.');
      activities.push(...rows);
      result.lastSale = latestIndexedSale(activities, mint);
      if (result.lastSale || rows.length < 100) return;
    }
    result.warnings.push('No sale found in the latest 300 indexed activities.');
  };
  const results = await Promise.allSettled([floor(), lastSale()]);
  if (results[0].status === 'rejected') result.warnings.push('Collection floor is temporarily unavailable.');
  if (results[1].status === 'rejected') result.warnings.push('Sale history is temporarily unavailable.');
  // Failed requests are retried on the next view; cache only complete reads.
  if (results.every(row => row.status === 'fulfilled')) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(mint, result);
  }
  return result;
}

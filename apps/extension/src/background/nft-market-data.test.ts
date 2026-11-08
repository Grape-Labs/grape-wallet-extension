import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNftMarketData, latestIndexedSale } from './nft-market-data';
const mint = 'ShVwdrTmJ8K3BqEgmFdBUV5MQxa4PYETLrjZPqMK1q1';
const sale = { tokenMint: mint, type: 'buyNow', price: 2.5, blockTime: 1700000000 };

afterEach(() => vi.unstubAllGlobals());

describe('NFT market data', () => {
  it('shows completed sales only, never listings, bids, transfers or another mint', () => {
    expect(latestIndexedSale([
      { ...sale, type: 'list', price: 100 }, { ...sale, type: 'bid' },
      { ...sale, type: 'transfer' }, { ...sale, tokenMint: 'another' },
      { ...sale, type: 'acceptBid', blockTime: 1700000100, price: 3 }, sale
    ], mint)).toMatchObject({ priceSol: 3, timestamp: 1700000100 });
  });
  it('does not turn missing, non-SOL or malformed prices into SOL values', () => {
    expect(latestIndexedSale([
      { ...sale, price: null }, { ...sale, price: 0 }, { ...sale, price: 'bad' },
      { ...sale, paymentMint: 'USDC' }, { ...sale, priceInfo: { tokenPrice: { address: 'USDC' } } },
      { ...sale, blockTime: 'invalid' }
    ], mint)).toBeNull();
  });
  it('converts floor lamports separately from sale prices which are already SOL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.includes('/activities?') ? [sale] : url.includes('/stats')
        ? { floorPrice: 1250000000 } : { collection: 'actual_collection', collectionName: 'Actual collection' }
    })));
    const data = await fetchNftMarketData(mint, true);
    expect(data.floorPriceSol).toBe(1.25);
    expect(data.lastSale?.priceSol).toBe(2.5);
    expect(data.collectionName).toBe('Actual collection');
    expect(data.warnings).toEqual([]);
  });
  it('finds older sales beyond a page of recent relistings', async () => {
    const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () =>
      url.includes('offset=0') ? Array.from({ length: 100 }, () => ({ ...sale, type: 'list' }))
        : url.includes('offset=100') ? [sale]
        : url.includes('/stats') ? { floorPrice: 1e9 } : { collection: 'collection' }
    }));
    vi.stubGlobal('fetch', fetch);
    expect((await fetchNftMarketData(mint, true)).lastSale?.priceSol).toBe(2.5);
    expect(fetch.mock.calls.some(([url]) => url.includes('offset=100'))).toBe(true);
  });
  it('keeps floor prices when sale history fails and marks the history unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/activities?')) throw new Error('rate limited');
      return { ok: true, json: async () => url.includes('/stats') ? { floorPrice: 1e9 } : { collection: 'collection' } };
    }));
    const data = await fetchNftMarketData(mint, true);
    expect(data.floorPriceSol).toBe(1);
    expect(data.lastSale).toBeNull();
    expect(data.warnings).toContain('Sale history is temporarily unavailable.');
  });
  it('does not infer collection prices from an NFT name or symbol', async () => {
    const fetch = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('/activities?') ? [] : { symbol: 'DTP', name: 'Degen Trash Panda #171' } }));
    vi.stubGlobal('fetch', fetch);
    expect((await fetchNftMarketData(mint, true)).floorPriceSol).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.includes('/collections/'))).toBe(false);
  });
});

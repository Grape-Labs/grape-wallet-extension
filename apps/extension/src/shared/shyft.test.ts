import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchShyftCollections } from './shyft';

describe('shyft collections parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('parses collections from the documented result.collections shape', async () => {
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'test-api-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            collections: [
              {
                collection_id: 'collection-1',
                name: 'Grape DAO',
                symbol: 'GRAPE',
                image: 'https://example.com/collection.png',
                nft_count: 2,
                nfts: [
                  {
                    mint: 'mint-1',
                    name: 'NFT One',
                    image: 'https://example.com/nft-1.png'
                  },
                  {
                    mint: 'mint-2',
                    name: 'NFT Two',
                    image: 'https://example.com/nft-2.png'
                  }
                ]
              }
            ]
          }
        })
      }))
    );

    await expect(fetchShyftCollections('mainnet-beta', 'wallet-address')).resolves.toEqual([
      {
        id: 'collection-1',
        name: 'Grape DAO',
        symbol: 'GRAPE',
        imageUri: 'https://example.com/collection.png',
        itemCount: 2,
        items: [
          {
            mint: 'mint-1',
            name: 'NFT One',
            imageUri: 'https://example.com/nft-1.png'
          },
          {
            mint: 'mint-2',
            name: 'NFT Two',
            imageUri: 'https://example.com/nft-2.png'
          }
        ]
      }
    ]);
  });
});

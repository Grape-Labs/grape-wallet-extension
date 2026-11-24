import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchShyftStakeAccounts, fetchShyftCollections, fetchShyftTransactionHistory } from './shyft';

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

describe('activity transfer identity', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('preserves wallet counterparties separately from the token mint', async () => {
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'test-api-key');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, result: [{
        signature: 'test-transfer', timestamp: '2026-09-23T12:00:00Z', status: 'Success',
        type: 'TOKEN_TRANSFER', actions: [{ type: 'TOKEN_TRANSFER',
          info: { amount: 50, token_address: 'usdc-mint', sender: 'wallet', receiver: 'recipient' }
        }]
      }] })
    })));
    const items = await fetchShyftTransactionHistory('mainnet-beta', 'wallet');
    expect(items[0].actions[0]).toMatchObject({ amount: '50', mint: 'usdc-mint', sender: 'wallet', recipient: 'recipient' });
  });
});

describe('Shyft stake account responses', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('reads documented result.data and converts whole SOL amounts into lamports', async () => {
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ success: true, result: { data: [{
        stake_account_address: 'stake-1', total_amount: 2, delegated_amount: 1,
        stake_authority_address: 'staker', withdraw_authority_address: 'withdrawer',
        vote_account_address: 'validator', state: 'active'
      }] } })
    })));
    expect(await fetchShyftStakeAccounts('mainnet-beta', 'wallet')).toEqual([{
      address: 'stake-1', lamports: 2000000000, delegatedLamports: 1000000000,
      staker: 'staker', withdrawer: 'withdrawer', voter: 'validator', state: 'active'
    }]);
  });
  it('preserves explicit lamport units in legacy responses', async () => {
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ success: true, result: [{
        address: 'stake-1', lamports: 1234567890, delegated_lamports: 1000000000
      }] })
    })));
    const accounts = await fetchShyftStakeAccounts('mainnet-beta', 'wallet');
    expect(accounts[0].lamports).toBe(1234567890);
    expect(accounts[0].delegatedLamports).toBe(1000000000);
  });
});

describe('Shyft backend stake lookup failures', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it('falls through once, then skips the broken endpoint until cooldown expires', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'stake-backend-failure-test');
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: 'failed to get accounts owned by program Stake11111111111111111111111111111111111111: Invalid params' }), { status: 400 })).mockImplementation(async () => new Response(JSON.stringify({ success: true, result: { data: [] } })));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'wallet-one')).rejects.toThrow('400');
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'wallet-two')).rejects.toThrow('Using RPC discovery');
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Other networks and other Shyft APIs remain usable.
    await expect(fetchShyftStakeAccounts('devnet', 'wallet-one')).resolves.toEqual([]);
    await expect(fetchShyftCollections('mainnet-beta', 'wallet-one')).resolves.toEqual([]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'wallet-one')).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('does not mistake a rejected successful-HTTP response for an empty wallet', async () => {
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'stake-logical-error-test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'failed to get accounts owned by program Stake11111111111111111111111111111111111111: Invalid params' }))));
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'wallet')).rejects.toThrow();
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'wallet')).rejects.toThrow('Using RPC discovery');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not disable stake discovery for unrelated bad requests', async () => {
    vi.stubEnv('VITE_GRAPE_SHYFT_API_KEY', 'stake-unrelated-error-test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Invalid wallet address' }), { status: 400 })));
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'bad-wallet')).rejects.toThrow('400');
    await expect(fetchShyftStakeAccounts('mainnet-beta', 'another-wallet')).rejects.toThrow('400');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from 'vitest';

import type { CollectionHolding, TokenHolding } from './models';
import { filterCollectibleTokens, getCollectibleMints, inferCollectibleMints, sortWalletTokens } from './assets';

function makeToken(overrides: Partial<TokenHolding> = {}): TokenHolding {
  return {
    mint: 'mint-a',
    amount: '1',
    decimals: 6,
    programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    accountAddress: 'account-a',
    ...overrides
  };
}

function makeCollection(overrides: Partial<CollectionHolding> = {}): CollectionHolding {
  return {
    id: 'collection-1',
    name: 'Collection One',
    itemCount: 1,
    items: [{ mint: 'nft-mint-1' }],
    ...overrides
  };
}

describe('wallet assets helpers', () => {
  it('collects NFT mints from collections', () => {
    const mints = getCollectibleMints([
      makeCollection(),
      makeCollection({
        id: 'collection-2',
        items: [{ mint: 'nft-mint-2' }, { mint: 'nft-mint-3' }]
      })
    ]);

    expect([...mints]).toEqual(['nft-mint-1', 'nft-mint-2', 'nft-mint-3']);
  });

  it('filters collectible mints out of token holdings', () => {
    const tokens = [
      makeToken({ mint: 'fungible-mint', symbol: 'USDC' }),
      makeToken({ mint: 'nft-mint-1', symbol: 'NFT' })
    ];

    expect(filterCollectibleTokens(tokens, [makeCollection()])).toEqual([tokens[0]]);
  });

  it('infers NFT-like mints from zero-decimal single-supply tokens', () => {
    const inferred = inferCollectibleMints([
      makeToken({ mint: 'nft-mint-1', decimals: 0, amount: '1', rawAmount: '1', rawSupply: '1' } as TokenHolding & {
        rawAmount: string;
        rawSupply: string;
      }),
      makeToken({ mint: 'fungible-mint', decimals: 0, amount: '2', rawAmount: '2', rawSupply: '1000' } as TokenHolding & {
        rawAmount: string;
        rawSupply: string;
      })
    ]);

    expect([...inferred]).toEqual(['nft-mint-1']);
  });

  it('merges inferred collectible mints with collection-derived mints', () => {
    const mints = getCollectibleMints([makeCollection()], new Set(['nft-mint-2']));

    expect([...mints]).toEqual(['nft-mint-2', 'nft-mint-1']);
  });

  it('sorts priced tokens ahead of unpriced tokens by USD value', () => {
    const tokens = [
      makeToken({ mint: 'unpriced', symbol: 'UNK', amount: '99999' }),
      makeToken({ mint: 'priced-low', symbol: 'LOW', amount: '10', priceUsd: 2, valueUsd: 20 }),
      makeToken({ mint: 'priced-high', symbol: 'HIGH', amount: '5', priceUsd: 10, valueUsd: 50 })
    ];

    expect(sortWalletTokens(tokens).map((token) => token.mint)).toEqual([
      'priced-high',
      'priced-low',
      'unpriced'
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import type { CollectionHolding, TokenHolding } from './models';
import { filterCollectibleTokens, getCollectibleMints, sortWalletTokens } from './assets';

function makeToken(overrides: Partial<TokenHolding> = {}): TokenHolding {
  return {
    mint: 'mint-a',
    amount: '1',
    decimals: 6,
    programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
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

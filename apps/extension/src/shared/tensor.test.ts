import { describe, expect, it } from 'vitest';
import { tensorItemUrl } from './tensor';
describe('Tensor marketplace links', () => {
  const mint = 'G2gpYLGAu9CiQ5kZaouR7PyCk6wWi2nCkaQadZ76kD3X';
  it('uses the exact asset mint', () => {
    expect(tensorItemUrl(mint, 'mainnet-beta')).toBe('https://www.tensor.trade/item/' + mint);
  });
  it('does not send devnet assets to the mainnet marketplace', () => {
    expect(tensorItemUrl(mint, 'devnet')).toBeNull();
  });
  it('rejects malformed identifiers and URL injection', () => {
    for (const mint of ['https://evil.example', '../test', '', '0'.repeat(32)])
      expect(tensorItemUrl(mint, 'mainnet-beta')).toBeNull();
  });
});

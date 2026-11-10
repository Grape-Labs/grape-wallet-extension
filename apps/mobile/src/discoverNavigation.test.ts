import { describe, expect, it } from 'vitest';
import { normalizeDiscoverUrlInput } from './discoverNavigation';

describe('Discover address bar', () => {
  it.each(['what', 'solana staking', '  what is grape?  ', 'SOL & BTC #news', 'τι είναι solana'])('searches %s', (input) => {
    expect(normalizeDiscoverUrlInput(input)).toEqual({
      url: `https://search.brave.com/search?q=${encodeURIComponent(input.trim())}`, error: null
    });
  });

  it.each([
    ['example.com', 'https://example.com/'],
    ['jup.ag/swap?input=SOL', 'https://jup.ag/swap?input=SOL'],
    ['https://example.com/path?q=sol', 'https://example.com/path?q=sol'],
    ['http://example.com', 'https://example.com/'],
    ['http://localhost:8080', 'http://localhost:8080/'],
    ['localhost:8080', 'https://localhost:8080/'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000/'],
    ['http://[::1]:3000', 'http://[::1]:3000/']
  ])('navigates to %s', (input, url) => {
    expect(normalizeDiscoverUrlInput(input)).toEqual({ url, error: null });
  });

  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'https://', 'https://bad host.com', 'https://user:password@example.com'])('rejects %s', (input) => {
    expect(normalizeDiscoverUrlInput(input).url).toBeNull();
    expect(normalizeDiscoverUrlInput(input).error).toBeTruthy();
  });

  it('ignores empty submissions', () => {
    expect(normalizeDiscoverUrlInput('  ')).toEqual({ url: null, error: null });
  });
});

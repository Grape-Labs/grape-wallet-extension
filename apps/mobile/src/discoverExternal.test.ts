import { describe, expect, it, vi } from 'vitest';
import { openDiscoverExternally } from './discoverExternal';

describe('Open Discover externally', () => {
  it('opens the current redirected page, including search parameters', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    await openDiscoverExternally('https://search.brave.com/search?q=solana', 'https://example.com', open);
    expect(open).toHaveBeenCalledExactlyOnceWith('https://search.brave.com/search?q=solana');
  });

  it.each(['about:blank', '', 'not a URL', 'javascript:alert(1)'])('falls back from %s to the requested page', async (current) => {
    const open = vi.fn().mockResolvedValue(undefined);
    await openDiscoverExternally(current, 'https://jup.ag', open);
    expect(open).toHaveBeenCalledExactlyOnceWith('https://jup.ag/');
  });

  it('rejects non-web pages without invoking the OS', async () => {
    const open = vi.fn();
    await expect(openDiscoverExternally('about:blank', 'file:///tmp/test', open)).rejects.toThrow('no web page');
    expect(open).not.toHaveBeenCalled();
  });

  it('reports an OS handoff failure to the caller for recovery', async () => {
    const error = new Error('No browser available');
    await expect(openDiscoverExternally('https://jup.ag', '', vi.fn().mockRejectedValue(error))).rejects.toBe(error);
  });
});

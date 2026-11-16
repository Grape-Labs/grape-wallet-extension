import { describe, expect, it } from 'vitest';
import { getEmbeddedDappUrl } from './dapp-launch';
describe('embedded dApp allowlist', () => {
  it.each(['https://governance.so/dao/abc?tab=proposals#vote', 'https://www.governance.so/', 'https://verification.governance.so/', 'https://access.governance.so/', 'https://round-trip.ai.studio/'])('allows %s', value => {
    expect(getEmbeddedDappUrl(value)?.href).toBe(value);
  });
  it.each(['https://governance.so.evil.example/', 'https://evilgovernance.so/', 'https://round-trip.ai.studio.evil.example/', 'https://sub.round-trip.ai.studio/', 'http://governance.so/', 'https://user:password@governance.so/', 'https://governance.so:8443/', 'javascript:alert(1)', 'chrome-extension://id/options.html', 'https://jup.ag/', 'not a URL'])('keeps %s outside the viewer', value => {
    expect(getEmbeddedDappUrl(value)).toBeNull();
  });
});

import { afterEach, vi } from 'vitest';
import { openDapp, preferEmbeddedDapps, setPreferEmbeddedDapps } from './dapp-launch';
afterEach(() => vi.unstubAllGlobals());
describe('dApp launch destination', () => {
  function setup() {
    const values = new Map<string, string>();
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://grape/${path}` } });
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    return open;
  }
  it('opens eligible apps in a dedicated extension tab and preserves their route', () => {
    const open = setup();
    const url = 'https://www.governance.so/dao/abc?tab=proposals#vote';
    openDapp(url);
    expect(open).toHaveBeenCalledWith(`chrome-extension://grape/dapp.html?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
  });
  it('persists the browser-tab preference', () => {
    const open = setup();
    setPreferEmbeddedDapps(false);
    expect(preferEmbeddedDapps()).toBe(false);
    openDapp('https://round-trip.ai.studio/');
    expect(open).toHaveBeenCalledWith('https://round-trip.ai.studio/', '_blank', 'noopener,noreferrer');
  });
  it('keeps third-party apps external even when embedding is enabled', () => {
    const open = setup();
    openDapp('https://jup.ag/', true);
    expect(open).toHaveBeenCalledWith('https://jup.ag/', '_blank', 'noopener,noreferrer');
  });
});

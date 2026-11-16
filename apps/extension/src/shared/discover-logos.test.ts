import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISCOVER_LOGOS, getDiscoverIconCandidates } from './discover-logos';

describe('Discover logo assets', () => {
  it('has a bundled image for every directory and payment provider entry', () => {
    const page = readFileSync(resolve('apps/extension/src/pages/popup/main.tsx'), 'utf8');
    const directory = page.slice(page.indexOf('const SOLANA_DISCOVER_DAPPS'), page.indexOf('const DISCOVER_DAPPS_BY_CHAIN'));
    const zcash = readFileSync(resolve('packages/core/src/discover.ts'), 'utf8');
    const payments = page.slice(page.indexOf('const paymentGroups ='), page.indexOf('const matchesProvider ='));
    const urls = [...(directory + zcash + payments).matchAll(/url: '(https:[^']+)'/g)].map(match => match[1]);
    urls.push('https://vine.governance.so');
    expect(urls.length).toBeGreaterThan(60);
    for (const url of urls) expect(DISCOVER_LOGOS[new URL(url).hostname], url).toBeTruthy();
  });
  it('ships real image files for all mapped hosts', () => {
    for (const asset of new Set(Object.values(DISCOVER_LOGOS))) {
      const file = resolve('apps/extension/public', asset);
      expect(existsSync(file), asset).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.length, asset).toBeGreaterThan(32);
      expect(/\.(png|ico|svg|jpg|webp|gif)$/.test(asset), asset).toBe(true);
    }
  });
  it('prefers the bundled brand over remote recent-site metadata', () => {
    expect(getDiscoverIconCandidates('https://jup.ag/swap', 'https://example.com/saved.png')[0]).toBe(DISCOVER_LOGOS['jup.ag']);
  });
  it('tries saved and standard icons for an unlisted recently connected app', () => {
    expect(getDiscoverIconCandidates('https://example.com/app', 'https://cdn.example.com/icon.png')).toEqual(['https://cdn.example.com/icon.png', 'https://example.com/apple-touch-icon.png', 'https://example.com/favicon.png', 'https://example.com/favicon.ico']);
  });
  it('ignores unsupported URLs and favicon metadata', () => {
    expect(getDiscoverIconCandidates('javascript:alert(1)')).toEqual([]);
    expect(getDiscoverIconCandidates('https://example.com', 'data:image/svg+xml,bad')[0]).toBe('https://example.com/apple-touch-icon.png');
    expect(getDiscoverIconCandidates('https://governance.so.evil.example')[0]).not.toMatch(/^dapp-logos/);
  });
});

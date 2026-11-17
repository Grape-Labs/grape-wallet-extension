// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NftGallery } from './NftGallery';
import { sendRuntimeMessage } from '../../shared/chrome';
vi.mock('../../shared/chrome', () => ({ sendRuntimeMessage: vi.fn(async ({ mint }) => ({ mint, fetchedAt: Date.now(), market: { source: 'Magic Eden', fetchedAt: Date.now(), floorPriceSol: null, lastSale: null, warnings: [] }, tokenAccountRentLamports: null, royaltyBps: null, restriction: null, notes: [] })) }));
const items = [{ mint: 'So11111111111111111111111111111111111111112', name: 'Collectible' }];
const report = { owner: '11111111111111111111111111111111', onInspect: vi.fn() };
describe('discreet NFT report entry', () => {
  let root: Root, container: HTMLDivElement;
  const render = (enabled = true) => act(() => root.render(createElement(NftGallery, { items, report: enabled ? report : undefined, renderItem: item => createElement('span', null, item.name) })));
  beforeEach(() => { vi.clearAllMocks(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); root = createRoot(container); });
  afterEach(() => act(() => root.unmount()));
  it('keeps one toolbar entry and no report panel through repeated gallery renders', () => {
    render(); render(); render();
    expect(container.querySelectorAll('.nft-report-toolbar-button')).toHaveLength(1);
    expect(container.querySelector('.nft-gallery-toolbar .nft-report-toolbar-button')).not.toBeNull();
    expect(container.querySelector('.nft-value-report')).toBeNull();
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
  });
  it('opens and closes one report without starting a scan; reopening preserves results', async () => {
    render();
    const trigger = container.querySelector<HTMLButtonElement>('.nft-report-toolbar-button')!;
    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.nft-value-report')?.id).toBe(trigger.getAttribute('aria-controls'));
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Generate report')!.click(); });
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Close NFT report"]')!.click());
    expect(container.querySelector('.nft-value-report')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => trigger.click()); render();
    expect(container.querySelectorAll('.nft-value-report')).toHaveLength(1);
    expect(container.querySelector('.nft-report-body')?.textContent).toContain('1 checked');
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
  });
  it('omits the entry when reports are not supported on the current wallet/network', () => {
    render(false); expect(container.querySelector('.nft-report-toolbar-button')).toBeNull();
  });
});

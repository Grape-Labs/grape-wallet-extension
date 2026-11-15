// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children), Text: ({ children }: { children: ReactNode }) => createElement('span', null, children), ScrollView: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, onPress, disabled, accessibilityLabel }: { children: ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string }) => createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel }, children),
  TextInput: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) => createElement('input', { value, onChange: (event: { target: { value: string } }) => onChangeText(event.target.value), 'aria-label': accessibilityLabel }),
  Image: () => null, Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) => visible ? createElement('section', { role: 'dialog' }, children) : null,
  ActivityIndicator: () => null, StyleSheet: { create: (value: unknown) => value }, Linking: { openURL: vi.fn(async () => {}) }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 })
}));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('./config', () => ({ getMobileSolanaRpcUrl: () => 'https://rpc.example' }));
const source = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./wallet', () => ({ loadWalletCollectibles: source.load }));
import { NftsScreen } from './NftsScreen';
import type { MobileWallet, MobileAsset } from './wallet';
import type { MobileThemePalette } from './theme';
const wallet = { id: 'wallet', address: 'owner', chain: 'solana' } as MobileWallet;
const props = { wallet, palette: {} as MobileThemePalette, active: true, reduceMotion: true, onBack: vi.fn() };
let root: Root; let element: HTMLDivElement;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { source.load.mockReset(); element = document.createElement('div'); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(() => root.unmount()); element.remove(); });
async function click(label: string) {
  const button = Array.from(element.querySelectorAll('button')).find(item => item.getAttribute('aria-label')?.includes(label) || item.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => { button.click(); });
}
describe('dedicated mobile NFT gallery', () => {
  it('opens NFT details and loads subsequent pages without duplicating cards', async () => {
    const item = { id: 'nft-1', chain: 'solana', name: 'Grape #1', collection: 'Grape collection' };
    source.load.mockResolvedValueOnce({ items: [item], nextCursor: '2' }).mockResolvedValueOnce({ items: [item, { ...item, id: 'nft-2', name: 'Grape #2' }] });
    await act(async () => { root.render(createElement(NftsScreen, props)); });
    await click('Grape #1'); expect(element.querySelector('[role="dialog"]')?.textContent).toContain('nft-1');
    await click('Close NFT details'); await click('Load more NFTs');
    expect(source.load).toHaveBeenLastCalledWith({ address: 'owner', chain: 'solana' }, '2');
    expect(Array.from(element.querySelectorAll('button')).filter(button => button.getAttribute('aria-label')?.includes('NFT details'))).toHaveLength(2);
  });
  it('shows an error rather than a false empty collection and supports retry', async () => {
    source.load.mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValueOnce({ items: [] });
    await act(async () => { root.render(createElement(NftsScreen, props)); });
    expect(element.textContent).toContain('Provider unavailable'); expect(element.textContent).not.toContain('No NFTs found');
    await click('Try again'); expect(element.textContent).toContain('No NFTs found');
  });
  it('ignores results after the gallery is no longer active', async () => {
    let resolve!: (value: unknown) => void;
    source.load.mockReturnValue(new Promise(done => { resolve = done; }));
    await act(async () => { root.render(createElement(NftsScreen, props)); });
    await act(() => root.render(createElement(NftsScreen, { ...props, active: false })));
    await act(async () => { resolve({ items: [{ id: 'late', chain: 'solana', name: 'Stale NFT' }] }); });
    expect(element.textContent).not.toContain('Stale NFT');
  });
});

it('retains NFTs already loaded by Assets when the indexer returns HTTP 400', async () => {
  source.load.mockRejectedValue(new Error('The NFT service is unavailable (HTTP 400).'));
  const knownAssets: MobileAsset[] = [{ id: 'ethereum-nft:0xcontract:7', chain: 'ethereum', tokenType: 'nft', symbol: 'NFT', amountLabel: '1 NFT', valueLabel: '', name: 'Known art', address: '0xcontract', accountAddress: '7', description: 'Collection' }, { id: 'eth', chain: 'ethereum', tokenType: 'native', symbol: 'ETH', amountLabel: '0 ETH', valueLabel: '', name: 'Ether' }];
  await act(async () => { root.render(createElement(NftsScreen, { ...props, wallet: { ...wallet, chain: 'ethereum' }, knownAssets } as Parameters<typeof NftsScreen>[0])); });
  expect(element.textContent).toContain('Showing NFTs already loaded with Assets');
  expect(element.textContent).toContain('Known art');
  expect(element.textContent).not.toContain('No NFTs found');
  await click('Known art');
  expect(element.querySelector('[role="dialog"]')?.textContent).toContain('Token ID: 7');
});

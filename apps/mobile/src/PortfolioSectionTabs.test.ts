// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => children,
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState }: { children: ReactNode; onPress: () => void; disabled: boolean; accessibilityLabel: string; accessibilityState: { selected: boolean } }) => createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel, 'aria-selected': accessibilityState.selected }, children),
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }
}));
vi.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
import { PortfolioSectionTabs } from './PortfolioSectionTabs';
import type { MobileThemePalette } from './theme';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('shows all portfolio destinations, exposes selection and prevents switching during signing', async () => {
  const element = document.createElement('div'); const root = createRoot(element); const onSelect = vi.fn();
  const props = { selected: 'home' as const, onSelect, palette: {} as MobileThemePalette, disabled: false, stakingAvailable: true };
  try {
    await act(() => root.render(createElement(PortfolioSectionTabs, props)));
    expect(Array.from(element.querySelectorAll('button')).map(button => button.textContent)).toEqual(['Assets', 'NFTs', 'Staking']);
    expect(element.querySelector('[aria-label="Assets"]')?.getAttribute('aria-selected')).toBe('true');
    await act(() => (element.querySelector('[aria-label="NFTs"]') as HTMLButtonElement).click());
    await act(() => (element.querySelector('[aria-label="Staking"]') as HTMLButtonElement).click());
    expect(onSelect.mock.calls.map(call => call[0])).toEqual(['nfts', 'staking']);
    await act(() => root.render(createElement(PortfolioSectionTabs, { ...props, disabled: true })));
    await act(() => (element.querySelector('[aria-label="NFTs"]') as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledTimes(2);
  } finally { await act(() => root.unmount()); }
});

it('adapts visible sections when switching to chains without staking or NFT support', async () => {
  const element = document.createElement('div'); const root = createRoot(element);
  const props = { selected: 'home' as const, onSelect: vi.fn(), palette: {} as MobileThemePalette, disabled: false, stakingAvailable: true, nftsAvailable: true };
  const labels = () => Array.from(element.querySelectorAll('button')).map(button => button.textContent);
  try {
    await act(() => root.render(createElement(PortfolioSectionTabs, props)));
    expect(labels()).toEqual(['Assets', 'NFTs', 'Staking']);
    await act(() => root.render(createElement(PortfolioSectionTabs, { ...props, stakingAvailable: false })));
    expect(labels()).toEqual(['Assets', 'NFTs']);
    await act(() => root.render(createElement(PortfolioSectionTabs, { ...props, stakingAvailable: false, nftsAvailable: false })));
    expect(labels()).toEqual(['Assets']);
    await act(() => root.render(createElement(PortfolioSectionTabs, props)));
    expect(labels()).toEqual(['Assets', 'NFTs', 'Staking']);
  } finally { await act(() => root.unmount()); }
});

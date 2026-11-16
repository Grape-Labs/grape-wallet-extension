// @vitest-environment jsdom
import { act, createElement, forwardRef, useImperativeHandle, useState, type ReactNode, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ measure: null as any, back: null as any, width: 390, scroll: vi.fn() }));
vi.mock('react-native', () => ({
  View: ({ children, onLayout, style }: any) => { if (onLayout) native.measure = onLayout; return createElement('div', { 'data-width': style?.width }, children); },
  Text: ({ children, accessibilityRole }: any) => createElement(accessibilityRole === 'header' ? 'h2' : 'span', null, children),
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState }: any) => createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel, role: accessibilityRole, 'aria-selected': accessibilityState?.selected }, children),
  ScrollView: forwardRef(({ children }: any, ref) => { useImperativeHandle(ref, () => ({ scrollTo: native.scroll })); return createElement('div', null, children); }),
  StyleSheet: { create: (value: unknown) => value }, useWindowDimensions: () => ({ width: native.width, height: 1024, fontScale: 1 }),
  BackHandler: { addEventListener: (_event: string, callback: any) => { native.back = callback; return { remove: () => { native.back = null; } }; } },
}));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null }));
vi.mock('@gorhom/bottom-sheet', () => ({ BottomSheetScrollView: ({ children }: { children: ReactNode }) => createElement('div', null, children) }));
vi.mock('./SelectionSheet', () => ({ SelectionSheet: ({ visible, children }: any) => visible ? createElement('section', { role: 'dialog' }, children) : null }));
import { NativeSettingsWorkspace, MobileSettingsPanel, SettingsPanelGrid } from './NativeSettingsWorkspace';
import { basePalette, type MobileThemePalette } from './theme';
import type { MobileSettingsCategory } from './settingsLayout';
const palette = { ...basePalette, primaryButton: '#b58cff', primaryButtonText: '#fff' } as MobileThemePalette;
let root: Root; let element: HTMLDivElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { native.width = 390; native.measure = null; element = document.createElement('div'); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(() => root.unmount()); element.remove(); });
const Fixture: FunctionComponent<{ disabled?: boolean; activeScreen?: boolean }> = ({ disabled = false, activeScreen = true }) => {
  const [active, setActive] = useState<MobileSettingsCategory>('wallet');
  return createElement(NativeSettingsWorkspace, { active, onSelect: setActive, palette, version: 'test', reduceMotion: true, disabled, activeScreen, children: createElement(SettingsPanelGrid, { children: createElement(MobileSettingsPanel, { title: active === 'addons' ? 'Private balances' : 'Network', children: createElement('span', null, 'Existing preference controls') }) }) });
}
async function click(label: string) { const target = Array.from(element.querySelectorAll('button')).find(node => node.getAttribute('aria-label')?.includes(label) || node.textContent === label); if (!target) throw new Error(`Missing ${label}`); await act(() => target.click()); }
describe('native Settings categories', () => {
  it('opens a phone category picker, switches to Add-ons, and closes the picker', async () => {
    await act(() => root.render(createElement(Fixture))); await click('Choose category');
    expect(element.querySelector('[role="dialog"]')).not.toBeNull(); await click('Add-ons');
    expect(element.querySelector('[role="dialog"]')).toBeNull(); expect(element.textContent).toContain('Private balances'); expect(element.textContent).not.toContain('Network');
  });
  it('keeps authentication work from being interrupted by category changes', async () => {
    await act(() => root.render(createElement(Fixture, { disabled: true }))); await click('Choose category');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });
  it('closes the picker on Android Back and when Settings loses focus', async () => {
    await act(() => root.render(createElement(Fixture))); await click('Choose category');
    await act(() => { expect(native.back()).toBe(true); }); expect(element.querySelector('[role="dialog"]')).toBeNull();
    await click('Choose category'); await act(() => root.render(createElement(Fixture, { activeScreen: false }))); expect(element.querySelector('[role="dialog"]')).toBeNull();
  });
  it('uses the measured tablet canvas and exposes direct category navigation', async () => {
    await act(() => root.render(createElement(Fixture))); await act(() => native.measure({ nativeEvent: { layout: { width: 812 } } }));
    expect(element.querySelector('button[aria-label="Settings category: General. Choose category"]')).toBeNull();
    await click('Add-ons'); expect(element.querySelector('button[aria-label="Add-ons"]')?.getAttribute('aria-selected')).toBe('true');
    expect(element.textContent).toContain('Private balances');
    const heading = Array.from(element.querySelectorAll('h2')).find(item => item.textContent === 'Private balances')!;
    expect(heading.parentElement?.parentElement?.parentElement?.getAttribute('data-width')).toBe('100%');
  });
});

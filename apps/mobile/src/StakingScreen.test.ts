// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ back: null as (() => boolean) | null }));
vi.mock('react-native', () => ({
  View: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Pressable: ({ children, onPress, disabled, accessibilityLabel }: { children: ReactNode; onPress?: () => void; disabled?: boolean; accessibilityLabel?: string }) => createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel }, children),
  TextInput: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string }) => createElement('input', { value, onChange: (event: { target: { value: string } }) => onChangeText(event.target.value), 'aria-label': accessibilityLabel }),
  ActivityIndicator: () => null, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Alert: { alert: vi.fn() }, Linking: { openURL: vi.fn(async () => {}) },
  BackHandler: { addEventListener: (_event: string, action: () => boolean) => { native.back = action; return { remove: () => {} }; } },
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 })
}));
vi.mock('@expo/vector-icons', () => ({ Feather: () => null, MaterialCommunityIcons: () => null }));
vi.mock('@gorhom/bottom-sheet', () => ({ BottomSheetScrollView: ({ children }: { children: ReactNode }) => createElement('div', null, children) }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => {}) }));
vi.mock('./SelectionSheet', () => ({
  SelectionSheet: ({ children, visible }: { children: ReactNode; visible: boolean }) => visible ? createElement('section', null, children) : null,
  SheetSearchInput: ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => createElement('input', { value, onChange: (event: { target: { value: string } }) => onChangeText(event.target.value), 'aria-label': 'Search validators' })
}));
const fixtures = vi.hoisted(() => ({ owner: 'owner', accounts: [{ address: 'stake-account', lamports: 2360000000, delegatedLamports: 2358000000, state: 'delegated', voter: 'vote-account', staker: 'owner', withdrawer: 'owner' }], validators: [{ voteAccount: 'vote-account', nodePubkey: 'node', name: 'Grape validator', commission: 5, activatedStakeLamports: 1000000000000, lastVote: 1, rootSlot: 1 }] }));
vi.mock('./solanaStaking', () => ({ createMobileStakingService: () => ({ accounts: async () => ({ accounts: fixtures.accounts, warnings: [] }), validators: async () => fixtures.validators }) }));
import { StakingScreen } from './StakingScreen';
import { basePalette, type MobileThemePalette } from './theme';
const palette = { ...basePalette, primaryButton: '#b58cff', primaryButtonText: '#fff' } as MobileThemePalette;
const defaults = () => ({ owner: fixtures.owner, rpcUrl: 'https://rpc.example', palette, active: true, busy: false, reviewOpen: false, balanceLamports: 7e9, solPrice: 70, privacy: false, reduceMotion: true, reloadToken: 0, notice: null, error: null, onBack: vi.fn(), onReview: vi.fn(async () => {}) });
let root: Root; let element: HTMLDivElement;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { element = document.createElement('div'); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(() => root.unmount()); element.remove(); });
async function click(label: string) {
  const button = Array.from(element.querySelectorAll('button')).find(item => item.getAttribute('aria-label') === label || item.textContent === label || item.getAttribute('aria-label')?.includes(label));
  if (!button) throw new Error(`Missing action: ${label}`);
  await act(async () => { button.click(); });
}
async function amount(value: string) {
  const field = element.querySelector('input[aria-label="Amount in SOL"]') as HTMLInputElement;
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('native staking screens', () => {
  it('opens account details and requests review instead of signing immediately', async () => {
    const props = defaults(); await act(async () => { root.render(createElement(StakingScreen, props)); });
    expect(element.textContent).toContain('Total'.toUpperCase());
    await click('Account details'); await click('Unstake SOL');
    expect(props.onReview).toHaveBeenCalledWith({ action: 'deactivate', stakeAccount: 'stake-account' });
  });
  it('searches/selects a validator and sends an exact amount to review', async () => {
    const props = defaults(); await act(async () => { root.render(createElement(StakingScreen, props)); });
    await click('Stake SOL'); await amount('1,5'); await click('Choose a validator');
    const row = Array.from(element.querySelectorAll('button')).find(item => item.textContent?.includes('5% commission ·'))!;
    await act(() => row.click()); await click('Review stake');
    expect(props.onReview).toHaveBeenCalledWith({ action: 'stake', amount: '1.5', voteAccount: 'vote-account' });
  });
  it('uses the selected account for withdrawal reviews', async () => {
    const props = defaults(); await act(async () => { root.render(createElement(StakingScreen, props)); });
    await click('Account details'); await click('Withdraw SOL'); await amount('0.5'); await click('Review withdrawal');
    expect(props.onReview).toHaveBeenCalledWith({ action: 'withdraw', amount: '0.5', stakeAccount: 'stake-account' });
  });
  it('keeps privacy balances hidden and blocks back while signing', async () => {
    const props = { ...defaults(), privacy: true, busy: true };
    await act(async () => { root.render(createElement(StakingScreen, props)); });
    expect(element.textContent).toContain('••••'); expect(element.textContent).not.toContain('2.36 SOL');
    expect(native.back!()).toBe(true); expect(props.onBack).not.toHaveBeenCalled();
    expect(Array.from(element.querySelectorAll('button')).find(item => item.textContent === 'Stake SOL')?.disabled).toBe(true);
  });
});

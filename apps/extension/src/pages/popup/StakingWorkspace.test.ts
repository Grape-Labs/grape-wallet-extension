// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StakingWorkspace } from './StakingWorkspace';
import type { StakeAccountRow, StakeValidatorRow } from '../../shared/models';
const owner = '11111111111111111111111111111111';
const vote = 'Vote111111111111111111111111111111111111111';
const account: StakeAccountRow = { address: 'Stake11111111111111111111111111111111111111', lamports: 2360000000, delegatedLamports: 2358000000, voter: vote, staker: owner, withdrawer: owner, state: 'delegated' };
const validator: StakeValidatorRow = { voteAccount: vote, name: 'Grape validator', nodePubkey: owner, activatedStakeLamports: 1000000000000, commission: 5, lastVote: 1, rootSlot: 1 };
const defaults = () => ({ accounts: [account], validators: [validator], loading: false, error: null, warnings: [], result: null, busy: null, balanceLamports: 7000000000, solPrice: 70, owner, privacy: false, watchOnly: false, network: 'mainnet-beta' as const, signingControl: null, signingReady: true, onRefresh: vi.fn(), onClearFeedback: vi.fn(), onStake: vi.fn(async () => true), onUnstake: vi.fn(async () => true), onWithdraw: vi.fn(async () => true) });
let element: HTMLDivElement; let root: Root;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  element = document.createElement('div'); document.body.append(element); root = createRoot(element);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(async () => { await act(() => root.unmount()); element.remove(); });
async function click(text: string) {
  const button = [...element.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => { button.click(); await Promise.resolve(); });
}
async function input(selector: string, value: string) {
  const field = element.querySelector(selector) as HTMLInputElement;
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function openAccount() { await act(() => (element.querySelector('.stake-account-row') as HTMLButtonElement).click()); }

describe('focused staking journey', () => {
  it('opens account details and requires review before unstaking', async () => {
    const props = defaults(); await act(() => root.render(createElement(StakingWorkspace, props)));
    expect(element.textContent).not.toContain('Harvest');
    expect(element.querySelector('form')).toBeNull();
    await openAccount(); await click('Unstake SOL');
    expect(element.textContent).toContain('Start unstaking?');
    expect(props.onUnstake).not.toHaveBeenCalled();
    await click('Confirm unstaking');
    expect(props.onUnstake).toHaveBeenCalledWith(account.address);
  });
  it('selects a validator and submits only after the stake review', async () => {
    const props = defaults(); await act(() => root.render(createElement(StakingWorkspace, props)));
    await click('Stake SOL'); await input('.stake-amount-input input', '1.5');
    await act(() => (element.querySelector('.stake-validator-trigger') as HTMLButtonElement).click());
    await act(() => (element.querySelector('.stake-validator-list button') as HTMLButtonElement).click());
    expect(element.querySelector('dialog')?.open).toBe(false);
    await act(() => element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(props.onStake).not.toHaveBeenCalled(); expect(element.textContent).toContain('Review stake');
    await click('Confirm stake'); expect(props.onStake).toHaveBeenCalledWith('1.5', vote);
  });
  it('uses the selected account for withdrawals and preserves input after a submission failure', async () => {
    const props = defaults(); props.onWithdraw.mockResolvedValue(false);
    await act(() => root.render(createElement(StakingWorkspace, props))); await openAccount(); await click('Withdraw SOL');
    await input('.stake-amount-input input', '0.25');
    await act(() => element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await click('Confirm withdrawal'); expect(props.onWithdraw).toHaveBeenCalledWith(account.address, '0.25');
    await act(() => (element.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click());
    expect((element.querySelector('.stake-amount-input input') as HTMLInputElement).value).toBe('0.25');
  });
  it.each(['Use maximum withdrawal amount', 'Use full account balance'])('fills the exact full withdrawal via %s without submitting', async label => {
    const props = { ...defaults(), accounts: [{ ...account, lamports: 2360253072 }] };
    await act(() => root.render(createElement(StakingWorkspace, props))); await openAccount(); await click('Withdraw SOL');
    await act(() => (element.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click());
    expect((element.querySelector('.stake-amount-input input') as HTMLInputElement).value).toBe('2.360253072');
    expect(props.onWithdraw).not.toHaveBeenCalled();
    await act(() => element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await click('Confirm withdrawal');
    expect(props.onWithdraw).toHaveBeenCalledWith(account.address, '2.360253072');
  });
  it('prevents watch-only signing and respects account authorities', async () => {
    const props = { ...defaults(), watchOnly: true, accounts: [{ ...account, staker: 'another', withdrawer: 'another' }] };
    await act(() => root.render(createElement(StakingWorkspace, props))); await openAccount();
    expect(element.textContent).not.toContain('Unstake SOL'); expect(element.textContent).not.toContain('Withdraw SOL');
    expect(props.onStake).not.toHaveBeenCalled(); expect(props.onUnstake).not.toHaveBeenCalled();
  });
  it('hides balances in privacy mode and labels incomplete discovery', async () => {
    await act(() => root.render(createElement(StakingWorkspace, { ...defaults(), privacy: true, warnings: ['Withdrawal lookup unavailable'] })));
    expect(element.textContent).toContain('partial balance'); expect(element.textContent).toContain('••••');
    expect(element.textContent).not.toContain('$165.20'); expect(element.textContent).not.toContain('2.36 SOL');
  });
});


describe('staking return estimates', () => {
  it('updates SOL and USD estimates from the amount and selected rate', async () => {
    const props = { ...defaults(), validators: [{ ...validator, estimatedApr: 6, yieldUpdatedAt: Date.now() }] };
    await act(() => root.render(createElement(StakingWorkspace, props)));
    await click('Stake SOL');
    expect(element.querySelector('.stake-return')?.textContent).toContain('Choose a validator');
    await input('.stake-amount-input input', '2');
    await act(() => (element.querySelector('.stake-validator-list button') as HTMLButtonElement).click());
    expect(element.querySelector('.stake-return-metrics')?.textContent).toContain('6%');
    expect(element.querySelector('.stake-return-metrics')?.textContent).toContain('0.12 SOL');
    expect(element.querySelector('.stake-return-metrics')?.textContent).toContain('$8.40');
    await input('.stake-amount-input input', '4');
    expect(element.querySelector('.stake-return-metrics')?.textContent).toContain('0.24 SOL');
    await act(() => root.render(createElement(StakingWorkspace, { ...props, privacy: true })));
    expect(element.querySelector('.stake-return-metrics')?.textContent).not.toContain('0.24');
    expect(element.querySelector('.stake-return-metrics')?.textContent).not.toContain('$16.80');
  });
  it('shows unavailable estimates for stale rates', async () => {
    await act(() => root.render(createElement(StakingWorkspace, { ...defaults(), validators: [{ ...validator, estimatedApr: 6, yieldUpdatedAt: Date.now() - 16 * 60_000 }] })));
    await openAccount();
    expect(element.querySelector('.stake-return')?.textContent).toContain('Rate unavailable');
    expect(element.querySelector('.stake-return-metrics')?.textContent).not.toContain('6%');
  });
});

describe('validator return comparison', () => {
  it('compares the same amount and period, including lower and equal returns', async () => {
    const props = { ...defaults(), validators: [{ ...validator, estimatedApr: 6, yieldUpdatedAt: Date.now() }, { ...validator, voteAccount: 'OtherVote', name: 'Other validator', estimatedApr: 8, yieldUpdatedAt: Date.now() }] };
    await act(() => root.render(createElement(StakingWorkspace, props)));
    await click('Stake SOL'); await input('.stake-amount-input input', '2');
    await act(() => (element.querySelector('.stake-validator-list button') as HTMLButtonElement).click());
    const comparison = element.querySelector('.stake-comparison')!;
    expect(comparison.textContent).toContain('0.12 SOL more ($8.40)');
    const selects = comparison.querySelectorAll('select');
    await act(() => { selects[0].value = 'OtherVote'; selects[0].dispatchEvent(new Event('change', { bubbles: true })); });
    expect(comparison.textContent).toContain('0.04 SOL less ($2.80)');
    await act(() => { selects[1].value = '6'; selects[1].dispatchEvent(new Event('change', { bubbles: true })); });
    expect(comparison.textContent).toContain('0.02 SOL less ($1.40)');
    expect(comparison.querySelector('svg title')?.textContent).toContain('over 6 months');
    await act(() => root.render(createElement(StakingWorkspace, { ...props, privacy: true })));
    expect(comparison.querySelector('svg')).toBeNull();
    expect(comparison.textContent).not.toContain('$1.40');
    expect(props.onStake).not.toHaveBeenCalled();
    await act(() => root.render(createElement(StakingWorkspace, { ...props, validators: props.validators.map(item => ({ ...item, estimatedApr: 6 })) })));
    expect(comparison.textContent).toContain('the same SOL rewards');
  });
});

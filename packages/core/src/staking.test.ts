import { estimateStakeApr } from './staking';
import { describe, expect, it } from 'vitest';
import { parseStakeAmount, stakeWithdrawalMax } from './staking';

describe('exact full stake-account withdrawal amount', () => {
  it.each([2360253072, 1, 2000000000, Number.MAX_SAFE_INTEGER])('round-trips every lamport of %s without locale formatting', lamports => {
    const amount = stakeWithdrawalMax(lamports);
    expect(amount).not.toBeNull();
    expect(parseStakeAmount(amount!)).toBe(BigInt(lamports));
    expect(amount).not.toContain(',');
  });
  it('preserves the screenshot balance exactly', () => {
    expect(stakeWithdrawalMax(2360253072)).toBe('2.360253072');
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('does not offer Max for invalid balance %s', value => {
    expect(stakeWithdrawalMax(value)).toBeNull();
  });
});

describe('estimated staking APR', () => {
  it('accounts for stake participation and validator commission', () => {
    expect(estimateStakeApr(.04, 1000, 600, 5)).toBeCloseTo(6.333333);
    expect(estimateStakeApr(.04, 1000, 600, 100)).toBe(0);
  });
  it('rejects missing or implausible network inputs', () => {
    expect(estimateStakeApr(.04, 1000, 0, 5)).toBeNull();
    expect(estimateStakeApr(NaN, 1000, 600, 5)).toBeNull();
    expect(estimateStakeApr(.04, 1000, 1200, 5)).toBeNull();
    expect(estimateStakeApr(.04, 1000, 600, -1)).toBeNull();
  });
});

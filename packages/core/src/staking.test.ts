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

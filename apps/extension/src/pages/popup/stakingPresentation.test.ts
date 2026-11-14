import { describe, expect, it } from 'vitest';
import type { StakeAccountRow } from '../../shared/models';
import { parseStakeAmount, stakeAccountStatus } from './stakingPresentation';
const account: StakeAccountRow = { address: 'account', lamports: 2360000000, delegatedLamports: 2358000000, voter: 'vote', staker: 'owner', withdrawer: 'owner', state: 'delegated' };
describe('stake account presentation', () => {
  it('distinguishes deactivation requests from delegated accounts without inventing withdrawal readiness', () => {
    expect(stakeAccountStatus({ ...account, deactivationEpoch: '18446744073709551615' }).label).toBe('Staked');
    expect(stakeAccountStatus({ ...account, deactivationEpoch: '800' })).toEqual({ label: 'Unstaking', tone: 'cooling', coolingDown: true });
    expect(stakeAccountStatus({ ...account, state: 'deactivating' }).label).toBe('Unstaking');
    expect(stakeAccountStatus({ ...account, state: 'unknown' }).label).toBe('Status unavailable');
  });
  it('parses amounts without rounding and rejects malformed or excessive precision', () => {
    expect(parseStakeAmount('.5')).toBe(500000000n);
    expect(parseStakeAmount('1.000000001')).toBe(1000000001n);
    expect(parseStakeAmount('0.000000001')).toBe(1n);
    for (const amount of ['0', '-1', '1e3', '1.0000000001', 'NaN', '9007199254740991', '']) expect(parseStakeAmount(amount)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { currentStakeApr, projectedStakeBalance } from './StakeComparison';
const validator = { voteAccount: 'vote', nodePubkey: 'node', commission: 5, activatedStakeLamports: 1, lastVote: 1, rootSlot: 1, estimatedApr: 6, yieldUpdatedAt: 1000 };
describe('staking projections', () => {
  it('uses simple annual rates over the selected period', () => {
    expect(projectedStakeBalance(100, 6, 12)).toBe(106);
    expect(projectedStakeBalance(100, 6, 6)).toBe(103);
    expect(projectedStakeBalance(100, 0, 12)).toBe(100);
    expect(projectedStakeBalance(100, 6, 0)).toBe(100);
  });
  it('accepts zero yield but rejects stale, future and invalid rates', () => {
    expect(currentStakeApr(validator, 2000)).toBe(6);
    expect(currentStakeApr({ ...validator, estimatedApr: 0 }, 2000)).toBe(0);
    expect(currentStakeApr(validator, 901000)).toBeNull();
    expect(currentStakeApr(validator, 999)).toBeNull();
    expect(currentStakeApr({ ...validator, estimatedApr: NaN }, 2000)).toBeNull();
    expect(currentStakeApr(undefined, 2000)).toBeNull();
  });
});

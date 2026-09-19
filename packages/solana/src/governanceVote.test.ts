import { expect, it } from 'vitest';
import { describeGovernanceVote } from './governanceVote';

it('uses option positions, not preference ranks, and preserves split allocations', () => {
  expect(describeGovernanceVote({ vote: { voteType: 0, approveChoices: [
    { rank: 0, weightPercentage: 0 }, { rank: 0, weightPercentage: 60 }, { rank: 1, weightPercentage: 40 }
  ] } }, [{ label: 'A' }, { label: 'B' }, { label: 'C' }])).toBe('B (60%), C (40%)');
});
it.each([[1, 'Deny'], [2, 'Abstain'], [3, 'Veto']])('decodes vote kind %s', (voteType, label) => {
  expect(describeGovernanceVote({ vote: { voteType: Number(voteType) } }, [])).toBe(label);
});
it('decodes legacy yes and no ballots without assuming missing records are yes', () => {
  expect(describeGovernanceVote({ voteWeight: { yes: 3n, no: 0n } }, [])).toBe('Yes');
  expect(describeGovernanceVote({ voteWeight: { yes: 0n, no: 3n } }, [])).toBe('No');
  expect(describeGovernanceVote({}, [])).toBe('Recorded (choice unavailable)');
});

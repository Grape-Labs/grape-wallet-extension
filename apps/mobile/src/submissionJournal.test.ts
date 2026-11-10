import { describe, expect, it } from 'vitest';
import { recoverSubmissionJournal } from './submissionJournal';
import type { MobileActivity } from './wallet';
const activity: MobileActivity = { id: 'a', chain: 'solana', walletId: 'wallet', type: 'send', title: 'Send SOL', subtitle: 'recipient', amountLabel: '1 SOL', timestamp: 1, signature: 'sig', status: 'unknown', source: 'local' };
const wallets = [{ id: 'wallet', chain: 'solana' as const }];
const entry = (value: unknown): [string, string] => ['journal', JSON.stringify(value)];
describe('submission journal recovery', () => {
  it('recovers a broadcast missing from wallet state', () => {
    expect(recoverSubmissionJournal([], [entry(activity)], wallets)).toEqual([activity]);
  });
  it('does not downgrade a confirmed activity or duplicate journal entries', () => {
    const confirmed = { ...activity, status: 'success' as const };
    expect(recoverSubmissionJournal([confirmed], [entry(activity), entry(activity)], wallets)).toEqual([confirmed]);
  });
  it('ignores malformed, deleted-account and wrong-chain records', () => {
    expect(recoverSubmissionJournal([], [['bad', '{'], entry(null), entry({ ...activity, walletId: 'deleted' }), entry({ ...activity, chain: 'ethereum' }), entry({ ...activity, timestamp: 'invalid' })], wallets)).toEqual([]);
  });
  it('bounds recovered history and sorts newest first', () => {
    const entries = Array.from({ length: 120 }, (_, i) => entry({ ...activity, id: `${i}`, signature: `${i}`, timestamp: i }));
    const result = recoverSubmissionJournal([], entries, wallets);
    expect(result).toHaveLength(100);
    expect(result[0].timestamp).toBe(119);
  });
});

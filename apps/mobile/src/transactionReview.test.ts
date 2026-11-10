import { describe, expect, it, vi } from 'vitest';
import { createReviewConfirmation } from './transactionReview';

describe('transaction review confirmation', () => {
  it('executes a reviewed action only once, even with concurrent taps', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const confirm = createReviewConfirmation(execute);
    await Promise.all([confirm(), confirm()]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('does not reuse authorization after an execution failure', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('Signing rejected'));
    const confirm = createReviewConfirmation(execute);
    await expect(confirm()).rejects.toThrow('Signing rejected');
    await confirm();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects stale reviews before invoking signing', async () => {
    let now = 0;
    const execute = vi.fn();
    const confirm = createReviewConfirmation(execute, () => now);
    now = 60_000;
    await expect(confirm()).rejects.toThrow('expired');
    expect(execute).not.toHaveBeenCalled();
  });
});

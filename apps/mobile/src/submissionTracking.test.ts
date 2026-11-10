import { describe, expect, it, vi } from 'vitest';
import { fetchSubmissionStatus, parseSubmissionStatus, recordSubmission } from './submissionTracking';

describe('submission confirmation', () => {
  it.each(['confirmed', 'finalized'])('accepts Solana %s', (confirmationStatus) => {
    expect(parseSubmissionStatus('solana', { value: [{ err: null, confirmationStatus }] })).toBe('success');
  });
  it('keeps processed and missing Solana transactions pending', () => {
    expect(parseSubmissionStatus('solana', { value: [{ err: null, confirmationStatus: 'processed' }] })).toBe('unknown');
    expect(parseSubmissionStatus('solana', { value: [null] })).toBe('unknown');
    expect(parseSubmissionStatus('solana', { value: [{}] })).toBe('unknown');
  });
  it('reports a Solana execution error', () => {
    expect(parseSubmissionStatus('solana', { value: [{ err: { InstructionError: [0, 'test'] } }] })).toBe('failed');
  });
  it.each(['ethereum', 'monad'])('uses mined %s receipt status', (chain) => {
    expect(parseSubmissionStatus(chain, { blockNumber: '0x123', status: '0x1' })).toBe('success');
    expect(parseSubmissionStatus(chain, { blockNumber: '0x123', status: '0x0' })).toBe('failed');
    expect(parseSubmissionStatus(chain, { status: '0x1' })).toBe('unknown');
    expect(parseSubmissionStatus(chain, null)).toBe('unknown');
  });
  it('keeps RPC failures pending instead of marking a transfer failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    try { expect(await fetchSubmissionStatus('solana', 'signature', 'https://rpc.example')).toBe('unknown'); }
    finally { vi.unstubAllGlobals(); }
  });
});

describe('broadcast record persistence', () => {
  it.each([[true, true], [true, false], [false, true], [false, false]])('handles journal=%s and wallet=%s', async (journal, state) => {
    const journalWrite = vi.fn(() => journal ? Promise.resolve() : Promise.reject(new Error('disk')));
    const stateWrite = vi.fn(() => state ? Promise.resolve() : Promise.reject(new Error('disk')));
    expect(await recordSubmission(journalWrite, stateWrite)).toBe(journal || state);
    expect(journalWrite).toHaveBeenCalledTimes(1);
    expect(stateWrite).toHaveBeenCalledTimes(1);
  });
});

it('contains synchronous persistence failures after broadcast', async () => {
  const stateWrite = vi.fn().mockResolvedValue(undefined);
  expect(await recordSubmission(() => { throw new Error('journal unavailable'); }, stateWrite)).toBe(true);
  expect(stateWrite).toHaveBeenCalledOnce();
});

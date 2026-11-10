import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestRouteJson } from './routeRequest';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('route request recovery', () => {
  it('returns valid quotes and propagates failures without retrying', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ amount: '123' }))).mockResolvedValueOnce(new Response('busy', { status: 429 }));
    expect(await requestRouteJson('https://quote.example')).toEqual({ amount: '123' });
    await expect(requestRouteJson('https://quote.example')).rejects.toThrow('Retry with your current amount');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('aborts a stalled quote and clears its timer', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const result = expect(requestRouteJson('https://quote.example', {}, 1000)).rejects.toThrow('entries are unchanged');
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears the timer after an offline failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await expect(requestRouteJson('https://quote.example')).rejects.toThrow('offline');
    expect(vi.getTimerCount()).toBe(0);
  });
});

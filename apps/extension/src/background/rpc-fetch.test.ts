import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPacedRpcFetch, withRpcDeadline } from './rpc-fetch';
afterEach(() => vi.useRealTimers());
const endpoint = 'https://mainnet.helius-rpc.com/';
describe('shared Helius request pacing', () => {
  it('spaces calls across callers sharing the endpoint', async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const fetcher = vi.fn<typeof fetch>(async () => { starts.push(Date.now()); return new Response('{}'); });
    const transport = createPacedRpcFetch(fetcher);
    const requests = [transport(endpoint), transport(endpoint), transport(endpoint)];
    await vi.runAllTimersAsync(); await Promise.all(requests);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(250);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(250);
  });
  it('stops queued calls on 429 and honors Retry-After without retrying a write', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '30' } })).mockResolvedValue(new Response('{}'));
    const transport = createPacedRpcFetch(fetcher);
    const pendingResults = Promise.allSettled([transport(endpoint, { method: 'POST', body: '{"method":"sendTransaction"}' }), transport(endpoint)]);
    await vi.advanceTimersByTimeAsync(250);
    const results = await pendingResults;
    expect(results.every(result => result.status === 'rejected')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_000);
    await expect(transport(endpoint)).rejects.toThrow('RPC rate limit');
    await vi.advanceTimersByTimeAsync(1000);
    await transport(endpoint);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('isolates endpoints and leaves other providers untouched', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new Response('', { status: String(input) === endpoint ? 429 : 200 }));
    const transport = createPacedRpcFetch(fetcher);
    await expect(transport(endpoint)).rejects.toThrow('RPC rate limit');
    await expect(transport('https://devnet.helius-rpc.com/')).resolves.toBeInstanceOf(Response);
    await expect(transport('https://rpc.example.com/')).resolves.toBeInstanceOf(Response);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('releases the queue after a network failure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(new Response('{}'));
    const transport = createPacedRpcFetch(fetcher);
    await expect(transport(endpoint)).rejects.toThrow('Offline');
    const next = transport(endpoint);
    await vi.runAllTimersAsync(); await expect(next).resolves.toBeInstanceOf(Response);
  });
});


it('does not block unrelated calls behind a slow response', async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(new Response('{}'));
  const transport = createPacedRpcFetch(fetcher);
  const slow = transport(endpoint);
  const fast = transport(endpoint);
  await vi.advanceTimersByTimeAsync(250);
  await expect(fast).resolves.toBeInstanceOf(Response);
  finish(new Response('{}'));
  await slow;
});
it('aborts stalled requests after the deadline', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))));
  const pending = withRpcDeadline(fetcher, 1000)(endpoint);
  const check = expect(pending).rejects.toThrow('RPC request timed out');
  await vi.advanceTimersByTimeAsync(1000);
  await check;
});

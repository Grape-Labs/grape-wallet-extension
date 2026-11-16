import { describe, expect, it, vi } from 'vitest';
import { createPrivacyReadFetch, privacyRateLimitMessage } from './privacyRpc';

const read = { method: 'POST', body: JSON.stringify({ method: 'getAccountInfo' }) };
describe('Privacy RPC rate limiting', () => {
  it('paces concurrent reads instead of sending a burst', async () => {
    let time = 0;
    const starts: number[] = [];
    const transport = createPrivacyReadFetch(async () => { starts.push(time); return Response.json({ result: null }); }, async ms => { time += ms; }, () => time);
    await Promise.all([transport('https://rpc.test', read), transport('https://rpc.test', read), transport('https://rpc.test', read)]);
    expect(starts).toEqual([0, 550, 1100]);
  });
  it('backs off after 429 and honors Retry-After before succeeding', async () => {
    let time = 0;
    const waits: number[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(Response.json({ result: 'ok' }));
    const transport = createPrivacyReadFetch(fetch, async ms => { waits.push(ms); time += ms; }, () => time);
    expect((await transport('https://rpc.test', read)).status).toBe(200);
    expect(waits).toEqual([2000]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('stops after bounded retries with a readable error', async () => {
    let time = 0;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response('', { status: 429 }));
    const transport = createPrivacyReadFetch(fetch, async ms => { time += ms; }, () => time);
    await expect(transport('https://rpc.test', read)).rejects.toThrow('Helius is rate limiting');
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(privacyRateLimitMessage({ cause: { context: { statusCode: 429 } } })).toContain('Please wait');
  });
  it('does not replay a submission or encrypted prover request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response('', { status: 429 }));
    const wait = vi.fn();
    const transport = createPrivacyReadFetch(fetch, wait);
    await transport('https://rpc.test', { method: 'POST', body: JSON.stringify({ method: 'sendTransaction' }) });
    await transport('https://rpc.test/prove', { method: 'POST', body: 'encrypted-request' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(wait).not.toHaveBeenCalled();
  });
  it('does not retry early when the provider requests a long cooldown', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '60' } }));
    await expect(createPrivacyReadFetch(fetch)('https://rpc.test', read)).rejects.toThrow('rate limiting');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

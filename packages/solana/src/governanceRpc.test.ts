import { afterEach, expect, it, vi } from 'vitest';
import type { Connection } from '@solana/web3.js';
import { createGovernanceRpcConnection } from './governanceRpc';

afterEach(() => vi.useRealTimers());

it('paces actual RPC calls across connections sharing an endpoint', async () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  const connection = () => ({ rpcEndpoint: 'https://rpc.test/pacing', getProgramAccounts: vi.fn(async function (this: { rpcEndpoint: string }) { expect(this.rpcEndpoint).toBe('https://rpc.test/pacing'); starts.push(Date.now()); return []; }) }) as unknown as Connection;
  const first = createGovernanceRpcConnection(connection());
  const second = createGovernanceRpcConnection(connection());
  const pending = Promise.all([first.getProgramAccounts({} as never), second.getProgramAccounts({} as never), first.getProgramAccounts({} as never)]);
  await vi.runAllTimersAsync();
  await pending;
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(180);
  expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(180);
  expect(createGovernanceRpcConnection(first)).toBe(first);
});

it('a rejected RPC request does not block subsequent requests', async () => {
  vi.useFakeTimers();
  const getAccountInfo = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(null);
  const connection = createGovernanceRpcConnection({ rpcEndpoint: 'https://rpc.test/recovery', getAccountInfo } as unknown as Connection);
  const failed = connection.getAccountInfo({} as never).catch((error) => error.message);
  const next = connection.getAccountInfo({} as never);
  await vi.runAllTimersAsync();
  expect(await failed).toBe('unavailable');
  expect(await next).toBeNull();
});

import { describe, expect, it, vi } from 'vitest';
import { assertPreparedRoute, assertRouteBudget, findRouteMaximum } from './routeFees';

describe('route-aware maximum', () => {
  it('re-quotes at the spendable amount and includes account costs', async () => {
    const quote = vi.fn(async (amount: bigint) => ({ amount }));
    const result = await findRouteMaximum({ balance: 1000n, quote, reserve: async () => 120n });
    expect(result).toEqual({ amount: 880n, quote: { amount: 880n } });
    expect(quote.mock.calls.map(([amount]) => amount)).toEqual([500n, 880n]);
  });
  it('re-quotes when the larger route needs more gas', async () => {
    const result = await findRouteMaximum({ balance: 1000n, quote: async amount => amount, reserve: async amount => amount > 800n ? 200n : 100n });
    expect(result.amount).toBe(800n);
    expect(result.quote).toBe(800n);
  });
  it('fails closed on missing fees, insufficient funds and provider failures', async () => {
    const quote = async (amount: bigint) => amount;
    await expect(findRouteMaximum({ balance: 1000n, quote, reserve: async () => 0n })).rejects.toThrow('unavailable');
    await expect(findRouteMaximum({ balance: 1000n, quote, reserve: async () => 1000n })).rejects.toThrow('Insufficient');
    await expect(findRouteMaximum({ balance: 1000n, quote: async () => { throw new Error('offline'); }, reserve: async () => 1n })).rejects.toThrow('offline');
  });
  it('bounds retries if fees keep increasing', async () => {
    let reserve = 0n;
    await expect(findRouteMaximum({ balance: 1000n, quote: async amount => amount, reserve: async () => reserve += 10n })).rejects.toThrow('changing');
  });
});
describe('prepared route binding', () => {
  const prepared = { walletId: 'wallet', quoteKey: 'quote', expiresAt: 100 };
  it('accepts only the same account, quote and unexpired approval', () => {
    expect(() => assertPreparedRoute(prepared, 'wallet', 'quote', 99)).not.toThrow();
    expect(() => assertPreparedRoute(prepared, 'other', 'quote', 99)).toThrow('changed');
    expect(() => assertPreparedRoute(prepared, 'wallet', 'other', 99)).toThrow('changed');
    expect(() => assertPreparedRoute(prepared, 'wallet', 'quote', 100)).toThrow('expired');
  });
});


it('requires another review when any approved gas bound or account reserve increases', () => {
  const approved = { reserveRaw: 100n, request: { gas: '10', gasPrice: '10' } };
  expect(() => assertRouteBudget(approved, { reserveRaw: 99n, request: { gas: '11', gasPrice: '9' } })).toThrow('gas changed');
  expect(() => assertRouteBudget(approved, { reserveRaw: 99n, request: { gas: '9', gasPrice: '11' } })).toThrow('gas changed');
  expect(() => assertRouteBudget(approved, { reserveRaw: 101n })).toThrow('fees increased');
  expect(() => assertRouteBudget(approved, { reserveRaw: 90n, request: { gas: '9', gasPrice: '10' } })).not.toThrow();
});

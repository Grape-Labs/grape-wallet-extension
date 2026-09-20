import { expect, it } from 'vitest';
import { hasPositiveGovernancePower } from './governancePower';
it('excludes zero balances and preserves tiny or large direct/delegated deposits', () => {
  for (const amount of ['0', '0.000000', '0 raw units', undefined, '-1', 'unknown']) expect(hasPositiveGovernancePower(amount)).toBe(false);
  for (const amount of ['1', '0.000000001', '900719925474099300001', '1 raw units']) expect(hasPositiveGovernancePower(amount)).toBe(true);
});

it('sorts totals ascending after decimal normalization, including delegated balances', async () => {
  const { compareGovernancePower: compare } = await import('./governancePower');
  expect(compare([{ amount: '1001200', decimals: 6 }], [{ amount: '2' }])).toBe(-1);
  expect(compare([{ amount: '1' }, { amount: '2' }], [{ amount: '2.5' }])).toBe(1);
  expect(compare([{ amount: '900719925474099300001' }], [{ amount: '900719925474099300002' }])).toBe(-1);
  expect(compare([{ amount: '0.000000001' }], [{ amount: '1', decimals: 9 }])).toBe(0);
});

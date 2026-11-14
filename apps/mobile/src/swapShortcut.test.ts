import { describe, expect, it, vi } from 'vitest';
import { getSwapShortcutAmount } from './swapShortcut';
describe('Swap percentage button regression', () => {
  it('fills all SOL percentages without preparing a transaction or requiring an output mint', async () => {
    const readBalance = vi.fn(async () => '1.000000001');
    const readMaximum = vi.fn(async () => { throw new Error('Invalid public key input'); });
    const results = await Promise.all([0.25, 0.5, 0.75].map(ratio => getSwapShortcutAmount({ ratio, native: true, decimals: 9, readBalance, readMaximum })));
    expect(results).toEqual(['0.250000000', '0.500000000', '0.750000000']);
    expect(readMaximum).not.toHaveBeenCalled();
  });
  it('uses only wallet/mint holdings for every token shortcut, including Max', async () => {
    const readBalance = vi.fn(async () => '1.234567890123456789');
    const readMaximum = vi.fn(async () => { throw new Error('cached token account missing'); });
    for (const ratio of [0.25, 0.5, 0.75, 1]) await getSwapShortcutAmount({ ratio, native: false, decimals: 18, readBalance, readMaximum });
    expect(readBalance).toHaveBeenCalledTimes(4);
    expect(readMaximum).not.toHaveBeenCalled();
  });
  it('retains the route fee reserve for native Max and propagates failures', async () => {
    const readBalance = vi.fn(async () => '1');
    const readMaximum = vi.fn(async () => '0.999995000');
    expect(await getSwapShortcutAmount({ ratio: 1, native: true, decimals: 9, readBalance, readMaximum })).toBe('0.999995000');
    expect(readBalance).not.toHaveBeenCalled();
    readMaximum.mockRejectedValueOnce(new Error('fee unavailable'));
    await expect(getSwapShortcutAmount({ ratio: 1, native: true, decimals: 9, readBalance, readMaximum })).rejects.toThrow('fee unavailable');
  });
});

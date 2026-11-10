import { getExactSendRatio } from './sendAmount';
import { describe, expect, it } from 'vitest';
import { getSendShortcutAmount } from './sendAmount';

describe('Send amount shortcuts', () => {
  it.each([[0.25, '25'], [0.5, '50'], [0.75, '75'], [1, '100']])('uses ratio %s', (ratio, expected) => {
    expect(getSendShortcutAmount(100, 6, ratio)).toBe(expected);
  });
  it('leaves SOL for fees on Max', () => {
    expect(getSendShortcutAmount(1, 9, 1, 0.00001)).toBe('0.99999');
  });
  it('rounds down to token precision', () => {
    expect(getSendShortcutAmount(1.234567, 6, 0.75)).toBe('0.925925');
    expect(getSendShortcutAmount(3, 0, 0.5)).toBe('1');
  });
  it('preserves whole-number trailing zeros', () => {
    expect(getSendShortcutAmount(100, 0, 1)).toBe('100');
  });
  it.each([0, -1, NaN, Infinity])('ignores unusable balance %s', (balance) => {
    expect(getSendShortcutAmount(balance, 9, 1)).toBe('');
  });
  it('does not consume the fee reserve for tiny balances', () => {
    expect(getSendShortcutAmount(0.000005, 9, 1, 0.00001)).toBe('');
  });
});


describe('exact send percentages', () => {
  it('does not round 18-decimal balances through floating point', () => {
    expect(getExactSendRatio('1.000000000000000001', 18, 100)).toBe('1.000000000000000001');
    expect(getExactSendRatio('1.000000000000000003', 18, 25)).toBe('0.250000000000000000');
  });
  it('rounds down indivisible units and blocks zero amounts', () => {
    expect(getExactSendRatio('7', 0, 50)).toBe('3');
    expect(() => getExactSendRatio('0.000000001', 9, 25)).toThrow('Insufficient');
  });
});

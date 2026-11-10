import { describe, expect, it } from 'vitest';
import { normalizeDecimalSeparator, normalizeDecimalInputForSubmit, sanitizeDecimalInput } from './amountInput';
describe('native decimal keyboard input', () => {
  it('preserves decimal comma amounts instead of multiplying them by ten', () => {
    expect(sanitizeDecimalInput('0,5', 9)).toBe('0.5');
    expect(normalizeDecimalSeparator(',5')).toBe('.5');
    expect(normalizeDecimalInputForSubmit('1,', 9)).toBe('1');
  });
  it('leaves malformed pasted text available for validation instead of changing the amount', () => {
    expect(normalizeDecimalInputForSubmit('1.2.', 9)).toBe('1.2.');
    for (const input of ['1e3', '1.2.3', '1,000.5', '-5', '12 SOL']) expect(sanitizeDecimalInput(input, 9)).toBe(input);
  });
  it('retains precision limits, leading decimal entry and trailing separators', () => {
    expect(sanitizeDecimalInput('.12', 9)).toBe('0.12');
    expect(sanitizeDecimalInput('0001.2345', 3)).toBe('1.234');
    expect(sanitizeDecimalInput('1.', 9)).toBe('1.');
    expect(sanitizeDecimalInput('', 9)).toBe('');
  });
});

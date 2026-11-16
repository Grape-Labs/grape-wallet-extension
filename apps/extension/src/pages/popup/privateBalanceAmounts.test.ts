import { describe, expect, it } from 'vitest';
import { formatLamportsAsSol, formatSolAmount, privateSolValuation } from './privateBalanceAmounts';

describe('Private Balance display units', () => {
  it('values private SOL separately from the public portfolio', () => {
    expect(privateSolValuation({ registered: true, balances: [{ mint: '11111111111111111111111111111111', amount: '10000000' }] }, 150)).toEqual({ sol: '0.01', usd: 1.5, otherAssets: false });
  });
  it('does not present missing data or an unpriced private balance as zero dollars', () => {
    expect(privateSolValuation(null, 150).usd).toBeNull();
    expect(privateSolValuation({ registered: false, balances: [] }, 150).usd).toBeNull();
    for (const price of [null, 0, NaN]) expect(privateSolValuation({ registered: true, balances: [{ mint: '11111111111111111111111111111111', amount: '10000000' }] }, price).usd).toBeNull();
    expect(privateSolValuation({ registered: true, balances: [] }, null).usd).toBe(0);
  });
  it('does not label SOL-only pricing as the value of other private tokens', () => {
    expect(privateSolValuation({ registered: true, balances: [{ mint: 'token-mint', amount: '10' }] }, 150)).toMatchObject({ usd: null, otherAssets: true });
  });
  it('renders fractional SOL review amounts without converting them to integer lamports', () => {
    expect(formatSolAmount('0.01')).toBe('0.01');
    expect(formatSolAmount('0.001')).toBe('0.001');
    expect(formatSolAmount('1.123456789')).toBe('1.123456789');
    expect(formatSolAmount('10.000000000')).toBe('10');
    expect(formatSolAmount('0')).toBe('0');
  });
  it('converts balances and fees from lamports with exact precision', () => {
    expect(formatLamportsAsSol('10000000')).toBe('0.01');
    expect(formatLamportsAsSol(5000)).toBe('0.000005');
    expect(formatLamportsAsSol('1')).toBe('0.000000001');
    expect(formatLamportsAsSol('10000000000')).toBe('10');
    expect(formatLamportsAsSol('18446744073709551615')).toBe('18446744073.709551615');
  });
  it('handles malformed display values without throwing or silently changing units', () => {
    for (const value of ['0.01', 'NaN', '', '-1', '1e9']) expect(formatLamportsAsSol(value)).toBe('—');
    for (const value of [NaN, Infinity, 0.01, Number.MAX_SAFE_INTEGER + 1]) expect(formatLamportsAsSol(value)).toBe('—');
    for (const value of ['', '1e9', '-0.1']) expect(formatSolAmount(value)).toBe('—');
  });
});

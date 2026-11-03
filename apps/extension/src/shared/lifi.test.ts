import { describe, expect, it } from 'vitest';
import { summarizeLifiSwapQuote, type LifiQuoteResponse } from './lifi';

const quote = {
  action: { toToken: { address: '0x1', chainId: 1, name: 'USD Coin', symbol: 'USDC', decimals: 6 } },
  estimate: { toAmount: '103507123', toAmountMin: '102989587' }
} satisfies LifiQuoteResponse;

describe('LI.FI swap output', () => {
  it('uses action token decimals for ETH to USDC, without rounding to zero', () => {
    expect(summarizeLifiSwapQuote(quote)).toEqual({
      outputAmountUi: '103.507123', minimumReceivedUi: '102.989587', outputSymbol: 'USDC'
    });
  });
  it('preserves tiny outputs and zero decimal tokens', () => {
    expect(summarizeLifiSwapQuote({ ...quote, estimate: { toAmount: '1' } }).outputAmountUi).toBe('0.000001');
    expect(summarizeLifiSwapQuote({ ...quote, action: { toToken: { ...quote.action.toToken, decimals: 0 } } }).outputAmountUi).toBe('103507123');
  });
  it.each([undefined, '0', '-1', 'bad'])('rejects missing or invalid output %s', (toAmount) => {
    expect(() => summarizeLifiSwapQuote({ ...quote, estimate: { toAmount } })).toThrow('invalid output');
  });
  it('rejects missing decimals rather than silently assuming 18', () => {
    expect(() => summarizeLifiSwapQuote({ estimate: quote.estimate })).toThrow('invalid output');
  });
});

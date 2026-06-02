import { describe, expect, it } from 'vitest';

import { extractExecutableBridgeTransactionRequest, hasExecutableBridgeTransaction } from '../src/bridge';

describe('bridge transaction extraction', () => {
  it('accepts Solana bridge quotes with data-only transaction requests', () => {
    const quoteResponse = {
      transactionRequest: {
        data: 'AQID'
      }
    } satisfies Record<string, unknown>;

    expect(extractExecutableBridgeTransactionRequest(quoteResponse, 'solana')).toEqual({
      data: 'AQID'
    });
    expect(hasExecutableBridgeTransaction(quoteResponse, 'solana')).toBe(true);
  });

  it('accepts executable bridge steps when the direct quote is not executable', () => {
    const quoteResponse = {
      transactionRequest: {
        to: '',
        data: ''
      },
      steps: [
        {
          transactionRequest: {
            to: '0x1234567890123456789012345678901234567890',
            data: '0xabcdef'
          }
        }
      ]
    } satisfies Record<string, unknown>;

    expect(extractExecutableBridgeTransactionRequest(quoteResponse, 'ethereum')).toEqual({
      to: '0x1234567890123456789012345678901234567890',
      data: '0xabcdef'
    });
    expect(hasExecutableBridgeTransaction(quoteResponse, 'ethereum')).toBe(true);
  });

  it('rejects EVM bridge quotes without a target address', () => {
    const quoteResponse = {
      transactionRequest: {
        data: '0xabcdef'
      }
    } satisfies Record<string, unknown>;

    expect(extractExecutableBridgeTransactionRequest(quoteResponse, 'ethereum')).toBeNull();
    expect(hasExecutableBridgeTransaction(quoteResponse, 'ethereum')).toBe(false);
  });
});

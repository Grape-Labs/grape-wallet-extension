import { describe, expect, it } from 'vitest';

import { extractExecutableBridgeTransactionRequest, hasExecutableBridgeTransaction, isValidBridgeRecipient, assertBridgeRecipient } from '../src/bridge';

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


describe('external bridge recipients', () => {
  it('validates recipients against their destination chain', () => {
    const evm = '0x1234567890123456789012345678901234567890';
    expect(isValidBridgeRecipient('ethereum', evm)).toBe(true);
    expect(isValidBridgeRecipient('monad', evm)).toBe(true);
    expect(isValidBridgeRecipient('sui', evm)).toBe(false);
    expect(isValidBridgeRecipient('sui', '0x' + 'ab'.repeat(32))).toBe(true);
    expect(isValidBridgeRecipient('solana', 'So11111111111111111111111111111111111111112')).toBe(true);
    expect(isValidBridgeRecipient('solana', evm)).toBe(false);
    expect(isValidBridgeRecipient('solana', '1'.repeat(33))).toBe(false);
    expect(isValidBridgeRecipient('ethereum', '0x' + '0'.repeat(40))).toBe(false);
  });
  it('checks native Zcash prefixes and checksums', () => {
    expect(isValidBridgeRecipient('zcash', 't1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F')).toBe(true);
    expect(isValidBridgeRecipient('zcash', 't1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7G')).toBe(false);
  });
  it('blocks execution after recipient changes and preserves case-sensitive addresses', () => {
    const recipient = '0x' + 'ab'.repeat(20);
    expect(() => assertBridgeRecipient({ action: { toAddress: recipient.toUpperCase() } }, 'ethereum', recipient)).not.toThrow();
    expect(() => assertBridgeRecipient({ action: { toAddress: recipient } }, 'ethereum', '0x' + 'cd'.repeat(20))).toThrow(/recipient changed/);
    expect(() => assertBridgeRecipient({}, 'ethereum', recipient)).toThrow(/recipient changed/);
    expect(() => assertBridgeRecipient({ action: { toAddress: 'Abc' } }, 'solana', 'abc')).toThrow(/recipient changed/);
  });
});

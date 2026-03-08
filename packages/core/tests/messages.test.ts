import { describe, expect, it } from 'vitest';

import { providerRequestSchema, providerResponseSchema, runtimeMessageSchema } from '../src/messages';

describe('message routing contracts', () => {
  it('validates provider requests and responses', () => {
    const request = providerRequestSchema.parse({
      id: 'request-1',
      method: 'signTransaction',
      origin: {
        origin: 'https://example.com',
        href: 'https://example.com/app',
        title: 'Example App'
      },
      params: {
        transaction: 'AQID'
      }
    });

    const response = providerResponseSchema.parse({
      id: 'request-1',
      success: true,
      result: {
        transaction: 'BAUG'
      }
    });

    expect(request.method).toBe('signTransaction');
    expect(response.success).toBe(true);
  });

  it('validates runtime messages used by extension pages', () => {
    const message = runtimeMessageSchema.parse({
      type: 'approval_respond',
      approvalId: 'approval-1',
      approved: true,
      password: 'secret123'
    });

    expect(message.type).toBe('approval_respond');
  });

  it('validates swap runtime messages used by the wallet popup', () => {
    const quoteMessage = runtimeMessageSchema.parse({
      type: 'wallet_get_swap_quote',
      amount: '1.25',
      slippageBps: 50,
      inputAsset: { kind: 'sol' },
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    });

    const executeMessage = runtimeMessageSchema.parse({
      type: 'wallet_execute_swap',
      quoteResponse: {
        inputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '1250000000',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outAmount: '1234000',
        slippageBps: 50
      }
    });

    expect(quoteMessage.type).toBe('wallet_get_swap_quote');
    expect(executeMessage.type).toBe('wallet_execute_swap');
  });
});

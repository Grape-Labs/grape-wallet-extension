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

  it('validates legacy sendTransaction provider requests', () => {
    const request = providerRequestSchema.parse({
      id: 'request-legacy-send-1',
      method: 'sendTransaction',
      origin: {
        origin: 'https://example.com',
        href: 'https://example.com/app',
        title: 'Example App'
      },
      params: {
        transaction: 'AQID'
      }
    });

    expect(request.method).toBe('sendTransaction');
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

  it('validates runtime messages for removing saved recent recipients', () => {
    const message = runtimeMessageSchema.parse({
      type: 'wallet_remove_recent_recipient',
      address: '7tCjotf5gGQ3U7P9C5iUKZx7PFrf7CAnr7Lq5M2vXy4V'
    });

    expect(message.type).toBe('wallet_remove_recent_recipient');
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

  it('accepts decimal runtime message amounts without a leading zero', () => {
    const quoteMessage = runtimeMessageSchema.parse({
      type: 'wallet_get_swap_quote',
      amount: '.1',
      slippageBps: 50,
      inputAsset: { kind: 'sol' },
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    });

    expect(quoteMessage.amount).toBe('.1');
  });

  it('validates token maintenance and incident response runtime messages', () => {
    const burn = runtimeMessageSchema.parse({
      type: 'wallet_burn_token',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      accountAddress: '3pon17fBLZ2GwkTsyHSkgjuYdbSyo1JU4nXxRjwvu9gG',
      amount: '1.25',
      decimals: 6,
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    });

    const incident = runtimeMessageSchema.parse({
      type: 'wallet_run_incident_response',
      safeWallet: '7tCjotf5gGQ3U7P9C5iUKZx7PFrf7CAnr7Lq5M2vXy4V',
      reserveSol: '0.02',
      revokeDelegates: true,
      sweepSplTokens: true,
      sweepSol: true,
      rotateCloseAuthorities: true,
      rotateMintAuthorities: true
    });

    expect(burn.type).toBe('wallet_burn_token');
    expect(incident.type).toBe('wallet_run_incident_response');
  });
});

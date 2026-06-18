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

  it('validates Sui and Monad provider requests', () => {
    const suiRequest = providerRequestSchema.parse({
      id: 'request-sui-1',
      method: 'sui_signTransaction',
      origin: {
        origin: 'https://example.com',
        href: 'https://example.com/app',
        title: 'Example App'
      },
      params: {
        transaction: '{"version":2}'
      }
    });

    const monadRequest = providerRequestSchema.parse({
      id: 'request-monad-1',
      method: 'monad_sendTransaction',
      origin: {
        origin: 'https://example.com',
        href: 'https://example.com/app',
        title: 'Example App'
      },
      params: {
        transaction: {
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '0x1'
        }
      }
    });

    expect(suiRequest.method).toBe('sui_signTransaction');
    expect(monadRequest.method).toBe('monad_sendTransaction');
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

  it('validates the auto-connect runtime message used by settings surfaces', () => {
    const message = runtimeMessageSchema.parse({
      type: 'wallet_set_auto_connect',
      enabled: false
    });

    expect(message).toMatchObject({
      type: 'wallet_set_auto_connect',
      enabled: false
    });
  });

  it('validates governance vote runtime messages with an explicit governance program', () => {
    const message = runtimeMessageSchema.parse({
      type: 'wallet_cast_governance_vote',
      daoId: 'By2sVGZXwfQq6rAiAM3rNPJ9iQfb5e2QhnF4YjJ4Bip',
      governanceProgramId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
      governanceId: '8opHzTAnfzRpPEx21XtnrVTX28YQuCpAjcn1PczScKh',
      proposalId: '7eHf3wBqLQxM5j5P3n4vD4K1M4x8rW2i5tQ7m4vWQx9G',
      proposalOwnerRecordId: '3wK8P3dJxLh9c4VYz6xW9g2V5sN3qT8mP4rL6fD2nQ1A',
      tokenOwnerRecordId: '5gM2R7hLqN4xP8vW3dT9kC1yB6jF2sH7uQ4mZ8pR1xY',
      governingTokenMint: '9xQeWvG816bUx9EPfEZdfnN6fCxW7G8xL9p1b2c3d4e',
      voteKind: 'approve'
    });

    expect(message.type).toBe('wallet_cast_governance_vote');
    expect(message).toMatchObject({
      governanceProgramId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw'
    });
  });

  it('validates runtime messages for removing saved recent recipients', () => {
    const message = runtimeMessageSchema.parse({
      type: 'wallet_remove_recent_recipient',
      address: '7tCjotf5gGQ3U7P9C5iUKZx7PFrf7CAnr7Lq5M2vXy4V'
    });

    expect(message.type).toBe('wallet_remove_recent_recipient');
  });

  it('validates runtime messages for adding and removing contacts', () => {
    const addMessage = runtimeMessageSchema.parse({
      type: 'wallet_add_contact',
      label: 'Alice',
      recipient: 'alice.sol'
    });
    const removeMessage = runtimeMessageSchema.parse({
      type: 'wallet_remove_contact',
      contactId: 'contact-1'
    });

    expect(addMessage).toMatchObject({
      type: 'wallet_add_contact',
      label: 'Alice',
      recipient: 'alice.sol'
    });
    expect(removeMessage).toMatchObject({
      type: 'wallet_remove_contact',
      contactId: 'contact-1'
    });
  });

  it('accepts short recipient domains for resolution and send runtime messages', () => {
    const resolveMessage = runtimeMessageSchema.parse({
      type: 'wallet_resolve_recipient',
      recipient: 'a.sol'
    });
    const sendMessage = runtimeMessageSchema.parse({
      type: 'wallet_send_transfer',
      recipient: 'a.skr',
      amount: '0.5',
      asset: { kind: 'sol' }
    });

    expect(resolveMessage).toMatchObject({
      type: 'wallet_resolve_recipient',
      recipient: 'a.sol'
    });
    expect(sendMessage).toMatchObject({
      type: 'wallet_send_transfer',
      recipient: 'a.skr'
    });
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

    expect(quoteMessage).toMatchObject({ amount: '.1' });
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

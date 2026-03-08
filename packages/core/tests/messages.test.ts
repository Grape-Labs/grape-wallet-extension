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
});

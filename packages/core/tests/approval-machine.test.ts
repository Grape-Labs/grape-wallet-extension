import { describe, expect, it } from 'vitest';

import { createPendingApproval, transitionApproval } from '../src/approval-machine';

describe('approval machine', () => {
  it('moves pending approvals to approved', () => {
    const pending = createPendingApproval('approval-1', 'connect');
    const approved = transitionApproval(pending, { type: 'APPROVE' });
    expect(approved.status).toBe('approved');
  });

  it('rejects double resolution', () => {
    const pending = createPendingApproval('approval-1', 'connect');
    const approved = transitionApproval(pending, { type: 'APPROVE' });
    expect(() => transitionApproval(approved, { type: 'REJECT', reason: 'nope' })).toThrow();
  });
});

import { GrapeError } from './errors';

export type ApprovalKind =
  | 'connect'
  | 'sign-message'
  | 'sign-transaction'
  | 'sign-all-transactions'
  | 'sign-and-send-transaction';

export type ApprovalState =
  | {
      status: 'pending';
      id: string;
      kind: ApprovalKind;
      createdAt: number;
    }
  | {
      status: 'approved';
      id: string;
      kind: ApprovalKind;
      createdAt: number;
      resolvedAt: number;
    }
  | {
      status: 'rejected';
      id: string;
      kind: ApprovalKind;
      createdAt: number;
      resolvedAt: number;
      reason: string;
    };

export type ApprovalEvent =
  | { type: 'APPROVE' }
  | { type: 'REJECT'; reason: string };

export function createPendingApproval(id: string, kind: ApprovalKind): ApprovalState {
  return {
    status: 'pending',
    id,
    kind,
    createdAt: Date.now()
  };
}

export function transitionApproval(state: ApprovalState, event: ApprovalEvent): ApprovalState {
  if (state.status !== 'pending') {
    throw new GrapeError('INVALID_APPROVAL_TRANSITION', `Approval ${state.id} is already resolved.`);
  }

  if (event.type === 'APPROVE') {
    return {
      status: 'approved',
      id: state.id,
      kind: state.kind,
      createdAt: state.createdAt,
      resolvedAt: Date.now()
    };
  }

  return {
    status: 'rejected',
    id: state.id,
    kind: state.kind,
    createdAt: state.createdAt,
    resolvedAt: Date.now(),
    reason: event.reason
  };
}


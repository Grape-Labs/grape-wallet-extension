import type { ApprovalKind, ApprovalState, OriginPermission, PageOrigin, ProviderRequest, SessionState, WalletState } from '@grape/core';
import type { TransactionSummary } from '@grape/solana';

export type ApprovalRecord = {
  id: string;
  kind: ApprovalKind;
  state: ApprovalState;
  request: ProviderRequest;
  origin: PageOrigin;
  createdAt: number;
  windowId?: number;
  requestedPermissions?: string[];
  network: WalletState['selectedNetwork'];
  publicKey?: string;
  transactionSummary?: TransactionSummary;
};

export type WalletStateResponse = {
  wallet: WalletState;
  session: SessionState;
  permissions: OriginPermission[];
  activeAccount?: { publicKey: string };
};


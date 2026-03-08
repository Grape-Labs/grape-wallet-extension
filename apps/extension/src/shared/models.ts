import type {
  ApprovalKind,
  ApprovalState,
  OriginPermission,
  PageOrigin,
  ProviderRequest,
  SendAsset,
  SessionState,
  WalletRecipient,
  WalletState
} from '@grape/core';
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
  requiresPassword?: boolean;
};

export type WalletStateResponse = {
  wallet: WalletState;
  session: SessionState;
  permissions: OriginPermission[];
  activeWallet?: { id: string; name: string; publicKey: string };
  activeAccount?: { publicKey: string };
  recentRecipients: WalletRecipient[];
  canUseUnlockedSigner: boolean;
};

export type TokenHolding = {
  mint: string;
  amount: string;
  decimals: number;
  programId: string;
  symbol?: string;
};

export type WalletAssetsResponse = {
  lamports: number | null;
  tokens: TokenHolding[];
};

export type SendTransferResponse = {
  signature: string;
  recipient: string;
  amount: string;
  asset: SendAsset;
  network: WalletState['selectedNetwork'];
};

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
import type { JupiterQuoteResponse } from './jupiter';

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
  name?: string;
  symbol?: string;
  logoUri?: string;
  priceUsd?: number | null;
  valueUsd?: number | null;
  priceChange24h?: number | null;
};

export type CollectibleItem = {
  mint: string;
  name?: string;
  imageUri?: string;
};

export type CollectionHolding = {
  id: string;
  name: string;
  symbol?: string;
  imageUri?: string;
  itemCount: number;
  items: CollectibleItem[];
};

export type WalletAssetsResponse = {
  lamports: number | null;
  tokens: TokenHolding[];
  collections?: CollectionHolding[];
  totalUsdValue?: number | null;
  nativePriceUsd?: number | null;
  nativeValueUsd?: number | null;
  nativePriceChange24h?: number | null;
};

export type SendTransferResponse = {
  signature: string;
  recipient: string;
  amount: string;
  asset: SendAsset;
  network: WalletState['selectedNetwork'];
};

export type WalletExportResponse = {
  walletId: string;
  walletName: string;
  publicKey: string;
  derivationPath: string;
  kind: 'mnemonic' | 'private-key';
  privateKeyBase58: string;
  mnemonic?: string;
};

export type WalletSwapQuoteResponse = {
  quoteResponse: JupiterQuoteResponse;
  inputMint: string;
  outputMint: string;
  inputAmountUi: string;
  outputAmountUi: string;
  priceImpactPct: string | null;
  routeLabels: string[];
  slippageBps: number;
};

export type WalletSwapExecuteResponse = {
  signature: string;
  inputMint: string;
  outputMint: string;
  inputAmountUi: string;
  outputAmountUi: string;
};

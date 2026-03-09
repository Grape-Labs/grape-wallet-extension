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
  hostSurfaceId?: string;
};

export type WalletStateResponse = {
  wallet: WalletState;
  session: SessionState;
  permissions: OriginPermission[];
  activeWallet?: {
    id: string;
    name: string;
    publicKey: string;
    biometricEnabled?: boolean;
    source?: 'created' | 'imported-mnemonic' | 'imported-private-key' | 'watch-only' | 'ledger';
    signerKind?: 'software' | 'watch-only' | 'ledger';
  };
  activeAccount?: { publicKey: string };
  recentRecipients: WalletRecipient[];
  canUseUnlockedSigner: boolean;
};

export type TokenHolding = {
  mint: string;
  amount: string;
  decimals: number;
  programId: string;
  accountAddress: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
  priceUsd?: number | null;
  valueUsd?: number | null;
  priceChange24h?: number | null;
  delegate?: string | null;
  delegatedAmount?: string | null;
  closeAuthority?: string | null;
};

export type CollectibleItem = {
  mint: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  accountAddress?: string;
  programId?: string;
  collectionId?: string;
  collectionName?: string;
  collectionSymbol?: string;
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
  cachedAt?: number;
  fromCache?: boolean;
  stale?: boolean;
};

export type TokenDetailsResponse = {
  mint: string;
  programId: string;
  accountAddress: string;
  name?: string;
  symbol?: string;
  logoUri?: string;
  amount: string;
  rawAmount: string;
  decimals: number;
  supply: string | null;
  rawSupply: string | null;
  mintInitialized: boolean | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  delegate: string | null;
  delegatedAmount: string | null;
  closeAuthority: string | null;
  accountState: string | null;
  metadataPda: string;
  metadataName: string | null;
  metadataSymbol: string | null;
  metadataUri: string | null;
  sellerFeeBasisPoints: number | null;
  updateAuthority: string | null;
};

export type SendTransferResponse = {
  signature: string;
  recipient: string;
  amount: string;
  asset: SendAsset;
  network: WalletState['selectedNetwork'];
};

export type TokenActionResponse = {
  signature: string;
  mint: string;
  accountAddress: string;
  action: 'burn' | 'close';
  amount?: string;
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

export type StakeAccountRow = {
  address: string;
  lamports: number;
  state: string;
  delegatedLamports: number;
  voter: string | null;
  staker: string | null;
  withdrawer: string | null;
};

export type WalletStakeAccountsResponse = {
  accounts: StakeAccountRow[];
  source: 'shyft' | 'rpc' | 'none';
  network: WalletState['selectedNetwork'];
  refreshedAt: number;
};

export type WalletStakeActionResponse = {
  signature: string;
  action: 'stake' | 'deactivate' | 'withdraw';
  stakeAccount: string;
  amountSol?: string;
  voteAccount?: string;
  network: WalletState['selectedNetwork'];
};

export type DelegatedTokenRisk = {
  accountAddress: string;
  mint: string;
  name?: string;
  symbol?: string;
  delegate: string;
  delegatedAmount?: string | null;
  closeAuthority?: string | null;
};

export type CloseAuthorityRisk = {
  accountAddress: string;
  mint: string;
  name?: string;
  symbol?: string;
  closeAuthority: string;
};

export type ControlledMintAuthority = {
  mint: string;
  name?: string;
  symbol?: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  controlsMintAuthority: boolean;
  controlsFreezeAuthority: boolean;
};

export type WalletSecurityReportResponse = {
  delegatedTokenAccounts: DelegatedTokenRisk[];
  externalCloseAuthorities: CloseAuthorityRisk[];
  controlledMints: ControlledMintAuthority[];
  warnings: string[];
  scannedAt: number;
};

export type IncidentResponseActionResult = {
  kind: 'revoke-delegates' | 'sweep-spl' | 'sweep-sol' | 'rotate-close-authorities' | 'rotate-mint-authorities';
  signatures: string[];
  itemCount: number;
};

export type IncidentResponseResponse = {
  safeWallet: string;
  reserveSol: string;
  actions: IncidentResponseActionResult[];
  warnings: string[];
};

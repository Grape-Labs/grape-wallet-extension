import type {
  AccessSessionState,
  ApprovalKind,
  ApprovalState,
  DeviceLinkSessionRecord,
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
  chain: WalletState['selectedChain'];
  request: ProviderRequest;
  origin: PageOrigin;
  createdAt: number;
  windowId?: number;
  requestedPermissions?: string[];
  network: WalletState['selectedNetwork'];
  publicKey?: string;
  walletId?: string;
  transactionSummary?: TransactionSummary;
  requiresPassword?: boolean;
  hostSurfaceId?: string;
};

export type WalletStateResponse = {
  wallet: WalletState;
  session: SessionState;
  permissions: OriginPermission[];
  access: AccessSessionState;
  activeWallet?: {
    id: string;
    name: string;
    publicKey: string;
    chain?: WalletState['selectedChain'];
    biometricEnabled?: boolean;
    source?: 'created' | 'imported-mnemonic' | 'imported-private-key' | 'watch-only' | 'ledger';
    signerKind?: 'software' | 'watch-only' | 'ledger';
  };
  activeAccount?: { publicKey: string };
  recentRecipients: WalletRecipient[];
  canUseUnlockedSigner: boolean;
  unlockedWalletIds: string[];
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
  nativeName?: string;
  nativeSymbol?: string;
  nativeDecimals?: number;
  nativeLogoUri?: string;
  totalUsdValue?: number | null;
  nativePriceUsd?: number | null;
  nativeValueUsd?: number | null;
  nativePriceChange24h?: number | null;
  cachedAt?: number;
  fromCache?: boolean;
  stale?: boolean;
};

export type WalletReputationSpace = {
  daoId: string;
  repMint: string;
  currentSeason: number;
  latestSeasonWithPoints: number;
  seasonCount: number;
  points: string;
  latestSeasonPoints: string;
  effectivePoints: string;
  metadataUri?: string | null;
  name?: string;
  symbol?: string;
  description?: string;
  imageUri?: string;
};

export type WalletReputationResponse = {
  spaces: WalletReputationSpace[];
  totalPoints: string;
  source: 'vine' | 'none';
  network: WalletState['selectedNetwork'];
  refreshedAt: number;
};

export type WalletVerificationPlatform = 'discord' | 'telegram' | 'twitter' | 'email' | 'unknown';

export type WalletVerificationIdentity = {
  daoId: string;
  spaceId: string;
  identityId: string;
  linkId: string;
  platform: WalletVerificationPlatform;
  platformCode: number;
  verified: boolean;
  verifiedAt: number | null;
  expiresAt: number | null;
  attestedBy: string | null;
  linkedAt: number | null;
  linkedWalletCount: number;
  currentWalletLinked: boolean;
  walletHashHex: string;
};

export type WalletVerificationResponse = {
  trackedSpaces: string[];
  identities: WalletVerificationIdentity[];
  totalVerified: number;
  source: 'shyft' | 'onchain' | 'none';
  network: WalletState['selectedNetwork'];
  refreshedAt: number;
};

export type WalletGovernanceProposalChoice = {
  rank: number;
  label: string;
  voteWeight: string;
  voteResult?: string | null;
};

export type WalletGovernanceProposalVoteSource = {
  tokenOwnerRecordId: string;
  governingTokenOwner: string;
  isDelegate: boolean;
  hasVoted: boolean;
};

export type WalletGovernanceProposal = {
  daoId: string;
  realmName: string;
  governanceProgramId: string;
  governanceId: string;
  proposalId: string;
  proposalName: string;
  descriptionLink?: string | null;
  state: string;
  stateCode: number;
  draftAt: number | null;
  votingAt: number | null;
  votingEndsAt: number | null;
  governingTokenMint: string;
  proposalOwnerRecordId: string;
  tokenOwnerRecordId: string | null;
  canVote: boolean;
  hasVoted: boolean;
  hasDenyOption: boolean;
  isDelegate: boolean;
  votingPowerType: 'community' | 'council' | 'delegated-community' | 'delegated-council' | 'unknown';
  voteSources: WalletGovernanceProposalVoteSource[];
  choices: WalletGovernanceProposalChoice[];
  yesVotes: string;
  noVotes: string;
  abstainVotes: string;
  denyVotes: string;
};

export type GovernanceDaoSummary = {
  daoId: string;
  realmName: string;
  communityMint: string;
  councilMint: string | null;
  /** Decimals for the community governance token (0 = whole units, e.g. NFT-based) */
  communityTokenDecimals: number;
  role: 'member' | 'delegate' | 'treasury';
  /** Own deposited community token voting power (raw bigint string) */
  communityVotingPower: string;
  /** Own deposited council token voting power (raw bigint string, always whole units) */
  councilVotingPower: string;
  /** Community tokens others have delegated to this wallet (raw bigint string) */
  delegateCommunityVotingPower: string;
  /** Council tokens others have delegated to this wallet (raw bigint string, always whole units) */
  delegateCouncilVotingPower: string;
  /** Number of wallets that have delegated to this wallet in this DAO */
  delegateCount: number;
};

export type GovernanceEligibleHolding = {
  mint: string;
  amount: string;
  rawAmount: string;
  decimals: number;
  symbol?: string;
  name?: string;
  logoUri?: string;
};

export type GovernanceEligibleDao = {
  daoId: string;
  realmName: string;
  communityMint: string;
  councilMint: string | null;
  communityHolding: GovernanceEligibleHolding | null;
  councilHolding: GovernanceEligibleHolding | null;
};

export type WalletGovernanceResponse = {
  trackedDaos: string[];
  discoveredDaos: string[];
  delegateDaos: string[];
  governedDaos: string[];
  memberDaos: number;
  proposals: WalletGovernanceProposal[];
  daos: GovernanceDaoSummary[];
  source: 'shyft' | 'rpc' | 'none';
  network: WalletState['selectedNetwork'];
  refreshedAt: number;
};

export type WalletGovernanceVoteResponse = {
  signature: string;
  daoId: string;
  proposalId: string;
  voteKind: 'approve' | 'deny' | 'abstain';
  choiceLabel?: string;
  network: WalletState['selectedNetwork'];
};

export type ChainTokenPreviewResponse = {
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  amount: string;
  rawAmount: string;
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
  chain: WalletState['selectedChain'];
  publicKey: string;
  derivationPath: string;
  kind: 'mnemonic' | 'private-key';
  privateKeyBase58: string;
  privateKeyBytes: number[];
  mnemonic?: string;
};

export type WalletDeviceLinkSessionResponse = DeviceLinkSessionRecord;

export type WalletSwapQuoteResponse = {
  inputMint: string;
  outputMint: string;
  inputAmountUi: string;
  slippageBps: number;
  selectedRouteId: string;
  routes: Array<{
    id: string;
    label: string;
    quoteResponse: JupiterQuoteResponse;
    outputAmountUi: string;
    priceImpactPct: string | null;
    routeLabels: string[];
  }>;
};

export type WalletSwapExecuteResponse = {
  signature: string;
  inputMint: string;
  outputMint: string;
  inputAmountUi: string;
  outputAmountUi: string;
};

export type WalletBridgeQuoteResponse = {
  fromChain: WalletState['selectedChain'];
  toChain: WalletState['selectedChain'];
  selectedRouteId: string;
  routes: Array<{
    id: string;
    label: string;
    quoteResponse: Record<string, unknown>;
    fromAmountUi: string;
    toAmountUi: string;
    fromSymbol: string;
    toSymbol: string;
    minimumReceivedUi?: string | null;
    feeUsd?: string | null;
    routeLabels: string[];
  }>;
};

export type WalletBridgeExecuteResponse = {
  signature: string;
  fromChain: WalletState['selectedChain'];
  toChain: WalletState['selectedChain'];
  fromAmountUi: string;
  toAmountUi: string;
  fromSymbol: string;
  toSymbol: string;
  destinationAddress: string;
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

export type StakeValidatorRow = {
  voteAccount: string;
  nodePubkey: string;
  name?: string | null;
  commission: number;
  activatedStakeLamports: number;
  lastVote: number;
  rootSlot: number;
};

export type WalletStakeValidatorsResponse = {
  validators: StakeValidatorRow[];
  source: 'rpc' | 'none';
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

export type WalletActivityAction = {
  type: string;
  label: string;
  amount?: string | null;
  asset?: string | null;
  address?: string | null;
  protocolName?: string | null;
};

export type WalletActivityItem = {
  signature: string;
  timestamp: number;
  status: 'success' | 'failed' | 'unknown';
  type: string;
  description: string;
  feeSol: number | null;
  feePayer: string | null;
  protocolName: string | null;
  protocolAddress: string | null;
  signers: string[];
  actions: WalletActivityAction[];
};

export type WalletActivityResponse = {
  items: WalletActivityItem[];
  source: 'shyft' | 'none';
  network: WalletState['selectedNetwork'];
  refreshedAt: number;
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

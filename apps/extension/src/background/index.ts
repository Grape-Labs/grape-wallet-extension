import {
  createEmptyWalletState,
  createInitialSessionState,
  createDeviceLinkPayloadText,
  createVaultRecord,
  createPendingApproval,
  base64ToBytes,
  decryptText,
  encryptText,
  extractExecutableBridgeTransactionRequest,
  getSelectedWallet,
  getSelectedWalletForChain,
  parseDeviceLinkPayloadText,
  resolveBiometricUnlockConfig,
  type DeviceLinkHandoffPayload,
  type DeviceLinkPreferencesSnapshot,
  type DeviceLinkSessionRecord,
  type GrapeChain,
  grantPermissions,
  hasPermission,
  isSessionExpired,
  listPermissions,
  migrateWalletState,
  removeWalletContact,
  removeWalletProfile,
  removeWalletRecipient,
  rememberWalletRecipient,
  revokeOriginPermissions,
  runtimeMessageSchema,
  type SendAsset,
  type ProviderRequest,
  providerRequestSchema,
  RpcError,
  STORAGE_KEYS,
  type RuntimeMessage,
  type VaultSecret,
  type WalletState,
  unlockVaultRecord,
  upsertWalletContact,
  verifyVaultPassword
} from '@grape/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  buildBurnSplTokenTransaction,
  buildCloseTokenAccountTransaction,
  buildSolTransferTransaction,
  buildSplTokenTransferTransaction,
  createAssociatedTokenAccountInstruction,
  createRevokeInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  estimateLegacyTransactionFee,
  exportSolanaSoftwareWalletSecret,
  getAssociatedTokenAddress,
  deriveSolanaAccount,
  deriveSolanaAccount0,
  importSolanaPrivateKey,
  resolveSolanaVaultSecret,
  parseDecimalAmount,
  TOKEN_AUTHORITY_TYPES,
  signAndSendSerializedTransaction,
  signAndSendTransaction,
  signMessageBytes,
  inspectTransaction,
  signSerializedTransaction,
  signSerializedTransactions,
  type TransactionSummary
} from '@grape/solana';
import {
  Authorized,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Lockup,
  ParsedAccountData,
  PublicKey,
  StakeProgram,
  Transaction,
  TransactionInstruction,
  VALIDATOR_INFO_KEY,
  ValidatorInfo
} from '@solana/web3.js';
import { resolve as resolveSolanaDomain } from '@bonfida/spl-name-service';
import { Record as AlternativeDomainRecord, TldParser } from '@onsol/tldparser';
import {
  getMaxVoterWeightRecordAddress,
  getVoterWeightRecordAddress,
  getAllGovernances,
  getAllProposals,
  getGovernance,
  getGovernanceProgramVersion,
  getRealmConfigAddress,
  getProposal,
  getRealm,
  getTokenOwnerRecord,
  getVoteRecord,
  getVoteRecordAddress,
  getVoteRecordsByVoter,
  getTokenOwnerRecordsByOwner,
  getGovernanceAccounts,
  TokenOwnerRecord,
  MemcmpFilter,
  getNativeTreasuryAddress,
  tryGetRealmConfig,
  ProposalState,
  Vote,
  VoteChoice,
  VoteKind,
  withCastVote
} from '@solana/spl-governance';
import { sendEthereumTokenWithLedger, sendEthereumWithLedger } from '../../../../packages/ethereum/src/ledger';
import { sendMonadTokenWithLedger, sendMonadWithLedger } from '../../../../packages/monad/src/ledger';
import { signAndSendLedgerSerializedTransaction, signAndSendLedgerTransaction } from '../../../../packages/solana/src/ledger';
import { sendSuiCoinWithLedger, sendSuiWithLedger, signSuiTransactionBytesWithLedger } from '../../../../packages/sui/src/ledger';
import {
  createSuiClient,
  deriveSuiAccount0,
  getSuiHoldings,
  getSuiCollectibles,
  getSuiSwapQuote,
  executeSuiSwap,
  importSuiPrivateKey,
  resolveSuiTransactionBytes,
  resolveSuiVaultSecret,
  sendSui,
  sendSuiCoin,
  validateSuiAddress,
  type SuiNetwork
} from '@grape/sui';
import {
  createMonadPublicClient,
  deriveMonadAccount0,
  getMonadHoldings,
  getMonadTokenPreview,
  importMonadPrivateKey,
  resolveMonadVaultSecret,
  sendMonad,
  sendMonadToken,
  sendMonadTransactionRequest,
  validateMonadAddress,
  type MonadNetwork
} from '@grape/monad';
import {
  createEthereumPublicClient,
  deriveEthereumAccount0,
  getEthereumHoldings,
  getEthereumTokenPreview,
  importEthereumPrivateKey,
  resolveEthereumVaultSecret,
  sendEthereum,
  sendEthereumToken,
  sendEthereumTransactionRequest,
  validateEthereumAddress,
  type EthereumNetwork
} from '@grape/ethereum';

import type {
  ApprovalRecord,
  ChainTokenPreviewResponse,
  WalletActivityResponse,
  WalletBridgeExecuteResponse,
  CollectionHolding,
  CollectibleItem,
  StakeAccountRow,
  StakeValidatorRow,
  TokenHolding,
  WalletAssetsResponse,
  WalletBridgeQuoteResponse,
  GovernanceEligibleDao,
  WalletGovernanceResponse,
  WalletGovernanceVoteResponse,
  WalletReputationResponse,
  WalletVerificationResponse
} from '../shared/models';

import { filterCollectibleTokens, inferCollectibleMints, sortWalletTokens } from '../shared/assets';
import { ChromeStorageArea, permissionsStorage, sessionStorage, walletStateStorage } from '../shared/chrome';
import { formatSavedRecipient, parseSupportedSolanaRecipientDomain } from '../shared/recipient-resolution';
import {
  createJupiterSwapTransaction,
  fetchJupiterPrices,
  fetchJupiterQuote,
  fetchJupiterStockMints,
  JUPITER_SOL_MINT,
  type JupiterQuoteResponse
} from '../shared/jupiter';
import { fetchLifiSwapQuote, fetchLifiTokenCatalog, fetchNativeBridgeQuote, getSupportedBridgeDestinations, isBridgeRouteSupported, LIFI_NATIVE_DECIMALS, LIFI_NATIVE_SYMBOL, LIFI_NATIVE_TOKEN_ADDRESS } from '../shared/lifi';
import { getRpcEndpoint } from '../shared/rpc';
import {
  fetchShyftCollections,
  fetchShyftStakeAccounts,
  fetchShyftTransactionHistory,
  fetchShyftWalletTokens,
  hasShyftApiKey
} from '../shared/shyft';

const SOLANA_CONFIG_PROGRAM_ID = new PublicKey('Config1111111111111111111111111111111111111');

const approvalsStorage = new ChromeStorageArea<Record<string, ApprovalRecord>>(chrome.storage.local, STORAGE_KEYS.approvals, {});
const deviceLinkStorage = new ChromeStorageArea<Record<string, DeviceLinkSessionRecord>>(
  chrome.storage.local,
  STORAGE_KEYS.deviceLinkSessions,
  {}
);
const accessSessionStorage = new ChromeStorageArea<import('@grape/core').AccessSessionState>(
  chrome.storage.local,
  'grape:access-session',
  {
    granted: true,
    requiredDaoId: '',
    grantedAt: null,
    lastCheckedAt: null
  }
);
const unlockedSecretSessionStorage = new ChromeStorageArea<UnlockedSecretCache>(
  chrome.storage.session,
  'grape:unlocked-secrets',
  {}
);
const unlockedPasswordSessionStorage = new ChromeStorageArea<{ value: string | null }>(
  chrome.storage.session,
  'grape:unlocked-password',
  { value: null }
);
const providerConnectionState = new WeakMap<chrome.runtime.Port, Set<string>>();
const assetCacheStorage = new ChromeStorageArea<Record<string, { cachedAt: number; data: WalletAssetsResponse }>>(
  chrome.storage.session,
  'grape:asset-cache',
  {}
);
type ActiveWalletSurface = {
  port: chrome.runtime.Port;
  surfaceId: string;
  page: string;
  visible: boolean;
  lastSeenAt: number;
};

const activeWalletSurfacePorts = new Map<chrome.runtime.Port, ActiveWalletSurface>();
const SURFACE_STALE_MS = 15_000;
const TOKEN_PROGRAM_IDS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
] as const;
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const VINE_REP_PROGRAM_ID = new PublicKey('V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX');
const VERIFICATION_REGISTRY_PROGRAM_ID = new PublicKey('VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q');
const DEFAULT_GOVERNANCE_PROGRAM_ID = 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw';
const GOVERNANCE_PROGRAM_VERSION_V1 = 1;
const GOVERNANCE_PROGRAM_VERSION_V2 = 2;
const GOVERNANCE_PROGRAM_VERSION_V3 = 3;
const GOVERNANCE_GRAPHQL_URL = 'https://grape.shyft.to/v1/graphql/';
const VERIFICATION_GRAPHQL_NAMESPACE = 'grape_verification_registry';
const GRAPHQL_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const COINGECKO_SIMPLE_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const GECKOTERMINAL_BASE_URL = 'https://api.geckoterminal.com/api/v2';
const GECKOTERMINAL_TOKEN_BATCH_SIZE = 50;
const ETHEREUM_BLOCKSCOUT_BASE_URL = 'https://eth.blockscout.com/api/v2';
const ETHEREUM_SEPOLIA_BLOCKSCOUT_BASE_URL = 'https://eth-sepolia.blockscout.com/api/v2';
const MONAD_BLOCKSCOUT_BASE_URL = 'https://monadscan.com/api/v2';
const MONAD_TESTNET_BLOCKSCOUT_BASE_URL = 'https://testnet.monadscan.com/api/v2';
const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  [JUPITER_SOL_MINT]: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC'
};
const INCIDENT_BATCH_SIZE = 6;
const ASSET_CACHE_TTL_MS = 45_000;
const REPUTATION_CACHE_TTL_MS = 120_000;
const STAKE_RETRY_ATTEMPTS = 3;
const DEVICE_LINK_TTL_MS = 10 * 60 * 1000;
const DEVICE_LINK_KDF_ITERATIONS = 20_000;
const NON_STRICT_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

function tryParseSolanaPublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

type ResolvedRecipient = {
  recipient: string;
  requestedRecipient: string;
  recipientKind: 'address' | 'sol-domain' | 'skr-domain';
  recipientDomain?: string;
};

type ParsedWalletTokenAccount = TokenHolding & {
  rawAmount: string;
};

type ControlledMintRecord = {
  mint: string;
  programId: string;
  name?: string;
  symbol?: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  controlsMintAuthority: boolean;
  controlsFreezeAuthority: boolean;
};

type ParsedMetaplexMetadata = {
  updateAuthority: string;
  mint: string;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  sellerFeeBasisPoints: number | null;
};

type CollectibleMetadataHint = {
  name?: string;
  symbol?: string;
  imageUri?: string;
};

type NativeUsdPriceQuote = {
  usdPrice: number | null;
  priceChange24h: number | null;
};

type VineSpaceConfig = {
  daoId: string;
  repMint: string;
  currentSeason: number;
  decayBps: number;
  configPda: string;
};

type VineReputationAccount = {
  season: number;
  points: bigint;
};

type VerificationSpaceAccount = {
  daoId: string;
  salt: Uint8Array;
  attestor: string;
  isFrozen: boolean;
};

type VerificationIdentityAccount = {
  space: string;
  platform: number;
  verified: boolean;
  verifiedAt: number | null;
  expiresAt: number | null;
  attestedBy: string | null;
};

type VerificationLinkAccount = {
  identity: string;
  walletHash: Uint8Array;
  linkedAt: number | null;
};

type GraphqlVerificationSpaceRow = {
  pubkey?: string;
  daoId?: string;
  salt?: string;
};

type GraphqlVerificationIdentityRow = {
  pubkey?: string;
  space?: string;
  platform?: number | string;
  verified?: boolean;
  verifiedAt?: number | string | null;
  expiresAt?: number | string | null;
  attestedBy?: string | null;
};

type GraphqlVerificationLinkRow = {
  pubkey?: string;
  identity?: string;
  walletHash?: string;
  linkedAt?: number | string | null;
};

type GovernanceOwner = {
  owner: string;
  name: string;
  dao: string;
};

type GovernanceRealmInfo = {
  daoId: string;
  name: string;
  communityMint: string;
  councilMint: string | null;
};

type GovernanceMembershipRecord = {
  pubkey: string;
  governingTokenMint: string;
  governingTokenOwner: string;
  governanceDelegate: string | null;
  governingTokenDepositAmount: string;
};

type GovernanceProgramAccount = {
  pubkey: string;
  realm: string;
  baseVotingTime: number | null;
};

type GovernanceProposalRecord = {
  pubkey: string;
  governance: string;
  governingTokenMint: string;
  tokenOwnerRecord: string;
  state: number;
  descriptionLink: string | null;
  name: string;
  draftAt: number | null;
  votingAt: number | null;
  maxVotingTime: number | null;
  yesVotes: string;
  noVotes: string;
  abstainVotes: string;
  denyVotes: string;
  options: Array<{
    rank: number;
    label: string;
    voteWeight: string;
    voteResult?: string | null;
  }>;
  hasDenyOption: boolean;
};

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  debug?: (payload: ProviderDebugPayload) => void;
};

const GOVERNANCE_OWNERS: GovernanceOwner[] = [
  { owner: 'GovMaiHfpVPw8BAM1mbdzgmSZYDw2tdP32J2fapoQoYs', name: 'Marinade_DAO', dao: '899YG3yk4F66ZgbNWLHriZHTXSKk9e1kvsKEquW7L6Mo' },
  { owner: 'GqTPL6qRf5aUuqscLh8Rg2HTxPUXfhhAXDptTLhp1t2J', name: 'Mango', dao: 'DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE' },
  { owner: 'GovHgfDPyQ1GwazJTDY2avSVY8GGcpmCapmmCsymRaGe', name: 'Psy_Finance', dao: 'FiG6YoqWnVzUmxFNukcRVXZC51HvLr6mts8nxcm7ScR8' },
  { owner: 'JPGov2SBA6f7XSJF5R4Si5jEJekGiyrwP2m7gSEqLUs', name: 'Jet_Custody', dao: 'FbpwgUzRPTneoZHDMNnM1zXb7Jm9iY8MzX2mAM8L6f43' },
  { owner: 'JPGov2SBA6f7XSJF5R4Si5jEJekGiyrwP2m7gSEqLUs', name: 'Jet_Custody', dao: 'ATnhhZJ74xg4mzxDyNQ5YAE1BZ98PhrhAsMS4xNXquvX' },
  { owner: 'pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U', name: 'Pyth_Governance', dao: '4ct8XU5tKbMNRphWy4rePsS9kBqPhDdvZoGpmprPaug4' },
  { owner: 'GMnke6kxYvqoAXgbFGnu84QzvNHoqqTnijWSXYYTFQbB', name: 'MonkeDAO', dao: 'B1CxhV1khhj7n5mi5hebbivesqH9mvXr5Hfh2nD2UCh6' },
  { owner: 'hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S', name: 'Helium', dao: '2VfPJn8ML1hNBnsEBo7SzmG11UJc7gbY8b23A3K8expd' },
  { owner: 'MGovW65tDhMMcpEmsegpsdgvzb6zUwGsNjhXFxRAnjd', name: 'MEAN_DAO', dao: '5o6gEoeJBpuXT1H1ijFTq3KcSGx7ayabdG2hji7cB3FG' },
  { owner: 'J9uWvULFL47gtCPvgR3oN7W357iehn5WF2Vn9MJvcSxz', name: 'Orca', dao: '66Du7mXgS2KMQBUk6m9h3TszMjqZqdWhsG3Duuf69VNW' },
  { owner: 'ALLGnZikNaJQeN4KCAbDjZRSzvSefUdeTpk18yfizZvT', name: 'ALLOVR_DAO', dao: 'A7nud4wxpAySc7Ai11vwXtkez79tHvcEvSquFBxw4iDh' },
  { owner: 'AEauWRrpn9Cs6GXujzdp1YhMmv2288kBt3SdEcPYEerr', name: 'Metaplex_DAO', dao: 'DA5G7QQbFioZ6K33wQcH8fVdgFcnaDjLD7DLQkapZg5X' },
  { owner: 'GMpXgTSJt2nJ7zjD1RwbT2QyPhKqD2MjAZuEaLsfPYLF', name: 'Metaplex_Genesis', dao: 'Cdui9Va8XnKVng3VGZXcfBFF6XSxbqSi2XruMc7iu817' },
  { owner: 'GmtpXy362L8cZfkRmTZMYunWVe8TyRjX5B7sodPZ63LJ', name: 'Metaplex_Found', dao: '2sEcHwzsNBwNoTM1yAXjtF1HTMQKUAXf8ivtdpSpo9Fv' },
  { owner: 'AVoAYTs36yB5izAaBkxRG67wL1AMwG3vo41hKtUSb8is', name: 'Serum', dao: '3MMDxjv1SzEFQDKryT7csAvaydYtrgMAc3L9xL9CVLCg' },
  { owner: '5hAykmD4YGcQ7Am3N7nC9kyELq6CThAkU82nhNKDJiCy', name: 'SOCEAN', dao: '759qyfKDMMuo9v36tW7fbGanL63mZFPNbhU7zjPrkuGK' },
  { owner: 'jdaoDN37BrVRvxuXSeyR7xE5Z9CAoQApexGrQJbnj6V', name: 'JungleDeFi_DAO', dao: '5g94Ver64ruf9CGBL3k2oQGdKCUt4QKjN7NQojSrHAwH' },
  { owner: 'jtogvBNH3WBSWDYD5FJfQP2ZxNTuf82zL8GkEhPeaJx', name: 'Jito', dao: 'jjCAwuuNpJCNMLAanpwgJZ6cdXzLPXe2GfD6TaDQBXt' }
];

const GOVERNANCE_REALM_DIRECTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE = 1000;
let governanceRealmDirectoryCache:
  | {
      expiresAt: number;
      realms: GovernanceRealmInfo[];
    }
  | null = null;

type UnlockedSecretCache = Record<string, {
  secret: VaultSecret;
  unlockedAt: number;
}>;

type ProviderDebugPayload = {
  phase: string;
  requestId?: string;
  method?: ProviderRequest['method'];
  approvalId?: string;
  kind?: ApprovalRecord['kind'];
  origin?: string;
  network?: 'mainnet-beta' | 'devnet';
  success?: boolean;
  code?: string;
  message?: string;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isLikelyRetryableRpcError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const normalized = message.toLowerCase();

  return (
    normalized.includes('504') ||
    normalized.includes('503') ||
    normalized.includes('502') ||
    normalized.includes('500') ||
    normalized.includes('gateway timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('429')
  );
}

function throwLedgerUnsupported(): never {
  throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger signing is temporarily unavailable in this build.');
}

class WalletController {
  private readonly pendingApprovals = new Map<string, PendingResolver>();
  private unlockedSecrets: UnlockedSecretCache = {};
  private readonly assetRefreshes = new Map<string, Promise<WalletAssetsResponse>>();
  private readonly reputationRefreshes = new Map<string, Promise<WalletReputationResponse>>();
  private readonly reputationCache = new Map<string, { cachedAt: number; data: WalletReputationResponse }>();
  private readonly verificationRefreshes = new Map<string, Promise<WalletVerificationResponse>>();
  private readonly verificationCache = new Map<string, { cachedAt: number; data: WalletVerificationResponse }>();
  private readonly governanceRefreshes = new Map<string, Promise<WalletGovernanceResponse>>();
  private readonly governanceCache = new Map<string, { cachedAt: number; data: WalletGovernanceResponse }>();

  private getProviderConnectionKey(origin: string, chain: GrapeChain) {
    return `${origin}::${chain}`;
  }

  private isProviderOriginConnected(port: chrome.runtime.Port, origin: string, chain: GrapeChain) {
    return providerConnectionState.get(port)?.has(this.getProviderConnectionKey(origin, chain)) ?? false;
  }

  private setProviderOriginConnected(port: chrome.runtime.Port, origin: string, chain: GrapeChain, connected: boolean) {
    const key = this.getProviderConnectionKey(origin, chain);
    const current = providerConnectionState.get(port) ?? new Set<string>();

    if (connected) {
      current.add(key);
      providerConnectionState.set(port, current);
      return;
    }

    current.delete(key);
    if (current.size === 0) {
      providerConnectionState.delete(port);
    } else {
      providerConnectionState.set(port, current);
    }
  }

  private getAssetCacheKey(walletId: string, network: 'mainnet-beta' | 'devnet', publicKey: string) {
    return `${walletId}:${network}:${publicKey}`;
  }

  private getReputationCacheKey(walletId: string, network: 'mainnet-beta' | 'devnet', publicKey: string) {
    return `${walletId}:${network}:${publicKey}`;
  }

  private getVerificationCacheKey(walletId: string, network: 'mainnet-beta' | 'devnet', publicKey: string) {
    return `${walletId}:${network}:${publicKey}`;
  }

  private getGovernanceCacheKey(walletId: string, network: 'mainnet-beta' | 'devnet', publicKey: string) {
    return `${walletId}:${network}:${publicKey}`;
  }

  private async persistUnlockedSecrets() {
    await unlockedSecretSessionStorage.set(this.unlockedSecrets);
  }

  private async clearUnlockedSecrets() {
    this.unlockedSecrets = {};
    await Promise.all([
      unlockedSecretSessionStorage.set({}),
      unlockedPasswordSessionStorage.set({ value: null })
    ]);
  }

  private async ensureUnlockedSecretsLoaded() {
    if (Object.keys(this.unlockedSecrets).length > 0) {
      return;
    }
    this.unlockedSecrets = await unlockedSecretSessionStorage.get();
  }

  private async getUnlockedWalletIds(sessionLocked: boolean) {
    if (sessionLocked) {
      return [] as string[];
    }

    await this.ensureUnlockedSecretsLoaded();
    const unlockedWalletIds = new Set(Object.keys(this.unlockedSecrets));
    const unlockedPassword = (await unlockedPasswordSessionStorage.get()).value;
    if (unlockedPassword) {
      const walletState = await this.getWalletState();
      for (const wallet of walletState.wallets) {
        if (wallet.vault) {
          unlockedWalletIds.add(wallet.id);
        }
      }
    }
    return [...unlockedWalletIds];
  }

  private getEffectiveIdleTimeoutMs(walletState: Awaited<ReturnType<WalletController['getWalletState']>>) {
    if (walletState.dappApprovalMode === 'non-strict') {
      return Math.max(walletState.idleTimeoutMs, NON_STRICT_IDLE_TIMEOUT_MS);
    }

    return walletState.idleTimeoutMs;
  }

  private async invalidateAssetCache(cacheKey?: string) {
    const cache = await assetCacheStorage.get();
    if (cacheKey) {
      if (!(cacheKey in cache)) {
        return;
      }
      delete cache[cacheKey];
    } else {
      for (const key of Object.keys(cache)) {
        delete cache[key];
      }
    }
    await assetCacheStorage.set(cache);
  }

  private resolveRpcEndpoint(
    network: 'mainnet-beta' | 'devnet',
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ) {
    return getRpcEndpoint(network, walletState.customRpcUrls);
  }

  private createConnection(
    network: 'mainnet-beta' | 'devnet',
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ) {
    return new Connection(this.resolveRpcEndpoint(network, walletState), 'confirmed');
  }

  private ensureResolvedSolanaDomainRecipient(domain: string, publicKey: PublicKey) {
    if (!PublicKey.isOnCurve(publicKey.toBytes())) {
      throw new RpcError(
        'INVALID_RECIPIENT',
        `${domain} resolves to a program-derived address. Enter a wallet address instead.`
      );
    }

    return publicKey.toBase58();
  }

  private async resolveSolanaRecipient(recipient: string, connection: Connection): Promise<ResolvedRecipient> {
    const requestedRecipient = recipient.trim();
    const directRecipient = tryParseSolanaPublicKey(requestedRecipient);
    if (directRecipient) {
      return {
        recipient: directRecipient.toBase58(),
        requestedRecipient,
        recipientKind: 'address'
      };
    }

    const supportedDomain = parseSupportedSolanaRecipientDomain(requestedRecipient);
    if (!supportedDomain) {
      throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Solana wallet address or a supported .sol/.skr domain.');
    }

    try {
      if (supportedDomain.suffix === '.sol') {
        const resolvedRecipient = await resolveSolanaDomain(connection, supportedDomain.domain);
        return {
          recipient: this.ensureResolvedSolanaDomainRecipient(supportedDomain.domain, resolvedRecipient),
          requestedRecipient,
          recipientKind: 'sol-domain',
          recipientDomain: supportedDomain.domain
        };
      }

      const parser = new TldParser(connection, 'solana');
      const solRecord = await parser.getRecord(supportedDomain.domain, AlternativeDomainRecord.SOL);
      const recordRecipient = solRecord ? tryParseSolanaPublicKey(solRecord) : null;
      const owner = await parser.getOwnerFromDomainTld(supportedDomain.domain);
      const ownerRecipient = recordRecipient ?? (typeof owner === 'string' ? tryParseSolanaPublicKey(owner) : owner);
      if (!ownerRecipient) {
        throw new Error('Domain did not resolve to a wallet address.');
      }

      return {
        recipient: this.ensureResolvedSolanaDomainRecipient(supportedDomain.domain, ownerRecipient),
        requestedRecipient,
        recipientKind: 'skr-domain',
        recipientDomain: supportedDomain.domain
      };
    } catch (error) {
      if (error instanceof RpcError) {
        throw error;
      }

      throw new RpcError(
        'INVALID_RECIPIENT',
        `Unable to resolve ${supportedDomain.domain}. Check the domain and try again.`
      );
    }
  }

  private async resolveRecipientForChain(
    chain: GrapeChain,
    recipient: string,
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ): Promise<ResolvedRecipient> {
    const requestedRecipient = recipient.trim();
    if (!requestedRecipient) {
      throw new RpcError('INVALID_RECIPIENT', 'Enter a recipient wallet address.');
    }

    if (chain === 'solana') {
      const connection = this.createConnection(this.getSelectedNetworkForChain(walletState, chain), walletState);
      return this.resolveSolanaRecipient(requestedRecipient, connection);
    }

    if (chain === 'sui') {
      if (!validateSuiAddress(requestedRecipient)) {
        throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Sui wallet address.');
      }
    } else if (chain === 'monad') {
      if (!validateMonadAddress(requestedRecipient)) {
        throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Monad wallet address.');
      }
    } else if (!validateEthereumAddress(requestedRecipient)) {
      throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Ethereum wallet address.');
    }

    return {
      recipient: requestedRecipient,
      requestedRecipient,
      recipientKind: 'address'
    };
  }

  private resolveStoredContactRecipient(resolvedRecipient: ResolvedRecipient): string {
    return resolvedRecipient.recipientKind === 'address'
      ? resolvedRecipient.recipient
      : formatSavedRecipient(resolvedRecipient.recipientDomain ?? resolvedRecipient.requestedRecipient);
  }

  private resolveSuiNetwork(network: 'mainnet-beta' | 'devnet'): SuiNetwork {
    return network === 'devnet' ? 'devnet' : 'mainnet';
  }

  private async createSuiClient(
    network: 'mainnet-beta' | 'devnet',
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ) {
    return createSuiClient(this.resolveSuiNetwork(network), walletState.chainState.sui.customRpcUrl);
  }

  private resolveMonadNetwork(_network: 'mainnet-beta' | 'devnet'): MonadNetwork {
    return _network === 'devnet' ? 'testnet' : 'mainnet';
  }

  private async createMonadClient(
    network: 'mainnet-beta' | 'devnet',
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ) {
    return createMonadPublicClient(this.resolveMonadNetwork(network), walletState.chainState.monad.customRpcUrl);
  }

  private resolveEthereumNetwork(network: 'mainnet-beta' | 'devnet'): EthereumNetwork {
    return network === 'devnet' ? 'sepolia' : 'mainnet';
  }

  private async createEthereumClient(
    network: 'mainnet-beta' | 'devnet',
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ) {
    return createEthereumPublicClient(this.resolveEthereumNetwork(network), walletState.chainState.ethereum.customRpcUrl);
  }

  private getSelectedNetworkForChain(
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>,
    chain: GrapeChain
  ): 'mainnet-beta' | 'devnet' {
    switch (chain) {
      case 'solana':
        return walletState.chainState.solana.selectedNetwork;
      case 'sui':
        return walletState.chainState.sui.selectedNetwork;
      case 'monad':
        return walletState.chainState.monad.selectedNetwork;
      case 'ethereum':
        return walletState.chainState.ethereum.selectedNetwork;
      default:
        return walletState.selectedNetwork;
    }
  }

  private async getUnlockedSecretIfAvailable(walletId: string) {
    const session = await this.getSessionState();
    if (session.locked) {
      return null;
    }

    await this.ensureUnlockedSecretsLoaded();
    return this.unlockedSecrets[walletId]?.secret ?? null;
  }

  private async persistWalletAccountRawPublicKey(walletId: string, accountId: string, rawPublicKey: string) {
    const walletState = await this.getWalletState();
    const nextWallets = walletState.wallets.map((wallet) => {
      if (wallet.id !== walletId) {
        return wallet;
      }

      return {
        ...wallet,
        accounts: wallet.accounts.map((account) =>
          account.id === accountId && account.rawPublicKey !== rawPublicKey
            ? {
                ...account,
                rawPublicKey
              }
            : account
        )
      };
    });

    await walletStateStorage.set({
      ...walletState,
      wallets: nextWallets
    });
  }

  private async getSuiProviderAccount(
    wallet: Awaited<ReturnType<WalletController['getWalletState']>>['wallets'][number],
    account: Awaited<ReturnType<WalletController['getWalletState']>>['wallets'][number]['accounts'][number]
  ) {
    let rawPublicKey = account.rawPublicKey;

    if (!rawPublicKey && wallet.signer.kind === 'software') {
      const unlockedSecret = await this.getUnlockedSecretIfAvailable(wallet.id);
      if (unlockedSecret) {
        rawPublicKey = arrayBufferToBase64(resolveSuiVaultSecret(unlockedSecret).getPublicKey().toRawBytes());
        void this.persistWalletAccountRawPublicKey(wallet.id, account.id, rawPublicKey);
      }
    }

    return {
      address: account.publicKey,
      publicKey: rawPublicKey ?? arrayBufferToBase64(new TextEncoder().encode(account.publicKey))
    };
  }

  private async buildProviderConnectResult(
    request: ProviderRequest,
    wallet: Awaited<ReturnType<WalletController['getWalletState']>>['wallets'][number],
    account: Awaited<ReturnType<WalletController['getWalletState']>>['wallets'][number]['accounts'][number]
  ) {
    switch (request.method) {
      case 'connect':
        return { publicKey: account.publicKey };
      case 'sui_connect':
        return {
          accounts: [await this.getSuiProviderAccount(wallet, account)]
        };
      case 'monad_requestAccounts':
        return [account.publicKey];
      default:
        throw new RpcError('UNKNOWN_REQUEST', 'Unsupported connection request.');
    }
  }

  private resolveMonadChainId(network: 'mainnet-beta' | 'devnet') {
    return network === 'devnet' ? '0x279f' : '0x8f';
  }

  private resolveEthereumChainId(network: 'mainnet-beta' | 'devnet') {
    return network === 'devnet' ? '0xaa36a7' : '0x1';
  }

  private getPreferredEvmChain(walletState: Awaited<ReturnType<WalletController['getWalletState']>>): 'monad' | 'ethereum' {
    if (walletState.selectedChain === 'monad' || walletState.selectedChain === 'ethereum') {
      return walletState.selectedChain;
    }

    if (walletState.wallets.some((wallet) => wallet.chain === 'ethereum')) {
      return 'ethereum';
    }

    return 'monad';
  }

  private resolveMonadNetworkFromChainId(chainId: string): MonadNetwork | null {
    const normalized = chainId.trim().toLowerCase();
    if (normalized === '0x8f' || normalized === '143') {
      return 'mainnet';
    }
    if (normalized === '0x279f' || normalized === '10143') {
      return 'testnet';
    }
    return null;
  }

  private resolveEthereumNetworkFromChainId(chainId: string): EthereumNetwork | null {
    const normalized = chainId.trim().toLowerCase();
    if (normalized === '0x1' || normalized === '1') {
      return 'mainnet';
    }
    if (normalized === '0xaa36a7' || normalized === '11155111') {
      return 'sepolia';
    }
    return null;
  }

  private resolveEvmSelection(
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>,
    request?: Extract<
      ProviderRequest,
      { method: 'monad_accounts' | 'monad_requestAccounts' | 'monad_chainId' | 'monad_switchChain' | 'monad_addChain' | 'monad_sendTransaction' | 'monad_signMessage' | 'monad_signTypedData' }
    >
  ): { chain: 'monad' | 'ethereum'; network: 'mainnet-beta' | 'devnet' } {
    if (request && (request.method === 'monad_switchChain' || request.method === 'monad_addChain')) {
      const ethereumNetwork = this.resolveEthereumNetworkFromChainId(request.params.chainId);
      if (ethereumNetwork) {
        return {
          chain: 'ethereum',
          network: ethereumNetwork === 'sepolia' ? 'devnet' : 'mainnet-beta'
        };
      }

      const monadNetwork = this.resolveMonadNetworkFromChainId(request.params.chainId);
      if (monadNetwork) {
        return {
          chain: 'monad',
          network: monadNetwork === 'testnet' ? 'devnet' : 'mainnet-beta'
        };
      }
    }

    const chain = this.getPreferredEvmChain(walletState);
    return {
      chain,
      network: this.getSelectedNetworkForChain(walletState, chain)
    };
  }

  private async setChainNetwork(chain: GrapeChain, network: 'mainnet-beta' | 'devnet') {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        solana: {
          ...walletState.chainState.solana,
          selectedNetwork: chain === 'solana' ? network : walletState.chainState.solana.selectedNetwork
        },
        sui: {
          ...walletState.chainState.sui,
          selectedNetwork: chain === 'sui' ? network : walletState.chainState.sui.selectedNetwork
        },
        monad: {
          ...walletState.chainState.monad,
          selectedNetwork: chain === 'monad' ? network : walletState.chainState.monad.selectedNetwork
        },
        ethereum: {
          ...walletState.chainState.ethereum,
          selectedNetwork: chain === 'ethereum' ? network : walletState.chainState.ethereum.selectedNetwork
        }
      },
      selectedNetwork: walletState.selectedChain === chain ? network : walletState.selectedNetwork
    });
  }

  private async setSelectedChainNetwork(chain: GrapeChain, network: 'mainnet-beta' | 'devnet') {
    const walletState = await this.getWalletState();
    const nextSelectedWalletId =
      walletState.selectedWalletIds[chain] ?? walletState.wallets.find((wallet) => wallet.chain === chain)?.id;

    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        solana: {
          ...walletState.chainState.solana,
          selectedNetwork: chain === 'solana' ? network : walletState.chainState.solana.selectedNetwork
        },
        sui: {
          ...walletState.chainState.sui,
          selectedNetwork: chain === 'sui' ? network : walletState.chainState.sui.selectedNetwork
        },
        monad: {
          ...walletState.chainState.monad,
          selectedNetwork: chain === 'monad' ? network : walletState.chainState.monad.selectedNetwork
        },
        ethereum: {
          ...walletState.chainState.ethereum,
          selectedNetwork: chain === 'ethereum' ? network : walletState.chainState.ethereum.selectedNetwork
        }
      },
      selectedChain: chain,
      selectedWalletIds: nextSelectedWalletId
        ? {
            ...walletState.selectedWalletIds,
            [chain]: nextSelectedWalletId
          }
        : walletState.selectedWalletIds,
      selectedNetwork: network,
      selectedWalletId:
        chain === 'solana'
          ? nextSelectedWalletId ?? walletState.selectedWalletId
          : walletState.selectedWalletId
    });
  }

  private getNextWalletNumber(walletState: Awaited<ReturnType<WalletController['getWalletState']>>) {
    return (
      walletState.wallets.reduce((max, wallet) => {
        const match = wallet.name.match(/^Wallet (\d+)$/);
        const value = match ? Number(match[1]) : 0;
        return Math.max(max, Number.isFinite(value) ? value : 0);
      }, 0) + 1
    );
  }

  private async buildWalletProfile(input: {
    name: string;
    chain: 'solana' | 'sui' | 'monad' | 'ethereum';
    secret: VaultSecret;
    password?: string;
    publicKey: string;
    rawPublicKey?: string;
    signer: import('@grape/core').WalletSigner;
    source: import('@grape/core').WalletProfile['source'];
    derivationPath: string;
    biometricUnlock?: import('@grape/core').BiometricUnlockConfig;
  }) {
    const walletId = `wallet-${crypto.randomUUID()}`;
    const account = {
      id: 'account-0',
      index: 0,
      publicKey: input.publicKey,
      rawPublicKey: input.rawPublicKey,
      derivationPath: input.derivationPath
    };

    return {
      id: walletId,
      name: input.name,
      chain: input.chain,
      vault: input.signer.kind === 'watch-only' ? undefined : await createVaultRecord(input.secret, input.password ?? ''),
      biometricUnlock: input.biometricUnlock,
      signer: input.signer,
      source: input.source,
      accounts: [account],
      selectedAccountId: account.id,
      recentRecipients: [],
      contacts: []
    };
  }

  private async refreshSuiAssetsOnly(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string,
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ): Promise<WalletAssetsResponse> {
    const client = await this.createSuiClient(network, walletState);
    const holdings = await getSuiHoldings(client, publicKey);
    const suiCollectibles = await getSuiCollectibles(client, publicKey).catch(() => []);
    const totalMist = BigInt(holdings.totalMist);
    const safeLamports = totalMist > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(totalMist);
    let nativePricing: NativeUsdPriceQuote = {
      usdPrice: null,
      priceChange24h: null
    };
    if (network === 'mainnet-beta') {
      try {
        nativePricing = await fetchSuiNativePrice();
      } catch {
        nativePricing = {
          usdPrice: null,
          priceChange24h: null
        };
      }
    }
    let tokenPricing: Record<string, { usdPrice: number | null; priceChange24h: number | null }> = {};
    if (network === 'mainnet-beta') {
      try {
        tokenPricing = await fetchSuiTokenPrices(holdings.coins.map((coin) => coin.coinType));
      } catch {
        tokenPricing = {};
      }
    }

    const nativeUsdPrice = nativePricing.usdPrice;
    const nativeValueUsd =
      nativeUsdPrice === null || safeLamports === null ? null : (safeLamports / 1_000_000_000) * nativeUsdPrice;
    const pricedTokens = holdings.coins.map((coin) => {
      const pricing = tokenPricing[coin.coinType.trim().toLowerCase()];
      const usdPrice = pricing?.usdPrice ?? getSuiStablecoinPriceUsd(coin.symbol);
      return {
        mint: coin.coinType,
        amount: coin.amount,
        decimals: coin.decimals,
        programId: 'sui-coin',
        accountAddress: publicKey,
        name: coin.name,
        symbol: coin.symbol,
        logoUri: coin.logoUri,
        priceUsd: usdPrice,
        valueUsd: usdPrice === null ? null : Number(coin.amount) * usdPrice,
        priceChange24h: pricing?.priceChange24h ?? null,
        delegate: null,
        delegatedAmount: null,
        closeAuthority: null
      };
    });
    const totalUsdValue = [nativeValueUsd, ...pricedTokens.map((token) => token.valueUsd ?? null)]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);
    const result: WalletAssetsResponse = {
      lamports: safeLamports,
      tokens: sortWalletTokens(pricedTokens),
      collections: groupCollectibles(suiCollectibles.map((item) => ({
        mint: item.objectId, accountAddress: item.objectId, programId: item.objectType,
        name: item.name, imageUri: item.imageUrl, collectionName: item.collectionName,
        collectionId: item.objectType
      }))),
      nativeName: 'Sui',
      nativeSymbol: 'SUI',
      nativeDecimals: 9,
      totalUsdValue: Number.isFinite(totalUsdValue) ? totalUsdValue : null,
      nativePriceUsd: nativeUsdPrice,
      nativeValueUsd,
      nativePriceChange24h: nativePricing.priceChange24h
    };

    const cache = await assetCacheStorage.get();
    cache[this.getAssetCacheKey(walletId, network, publicKey)] = {
      cachedAt: Date.now(),
      data: result
    };
    await assetCacheStorage.set(cache);

    return result;
  }

  private async refreshMonadAssetsOnly(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string,
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ): Promise<WalletAssetsResponse> {
    const client = await this.createMonadClient(network, walletState);
    const holdings = await getMonadHoldings(client, publicKey);
    const collections = await fetchEvmNftCollections(network === 'mainnet-beta' ? MONAD_BLOCKSCOUT_BASE_URL : MONAD_TESTNET_BLOCKSCOUT_BASE_URL, publicKey).catch(() => []);
    const safeBaseUnits = holdings.totalWei > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(holdings.totalWei);
    const monadNativeToken = network === 'mainnet-beta'
      ? (await fetchLifiTokenCatalog('monad').catch(() => [])).find((token) =>
          token.address.toLowerCase() === LIFI_NATIVE_TOKEN_ADDRESS.monad || token.symbol.toUpperCase() === 'MON'
        )
      : undefined;
    const nativePriceUsd = normalizeNumber(monadNativeToken?.priceUSD);
    const nativeValueUsd = nativePriceUsd === null ? null : Number(holdings.formatted) * nativePriceUsd;
    const result: WalletAssetsResponse = {
      lamports: safeBaseUnits,
      tokens: [],
      collections,
      nativeName: 'Monad',
      nativeSymbol: 'MON',
      nativeDecimals: 18,
      totalUsdValue: nativeValueUsd,
      nativePriceUsd: nativePriceUsd,
      nativeValueUsd,
      nativePriceChange24h: null
    };

    const cache = await assetCacheStorage.get();
    cache[this.getAssetCacheKey(walletId, network, publicKey)] = {
      cachedAt: Date.now(),
      data: result
    };
    await assetCacheStorage.set(cache);

    return result;
  }

  private async refreshEthereumAssetsOnly(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string,
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ): Promise<WalletAssetsResponse> {
    const client = await this.createEthereumClient(network, walletState);
    const holdings = await getEthereumHoldings(client, publicKey);
    const safeBaseUnits = holdings.totalWei > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(holdings.totalWei);
    let nativePricing: NativeUsdPriceQuote = {
      usdPrice: null,
      priceChange24h: null
    };
    try {
      nativePricing = await fetchEthereumNativePrice(network);
    } catch {
      nativePricing = {
        usdPrice: null,
        priceChange24h: null
      };
    }

    let tokenHoldings: TokenHolding[] = [];
    try {
      tokenHoldings = await fetchEthereumTokenBalances(network, publicKey);
    } catch {
      tokenHoldings = [];
    }
    const collections = await fetchEvmNftCollections(getEthereumBlockscoutBaseUrl(network), publicKey).catch(() => []);

    const nativeUsdPrice = nativePricing.usdPrice;
    const nativeValueUsd =
      nativeUsdPrice === null || safeBaseUnits === null ? null : (safeBaseUnits / 1_000_000_000_000_000_000) * nativeUsdPrice;
    const totalUsdValue = [nativeValueUsd, ...tokenHoldings.map((token) => token.valueUsd ?? null)]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);
    const result: WalletAssetsResponse = {
      lamports: safeBaseUnits,
      tokens: sortWalletTokens(tokenHoldings),
      collections,
      nativeName: 'Ethereum',
      nativeSymbol: 'ETH',
      nativeDecimals: 18,
      totalUsdValue: Number.isFinite(totalUsdValue) ? totalUsdValue : null,
      nativePriceUsd: nativeUsdPrice,
      nativeValueUsd,
      nativePriceChange24h: nativePricing.priceChange24h
    };

    const cache = await assetCacheStorage.get();
    cache[this.getAssetCacheKey(walletId, network, publicKey)] = {
      cachedAt: Date.now(),
      data: result
    };
    await assetCacheStorage.set(cache);

    return result;
  }

  private async refreshSolanaAssetsFast(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string,
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ): Promise<WalletAssetsResponse> {
    const owner = tryParseSolanaPublicKey(publicKey);
    if (!owner) {
      const fallback: WalletAssetsResponse = {
        lamports: 0,
        tokens: [],
        collections: [],
        nativeName: 'Solana',
        nativeSymbol: 'SOL',
        nativeDecimals: 9,
        totalUsdValue: null,
        nativePriceUsd: null,
        nativeValueUsd: null,
        nativePriceChange24h: null,
        stale: true
      };

      const cache = await assetCacheStorage.get();
      cache[this.getAssetCacheKey(walletId, network, publicKey)] = {
        cachedAt: Date.now(),
        data: fallback
      };
      await assetCacheStorage.set(cache);
      return fallback;
    }

    const connection = this.createConnection(network, walletState);
    const [lamports, shyftMetadataResult] = await Promise.all([
      connection.getBalance(owner),
      hasShyftApiKey() ? fetchShyftWalletTokens(network, publicKey).catch(() => ({})) : Promise.resolve({})
    ]);

    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const tokens = (await this.scanWalletTokenAccounts(connection, owner, shyftMetadata))
      .filter((token) => Number(token.amount) > 0)
      .map((token) => ({
        ...token,
        priceUsd: null,
        valueUsd: null,
        priceChange24h: null
      }));

    const result: WalletAssetsResponse = {
      lamports,
      tokens: sortWalletTokens(tokens),
      collections: [],
      nativeName: 'Solana',
      nativeSymbol: 'SOL',
      nativeDecimals: 9,
      totalUsdValue: null,
      nativePriceUsd: null,
      nativeValueUsd: null,
      nativePriceChange24h: null,
      stale: true
    };

    const cache = await assetCacheStorage.get();
    cache[this.getAssetCacheKey(walletId, network, publicKey)] = {
      cachedAt: Date.now(),
      data: result
    };
    await assetCacheStorage.set(cache);

    return result;
  }

  private async refreshAssetsCache(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string
  ): Promise<WalletAssetsResponse> {
    const cacheKey = this.getAssetCacheKey(walletId, network, publicKey);
    const inFlight = this.assetRefreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = (async () => {
      const walletState = await this.getWalletState();
      const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
      if (!targetWallet) {
        throw new RpcError('WALLET_NOT_FOUND', 'Wallet could not be found.');
      }

      if (targetWallet.chain === 'sui') {
        return this.refreshSuiAssetsOnly(walletId, network, publicKey, walletState);
      }
      if (targetWallet.chain === 'monad') {
        return this.refreshMonadAssetsOnly(walletId, network, publicKey, walletState);
      }
      if (targetWallet.chain === 'ethereum') {
        return this.refreshEthereumAssetsOnly(walletId, network, publicKey, walletState);
      }

      const owner = tryParseSolanaPublicKey(publicKey);
      if (!owner) {
        const fallback: WalletAssetsResponse = {
          lamports: 0,
          tokens: [],
          collections: [],
          nativeName: 'Solana',
          nativeSymbol: 'SOL',
          nativeDecimals: 9,
          totalUsdValue: null,
          nativePriceUsd: null,
          nativeValueUsd: null,
          nativePriceChange24h: null
        };

        const cache = await assetCacheStorage.get();
        cache[this.getAssetCacheKey(walletId, network, publicKey)] = {
          cachedAt: Date.now(),
          data: fallback
        };
        await assetCacheStorage.set(cache);

        return fallback;
      }

      const connection = this.createConnection(network, walletState);
      const [lamports, shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
        connection.getBalance(owner),
        hasShyftApiKey() ? fetchShyftWalletTokens(network, publicKey).catch(() => ({})) : Promise.resolve({}),
        hasShyftApiKey() ? fetchShyftCollections(network, publicKey).catch(() => []) : Promise.resolve([])
      ]);

      const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
      const collections = shyftCollectionsResult as CollectionHolding[];
      const tokens = (await this.scanWalletTokenAccounts(connection, owner, shyftMetadata)).filter((token) => Number(token.amount) > 0);
      const zeroDecimalTokens = tokens.filter((token) => token.decimals === 0 && !!tryParseSolanaPublicKey(token.mint));
      const mintSupplyEntries = await Promise.all(
        zeroDecimalTokens.map(async (token) => {
          try {
            const mintPublicKey = tryParseSolanaPublicKey(token.mint);
            if (!mintPublicKey) {
              return [token.mint, null] as const;
            }

            const mintAccountInfo = await connection.getParsedAccountInfo(mintPublicKey, 'confirmed');
            const mintAccountData = mintAccountInfo.value?.data;
            if (!mintAccountData || typeof mintAccountData !== 'object' || !('parsed' in mintAccountData)) {
              return [token.mint, null] as const;
            }

            const parsedMint = mintAccountData.parsed;
            if (!parsedMint || typeof parsedMint !== 'object' || !('info' in parsedMint) || !parsedMint.info || typeof parsedMint.info !== 'object') {
              return [token.mint, null] as const;
            }

            const mintInfo = parsedMint.info as Record<string, unknown>;
            return [token.mint, { rawSupply: typeof mintInfo.supply === 'string' ? mintInfo.supply : null }] as const;
          } catch {
            return [token.mint, null] as const;
          }
        })
      );
      const mintSupplyMap = Object.fromEntries(mintSupplyEntries);
      const metadataExistenceEntries = await Promise.all(
        zeroDecimalTokens.map(async (token) => {
          try {
            const mintPublicKey = tryParseSolanaPublicKey(token.mint);
            if (!mintPublicKey) {
              return [token.mint, false] as const;
            }

            const metadataPda = PublicKey.findProgramAddressSync(
              [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mintPublicKey.toBytes()],
              METADATA_PROGRAM_ID
            )[0];
            const metadataAccountInfo = await connection.getAccountInfo(metadataPda, 'confirmed');
            return [token.mint, !!metadataAccountInfo] as const;
          } catch {
            return [token.mint, false] as const;
          }
        })
      );
      const metadataExistenceMap = Object.fromEntries(metadataExistenceEntries);
      const inferredCollectibleMints = inferCollectibleMints(
        tokens.map((token) => ({
          ...token,
          rawSupply: mintSupplyMap[token.mint]?.rawSupply ?? null,
          hasMetadata: metadataExistenceMap[token.mint] ?? false
        }))
      );
      const tokenByMint = new Map(tokens.map((token) => [token.mint, token] as const));
      const mergedCollections = collections.map((collection) => ({
        ...collection,
        items: collection.items.map((item) => {
          const token = tokenByMint.get(item.mint);
          const metadata = shyftMetadata[item.mint];
          return {
            ...item,
            name: item.name ?? token?.name ?? metadata?.name,
            symbol: item.symbol ?? token?.symbol ?? metadata?.symbol,
            imageUri: item.imageUri ?? token?.logoUri ?? metadata?.logoUri,
            accountAddress: item.accountAddress ?? token?.accountAddress,
            programId: item.programId ?? token?.programId,
            collectionId: item.collectionId ?? collection.id,
            collectionName: item.collectionName ?? collection.name,
            collectionSymbol: item.collectionSymbol ?? collection.symbol
          };
        })
      }));
      const detectedCollectibleItems = tokens
        .filter((token) => inferredCollectibleMints.has(token.mint))
        .map((token) => ({
          mint: token.mint,
          name: token.name ?? token.symbol,
          symbol: token.symbol,
          imageUri: token.logoUri,
          accountAddress: token.accountAddress,
          programId: token.programId
        }));
      const collectibleMetadataHints = await fetchCollectibleMetadataHints(connection, [
        ...mergedCollections.flatMap((collection) => collection.items),
        ...detectedCollectibleItems
      ]);
      const enrichCollectibleItem = (item: CollectibleItem, collection?: CollectionHolding): CollectibleItem => {
        const hint = collectibleMetadataHints[item.mint];
        return {
          ...item,
          name: item.name ?? hint?.name,
          symbol: item.symbol ?? hint?.symbol,
          imageUri: item.imageUri ?? hint?.imageUri ?? collection?.imageUri
        };
      };
      const enrichedCollections = mergedCollections.map((collection) => {
        const items = collection.items.map((item) => enrichCollectibleItem(item, collection));
        return {
          ...collection,
          imageUri: collection.imageUri ?? items.find((item) => !!item.imageUri)?.imageUri,
          items
        };
      });
      const knownCollectionMints = new Set(enrichedCollections.flatMap((collection) => collection.items.map((item) => item.mint)));
      const fallbackCollectibleItems = detectedCollectibleItems
        .filter((item) => !knownCollectionMints.has(item.mint))
        .map((item) => enrichCollectibleItem(item));
      const finalCollections =
        fallbackCollectibleItems.length > 0
          ? [
              ...enrichedCollections,
              {
                id: 'grape-detected-collectibles',
                name: enrichedCollections.length > 0 ? 'Other Collectibles' : 'Collectibles',
                itemCount: fallbackCollectibleItems.length,
                imageUri: fallbackCollectibleItems[0]?.imageUri,
                items: fallbackCollectibleItems
              }
            ]
          : enrichedCollections;

      const fungibleTokens = filterCollectibleTokens(tokens, finalCollections, inferredCollectibleMints);

      let pricing: Record<string, { usdPrice: number | null; priceChange24h: number | null }> = {};
      let stockMints = new Set<string>();
      try {
        [pricing, stockMints] = await Promise.all([
          fetchJupiterPrices([JUPITER_SOL_MINT, ...fungibleTokens.map((token) => token.mint)]),
          fetchJupiterStockMints().catch(() => new Set<string>())
        ]);
      } catch {
        pricing = {};
      }

      const nativeUsdPrice = pricing[JUPITER_SOL_MINT]?.usdPrice ?? null;
      const nativePriceChange24h = pricing[JUPITER_SOL_MINT]?.priceChange24h ?? null;
      const nativeValueUsd = nativeUsdPrice === null ? null : (lamports / 1_000_000_000) * nativeUsdPrice;
      const pricedTokens = fungibleTokens.map((token) => {
        const usdPrice = pricing[token.mint]?.usdPrice ?? null;
        return {
          ...token,
          assetClass: stockMints.has(token.mint) ? 'stock' as const : 'crypto' as const,
          priceUsd: usdPrice,
          valueUsd: usdPrice === null ? null : Number(token.amount) * usdPrice,
          priceChange24h: pricing[token.mint]?.priceChange24h ?? null
        };
      });
      const sortedTokens = sortWalletTokens(pricedTokens);
      const totalUsdValue = [nativeValueUsd, ...pricedTokens.map((token) => token.valueUsd ?? null)]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .reduce((sum, value) => sum + value, 0);

      const result: WalletAssetsResponse = {
        lamports,
        tokens: sortedTokens,
        collections: finalCollections,
        nativeName: 'Solana',
        nativeSymbol: 'SOL',
        nativeDecimals: 9,
        totalUsdValue: Number.isFinite(totalUsdValue) ? totalUsdValue : null,
        nativePriceUsd: nativeUsdPrice,
        nativeValueUsd,
        nativePriceChange24h
      };

      const cache = await assetCacheStorage.get();
      cache[cacheKey] = {
        cachedAt: Date.now(),
        data: result
      };
      await assetCacheStorage.set(cache);

      return result;
    })().finally(() => {
      this.assetRefreshes.delete(cacheKey);
    });

    this.assetRefreshes.set(cacheKey, refreshPromise);
    return refreshPromise;
  }

  async refreshAssetValues(chain?: GrapeChain) {
    const walletState = await this.getWalletState();
    const cache = await assetCacheStorage.get();
    const targets = walletState.wallets
      .filter((wallet) => !chain || wallet.chain === chain)
      .flatMap((wallet) => {
        const account = wallet.accounts.find((candidate) => candidate.id === wallet.selectedAccountId) ?? wallet.accounts[0];
        if (!account) return [];
        const network = walletState.chainState[wallet.chain].selectedNetwork;
        const cached = cache[this.getAssetCacheKey(wallet.id, network, account.publicKey)];
        if (cached && Date.now() - cached.cachedAt < ASSET_CACHE_TTL_MS) return [];
        return [{ walletId: wallet.id, network, publicKey: account.publicKey }];
      });

    for (let index = 0; index < targets.length; index += 3) {
      await Promise.allSettled(
        targets.slice(index, index + 3).map((target) =>
          this.refreshAssetsCache(target.walletId, target.network, target.publicKey)
        )
      );
    }
    return { refreshed: targets.length };
  }

  async previewChainToken(tokenAddress: string): Promise<ChainTokenPreviewResponse> {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    if (selectedWallet.chain === 'ethereum') {
      const client = await this.createEthereumClient(walletState.selectedNetwork, walletState);
      return getEthereumTokenPreview(client, activeAccount.publicKey, tokenAddress);
    }

    if (selectedWallet.chain === 'monad') {
      const client = await this.createMonadClient(walletState.selectedNetwork, walletState);
      return getMonadTokenPreview(client, activeAccount.publicKey, tokenAddress);
    }

    throw new RpcError('UNSUPPORTED_CHAIN', 'Token contract preview is currently available for Ethereum and Monad only.');
  }

  async getWalletState() {
    const raw = await walletStateStorage.get();
    const migrated = migrateWalletState(raw);
    if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
      await walletStateStorage.set(migrated);
    }
    return migrated;
  }

  async getSessionState() {
    const wallet = await this.getWalletState();
    const session = await sessionStorage.get();
    const selectedWallet = getSelectedWallet(wallet);
    if (
      wallet.wallets.length > 0 &&
      (wallet.wallets.every((entry) => entry.signer.kind === 'watch-only') || selectedWallet?.signer.kind === 'watch-only')
    ) {
      if (session.locked) {
        const unlocked = {
          ...session,
          locked: false,
          lastActivityAt: Date.now()
        };
        await sessionStorage.set(unlocked);
        return unlocked;
      }
      return session;
    }
    if (isSessionExpired(session, this.getEffectiveIdleTimeoutMs(wallet))) {
      await this.clearUnlockedSecrets();
      const locked = {
        ...session,
        locked: true
      };
      await sessionStorage.set(locked);
      return locked;
    }
    if (!session.locked) {
      await this.ensureUnlockedSecretsLoaded();
      const unlockedPassword = (await unlockedPasswordSessionStorage.get()).value;
      if (
        wallet.wallets.some((entry) => entry.signer.kind !== 'watch-only') &&
        Object.keys(this.unlockedSecrets).length === 0 &&
        !unlockedPassword
      ) {
        await unlockedPasswordSessionStorage.set({ value: null });
        const locked = {
          ...session,
          locked: true,
          lastActivityAt: 0
        };
        await sessionStorage.set(locked);
        return locked;
      }
    }
    return session;
  }

  async setSessionState(partial: Partial<{ locked: boolean; lastActivityAt: number }>) {
    const current = await sessionStorage.get();
    await sessionStorage.set({
      ...current,
      ...partial
    });
  }

  async ensureReadyWallet() {
    const wallet = await this.getWalletState();
    const selectedWallet = getSelectedWallet(wallet);
    if (wallet.setup !== 'ready' || !selectedWallet || !selectedWallet.selectedAccountId) {
      throw new RpcError('WALLET_NOT_READY', 'Wallet has not been created or imported yet.');
    }
    return {
      walletState: wallet,
      selectedWallet
    };
  }

  async createWallet(
    secret: VaultSecret,
    password: string | undefined,
    publicKey: string,
    chain: 'solana' | 'sui' | 'monad' | 'ethereum' = 'solana',
    signer: import('@grape/core').WalletSigner = { kind: 'software' },
    source: import('@grape/core').WalletProfile['source'] = signer.kind === 'ledger'
      ? 'ledger'
      : signer.kind === 'watch-only'
        ? 'watch-only'
      : secret.kind === 'private-key'
        ? 'imported-private-key'
        : 'created'
  ) {
    const current = await this.getWalletState();
    const nextWalletNumber = this.getNextWalletNumber(current);
    if (current.setup === 'ready' && signer.kind !== 'watch-only') {
      const passwordProtectedWallet = current.wallets.find((wallet) => !!wallet.vault);
      if (passwordProtectedWallet) {
        if (!password) {
          throw new RpcError('INVALID_PASSWORD', 'Use your existing wallet password to add another wallet.');
        }
        const valid = await verifyVaultPassword(passwordProtectedWallet.vault!, password);
        if (!valid) {
          throw new RpcError('INVALID_PASSWORD', 'Use your existing wallet password to add another wallet.');
        }
      }
    }

    const derivationPath =
      signer.kind === 'ledger'
        ? signer.derivationPath
        : signer.kind === 'watch-only'
          ? 'watch-only'
          : secret.kind === 'mnemonic'
            ? chain === 'solana'
              ? `m/44'/501'/0'/0'`
              : chain === 'sui'
                ? `m/44'/784'/0'/0'/0'`
                : `m/44'/60'/0'/0/0`
            : 'imported-private-key';

    const rawPublicKey =
      chain === 'sui' && signer.kind !== 'watch-only'
        ? secret.kind === 'mnemonic'
          ? arrayBufferToBase64(deriveSuiAccount0(secret.mnemonic).keypair.getPublicKey().toRawBytes())
          : secret.kind === 'private-key'
            ? arrayBufferToBase64(importSuiPrivateKey(secret.secretKey).keypair.getPublicKey().toRawBytes())
            : undefined
        : undefined;

    const profile = await this.buildWalletProfile({
      name: `Wallet ${nextWalletNumber}`,
      chain,
      secret,
      password,
      publicKey,
      rawPublicKey,
      signer,
      source,
      derivationPath
    });
    const nextState = {
      ...current,
      setup: 'ready' as const,
      wallets: [...current.wallets, profile],
      selectedChain: chain,
      selectedNetwork:
        chain === 'solana'
          ? current.chainState.solana.selectedNetwork
          : chain === 'sui'
            ? current.chainState.sui.selectedNetwork
            : chain === 'monad'
              ? current.chainState.monad.selectedNetwork
              : current.chainState.ethereum.selectedNetwork,
      selectedWalletIds: {
        ...current.selectedWalletIds,
        [chain]: profile.id
      },
      selectedWalletId: chain === 'solana' || !current.selectedWalletId ? profile.id : current.selectedWalletId
    };
    await walletStateStorage.set(nextState);
    if (signer.kind !== 'watch-only') {
      this.unlockedSecrets[profile.id] = {
        secret,
        unlockedAt: Date.now()
      };
      await Promise.all([
        this.persistUnlockedSecrets(),
        password ? unlockedPasswordSessionStorage.set({ value: password }) : Promise.resolve()
      ]);
    }
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
  }

  async createMnemonicWalletSet(
    mnemonic: string,
    password: string,
    source: 'created' | 'imported-mnemonic',
    biometricUnlock?: import('@grape/core').BiometricUnlockConfig,
    selectedSolanaAccounts?: Array<{ publicKey: string; derivationPath: string; index: number }>
  ) {
    const current = await this.getWalletState();
    const nextWalletNumber = this.getNextWalletNumber(current);
    if (current.setup === 'ready') {
      const passwordProtectedWallet = current.wallets.find((wallet) => !!wallet.vault);
      if (passwordProtectedWallet) {
        const valid = await verifyVaultPassword(passwordProtectedWallet.vault!, password);
        if (!valid) {
          throw new RpcError('INVALID_PASSWORD', 'Use your existing wallet password to add another wallet.');
        }
      }
    }

    const solanaAccount = deriveSolanaAccount0(mnemonic);
    const suiAccount = deriveSuiAccount0(mnemonic);
    const monadAccount = deriveMonadAccount0(mnemonic);
    const ethereumAccount = deriveEthereumAccount0(mnemonic);
    const signer: import('@grape/core').WalletSigner = { kind: 'software' };

    const [solanaProfile, suiProfile, monadProfile, ethereumProfile] = await Promise.all([
      this.buildWalletProfile({
        name: `Wallet ${nextWalletNumber}`,
        chain: 'solana',
        secret: { kind: 'mnemonic', mnemonic },
        password,
        publicKey: solanaAccount.publicKey,
        signer,
        source,
        derivationPath: solanaAccount.derivationPath,
        biometricUnlock
      }),
      this.buildWalletProfile({
        name: `Wallet ${nextWalletNumber}`,
        chain: 'sui',
        secret: { kind: 'mnemonic', mnemonic },
        password,
        publicKey: suiAccount.address,
        rawPublicKey: arrayBufferToBase64(suiAccount.keypair.getPublicKey().toRawBytes()),
        signer,
        source,
        derivationPath: suiAccount.derivationPath,
        biometricUnlock
      }),
      this.buildWalletProfile({
        name: `Wallet ${nextWalletNumber}`,
        chain: 'monad',
        secret: { kind: 'mnemonic', mnemonic },
        password,
        publicKey: monadAccount.address,
        signer,
        source,
        derivationPath: monadAccount.derivationPath,
        biometricUnlock
      }),
      this.buildWalletProfile({
        name: `Wallet ${nextWalletNumber}`,
        chain: 'ethereum',
        secret: { kind: 'mnemonic', mnemonic },
        password,
        publicKey: ethereumAccount.address,
        signer,
        source,
        derivationPath: ethereumAccount.derivationPath,
        biometricUnlock
      })
    ]);
    if (selectedSolanaAccounts?.length) {
      solanaProfile.accounts = selectedSolanaAccounts.map((account) => ({
        id: `account-${account.index}`,
        index: account.index,
        publicKey: account.publicKey,
        derivationPath: account.derivationPath
      }));
      solanaProfile.selectedAccountId = solanaProfile.accounts[0].id;
    }

    const nextState = {
      ...current,
      setup: 'ready' as const,
      wallets: [...current.wallets, solanaProfile, suiProfile, monadProfile, ethereumProfile],
      sharedBiometricUnlock: biometricUnlock ?? current.sharedBiometricUnlock,
      selectedChain: current.setup === 'ready' ? current.selectedChain : ('solana' as const),
      selectedWalletIds: {
        ...current.selectedWalletIds,
        solana: solanaProfile.id,
        sui: suiProfile.id,
        monad: monadProfile.id,
        ethereum: ethereumProfile.id
      },
      selectedWalletId: solanaProfile.id
    };

    await walletStateStorage.set(nextState);
    this.unlockedSecrets[solanaProfile.id] = {
      secret: { kind: 'mnemonic', mnemonic },
      unlockedAt: Date.now()
    };
    this.unlockedSecrets[suiProfile.id] = {
      secret: { kind: 'mnemonic', mnemonic },
      unlockedAt: Date.now()
    };
    this.unlockedSecrets[monadProfile.id] = {
      secret: { kind: 'mnemonic', mnemonic },
      unlockedAt: Date.now()
    };
    this.unlockedSecrets[ethereumProfile.id] = {
      secret: { kind: 'mnemonic', mnemonic },
      unlockedAt: Date.now()
    };
    await Promise.all([
      this.persistUnlockedSecrets(),
      unlockedPasswordSessionStorage.set({ value: password })
    ]);
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
  }

  async scanMnemonicAccounts(mnemonic: string, count = 10) {
    const walletState = await this.getWalletState();
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const accounts = Array.from({ length: count }, (_value, index) => {
      const derivationPath = `m/44'/501'/${index}'/0'`;
      const derived = deriveSolanaAccount(mnemonic, derivationPath);
      return { index, publicKey: derived.publicKey, derivationPath };
    });
    const balances = await connection.getMultipleAccountsInfo(accounts.map((account) => new PublicKey(account.publicKey)));
    return accounts.map((account, index) => {
      const lamports = balances[index]?.lamports ?? 0;
      return {
        ...account,
        lamports,
        balanceLabel: `${(lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
      };
    });
  }

  async unlockWallet(password: string) {
    const { walletState } = await this.ensureReadyWallet();
    const vaultWallets = walletState.wallets.filter((wallet) => !!wallet.vault);
    if (vaultWallets.length === 0) {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
      return true;
    }

    const selectedWallet = getSelectedWallet(walletState);
    const prioritizedWallets =
      selectedWallet?.vault
        ? [selectedWallet, ...vaultWallets.filter((wallet) => wallet.id !== selectedWallet.id)]
        : vaultWallets;

    if (prioritizedWallets.length === 0) {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
      return true;
    }

    let unlockedWalletId: string | null = null;
    let unlockedSecret: VaultSecret | null = null;

    for (const wallet of prioritizedWallets) {
      if (!wallet.vault) {
        continue;
      }

      const secret = await unlockVaultRecord(wallet.vault, password).catch(() => null);
      if (secret) {
        unlockedWalletId = wallet.id;
        unlockedSecret = secret;
        break;
      }
    }

    if (!unlockedWalletId || !unlockedSecret) {
      throw new RpcError('INVALID_PASSWORD', 'Password is incorrect.');
    }

    this.unlockedSecrets = {
      [unlockedWalletId]: {
        secret: unlockedSecret,
        unlockedAt: Date.now()
      }
    };
    await Promise.all([
      this.persistUnlockedSecrets(),
      unlockedPasswordSessionStorage.set({ value: password })
    ]);
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });

    return true;
  }

  async lockWallet() {
    await this.clearUnlockedSecrets();
    const walletState = await this.getWalletState();
    if (walletState.wallets.length > 0 && walletState.wallets.every((entry) => entry.signer.kind === 'watch-only')) {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
      return true;
    }
    await this.setSessionState({ locked: true, lastActivityAt: 0 });
    return true;
  }

  async resetWallet() {
    await this.clearUnlockedSecrets();

    for (const [approvalId, pending] of this.pendingApprovals.entries()) {
      pending.reject(new RpcError('WALLET_RESET', 'Wallet was reset.'));
      this.pendingApprovals.delete(approvalId);
    }

    await Promise.all([
      walletStateStorage.set(createEmptyWalletState()),
      permissionsStorage.set({ origins: {} }),
      sessionStorage.set(createInitialSessionState()),
      approvalsStorage.set({}),
      deviceLinkStorage.set({}),
      assetCacheStorage.set({})
    ]);

    return this.getStateResponse();
  }

  async removeWallet(walletId: string) {
    const walletState = await this.getWalletState();
    const approvals = await approvalsStorage.get();
    const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
    if (!targetWallet) {
      throw new RpcError('WALLET_NOT_FOUND', 'Wallet could not be found.');
    }

    delete this.unlockedSecrets[walletId];
    await this.persistUnlockedSecrets();

    for (const [approvalId, pending] of this.pendingApprovals.entries()) {
      const approval = approvals[approvalId];
      if (approval?.publicKey && targetWallet.accounts.some((account) => account.publicKey === approval.publicKey)) {
        pending.reject(new RpcError('WALLET_REMOVED', 'Wallet was removed.'));
        this.pendingApprovals.delete(approvalId);
      }
    }

    const nextState = removeWalletProfile(walletState, walletId);
    await walletStateStorage.set(nextState);
    await this.invalidateAssetCache();

    if (nextState.wallets.length === 0) {
      await this.setSessionState({ locked: true, lastActivityAt: 0 });
    }

    return this.getStateResponse();
  }

  async removeRecentRecipient(address: string) {
    const walletState = await this.getWalletState();
    const selectedWallet = getSelectedWallet(walletState);
    if (!selectedWallet) {
      return this.getStateResponse();
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? removeWalletRecipient(wallet, address) : wallet
      )
    });

    return this.getStateResponse();
  }

  async addContact(input: { label: string; recipient: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const normalizedLabel = input.label.trim();
    if (!normalizedLabel) {
      throw new RpcError('INVALID_CONTACT_LABEL', 'Enter a contact label.');
    }

    const resolvedRecipient = await this.resolveRecipientForChain(selectedWallet.chain, input.recipient, walletState);
    const storedRecipient = this.resolveStoredContactRecipient(resolvedRecipient);
    const existingContact = selectedWallet.contacts.find((entry) => entry.recipient === storedRecipient);
    const normalizedLabelKey = normalizedLabel.toLowerCase();
    const duplicateLabel = selectedWallet.contacts.find(
      (entry) => entry.id !== existingContact?.id && entry.label.trim().toLowerCase() === normalizedLabelKey
    );
    if (duplicateLabel) {
      throw new RpcError('DUPLICATE_CONTACT_LABEL', 'That contact label is already in use.');
    }

    const timestamp = Date.now();
    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id
          ? upsertWalletContact(wallet, {
              id: existingContact?.id ?? crypto.randomUUID(),
              label: normalizedLabel,
              recipient: storedRecipient,
              createdAt: existingContact?.createdAt ?? timestamp,
              updatedAt: timestamp
            })
          : wallet
      )
    });

    return this.getStateResponse();
  }

  async removeContact(contactId: string) {
    const walletState = await this.getWalletState();
    const selectedWallet = getSelectedWallet(walletState);
    if (!selectedWallet) {
      return this.getStateResponse();
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? removeWalletContact(wallet, contactId) : wallet
      )
    });

    return this.getStateResponse();
  }

  async getActiveAccount() {
    const wallet = await this.getWalletState();
    const selectedWallet = getSelectedWallet(wallet);
    if (!selectedWallet) {
      return undefined;
    }
    return selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
  }

  async getStateResponse() {
    const [wallet, session, permissions, activeAccount, access] = await Promise.all([
      this.getWalletState(),
      this.getSessionState(),
      permissionsStorage.get(),
      this.getActiveAccount(),
      accessSessionStorage.get()
    ]);
    const activeWallet = getSelectedWallet(wallet);
    const unlockedPassword = session.locked ? null : (await unlockedPasswordSessionStorage.get()).value;
    const canUseUnlockedSigner = !!(
      activeWallet &&
      activeAccount &&
      activeWallet.signer.kind !== 'watch-only' &&
      !session.locked &&
      (
        (await this.findUnlockedSecretForAccount(activeWallet.id, activeWallet.chain, activeAccount.publicKey, activeAccount.derivationPath)) ||
        (!!activeWallet.vault && !!unlockedPassword)
      )
    );
    const unlockedWalletIds = await this.getUnlockedWalletIds(session.locked);
    const normalizedAccess = {
      ...access,
      granted: true,
      requiredDaoId: ''
    };

    return {
      wallet,
      session,
      permissions: listPermissions(permissions),
      access: normalizedAccess,
      activeWallet:
        activeWallet && activeAccount
          ? {
              id: activeWallet.id,
              name: activeWallet.name,
              publicKey: activeAccount.publicKey,
              chain: activeWallet.chain,
              biometricEnabled: !!activeWallet.vault && activeWallet.signer.kind !== 'watch-only' && !!resolveBiometricUnlockConfig(wallet, activeWallet),
              source: activeWallet.source,
              signerKind: activeWallet.signer.kind
            }
          : undefined,
      activeAccount: activeAccount ? { publicKey: activeAccount.publicKey } : undefined,
      recentRecipients: activeWallet?.recentRecipients ?? [],
      contacts: activeWallet?.contacts ?? [],
      canUseUnlockedSigner,
      unlockedWalletIds
    };
  }

  async setNetwork(network: 'mainnet-beta' | 'devnet') {
    const { walletState } = await this.ensureReadyWallet();
    const selectedChain = walletState.selectedChain;
    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        solana: {
          ...walletState.chainState.solana,
          selectedNetwork: selectedChain === 'solana' ? network : walletState.chainState.solana.selectedNetwork
        },
        sui: {
          ...walletState.chainState.sui,
          selectedNetwork: selectedChain === 'sui' ? network : walletState.chainState.sui.selectedNetwork
        },
        monad: {
          ...walletState.chainState.monad,
          selectedNetwork: selectedChain === 'monad' ? network : walletState.chainState.monad.selectedNetwork
        },
        ethereum: {
          ...walletState.chainState.ethereum,
          selectedNetwork: selectedChain === 'ethereum' ? network : walletState.chainState.ethereum.selectedNetwork
        }
      },
      selectedNetwork: network
    });
    return this.getStateResponse();
  }

  async setTheme(theme: import('@grape/core').GrapeTheme) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      selectedTheme: theme
    });
    return this.getStateResponse();
  }

  async setCustomTheme(customTheme: import('@grape/core').CustomThemeConfig) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      customTheme
    });
    return this.getStateResponse();
  }

  async setThemeBackgroundStyle(style: import('@grape/core').ThemeBackgroundStyle) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      themeBackgroundStyle: style
    });
    return this.getStateResponse();
  }

  async setThemeMotionIntensity(intensity: import('@grape/core').ThemeMotionIntensity) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      themeMotionIntensity: intensity
    });
    return this.getStateResponse();
  }

  async setPrivacyMode(enabled: boolean) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      privacyMode: enabled
    });
    return this.getStateResponse();
  }

  async setHideLowValueTokens(enabled: boolean) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      hideLowValueTokens: enabled
    });
    return this.getStateResponse();
  }

  async setAutoConnect(enabled: boolean) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      autoConnectEnabled: enabled
    });
    return this.getStateResponse();
  }

  async setDappApprovalMode(mode: import('@grape/core').DappApprovalMode) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      dappApprovalMode: mode
    });
    return this.getStateResponse();
  }

  async setCustomRpc(network: 'mainnet-beta' | 'devnet', rpcUrl: string | null) {
    const walletState = await this.getWalletState();
    const nextCustomRpcUrls = {
      ...walletState.customRpcUrls
    };

    if (rpcUrl?.trim()) {
      nextCustomRpcUrls[network] = rpcUrl.trim();
    } else {
      delete nextCustomRpcUrls[network];
    }

    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        solana: {
          ...walletState.chainState.solana,
          customRpcUrls: nextCustomRpcUrls
        }
      },
      customRpcUrls: nextCustomRpcUrls
    });
    await this.invalidateAssetCache();
    return this.getStateResponse();
  }

  async setSuiCustomRpc(rpcUrl: string | null) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        sui: {
          ...walletState.chainState.sui,
          customRpcUrl: rpcUrl?.trim() || undefined
        }
      }
    });
    await this.invalidateAssetCache();
    return this.getStateResponse();
  }

  async setMonadCustomRpc(rpcUrl: string | null) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        monad: {
          ...walletState.chainState.monad,
          customRpcUrl: rpcUrl?.trim() || undefined
        }
      }
    });
    await this.invalidateAssetCache();
    return this.getStateResponse();
  }

  async setEthereumCustomRpc(rpcUrl: string | null) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      chainState: {
        ...walletState.chainState,
        ethereum: {
          ...walletState.chainState.ethereum,
          customRpcUrl: rpcUrl?.trim() || undefined
        }
      }
    });
    await this.invalidateAssetCache();
    return this.getStateResponse();
  }

  async selectWallet(walletId: string) {
    const walletState = await this.getWalletState();
    const selectedWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
    if (!selectedWallet) {
      throw new RpcError('WALLET_NOT_FOUND', 'Wallet could not be found.');
    }

    await walletStateStorage.set({
      ...walletState,
      selectedChain: selectedWallet.chain,
      selectedWalletIds: {
        ...walletState.selectedWalletIds,
        [selectedWallet.chain]: walletId
      },
      selectedWalletId: walletId
    });
    return this.getStateResponse();
  }

  async setChain(chain: 'solana' | 'sui' | 'monad' | 'ethereum') {
    const walletState = await this.getWalletState();
    const nextSelectedWalletId =
      walletState.selectedWalletIds[chain] ?? walletState.wallets.find((wallet) => wallet.chain === chain)?.id;
    await walletStateStorage.set({
      ...walletState,
      selectedChain: chain,
      selectedWalletIds: nextSelectedWalletId
        ? {
            ...walletState.selectedWalletIds,
            [chain]: nextSelectedWalletId
          }
        : walletState.selectedWalletIds,
      selectedNetwork:
        chain === 'solana'
          ? walletState.chainState.solana.selectedNetwork
          : chain === 'sui'
            ? walletState.chainState.sui.selectedNetwork
            : chain === 'monad'
              ? walletState.chainState.monad.selectedNetwork
              : walletState.chainState.ethereum.selectedNetwork,
      selectedWalletId: nextSelectedWalletId ?? walletState.selectedWalletId
    });
    return this.getStateResponse();
  }

  async setWalletLabel(walletId: string, name: string) {
    const walletState = await this.getWalletState();
    const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
    if (!targetWallet) {
      throw new RpcError('WALLET_NOT_FOUND', 'Wallet could not be found.');
    }

    const nextName = name.trim();
    if (!nextName) {
      throw new RpcError('INVALID_WALLET_NAME', 'Wallet label cannot be empty.');
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === walletId
          ? {
              ...wallet,
              name: nextName
            }
          : wallet
      )
    });
    return this.getStateResponse();
  }

  async setIdleTimeout(idleTimeoutMs: number) {
    const { walletState } = await this.ensureReadyWallet();
    await walletStateStorage.set({
      ...walletState,
      idleTimeoutMs
    });
    return this.getStateResponse();
  }

  async setTrackedReputationSpaces(daoIds: string[]) {
    const walletState = await this.getWalletState();
    const nextDaoIds = Array.from(new Set(daoIds.map((entry) => entry.trim()).filter((entry) => !!entry)));
    await walletStateStorage.set({
      ...walletState,
      trackedReputationSpaceIds: nextDaoIds
    });
    this.reputationCache.clear();
    return this.getStateResponse();
  }

  async setTrackedVerificationSpaces(daoIds: string[]) {
    const walletState = await this.getWalletState();
    const nextDaoIds = Array.from(new Set(daoIds.map((entry) => entry.trim()).filter((entry) => !!entry)));
    await walletStateStorage.set({
      ...walletState,
      trackedVerificationSpaceIds: nextDaoIds
    });
    this.verificationCache.clear();
    return this.getStateResponse();
  }

  async setTrackedGovernanceDaos(daoIds: string[]) {
    const walletState = await this.getWalletState();
    const nextDaoIds = Array.from(new Set(daoIds.map((entry) => entry.trim()).filter((entry) => !!entry)));
    await walletStateStorage.set({
      ...walletState,
      trackedGovernanceDaoIds: nextDaoIds
    });
    this.governanceCache.clear();
    return this.getStateResponse();
  }

  async setBiometricUnlock(config: import('@grape/core').BiometricUnlockConfig | null) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (!selectedWallet.vault || selectedWallet.signer.kind === 'watch-only') {
      throw new RpcError('BIOMETRIC_UNAVAILABLE', 'Biometric unlock is only available for password-protected wallets.');
    }
    await walletStateStorage.set({
      ...walletState,
      sharedBiometricUnlock: config ?? undefined,
      wallets: walletState.wallets.map((wallet) =>
        wallet.biometricUnlock
          ? {
              ...wallet,
              biometricUnlock: undefined
            }
          : wallet
      )
    });
    return this.getStateResponse();
  }

  async getBalanceLamports() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return null;
    }
    if (selectedWallet.chain === 'sui') {
      const client = await this.createSuiClient(walletState.selectedNetwork, walletState);
      const balance = await client.getBalance({ owner: activeAccount.publicKey, coinType: '0x2::sui::SUI' });
      const total = BigInt(balance.balance.balance);
      return total > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(total);
    }
    if (selectedWallet.chain === 'monad') {
      const client = await this.createMonadClient(walletState.selectedNetwork, walletState);
      const balance = await getMonadHoldings(client, activeAccount.publicKey);
      return balance.totalWei > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(balance.totalWei);
    }
    if (selectedWallet.chain === 'ethereum') {
      const client = await this.createEthereumClient(walletState.selectedNetwork, walletState);
      const balance = await getEthereumHoldings(client, activeAccount.publicKey);
      return balance.totalWei > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(balance.totalWei);
    }
    const publicKey = tryParseSolanaPublicKey(activeAccount.publicKey);
    if (!publicKey) {
      return 0;
    }
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    return connection.getBalance(publicKey);
  }

  private assertInteractiveWallet(selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>) {
    if (selectedWallet.signer.kind === 'watch-only') {
      throw new RpcError('WATCH_ONLY_WALLET', 'This wallet is watch-only and cannot sign messages or transactions.');
    }
  }

  private async scanWalletTokenAccounts(
    connection: Connection,
    owner: PublicKey,
    shyftMetadata: Record<string, { name?: string; symbol?: string; logoUri?: string }>
  ): Promise<ParsedWalletTokenAccount[]> {
    const tokenResponses = await Promise.all(
      TOKEN_PROGRAM_IDS.map((programId) =>
        connection.getParsedTokenAccountsByOwner(owner, {
          programId: new PublicKey(programId)
        })
      )
    );

    return tokenResponses.flatMap((response) =>
      response.value.map((accountInfo) => {
        const parsed = accountInfo.account.data.parsed.info;
        const tokenAmount = parsed.tokenAmount as {
          uiAmountString?: string;
          amount: string;
          decimals: number;
        };
        const delegatedAmount = parsed.delegatedAmount as { uiAmountString?: string; amount?: string } | undefined;
        const mint = parsed.mint as string;

        return {
          mint,
          amount: tokenAmount.uiAmountString ?? tokenAmount.amount,
          rawAmount: tokenAmount.amount,
          decimals: tokenAmount.decimals,
          programId: accountInfo.account.owner.toBase58(),
          accountAddress: accountInfo.pubkey.toBase58(),
          name: shyftMetadata[mint]?.name,
          symbol: shyftMetadata[mint]?.symbol ?? KNOWN_TOKEN_SYMBOLS[mint],
          logoUri: shyftMetadata[mint]?.logoUri,
          delegate: typeof parsed.delegate === 'string' ? parsed.delegate : null,
          delegatedAmount:
            delegatedAmount?.uiAmountString ??
            (typeof delegatedAmount?.amount === 'string' ? delegatedAmount.amount : null),
          closeAuthority: typeof parsed.closeAuthority === 'string' ? parsed.closeAuthority : null
        } satisfies ParsedWalletTokenAccount;
      })
    );
  }

  private async scanControlledMints(
    connection: Connection,
    walletPublicKey: string,
    tokens: ParsedWalletTokenAccount[],
    collections: CollectionHolding[]
  ): Promise<ControlledMintRecord[]> {
    const mintAddresses = Array.from(
      new Set([
        ...tokens.map((token) => token.mint),
        ...collections.flatMap((collection) => collection.items.map((item) => item.mint))
      ])
    );

    const mintAccounts = await Promise.all(
      mintAddresses.map(async (mint) => {
        const mintPublicKey = tryParseSolanaPublicKey(mint);
        if (!mintPublicKey) {
          return null;
        }
        const accountInfo = await connection.getParsedAccountInfo(mintPublicKey, 'confirmed');
        const parsedData = accountInfo.value?.data;
        if (!parsedData || typeof parsedData !== 'object' || !('parsed' in parsedData)) {
          return null;
        }

        const parsed = parsedData.parsed;
        if (!parsed || typeof parsed !== 'object' || !('info' in parsed) || !parsed.info || typeof parsed.info !== 'object') {
          return null;
        }

        const info = parsed.info as Record<string, unknown>;
        const mintAuthority = typeof info.mintAuthority === 'string' ? info.mintAuthority : null;
        const freezeAuthority = typeof info.freezeAuthority === 'string' ? info.freezeAuthority : null;
        const token = tokens.find((entry) => entry.mint === mint);

        const entry: ControlledMintRecord = {
          mint,
          programId: accountInfo.value?.owner.toBase58() ?? token?.programId ?? TOKEN_PROGRAM_IDS[0],
          name: token?.name,
          symbol: token?.symbol,
          mintAuthority,
          freezeAuthority,
          controlsMintAuthority: mintAuthority === walletPublicKey,
          controlsFreezeAuthority: freezeAuthority === walletPublicKey
        };

        return entry;
      })
    );

    return mintAccounts.filter(
      (entry): entry is ControlledMintRecord => !!entry && (entry.controlsMintAuthority || entry.controlsFreezeAuthority)
    );
  }

  private async submitTransactionForWallet(
    selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>,
    activePublicKey: string,
    secret: VaultSecret | null,
    connection: Connection,
    transaction: Transaction
  ) {
    try {
      return selectedWallet.signer.kind === 'ledger'
        ? await signAndSendLedgerTransaction(transaction, activePublicKey, selectedWallet.signer.derivationPath, connection)
        : await signAndSendTransaction(transaction, this.resolveSolanaSignerForWallet(secret as VaultSecret, selectedWallet, activePublicKey), connection);
    } catch (error) {
      throw normalizeSigningError(error);
    } finally {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    }
  }

  private async submitInstructionBatches(
    selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>,
    activePublicKey: string,
    secret: VaultSecret | null,
    connection: Connection,
    owner: PublicKey,
    instructions: TransactionInstruction[],
    batchSize = INCIDENT_BATCH_SIZE
  ): Promise<string[]> {
    const signatures: string[] = [];

    for (let index = 0; index < instructions.length; index += batchSize) {
      const batch = instructions.slice(index, index + batchSize);
      if (batch.length === 0) {
        continue;
      }

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction({
        feePayer: owner,
        recentBlockhash: blockhash
      });
      transaction.add(...batch);
      signatures.push(await this.submitTransactionForWallet(selectedWallet, activePublicKey, secret, connection, transaction));
    }

    return signatures;
  }

  async getAssets(options?: { staleWhileRevalidate?: boolean }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return {
        lamports: null,
        tokens: []
      };
    }

    const cacheKey = this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
    const cache = await assetCacheStorage.get();
    const cached = cache[cacheKey];

    if (cached) {
      const stale = Date.now() - cached.cachedAt >= ASSET_CACHE_TTL_MS;
      if (!stale) {
        if (cached.data.stale && options?.staleWhileRevalidate) {
          void this.refreshAssetsCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
        }
        return {
          ...cached.data,
          cachedAt: cached.cachedAt,
          fromCache: true,
          stale: !!cached.data.stale
        };
      }

      if (options?.staleWhileRevalidate) {
        void this.refreshAssetsCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
        return {
          ...cached.data,
          cachedAt: cached.cachedAt,
          fromCache: true,
          stale: true
        };
      }
    }

    if (options?.staleWhileRevalidate && selectedWallet.chain === 'solana') {
      const fastAssets = await this.refreshSolanaAssetsFast(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey, walletState);
      void this.refreshAssetsCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
      return {
        ...fastAssets,
        fromCache: false,
        stale: true
      };
    }

    return this.refreshAssetsCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
  }

  private async refreshReputationCache(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string
  ): Promise<WalletReputationResponse> {
    const cacheKey = this.getReputationCacheKey(walletId, network, publicKey);
    const inFlight = this.reputationRefreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = (async () => {
      const walletState = await this.getWalletState();
      const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
      if (!targetWallet || targetWallet.chain !== 'solana') {
        const empty = {
          spaces: [],
          totalPoints: '0',
          source: 'none' as const,
          network,
          refreshedAt: Date.now()
        };
        this.reputationCache.set(cacheKey, { cachedAt: Date.now(), data: empty });
        return empty;
      }

      const owner = tryParseSolanaPublicKey(publicKey);
      if (!owner) {
        const empty = {
          spaces: [],
          totalPoints: '0',
          source: 'none' as const,
          network,
          refreshedAt: Date.now()
        };
        this.reputationCache.set(cacheKey, { cachedAt: Date.now(), data: empty });
        return empty;
      }

      const connection = this.createConnection(network, walletState);
      let spaces: WalletReputationResponse['spaces'] = [];
      try {
        spaces = await fetchOgReputationForWallet(connection, owner, walletState.trackedReputationSpaceIds);
      } catch {
        spaces = [];
      }
      const totalPoints = spaces.reduce((sum, entry) => sum + BigInt(entry.points), BigInt(0)).toString();
      const result: WalletReputationResponse = {
        spaces,
        totalPoints,
        source: spaces.length > 0 ? 'vine' : 'none',
        network,
        refreshedAt: Date.now()
      };
      this.reputationCache.set(cacheKey, { cachedAt: Date.now(), data: result });
      return result;
    })().finally(() => {
      this.reputationRefreshes.delete(cacheKey);
    });

    this.reputationRefreshes.set(cacheKey, refreshPromise);
    return refreshPromise;
  }

  async getReputation() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount || selectedWallet.chain !== 'solana') {
      return {
        spaces: [],
        totalPoints: '0',
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    const cacheKey = this.getReputationCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
    const cached = this.reputationCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < REPUTATION_CACHE_TTL_MS) {
      return cached.data;
    }

    return this.refreshReputationCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
  }

  private async refreshVerificationCache(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string
  ): Promise<WalletVerificationResponse> {
    const cacheKey = this.getVerificationCacheKey(walletId, network, publicKey);
    const inFlight = this.verificationRefreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = (async () => {
      const walletState = await this.getWalletState();
      const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
      const trackedSpaces = walletState.trackedVerificationSpaceIds;
      if (!targetWallet || targetWallet.chain !== 'solana') {
        const empty: WalletVerificationResponse = {
          trackedSpaces,
          identities: [],
          totalVerified: 0,
          source: 'none',
          network,
          refreshedAt: Date.now()
        };
        this.verificationCache.set(cacheKey, { cachedAt: Date.now(), data: empty });
        return empty;
      }

      const owner = tryParseSolanaPublicKey(publicKey);
      if (!owner) {
        const empty: WalletVerificationResponse = {
          trackedSpaces,
          identities: [],
          totalVerified: 0,
          source: 'none',
          network,
          refreshedAt: Date.now()
        };
        this.verificationCache.set(cacheKey, { cachedAt: Date.now(), data: empty });
        return empty;
      }

      const identities = await fetchVerificationForWalletIndexed(owner, trackedSpaces);
      const source: WalletVerificationResponse['source'] = trackedSpaces.length > 0 ? 'shyft' : 'none';

      const result: WalletVerificationResponse = {
        trackedSpaces,
        identities,
        totalVerified: identities.filter((identity) => identity.verified).length,
        source,
        network,
        refreshedAt: Date.now()
      };
      this.verificationCache.set(cacheKey, { cachedAt: Date.now(), data: result });
      return result;
    })().finally(() => {
      this.verificationRefreshes.delete(cacheKey);
    });

    this.verificationRefreshes.set(cacheKey, refreshPromise);
    return refreshPromise;
  }

  async getVerification() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount || selectedWallet.chain !== 'solana') {
      return {
        trackedSpaces: walletState.trackedVerificationSpaceIds,
        identities: [],
        totalVerified: 0,
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    const cacheKey = this.getVerificationCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
    const cached = this.verificationCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < REPUTATION_CACHE_TTL_MS) {
      return cached.data;
    }

    return this.refreshVerificationCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
  }

  private getAccessVerificationTarget(walletState: Awaited<ReturnType<WalletController['getWalletState']>>) {
    const solanaWallet =
      getSelectedWalletForChain(walletState, 'solana') ??
      walletState.wallets.find((wallet) => wallet.chain === 'solana');
    if (!solanaWallet) {
      return null;
    }

    const activeAccount =
      solanaWallet.accounts.find((account) => account.id === solanaWallet.selectedAccountId) ??
      solanaWallet.accounts[0];
    if (!activeAccount) {
      return null;
    }

    return {
      wallet: solanaWallet,
      publicKey: activeAccount.publicKey
    };
  }

  async refreshAccessSession() {
    const currentAccess = await accessSessionStorage.get();
    const now = Date.now();
    const walletState = await this.getWalletState();
    const verificationTarget = this.getAccessVerificationTarget(walletState);

    await accessSessionStorage.set({
      granted: true,
      requiredDaoId: '',
      grantedAt: currentAccess.grantedAt ?? now,
      lastCheckedAt: now,
      qualifyingWalletPublicKey: verificationTarget?.publicKey
    });

    await ensureProviderInjectedIntoExistingTabs();

    return this.getStateResponse();
  }

  async clearAccessSession() {
    await accessSessionStorage.set({
      granted: true,
      requiredDaoId: '',
      grantedAt: null,
      lastCheckedAt: Date.now()
    });
    return this.getStateResponse();
  }

  private async refreshGovernanceCache(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string
  ): Promise<WalletGovernanceResponse> {
    const cacheKey = this.getGovernanceCacheKey(walletId, network, publicKey);
    const inFlight = this.governanceRefreshes.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = (async () => {
      const walletState = await this.getWalletState();
      const targetWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
      const trackedDaos = walletState.trackedGovernanceDaoIds;
      if (!targetWallet || targetWallet.chain !== 'solana') {
        const empty: WalletGovernanceResponse = {
          trackedDaos,
          discoveredDaos: [],
          delegateDaos: [],
          governedDaos: [],
          memberDaos: 0,
          proposals: [],
          daos: [],
          source: 'none',
          network,
          refreshedAt: Date.now()
        };
        this.governanceCache.set(cacheKey, { cachedAt: Date.now(), data: empty });
        return empty;
      }

      const owner = tryParseSolanaPublicKey(publicKey);
      if (!owner) {
        const empty: WalletGovernanceResponse = {
          trackedDaos,
          discoveredDaos: [],
          delegateDaos: [],
          governedDaos: [],
          memberDaos: 0,
          proposals: [],
          daos: [],
          source: 'none',
          network,
          refreshedAt: Date.now()
        };
        this.governanceCache.set(cacheKey, { cachedAt: Date.now(), data: empty });
        return empty;
      }

      const connection = this.createConnection(network, walletState);
      let result: WalletGovernanceResponse;
      try {
        result = await fetchGovernanceForWallet(connection, owner, trackedDaos);
      } catch {
        result = {
          trackedDaos,
          discoveredDaos: [],
          delegateDaos: [],
          governedDaos: [],
          memberDaos: 0,
          proposals: [],
          daos: [],
          source: 'none',
          network,
          refreshedAt: Date.now()
        };
      }
      this.governanceCache.set(cacheKey, { cachedAt: Date.now(), data: result });
      return result;
    })().finally(() => {
      this.governanceRefreshes.delete(cacheKey);
    });

    this.governanceRefreshes.set(cacheKey, refreshPromise);
    return refreshPromise;
  }

  async getGovernance() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount || selectedWallet.chain !== 'solana') {
      return {
        trackedDaos: walletState.trackedGovernanceDaoIds,
        discoveredDaos: [],
        delegateDaos: [],
        governedDaos: [],
        memberDaos: 0,
        proposals: [],
        daos: [],
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    const cacheKey = this.getGovernanceCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
    const cached = this.governanceCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < REPUTATION_CACHE_TTL_MS) {
      return cached.data;
    }

    return this.refreshGovernanceCache(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey);
  }

  async scanGovernanceEligibility(): Promise<GovernanceEligibleDao[]> {
    const { selectedWallet } = await this.ensureReadyWallet();
    if (selectedWallet.chain !== 'solana') {
      return [];
    }

    const assets = await this.getAssets({ staleWhileRevalidate: true });
    const holdingByMint = new Map<string, {
      mint: string;
      amount: string;
      rawAmount: string;
      decimals: number;
      symbol?: string;
      name?: string;
      logoUri?: string;
    }>();

    for (const token of assets.tokens) {
      const mint = token.mint?.trim();
      if (!mint) {
        continue;
      }

      let hasPositiveBalance = false;
      try {
        hasPositiveBalance = BigInt(token.rawAmount ?? '0') > 0n;
      } catch {
        const parsed = Number(token.amount ?? 0);
        hasPositiveBalance = Number.isFinite(parsed) && parsed > 0;
      }

      if (!hasPositiveBalance || holdingByMint.has(mint)) {
        continue;
      }

      holdingByMint.set(mint, {
        mint,
        amount: token.amount,
        rawAmount: token.rawAmount,
        decimals: token.decimals,
        symbol: token.symbol,
        name: token.name,
        logoUri: token.logoUri
      });
    }

    if (holdingByMint.size === 0) {
      return [];
    }

    const realms = await fetchGovernanceRealmDirectory();
    return realms
      .map((realm) => {
        const communityHolding = holdingByMint.get(realm.communityMint) ?? null;
        const councilHolding = realm.councilMint ? holdingByMint.get(realm.councilMint) ?? null : null;
        if (!communityHolding && !councilHolding) {
          return null;
        }

        return {
          daoId: realm.daoId,
          realmName: realm.name,
          communityMint: realm.communityMint,
          councilMint: realm.councilMint,
          communityHolding,
          councilHolding
        } satisfies GovernanceEligibleDao;
      })
      .filter((entry): entry is GovernanceEligibleDao => !!entry)
      .sort((left, right) => {
        const leftScore = (left.communityHolding ? 1 : 0) + (left.councilHolding ? 1 : 0);
        const rightScore = (right.communityHolding ? 1 : 0) + (right.councilHolding ? 1 : 0);
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        const leftAmount = Number(left.communityHolding?.amount ?? 0) + Number(left.councilHolding?.amount ?? 0);
        const rightAmount = Number(right.communityHolding?.amount ?? 0) + Number(right.councilHolding?.amount ?? 0);
        if (Number.isFinite(leftAmount) && Number.isFinite(rightAmount) && leftAmount !== rightAmount) {
          return rightAmount - leftAmount;
        }

        return left.realmName.localeCompare(right.realmName);
      });
  }

  async castGovernanceVote(input: {
    daoId: string;
    governanceProgramId?: string;
    governanceId: string;
    proposalId: string;
    proposalOwnerRecordId: string;
    tokenOwnerRecordId: string;
    governingTokenMint: string;
    voteKind: 'approve' | 'deny' | 'abstain';
    choiceRank?: number;
    password?: string;
  }): Promise<WalletGovernanceVoteResponse> {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Governance voting is currently supported for Solana wallets only.');
    }

    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const owner = tryParseSolanaPublicKey(activeAccount.publicKey);
    if (!owner) {
      throw new RpcError('INVALID_PUBLIC_KEY', 'Active wallet address is invalid.');
    }

    const programId = new PublicKey(input.governanceProgramId ?? findGovernanceOwnerByDao(input.daoId).owner);
    const realmPk = new PublicKey(input.daoId);
    const governancePk = new PublicKey(input.governanceId);
    const proposalPk = new PublicKey(input.proposalId);
    const proposalOwnerRecordPk = new PublicKey(input.proposalOwnerRecordId);
    const tokenOwnerRecordPk = new PublicKey(input.tokenOwnerRecordId);
    const governingTokenMintPk = new PublicKey(input.governingTokenMint);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);

    const [programVersion, proposalAccount, governanceAccount, realmAccount, tokenOwnerRecordAccount, realmConfigAccount] = await Promise.all([
      resolveGovernanceProgramVersion(connection, programId, realmPk),
      getProposal(connection, proposalPk),
      getGovernance(connection, governancePk),
      getRealm(connection, realmPk),
      getTokenOwnerRecord(connection, tokenOwnerRecordPk),
      tryGetRealmConfig(connection, programId, realmPk)
    ]);

    if (proposalAccount.account.state !== ProposalState.Voting) {
      throw new RpcError('PROPOSAL_NOT_VOTING', 'This proposal is not in the voting window anymore.');
    }
    if (proposalAccount.account.governance.toBase58() !== input.governanceId) {
      throw new RpcError('INVALID_PROPOSAL', 'This proposal does not belong to the selected governance account.');
    }
    if (proposalAccount.account.tokenOwnerRecord.toBase58() !== input.proposalOwnerRecordId) {
      throw new RpcError('INVALID_PROPOSAL', 'This proposal owner record does not match the selected proposal.');
    }
    if (proposalAccount.account.governingTokenMint.toBase58() !== input.governingTokenMint) {
      throw new RpcError(
        'INVALID_GOVERNANCE_MINT',
        'The selected vote record does not match this proposal voting class. Community and council votes must use their matching governance mint.'
      );
    }
    if (tokenOwnerRecordAccount.account.realm.toBase58() !== input.daoId) {
      throw new RpcError('INVALID_TOKEN_OWNER_RECORD', 'This token owner record does not belong to the selected DAO.');
    }
    if (tokenOwnerRecordAccount.account.governingTokenMint.toBase58() !== input.governingTokenMint) {
      throw new RpcError(
        'INVALID_TOKEN_OWNER_RECORD',
        'This token owner record does not match the proposal voting mint.'
      );
    }

    const voteRecordPk = await getVoteRecordAddress(programId, proposalPk, tokenOwnerRecordPk);
    const existingVoteRecord = await getVoteRecord(connection, voteRecordPk).catch(() => null);
    if (existingVoteRecord && !existingVoteRecord.account.isRelinquished) {
      throw new RpcError('ALREADY_VOTED', 'This token owner record already voted on the proposal.');
    }

    const instructions: TransactionInstruction[] = [];
    const vote =
      input.voteKind === 'deny'
        ? new Vote({ voteType: VoteKind.Deny, approveChoices: undefined, deny: true, veto: undefined })
        : input.voteKind === 'abstain'
          ? new Vote({ voteType: VoteKind.Abstain, approveChoices: undefined, deny: undefined, veto: undefined })
          : new Vote({
              voteType: VoteKind.Approve,
              approveChoices: [new VoteChoice({ rank: input.choiceRank ?? 0, weightPercentage: 100 })],
              deny: undefined,
              veto: undefined
            });

    const communityMintPk = realmAccount.account.communityMint;
    const councilMintPk = realmAccount.account.config.councilMint ?? null;
    const governingTokenConfig = governingTokenMintPk.equals(communityMintPk)
      ? realmConfigAccount?.account.communityTokenConfig
      : councilMintPk && governingTokenMintPk.equals(councilMintPk)
        ? realmConfigAccount?.account.councilTokenConfig
        : null;
    const governingTokenOwnerPk = tokenOwnerRecordAccount.account.governingTokenOwner;
    const voterWeightRecordPk = governingTokenConfig?.voterWeightAddin
      ? await getVoterWeightRecordAddress(
          governingTokenConfig.voterWeightAddin,
          realmPk,
          governingTokenMintPk,
          governingTokenOwnerPk
        )
      : undefined;
    const maxVoterWeightRecordPk = governingTokenConfig?.maxVoterWeightAddin
      ? await getMaxVoterWeightRecordAddress(
          governingTokenConfig.maxVoterWeightAddin,
          realmPk,
          governingTokenMintPk
        )
      : undefined;
    const governancePluginAccounts = [voterWeightRecordPk, maxVoterWeightRecordPk].filter(
      (entry): entry is PublicKey => !!entry
    );
    if (governancePluginAccounts.length > 0) {
      const pluginAccountInfos = await connection.getMultipleAccountsInfo(governancePluginAccounts, 'confirmed');
      const missingGovernancePluginAccount = governancePluginAccounts.find((_, index) => !pluginAccountInfos[index]);
      if (missingGovernancePluginAccount) {
        throw new RpcError(
          'GOVERNANCE_PLUGIN_ACCOUNT_MISSING',
          'This DAO uses a governance voter-weight plugin, but the required voting record is not available for this wallet yet. Voting for this DAO is not currently supported in Grape.'
        );
      }
    }

    await withCastVote(
      instructions,
      programId,
      programVersion,
      realmAccount.pubkey,
      governanceAccount.pubkey,
      proposalAccount.pubkey,
      proposalOwnerRecordPk,
      tokenOwnerRecordPk,
      owner,
      governingTokenMintPk,
      vote,
      owner,
      voterWeightRecordPk,
      maxVoterWeightRecordPk
    );

    const secret = await this.getUnlockedSecretForAccount(
      selectedWallet.id,
      selectedWallet.vault,
      selectedWallet.chain,
      activeAccount.publicKey,
      input.password,
      activeAccount.derivationPath
    );
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: owner,
      recentBlockhash: blockhash
    });
    transaction.add(...instructions);
    let signature: string;
    try {
      signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);
    } catch (error) {
      if (error instanceof RpcError) {
        const normalizedMessage = error.message.toLowerCase();
        if (
          normalizedMessage.includes('custom program error: 0x44d') ||
          normalizedMessage.includes('account doesn\'t exist') ||
          normalizedMessage.includes('account does not exist')
        ) {
          throw new RpcError(
            'GOVERNANCE_PLUGIN_ACCOUNT_MISSING',
            'This DAO uses a governance voter-weight plugin, but the required voting record is not available for this wallet yet. Voting for this DAO is not currently supported in Grape.'
          );
        }
      }
      throw error;
    }

    this.governanceCache.clear();

    return {
      signature,
      daoId: input.daoId,
      proposalId: input.proposalId,
      voteKind: input.voteKind,
      choiceLabel: input.voteKind === 'approve' ? `Option ${input.choiceRank ?? 0}` : undefined,
      network: walletState.selectedNetwork
    };
  }

  async getStakeAccounts() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      return {
        accounts: [],
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    if (selectedWallet.chain !== 'solana') {
      return {
        accounts: [],
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    if (hasShyftApiKey()) {
      try {
        const shyftAccounts = await fetchShyftStakeAccounts(walletState.selectedNetwork, activeAccount.publicKey);
        if (shyftAccounts.length > 0) {
          return {
            accounts: shyftAccounts,
            source: 'shyft' as const,
            network: walletState.selectedNetwork,
            refreshedAt: Date.now()
          };
        }
      } catch {
        // Fall through to RPC discovery.
      }
    }

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const authority = tryParseSolanaPublicKey(activeAccount.publicKey);
    if (!authority) {
      return {
        accounts: [],
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }
    const getProgramAccountsByAuthority = async (offset: number) => {
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= STAKE_RETRY_ATTEMPTS; attempt += 1) {
        try {
          return await connection.getProgramAccounts(StakeProgram.programId, {
            commitment: 'confirmed',
            encoding: 'base64',
            dataSlice: {
              offset: 0,
              length: 0
            },
            filters: [
              { dataSize: StakeProgram.space },
              { memcmp: { offset, bytes: authority.toBase58() } }
            ]
          });
        } catch (error) {
          lastError = error;
          if (!isLikelyRetryableRpcError(error) || attempt === STAKE_RETRY_ATTEMPTS) {
            throw error;
          }
          await delay(250 * attempt);
        }
      }

      throw lastError;
    };

    const [asStaker, asWithdrawer] = await Promise.all([
      getProgramAccountsByAuthority(12),
      getProgramAccountsByAuthority(44)
    ]);

    const rowsByAddress = new Map<string, StakeAccountRow>();
    [...asStaker, ...asWithdrawer].forEach((entry) => {
      const address = entry.pubkey.toBase58();
      const current = rowsByAddress.get(address);
      rowsByAddress.set(address, {
        address,
        lamports: Math.max(current?.lamports ?? 0, entry.account.lamports),
        state: 'unknown',
        delegatedLamports: 0,
        voter: null,
        staker: null,
        withdrawer: null
      });
    });

    const baseRows = Array.from(rowsByAddress.values());
    const enrichedRows = [...baseRows];
    const chunkSize = 8;

    for (let startIndex = 0; startIndex < enrichedRows.length; startIndex += chunkSize) {
      const chunkRows = enrichedRows.slice(startIndex, startIndex + chunkSize);
      const chunkResponses = await Promise.allSettled(
        chunkRows.map(async (row) => {
          let accountInfo: Awaited<ReturnType<typeof connection.getParsedAccountInfo>> | null = null;
          let lastError: unknown = null;
          for (let attempt = 1; attempt <= STAKE_RETRY_ATTEMPTS; attempt += 1) {
            try {
              accountInfo = await connection.getParsedAccountInfo(new PublicKey(row.address), 'confirmed');
              break;
            } catch (error) {
              lastError = error;
              if (!isLikelyRetryableRpcError(error) || attempt === STAKE_RETRY_ATTEMPTS) {
                throw error;
              }
              await delay(200 * attempt);
            }
          }
          if (!accountInfo) {
            throw lastError instanceof Error ? lastError : new Error('Unable to load parsed stake account info.');
          }
          if (!accountInfo.value) {
            return null;
          }
          const parsedData = accountInfo.value.data as ParsedAccountData;
          const parsedInfo = parsedData.parsed.info as {
            meta?: { authorized?: { staker?: string; withdrawer?: string } };
            stake?: { delegation?: { stake?: string; voter?: string } };
          };

          return {
            address: row.address,
            state: parsedData.parsed.type ?? row.state,
            delegatedLamports: Number(parsedInfo.stake?.delegation?.stake ?? '0'),
            voter: parsedInfo.stake?.delegation?.voter ?? null,
            staker: parsedInfo.meta?.authorized?.staker ?? null,
            withdrawer: parsedInfo.meta?.authorized?.withdrawer ?? null
          };
        })
      );

      chunkResponses.forEach((response, index) => {
        if (response.status !== 'fulfilled' || !response.value) {
          return;
        }
        const target = enrichedRows.find((candidate) => candidate.address === chunkRows[index]?.address);
        if (!target) {
          return;
        }
        target.state = response.value.state;
        target.delegatedLamports = response.value.delegatedLamports;
        target.voter = response.value.voter;
        target.staker = response.value.staker;
        target.withdrawer = response.value.withdrawer;
      });
    }

    enrichedRows.sort((left, right) => right.lamports - left.lamports);
    return {
      accounts: enrichedRows,
      source: enrichedRows.length > 0 ? ('rpc' as const) : ('none' as const),
      network: walletState.selectedNetwork,
      refreshedAt: Date.now()
    };
  }

  async getStakeValidators() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (selectedWallet.chain !== 'solana') {
      return {
        validators: [],
        source: 'none' as const,
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const voteAccounts = await connection.getVoteAccounts('confirmed');
    const validatorNames = new Map<string, string>();

    try {
      const validatorInfoAccounts = await connection.getProgramAccounts(SOLANA_CONFIG_PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [
          {
            memcmp: {
              offset: 1,
              bytes: VALIDATOR_INFO_KEY.toBase58()
            }
          }
        ]
      });

      for (const account of validatorInfoAccounts) {
        const validatorInfo = ValidatorInfo.fromConfigData(account.account.data);
        const validatorName = validatorInfo?.info?.name?.trim();
        if (!validatorInfo || !validatorName) {
          continue;
        }
        validatorNames.set(validatorInfo.key.toBase58(), validatorName);
      }
    } catch {
      // Name lookup is best-effort. The validator list still works with raw vote accounts.
    }

    const validators: StakeValidatorRow[] = voteAccounts.current
      .map((entry) => ({
        voteAccount: entry.votePubkey,
        nodePubkey: entry.nodePubkey,
        name: validatorNames.get(entry.nodePubkey) ?? null,
        commission: entry.commission,
        activatedStakeLamports: Number(entry.activatedStake ?? 0),
        lastVote: entry.lastVote,
        rootSlot: entry.rootSlot
      }))
      .sort((left, right) => {
        if (right.activatedStakeLamports !== left.activatedStakeLamports) {
          return right.activatedStakeLamports - left.activatedStakeLamports;
        }
        if (left.commission !== right.commission) {
          return left.commission - right.commission;
        }
        return left.voteAccount.localeCompare(right.voteAccount);
      });

    return {
      validators,
      source: validators.length > 0 ? ('rpc' as const) : ('none' as const),
      network: walletState.selectedNetwork,
      refreshedAt: Date.now()
    };
  }

  async getActivity(limit = 30): Promise<WalletActivityResponse> {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount || selectedWallet.chain !== 'solana' || !hasShyftApiKey()) {
      return {
        items: [],
        source: 'none',
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    const items = await fetchShyftTransactionHistory(walletState.selectedNetwork, activeAccount.publicKey, limit);
    return {
      items,
      source: 'shyft',
      network: walletState.selectedNetwork,
      refreshedAt: Date.now()
    };
  }

  async getTokenActivity(accountAddress: string, limit = 20): Promise<WalletActivityResponse> {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (selectedWallet.chain !== 'solana' || !hasShyftApiKey()) {
      return {
        items: [],
        source: 'none',
        network: walletState.selectedNetwork,
        refreshedAt: Date.now()
      };
    }

    const items = await fetchShyftTransactionHistory(walletState.selectedNetwork, accountAddress, limit);
    return {
      items,
      source: 'shyft',
      network: walletState.selectedNetwork,
      refreshedAt: Date.now()
    };
  }

  async getTokenDetails(input: { mint: string; accountAddress: string; programId: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Detailed token inspection is currently available for Solana only.');
    }

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const accountAddress = tryParseSolanaPublicKey(input.accountAddress);
    const mintAddress = tryParseSolanaPublicKey(input.mint);
    if (!accountAddress || !mintAddress) {
      throw new RpcError('TOKEN_NOT_FOUND', 'Token details could not be loaded for an invalid Solana address.');
    }
    const [shyftMetadataResult, tokenAccountInfo, mintAccountInfo, tokenMarket] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      connection.getParsedAccountInfo(accountAddress, 'confirmed'),
      connection.getParsedAccountInfo(mintAddress, 'confirmed'),
      walletState.selectedNetwork === 'mainnet-beta'
        ? fetchSolanaTokenMarket(input.mint).catch(() => null)
        : Promise.resolve(null)
    ]);

    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const tokenAccountData = tokenAccountInfo.value?.data;
    const mintAccountData = mintAccountInfo.value?.data;

    if (!tokenAccountData || typeof tokenAccountData !== 'object' || !('parsed' in tokenAccountData)) {
      throw new RpcError('TOKEN_NOT_FOUND', 'Token account could not be loaded.');
    }

    const parsedToken = tokenAccountData.parsed;
    if (!parsedToken || typeof parsedToken !== 'object' || !('info' in parsedToken) || !parsedToken.info || typeof parsedToken.info !== 'object') {
      throw new RpcError('TOKEN_NOT_FOUND', 'Token account could not be parsed.');
    }

    const tokenInfo = parsedToken.info as Record<string, unknown>;
    const tokenAmount = tokenInfo.tokenAmount as { uiAmountString?: string; amount: string; decimals: number };
    const delegatedAmount = tokenInfo.delegatedAmount as { uiAmountString?: string; amount?: string } | undefined;

    let supply: string | null = null;
    let rawSupply: string | null = null;
    let mintInitialized: boolean | null = null;
    let mintAuthority: string | null = null;
    let freezeAuthority: string | null = null;

    if (mintAccountData && typeof mintAccountData === 'object' && 'parsed' in mintAccountData) {
      const parsedMint = mintAccountData.parsed;
      if (parsedMint && typeof parsedMint === 'object' && 'info' in parsedMint && parsedMint.info && typeof parsedMint.info === 'object') {
        const mintInfo = parsedMint.info as Record<string, unknown>;
        rawSupply = typeof mintInfo.supply === 'string' ? mintInfo.supply : null;
        supply =
          typeof rawSupply === 'string' && typeof tokenAmount.decimals === 'number'
            ? formatUiAmount(rawSupply, tokenAmount.decimals)
            : null;
        mintInitialized = typeof mintInfo.isInitialized === 'boolean' ? mintInfo.isInitialized : null;
        mintAuthority = typeof mintInfo.mintAuthority === 'string' ? mintInfo.mintAuthority : null;
        freezeAuthority = typeof mintInfo.freezeAuthority === 'string' ? mintInfo.freezeAuthority : null;
      }
    }

    const metadataPda = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mintAddress.toBytes()],
      METADATA_PROGRAM_ID
    )[0].toBase58();
    const metadataAccountInfo = await connection.getAccountInfo(new PublicKey(metadataPda), 'confirmed');
    const parsedMetadata = metadataAccountInfo?.data ? parseMetaplexMetadataAccount(metadataAccountInfo.data) : null;

    return {
      mint: input.mint,
      programId: input.programId,
      accountAddress: input.accountAddress,
      name: shyftMetadata[input.mint]?.name ?? parsedMetadata?.name ?? undefined,
      symbol: shyftMetadata[input.mint]?.symbol ?? parsedMetadata?.symbol ?? KNOWN_TOKEN_SYMBOLS[input.mint],
      logoUri: shyftMetadata[input.mint]?.logoUri,
      amount: tokenAmount.uiAmountString ?? tokenAmount.amount,
      rawAmount: tokenAmount.amount,
      decimals: tokenAmount.decimals,
      supply,
      rawSupply,
      mintInitialized,
      mintAuthority,
      freezeAuthority,
      delegate: typeof tokenInfo.delegate === 'string' ? tokenInfo.delegate : null,
      delegatedAmount:
        delegatedAmount?.uiAmountString ?? (typeof delegatedAmount?.amount === 'string' ? delegatedAmount.amount : null),
      closeAuthority: typeof tokenInfo.closeAuthority === 'string' ? tokenInfo.closeAuthority : null,
      accountState: typeof tokenInfo.state === 'string' ? tokenInfo.state : null,
      metadataPda,
      metadataName: parsedMetadata?.name ?? null,
      metadataSymbol: parsedMetadata?.symbol ?? null,
      metadataUri: parsedMetadata?.uri ?? null,
      sellerFeeBasisPoints: parsedMetadata?.sellerFeeBasisPoints ?? null,
      updateAuthority: parsedMetadata?.updateAuthority ?? null,
      priceHistory: tokenMarket?.history ?? [],
      marketData: tokenMarket?.marketData ?? null
    };
  }

  async revokePermission(origin: string) {
    const permissions = await permissionsStorage.get();
    await permissionsStorage.set(revokeOriginPermissions(permissions, origin));
    return this.getStateResponse();
  }

  async revokeAllPermissions() {
    await permissionsStorage.set([]);
    return this.getStateResponse();
  }

  private getDeviceLinkPreferencesSnapshot(walletState: Awaited<ReturnType<WalletController['getWalletState']>>): DeviceLinkPreferencesSnapshot {
    return {
      trackedReputationSpaceIds: [...walletState.trackedReputationSpaceIds],
      trackedVerificationSpaceIds: [...walletState.trackedVerificationSpaceIds],
      trackedGovernanceDaoIds: [...walletState.trackedGovernanceDaoIds],
      selectedChain: walletState.selectedChain,
      selectedNetwork: walletState.selectedNetwork,
      selectedTheme: walletState.selectedTheme,
      customTheme: walletState.customTheme,
      themeBackgroundStyle: walletState.themeBackgroundStyle,
      themeMotionIntensity: walletState.themeMotionIntensity,
      autoConnectEnabled: walletState.autoConnectEnabled,
      dappApprovalMode: walletState.dappApprovalMode,
      privacyMode: walletState.privacyMode
    };
  }

  private applyDeviceLinkPreferences(
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>,
    preferences: DeviceLinkPreferencesSnapshot
  ) {
    return {
      ...walletState,
      trackedReputationSpaceIds: Array.from(new Set([...walletState.trackedReputationSpaceIds, ...preferences.trackedReputationSpaceIds])),
      trackedVerificationSpaceIds: Array.from(new Set([...walletState.trackedVerificationSpaceIds, ...preferences.trackedVerificationSpaceIds])),
      trackedGovernanceDaoIds: Array.from(new Set([...walletState.trackedGovernanceDaoIds, ...preferences.trackedGovernanceDaoIds])),
      selectedChain: preferences.selectedChain,
      selectedNetwork: preferences.selectedNetwork,
      selectedTheme: preferences.selectedTheme,
      customTheme: preferences.customTheme,
      themeBackgroundStyle: preferences.themeBackgroundStyle,
      themeMotionIntensity: preferences.themeMotionIntensity,
      autoConnectEnabled: preferences.autoConnectEnabled,
      dappApprovalMode: preferences.dappApprovalMode,
      privacyMode: preferences.privacyMode
    };
  }

  private normalizePairingCode(input: string) {
    return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
  }

  private createPairingCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const raw = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  }

  private resolveSolanaSignerForWallet(
    secret: VaultSecret,
    wallet: NonNullable<ReturnType<typeof getSelectedWallet>>,
    publicKey: string
  ) {
    const derivationPath = wallet.accounts.find((account) => account.publicKey === publicKey)?.derivationPath;
    return resolveSolanaVaultSecret(secret, derivationPath);
  }

  private resolvePublicKeyFromSecret(secret: VaultSecret, chain: GrapeChain, derivationPath?: string): string {
    if (secret.kind === 'mnemonic') {
      switch (chain) {
        case 'solana':
          return resolveSolanaVaultSecret(secret, derivationPath).publicKey.toBase58();
        case 'sui':
          return deriveSuiAccount0(secret.mnemonic).address;
        case 'monad':
          return deriveMonadAccount0(secret.mnemonic).address;
        case 'ethereum':
          return deriveEthereumAccount0(secret.mnemonic).address;
      }
    }

    if (secret.kind === 'private-key') {
      switch (chain) {
        case 'solana':
          return importSolanaPrivateKey(secret.secretKey).publicKey;
        case 'sui':
          return importSuiPrivateKey(secret.secretKey).address;
        case 'monad':
          return importMonadPrivateKey(secret.secretKey).address;
        case 'ethereum':
          return importEthereumPrivateKey(secret.secretKey).address;
      }
    }

    throw new RpcError('EXPORT_UNAVAILABLE', 'This wallet secret cannot be linked to another device.');
  }

  private async getLinkableWalletSecret(password?: string) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    if (selectedWallet.signer.kind !== 'software' || !selectedWallet.vault) {
      throw new RpcError('EXPORT_UNAVAILABLE', 'Only software wallets can be linked to another device.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, password);
    const resolvedPublicKey = this.resolvePublicKeyFromSecret(secret, selectedWallet.chain);
    if (resolvedPublicKey !== activeAccount.publicKey) {
      throw new RpcError('EXPORT_FAILED', 'The selected wallet secret does not match the active account.');
    }

    return {
      walletState,
      selectedWallet,
      activeAccount,
      secret
    };
  }

  async createDeviceLinkSession(password?: string) {
    const { walletState, selectedWallet, activeAccount, secret } = await this.getLinkableWalletSecret(password);
    const sessionId = crypto.randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + DEVICE_LINK_TTL_MS;
    const pairingCode = this.createPairingCode();
    const handoffPayload: DeviceLinkHandoffPayload = {
      version: 1,
      type: 'grape-device-link',
      sessionId,
      createdAt,
      expiresAt,
      wallet: {
        walletName: selectedWallet.name,
        chain: selectedWallet.chain,
        publicKey: activeAccount.publicKey,
        derivationPath: activeAccount.derivationPath,
        source: secret.kind === 'mnemonic'
          ? selectedWallet.source === 'created'
            ? 'created'
            : 'imported-mnemonic'
          : 'imported-private-key',
        secret
      },
      preferences: this.getDeviceLinkPreferencesSnapshot(walletState)
    };
    const handoff = await encryptText(JSON.stringify(handoffPayload), this.normalizePairingCode(pairingCode), undefined, DEVICE_LINK_KDF_ITERATIONS);
    const envelope = {
      version: 1 as const,
      type: 'grape-device-link-qr' as const,
      sessionId,
      createdAt,
      expiresAt,
      walletName: selectedWallet.name,
      chain: selectedWallet.chain,
      publicKey: activeAccount.publicKey,
      handoff
    };
    const record: DeviceLinkSessionRecord = {
      id: sessionId,
      walletId: selectedWallet.id,
      walletName: selectedWallet.name,
      chain: selectedWallet.chain,
      publicKey: activeAccount.publicKey,
      pairingCode,
      createdAt,
      expiresAt,
      qrPayload: createDeviceLinkPayloadText(envelope),
      envelope,
      status: 'ready'
    };

    const sessions = await deviceLinkStorage.get();
    const nextSessions = Object.fromEntries(
      Object.values(sessions)
        .filter((entry) => entry.expiresAt > createdAt && entry.status === 'ready')
        .map((entry) => [entry.id, entry])
    ) as Record<string, DeviceLinkSessionRecord>;
    nextSessions[record.id] = record;
    await deviceLinkStorage.set(nextSessions);
    return record;
  }

  async listDeviceLinkSessions() {
    const now = Date.now();
    const sessions = await deviceLinkStorage.get();
    let changed = false;
    const nextSessions: Record<string, DeviceLinkSessionRecord> = {};

    for (const entry of Object.values(sessions)) {
      const status = entry.expiresAt <= now ? 'expired' : entry.status;
      if (status !== entry.status) {
        changed = true;
      }
      if (status === 'revoked') {
        continue;
      }
      nextSessions[entry.id] = {
        ...entry,
        status
      };
    }

    if (changed) {
      await deviceLinkStorage.set(nextSessions);
    }

    return Object.values(nextSessions).sort((left, right) => right.createdAt - left.createdAt);
  }

  async deleteDeviceLinkSession(sessionId: string) {
    const sessions = await deviceLinkStorage.get();
    if (!sessions[sessionId]) {
      return this.listDeviceLinkSessions();
    }
    const nextSessions = {
      ...sessions
    };
    delete nextSessions[sessionId];
    await deviceLinkStorage.set(nextSessions);
    return this.listDeviceLinkSessions();
  }

  async importDeviceLink(input: { payload: string; pairingCode: string; password: string }) {
    const envelope = parseDeviceLinkPayloadText(input.payload);
    if (envelope.expiresAt <= Date.now()) {
      throw new RpcError('DEVICE_LINK_EXPIRED', 'This restore payload has expired. Create a new link from your existing device.');
    }

    const pairingCode = this.normalizePairingCode(input.pairingCode);
    const rawPayload = await decryptText(envelope.handoff, pairingCode).catch(() => {
      throw new RpcError('INVALID_PAIRING_CODE', 'Pairing code is incorrect, or the restore payload was scanned incorrectly. Try scanning again or paste the restore payload manually.');
    });
    const payload = JSON.parse(rawPayload) as DeviceLinkHandoffPayload;

    if (
      payload.version !== 1 ||
      payload.type !== 'grape-device-link' ||
      payload.sessionId !== envelope.sessionId ||
      payload.expiresAt <= Date.now()
    ) {
      throw new RpcError('DEVICE_LINK_INVALID', 'Restore payload is invalid or expired.');
    }

    if (payload.wallet.secret.kind === 'mnemonic') {
      await this.createMnemonicWalletSet(
        payload.wallet.secret.mnemonic,
        input.password,
        payload.wallet.source === 'created' ? 'created' : 'imported-mnemonic'
      );
    } else if (payload.wallet.secret.kind === 'private-key') {
      await this.createWallet(
        payload.wallet.secret,
        input.password,
        payload.wallet.publicKey,
        payload.wallet.chain,
        { kind: 'software' },
        'imported-private-key'
      );
    } else {
      throw new RpcError('DEVICE_LINK_INVALID', 'Restore payload contains an unsupported wallet secret.');
    }

    const currentState = await this.getWalletState();
    const nextState = this.applyDeviceLinkPreferences(currentState, payload.preferences);
    await walletStateStorage.set(nextState);
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return this.getStateResponse();
  }

  async exportWalletSecret(password: string) {
    const { selectedWallet, activeAccount, secret } = await this.getLinkableWalletSecret(password);
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('EXPORT_UNAVAILABLE', 'Secret export is currently available for Solana software wallets only.');
    }
    const exported = exportSolanaSoftwareWalletSecret(secret);

    if (exported.publicKey !== activeAccount.publicKey) {
      throw new RpcError('EXPORT_FAILED', 'Exported wallet does not match the selected account.');
    }

    return {
      walletId: selectedWallet.id,
      walletName: selectedWallet.name,
      chain: selectedWallet.chain,
      publicKey: exported.publicKey,
      derivationPath: exported.derivationPath,
      kind: exported.kind,
      privateKeyBase58: exported.privateKeyBase58,
      privateKeyBytes: exported.privateKeyBytes,
      mnemonic: exported.mnemonic
    };
  }

  async stakeCreate(input: { amount: string; voteAccount: string; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const votePubkey = new PublicKey(input.voteAccount.trim());
    const stakeLamportsBigint = parseDecimalAmount(input.amount, 9);
    const rentExempt = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
    const totalLamportsBigint = stakeLamportsBigint + BigInt(rentExempt);
    if (totalLamportsBigint > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RpcError('INVALID_AMOUNT', 'Stake amount is too large.');
    }

    const totalLamports = Number(totalLamportsBigint);
    const stakeKeypair = Keypair.generate();
    const transaction = StakeProgram.createAccount({
      fromPubkey: owner,
      stakePubkey: stakeKeypair.publicKey,
      authorized: new Authorized(owner, owner),
      lockup: Lockup.default,
      lamports: totalLamports
    });
    transaction.add(
      ...StakeProgram.delegate({
        stakePubkey: stakeKeypair.publicKey,
        authorizedPubkey: owner,
        votePubkey
      }).instructions
    );
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = owner;
    transaction.partialSign(stakeKeypair);

    let signature: string;
    try {
      if (selectedWallet.signer.kind === 'ledger') {
        throwLedgerUnsupported();
      } else {
        transaction.partialSign(this.resolveSolanaSignerForWallet(secret, selectedWallet, activeAccount.publicKey));
        signature = await connection.sendRawTransaction(transaction.serialize());
      }
    } catch (error) {
      throw normalizeSigningError(error);
    }

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return {
      signature,
      action: 'stake' as const,
      stakeAccount: stakeKeypair.publicKey.toBase58(),
      amountSol: input.amount,
      voteAccount: votePubkey.toBase58(),
      network: walletState.selectedNetwork
    };
  }

  async stakeDeactivate(input: { stakeAccount: string; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const signature = await this.submitInstructionBatches(
      selectedWallet,
      activeAccount.publicKey,
      secret,
      connection,
      owner,
      StakeProgram.deactivate({
        stakePubkey: new PublicKey(input.stakeAccount),
        authorizedPubkey: owner
      }).instructions,
      1
    );

    return {
      signature: signature[0],
      action: 'deactivate' as const,
      stakeAccount: input.stakeAccount,
      network: walletState.selectedNetwork
    };
  }

  async stakeWithdraw(input: { stakeAccount: string; amount: string; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const lamportsBigint = parseDecimalAmount(input.amount, 9);
    if (lamportsBigint > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RpcError('INVALID_AMOUNT', 'Withdraw amount is too large.');
    }

    const signature = await this.submitInstructionBatches(
      selectedWallet,
      activeAccount.publicKey,
      secret,
      connection,
      owner,
      StakeProgram.withdraw({
        stakePubkey: new PublicKey(input.stakeAccount),
        authorizedPubkey: owner,
        toPubkey: owner,
        lamports: Number(lamportsBigint)
      }).instructions,
      1
    );

    return {
      signature: signature[0],
      action: 'withdraw' as const,
      stakeAccount: input.stakeAccount,
      amountSol: input.amount,
      network: walletState.selectedNetwork
    };
  }

  async resolveRecipient(input: { recipient: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const resolvedRecipient = await this.resolveRecipientForChain(selectedWallet.chain, input.recipient, walletState);

    return {
      ...resolvedRecipient,
      chain: selectedWallet.chain
    };
  }

  async sendTransfer(input: { recipient: string; amount: string; password?: string; asset: SendAsset }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    const resolvedRecipient = await this.resolveRecipientForChain(selectedWallet.chain, input.recipient, walletState);
    let signature: string;

    if (selectedWallet.chain === 'sui') {
      try {
        if (selectedWallet.signer.kind === 'ledger') {
          if (input.asset.kind === 'sui') {
            signature = await sendSuiWithLedger(this.resolveSuiNetwork(walletState.selectedNetwork), selectedWallet.signer.derivationPath, {
              recipient: resolvedRecipient.recipient,
              amountMist: parseDecimalAmount(input.amount, 9),
              customRpcUrl: walletState.chainState.sui.customRpcUrl
            });
          } else if (input.asset.kind === 'sui-coin') {
            signature = await sendSuiCoinWithLedger(this.resolveSuiNetwork(walletState.selectedNetwork), selectedWallet.signer.derivationPath, {
              recipient: resolvedRecipient.recipient,
              amountBaseUnits: parseDecimalAmount(input.amount, input.asset.decimals),
              coinType: input.asset.coinType,
              customRpcUrl: walletState.chainState.sui.customRpcUrl
            });
          } else {
            throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send this asset.');
          }
        } else {
          const client = await this.createSuiClient(walletState.selectedNetwork, walletState);
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          const signer = resolveSuiVaultSecret(secret);
          if (input.asset.kind === 'sui') {
            signature = await sendSui(client, signer, {
              recipient: resolvedRecipient.recipient,
              amountMist: parseDecimalAmount(input.amount, 9)
            });
          } else if (input.asset.kind === 'sui-coin') {
            signature = await sendSuiCoin(client, signer, {
              recipient: resolvedRecipient.recipient,
              amountBaseUnits: parseDecimalAmount(input.amount, input.asset.decimals),
              coinType: input.asset.coinType
            });
          } else {
            throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send this asset.');
          }
        }
      } catch (error) {
        throw normalizeSigningError(error);
      }
    } else if (selectedWallet.chain === 'monad') {
      try {
        if (selectedWallet.signer.kind === 'ledger') {
          if (input.asset.kind === 'mon') {
            signature = await sendMonadWithLedger(this.resolveMonadNetwork(walletState.selectedNetwork), selectedWallet.signer.derivationPath, {
              recipient: resolvedRecipient.recipient,
              amountEther: input.amount,
              customRpcUrl: walletState.chainState.monad.customRpcUrl
            });
          } else if (input.asset.kind === 'evm-token') {
            signature = await sendMonadTokenWithLedger(
              this.resolveMonadNetwork(walletState.selectedNetwork),
              selectedWallet.signer.derivationPath,
              {
                recipient: resolvedRecipient.recipient,
                amount: input.amount,
                tokenAddress: input.asset.tokenAddress,
                decimals: input.asset.decimals,
                customRpcUrl: walletState.chainState.monad.customRpcUrl
              }
            );
          } else {
            throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send this asset.');
          }
        } else if (input.asset.kind === 'mon') {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          signature = await sendMonad(this.resolveMonadNetwork(walletState.selectedNetwork), secret, {
            recipient: resolvedRecipient.recipient,
            amountEther: input.amount,
            customRpcUrl: walletState.chainState.monad.customRpcUrl
          });
        } else if (input.asset.kind === 'evm-token') {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          signature = await sendMonadToken(this.resolveMonadNetwork(walletState.selectedNetwork), secret, {
            recipient: resolvedRecipient.recipient,
            amount: input.amount,
            tokenAddress: input.asset.tokenAddress,
            decimals: input.asset.decimals,
            customRpcUrl: walletState.chainState.monad.customRpcUrl
          });
        } else {
          throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send this asset.');
        }
      } catch (error) {
        throw normalizeSigningError(error);
      }
    } else if (selectedWallet.chain === 'ethereum') {
      try {
        if (selectedWallet.signer.kind === 'ledger') {
          if (input.asset.kind === 'eth') {
            signature = await sendEthereumWithLedger(this.resolveEthereumNetwork(walletState.selectedNetwork), selectedWallet.signer.derivationPath, {
              recipient: resolvedRecipient.recipient,
              amountEther: input.amount,
              customRpcUrl: walletState.chainState.ethereum.customRpcUrl
            });
          } else if (input.asset.kind === 'evm-token') {
            signature = await sendEthereumTokenWithLedger(
              this.resolveEthereumNetwork(walletState.selectedNetwork),
              selectedWallet.signer.derivationPath,
              {
                recipient: resolvedRecipient.recipient,
                amount: input.amount,
                tokenAddress: input.asset.tokenAddress,
                decimals: input.asset.decimals,
                customRpcUrl: walletState.chainState.ethereum.customRpcUrl
              }
            );
          } else {
            throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send this asset.');
          }
        } else if (input.asset.kind === 'eth') {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          signature = await sendEthereum(this.resolveEthereumNetwork(walletState.selectedNetwork), secret, {
            recipient: resolvedRecipient.recipient,
            amountEther: input.amount,
            customRpcUrl: walletState.chainState.ethereum.customRpcUrl
          });
        } else if (input.asset.kind === 'evm-token') {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          signature = await sendEthereumToken(this.resolveEthereumNetwork(walletState.selectedNetwork), secret, {
            recipient: resolvedRecipient.recipient,
            amount: input.amount,
            tokenAddress: input.asset.tokenAddress,
            decimals: input.asset.decimals,
            customRpcUrl: walletState.chainState.ethereum.customRpcUrl
          });
        } else {
          throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send this asset.');
        }
      } catch (error) {
        throw normalizeSigningError(error);
      }
    } else {
      if (
        input.asset.kind === 'sui' ||
        input.asset.kind === 'mon' ||
        input.asset.kind === 'eth' ||
        input.asset.kind === 'sui-coin' ||
        input.asset.kind === 'evm-token'
      ) {
        throw new RpcError('UNSUPPORTED_ASSET', 'Use the matching chain wallet to send native assets.');
      }

      const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
      const connection = this.createConnection(walletState.selectedNetwork, walletState);
      const owner = new PublicKey(activeAccount.publicKey);
      const transaction =
        input.asset.kind === 'sol'
          ? await buildSolTransferTransaction(connection, owner, {
              recipient: resolvedRecipient.recipient,
              amount: input.amount
            })
          : await buildSplTokenTransferTransaction(connection, owner, {
              recipient: resolvedRecipient.recipient,
              amount: input.amount,
              mint: input.asset.mint,
              decimals: input.asset.decimals,
              programId: input.asset.programId
            });

      const [balanceLamports, feeLamports] = await Promise.all([
        connection.getBalance(owner, 'confirmed'),
        estimateLegacyTransactionFee(connection, transaction)
      ]);
      if (input.asset.kind === 'sol') {
        const transferLamports = parseDecimalAmount(input.amount, 9);
        const requiredLamports = transferLamports + BigInt(feeLamports);
        if (BigInt(balanceLamports) < requiredLamports) {
          throw new RpcError(
            'INSUFFICIENT_FUNDS',
            `Not enough SOL. You need ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL including network fee, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
          );
        }
      } else {
        const createsRecipientTokenAccount = transaction.instructions.some((instruction) =>
          instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)
        );
        const ataRentLamports = createsRecipientTokenAccount
          ? await connection.getMinimumBalanceForRentExemption(165)
          : 0;
        const requiredLamports = BigInt(feeLamports + ataRentLamports);
        if (BigInt(balanceLamports) < requiredLamports) {
          throw new RpcError(
            'INSUFFICIENT_FUNDS',
            createsRecipientTokenAccount
              ? `Not enough SOL. You need ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL for network fees and recipient token account creation, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
              : `Not enough SOL. You need at least ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL for network fees, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
          );
        }
      }

      try {
        signature =
          selectedWallet.signer.kind === 'ledger'
            ? throwLedgerUnsupported()
            : await signAndSendTransaction(
                transaction,
                this.resolveSolanaSignerForWallet(secret, selectedWallet, activeAccount.publicKey),
                connection
              );
      } catch (error) {
        throw normalizeSigningError(error);
      }
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? rememberWalletRecipient(wallet, resolvedRecipient.recipient) : wallet
      )
    });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });

    return {
      signature,
      recipient: resolvedRecipient.recipient,
      requestedRecipient: resolvedRecipient.requestedRecipient,
      recipientKind: resolvedRecipient.recipientKind,
      recipientDomain: resolvedRecipient.recipientDomain,
      amount: input.amount,
      asset: input.asset,
      network: walletState.selectedNetwork
    };
  }

  async burnToken(input: {
    mint: string;
    accountAddress: string;
    amount: string;
    decimals: number;
    programId: string;
    password?: string;
  }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const transaction = await buildBurnSplTokenTransaction(connection, owner, input);
    const signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      mint: input.mint,
      accountAddress: input.accountAddress,
      action: 'burn' as const,
      amount: input.amount,
      network: walletState.selectedNetwork
    };
  }

  async closeTokenAccount(input: { mint: string; accountAddress: string; programId: string; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const tokenAccounts = await this.scanWalletTokenAccounts(connection, owner, {});
    const tokenAccount = tokenAccounts.find(
      (account) =>
        account.mint === input.mint &&
        account.programId === input.programId &&
        account.accountAddress === input.accountAddress
    );
    if (!tokenAccount) {
      throw new RpcError('TOKEN_ACCOUNT_MISSING', 'The selected token account could not be found.');
    }
    if (BigInt(tokenAccount.rawAmount) > 0n) {
      throw new RpcError('TOKEN_ACCOUNT_NOT_EMPTY', 'Burn or transfer the remaining token balance before closing this account.');
    }
    if (tokenAccount.delegate) {
      throw new RpcError('DELEGATE_PRESENT', 'Revoke the token delegate before closing this account.');
    }

    const transaction = await buildCloseTokenAccountTransaction(connection, owner, input);
    const signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      mint: input.mint,
      accountAddress: input.accountAddress,
      action: 'close' as const,
      network: walletState.selectedNetwork
    };
  }

  async getReclaimableTokenAccounts() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Rent reclaim is available for Solana wallets only.');
    }
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const tokenAccounts = (await this.scanWalletTokenAccounts(connection, owner, {})).filter(
      (account) =>
        BigInt(account.rawAmount) === 0n &&
        !account.delegate &&
        (!account.closeAuthority || account.closeAuthority === owner.toBase58())
    );
    if (tokenAccounts.length === 0) {
      return { accounts: [], totalLamports: 0, network: walletState.selectedNetwork };
    }
    const accountInfos = await connection.getMultipleAccountsInfo(
      tokenAccounts.map((account) => new PublicKey(account.accountAddress)),
      'confirmed'
    );
    const accounts = tokenAccounts.flatMap((account, index) => {
      const info = accountInfos[index];
      if (!info || info.lamports <= 0) return [];
      return [{
        mint: account.mint,
        accountAddress: account.accountAddress,
        programId: account.programId,
        lamports: info.lamports,
        name: account.name,
        symbol: account.symbol,
        logoUri: account.logoUri
      }];
    });
    return {
      accounts,
      totalLamports: accounts.reduce((total, account) => total + account.lamports, 0),
      network: walletState.selectedNetwork
    };
  }

  async reclaimTokenAccounts(input: {
    accounts: Array<{ mint: string; accountAddress: string; programId: string }>;
    password?: string;
  }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Rent reclaim is available for Solana wallets only.');
    }
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const fresh = await this.getReclaimableTokenAccounts();
    const freshByAddress = new Map(fresh.accounts.map((account) => [account.accountAddress, account]));
    const selected = input.accounts.map((account) => {
      const verified = freshByAddress.get(account.accountAddress);
      if (!verified || verified.mint !== account.mint || verified.programId !== account.programId) {
        throw new RpcError('TOKEN_ACCOUNT_NOT_RECLAIMABLE', `Token account ${account.accountAddress} is no longer eligible to close.`);
      }
      return verified;
    });
    const transactions = await Promise.all(
      selected.map((account) => buildCloseTokenAccountTransaction(connection, owner, account))
    );
    const secret = selectedWallet.signer.kind === 'ledger'
      ? null
      : await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const signatures = await this.submitInstructionBatches(
      selectedWallet,
      activeAccount.publicKey,
      secret,
      connection,
      owner,
      transactions.flatMap((transaction) => transaction.instructions),
      6
    );
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));
    return {
      signatures,
      reclaimedLamports: selected.reduce((total, account) => total + account.lamports, 0),
      closedAccounts: selected.length,
      network: walletState.selectedNetwork
    };
  }

  async getSecurityReport() {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Security scanning is currently available for Solana only.');
    }
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const [shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      hasShyftApiKey()
        ? fetchShyftCollections(walletState.selectedNetwork, activeAccount.publicKey).catch(() => [])
        : Promise.resolve([])
    ]);
    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const collections = shyftCollectionsResult as CollectionHolding[];
    const tokens = await this.scanWalletTokenAccounts(connection, owner, shyftMetadata);
    const controlledMints = await this.scanControlledMints(connection, activeAccount.publicKey, tokens, collections);
    const delegatedTokenAccounts = tokens
      .filter((token) => !!token.delegate)
      .map((token) => ({
        accountAddress: token.accountAddress,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        delegate: token.delegate ?? '',
        delegatedAmount: token.delegatedAmount ?? null,
        closeAuthority: token.closeAuthority ?? null
      }));
    const externalCloseAuthorities = tokens
      .filter((token) => !!token.closeAuthority && token.closeAuthority !== activeAccount.publicKey)
      .map((token) => ({
        accountAddress: token.accountAddress,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        closeAuthority: token.closeAuthority ?? ''
      }));
    const warnings: string[] = [];

    if (delegatedTokenAccounts.length > 0) {
      warnings.push(`${delegatedTokenAccounts.length} token account${delegatedTokenAccounts.length === 1 ? '' : 's'} have an active delegate.`);
    }
    if (externalCloseAuthorities.length > 0) {
      warnings.push(`${externalCloseAuthorities.length} token account${externalCloseAuthorities.length === 1 ? '' : 's'} have an external close authority.`);
    }
    if (controlledMints.length > 0) {
      warnings.push(`${controlledMints.length} discovered mint${controlledMints.length === 1 ? '' : 's'} still trust this wallet with mint and/or freeze authority.`);
    }

    return {
      delegatedTokenAccounts,
      externalCloseAuthorities,
      controlledMints,
      warnings,
      scannedAt: Date.now()
    };
  }

  async runIncidentResponse(input: {
    safeWallet: string;
    reserveSol: string;
    password?: string;
    revokeDelegates: boolean;
    sweepSplTokens: boolean;
    sweepSol: boolean;
    rotateCloseAuthorities: boolean;
    rotateMintAuthorities: boolean;
  }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Incident response is currently available for Solana only.');
    }
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const owner = new PublicKey(activeAccount.publicKey);
    const safeWallet = new PublicKey(input.safeWallet);
    const [shyftMetadataResult, shyftCollectionsResult] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      hasShyftApiKey()
        ? fetchShyftCollections(walletState.selectedNetwork, activeAccount.publicKey).catch(() => [])
        : Promise.resolve([])
    ]);
    const shyftMetadata = shyftMetadataResult as Record<string, { name?: string; symbol?: string; logoUri?: string }>;
    const collections = shyftCollectionsResult as CollectionHolding[];
    const tokenAccounts = await this.scanWalletTokenAccounts(connection, owner, shyftMetadata);
    const fungibleTokens = (filterCollectibleTokens(tokenAccounts, collections) as ParsedWalletTokenAccount[]).filter(
      (token) => BigInt(token.rawAmount) > 0n
    );
    const controlledMints = await this.scanControlledMints(connection, activeAccount.publicKey, tokenAccounts, collections);
    const warnings: string[] = [];
    const actions: Array<{
      kind: 'revoke-delegates' | 'sweep-spl' | 'sweep-sol' | 'rotate-close-authorities' | 'rotate-mint-authorities';
      signatures: string[];
      itemCount: number;
    }> = [];

    if (input.revokeDelegates) {
      const revokeInstructions = tokenAccounts
        .filter((token) => !!token.delegate)
        .map((token) =>
          createRevokeInstruction(
            new PublicKey(token.accountAddress),
            owner,
            new PublicKey(token.programId)
          )
        );
      if (revokeInstructions.length > 0) {
        actions.push({
          kind: 'revoke-delegates',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            revokeInstructions
          ),
          itemCount: revokeInstructions.length
        });
      }
    }

    if (input.sweepSplTokens) {
      const destinationLookups = await Promise.all(
        fungibleTokens.map(async (token) => {
          const mint = new PublicKey(token.mint);
          const tokenProgramId = new PublicKey(token.programId);
          const destinationAta = getAssociatedTokenAddress(safeWallet, mint, tokenProgramId);
          const destinationInfo = await connection.getAccountInfo(destinationAta, 'confirmed');
          return {
            token,
            mint,
            tokenProgramId,
            destinationAta,
            destinationExists: !!destinationInfo
          };
        })
      );
      const sweepInstructions: TransactionInstruction[] = [];
      for (const entry of destinationLookups) {
        if (!entry.destinationExists) {
          sweepInstructions.push(
            createAssociatedTokenAccountInstruction(owner, entry.destinationAta, safeWallet, entry.mint, entry.tokenProgramId)
          );
        }
        sweepInstructions.push(
          createTransferCheckedInstruction(
            new PublicKey(entry.token.accountAddress),
            entry.mint,
            entry.destinationAta,
            owner,
            BigInt(entry.token.rawAmount),
            entry.token.decimals,
            entry.tokenProgramId
          )
        );
      }
      if (sweepInstructions.length > 0) {
        actions.push({
          kind: 'sweep-spl',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            sweepInstructions
          ),
          itemCount: fungibleTokens.length
        });
      }
    }

    if (input.rotateCloseAuthorities) {
      const closeAuthorityInstructions = tokenAccounts
        .filter((token) => !token.closeAuthority || token.closeAuthority === activeAccount.publicKey)
        .map((token) =>
          createSetAuthorityInstruction(
            new PublicKey(token.accountAddress),
            owner,
            new PublicKey(token.programId),
            TOKEN_AUTHORITY_TYPES.closeAccount,
            safeWallet
          )
        );
      if (closeAuthorityInstructions.length > 0) {
        actions.push({
          kind: 'rotate-close-authorities',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            closeAuthorityInstructions
          ),
          itemCount: closeAuthorityInstructions.length
        });
      }
      const skippedExternalCloseAuthorities = tokenAccounts.filter(
        (token) => !!token.closeAuthority && token.closeAuthority !== activeAccount.publicKey
      );
      if (skippedExternalCloseAuthorities.length > 0) {
        warnings.push(`Skipped ${skippedExternalCloseAuthorities.length} token account close authorit${skippedExternalCloseAuthorities.length === 1 ? 'y' : 'ies'} because another authority controls them.`);
      }
    }

    if (input.rotateMintAuthorities) {
      const mintAuthorityInstructions = controlledMints.flatMap((mint) => {
        const instructions: TransactionInstruction[] = [];
        const tokenProgramId = new PublicKey(mint.programId);
        const mintAddress = new PublicKey(mint.mint);

        if (mint.controlsMintAuthority) {
          instructions.push(
            createSetAuthorityInstruction(mintAddress, owner, tokenProgramId, TOKEN_AUTHORITY_TYPES.mintTokens, safeWallet)
          );
        }
        if (mint.controlsFreezeAuthority) {
          instructions.push(
            createSetAuthorityInstruction(mintAddress, owner, tokenProgramId, TOKEN_AUTHORITY_TYPES.freezeAccount, safeWallet)
          );
        }

        return instructions;
      });
      if (mintAuthorityInstructions.length > 0) {
        actions.push({
          kind: 'rotate-mint-authorities',
          signatures: await this.submitInstructionBatches(
            selectedWallet,
            activeAccount.publicKey,
            secret,
            connection,
            owner,
            mintAuthorityInstructions
          ),
          itemCount: controlledMints.length
        });
      }
    }

    if (input.sweepSol) {
      const reserveLamports = parseDecimalAmount(input.reserveSol, 9);
      const balanceLamports = await connection.getBalance(owner, 'confirmed');
      const transferLamports = BigInt(balanceLamports) - reserveLamports;
      if (transferLamports > 0n) {
        let transaction = await buildSolTransferTransaction(connection, owner, {
          recipient: safeWallet.toBase58(),
          amount: (Number(transferLamports) / 1_000_000_000).toFixed(9).replace(/\.?0+$/, '')
        });
        const feeLamports = await estimateLegacyTransactionFee(connection, transaction);
        const adjustedLamports = BigInt(balanceLamports) - reserveLamports - BigInt(feeLamports);
        if (adjustedLamports > 0n) {
          transaction = await buildSolTransferTransaction(connection, owner, {
            recipient: safeWallet.toBase58(),
            amount: (Number(adjustedLamports) / 1_000_000_000).toFixed(9).replace(/\.?0+$/, '')
          });
          actions.push({
            kind: 'sweep-sol',
            signatures: [
              await this.submitTransactionForWallet(
                selectedWallet,
                activeAccount.publicKey,
                secret,
                connection,
                transaction
              )
            ],
            itemCount: 1
          });
        } else {
          warnings.push('Skipped SOL sweep because the requested reserve leaves no balance after fees.');
        }
      } else {
        warnings.push('Skipped SOL sweep because the requested reserve is greater than the current SOL balance.');
      }
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? rememberWalletRecipient(wallet, safeWallet.toBase58()) : wallet
      )
    });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      safeWallet: safeWallet.toBase58(),
      reserveSol: input.reserveSol,
      actions,
      warnings
    };
  }

  async getSwapQuote(input: { amount: string; slippageBps: number; inputAsset: SendAsset; outputMint: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('SWAP_UNAVAILABLE', 'Native swaps are currently available only on mainnet-beta.');
    }

    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    if (selectedWallet.chain === 'ethereum' || selectedWallet.chain === 'monad') {
      const fromToken = input.inputAsset.kind === 'evm-token' ? input.inputAsset.tokenAddress : LIFI_NATIVE_TOKEN_ADDRESS[selectedWallet.chain];
      const decimals = input.inputAsset.kind === 'evm-token' ? input.inputAsset.decimals : 18;
      const amountRaw = parseDecimalAmount(input.amount, decimals).toString();
      const quote = await fetchLifiSwapQuote({ chain: selectedWallet.chain, fromToken, toToken: input.outputMint, amountRaw, walletAddress: activeAccount.publicKey, slippageBps: input.slippageBps });
      const estimate = quote.estimate as { toAmount?: string; fromToken?: { symbol?: string }; toToken?: { symbol?: string; decimals?: number }; tool?: string } | undefined;
      const outputDecimals = estimate?.toToken?.decimals ?? 18;
      return { inputMint: fromToken, outputMint: input.outputMint, inputAmountUi: input.amount, slippageBps: input.slippageBps, selectedRouteId: 'best', routes: [{ id: 'best', label: 'Best route', quoteResponse: { ...quote, _grapeSwapChain: selectedWallet.chain }, outputAmountUi: formatUiAmount(estimate?.toAmount ?? '0', outputDecimals), priceImpactPct: null, routeLabels: [String((quote.toolDetails as { name?: string } | undefined)?.name ?? 'LI.FI')] }] };
    }
    if (selectedWallet.chain === 'sui') {
      const fromCoinType = input.inputAsset.kind === 'sui-coin' ? input.inputAsset.coinType : '0x2::sui::SUI';
      const decimals = input.inputAsset.kind === 'sui-coin' ? input.inputAsset.decimals : 9;
      const client = createSuiClient(this.resolveSuiNetwork(walletState.selectedNetwork), walletState.chainState.sui.customRpcUrl);
      const quote = await getSuiSwapQuote(client, { fromCoinType, toCoinType: input.outputMint, amountIn: parseDecimalAmount(input.amount, decimals) });
      const metadata = await client.getCoinMetadata({ coinType: input.outputMint }).catch(() => null);
      return { inputMint: fromCoinType, outputMint: input.outputMint, inputAmountUi: input.amount, slippageBps: input.slippageBps, selectedRouteId: 'best', routes: [{ id: 'best', label: 'Best route', quoteResponse: { _grapeSwapChain: 'sui', fromCoinType, toCoinType: input.outputMint, amountIn: quote.amountIn, slippageBps: input.slippageBps }, outputAmountUi: formatUiAmount(quote.amountOut, metadata?.coinMetadata?.decimals ?? 0), priceImpactPct: null, routeLabels: quote.providers }] };
    }

    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const inputMint = input.inputAsset.kind === 'spl-token' ? input.inputAsset.mint : JUPITER_SOL_MINT;
    if (inputMint === input.outputMint) {
      throw new RpcError('INVALID_SWAP', 'Choose a different output token.');
    }

    const inputDecimals = input.inputAsset.kind === 'spl-token' ? input.inputAsset.decimals : 9;
    const amountBaseUnits = parseDecimalAmount(input.amount, inputDecimals).toString();
    const quoteResponse = await fetchJupiterQuote({
      inputMint,
      outputMint: input.outputMint,
      amount: amountBaseUnits,
      slippageBps: input.slippageBps
    });
    const directQuoteResponse =
      quoteResponse.routePlan && quoteResponse.routePlan.length === 1
        ? null
        : await fetchJupiterQuote({
            inputMint,
            outputMint: input.outputMint,
            amount: amountBaseUnits,
            slippageBps: input.slippageBps,
            onlyDirectRoutes: true
          }).catch(() => null);
    const outputDecimals = await getMintDecimals(connection, input.outputMint);

    const routes = [quoteResponse, directQuoteResponse]
      .filter((entry): entry is JupiterQuoteResponse => !!entry)
      .map((entry, index) => {
        const routeLabels = extractSwapRouteLabels(entry);
        const isDirectCandidate = index === 1;
        return {
          id: isDirectCandidate ? 'direct' : 'best',
          label: isDirectCandidate ? 'Direct route' : 'Best route',
          quoteResponse: entry,
          outputAmountUi: formatUiAmount(entry.outAmount, outputDecimals),
          priceImpactPct: typeof entry.priceImpactPct === 'string' ? entry.priceImpactPct : null,
          routeLabels
        };
      })
      .filter((route, index, allRoutes) => {
        return (
          allRoutes.findIndex((candidate) => {
            return (
              candidate.outputAmountUi === route.outputAmountUi &&
              candidate.routeLabels.join('|') === route.routeLabels.join('|')
            );
          }) === index
        );
      });

    return {
      inputMint,
      outputMint: input.outputMint,
      inputAmountUi: input.amount,
      slippageBps: input.slippageBps,
      selectedRouteId: routes[0]?.id ?? 'best',
      routes
    };
  }

  async executeSwap(input: { quoteResponse: JupiterQuoteResponse | Record<string, unknown>; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('SWAP_UNAVAILABLE', 'Native swaps are currently available only on mainnet-beta.');
    }

    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const genericQuote = input.quoteResponse as Record<string, unknown>;
    if (selectedWallet.chain === 'ethereum' || selectedWallet.chain === 'monad') {
      if (selectedWallet.signer.kind === 'ledger') {
        throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger swaps are not yet available for EVM wallets.');
      }
      const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
      const transactionRequest = extractExecutableBridgeTransactionRequest(genericQuote, selectedWallet.chain);
      if (!transactionRequest?.to) throw new RpcError('SWAP_UNSUPPORTED', 'This route did not include an executable transaction.');
      const signature = selectedWallet.chain === 'ethereum'
        ? await sendEthereumTransactionRequest(this.resolveEthereumNetwork(walletState.selectedNetwork), secret, { to: transactionRequest.to, data: transactionRequest.data, value: transactionRequest.value, customRpcUrl: walletState.chainState.ethereum.customRpcUrl })
        : await sendMonadTransactionRequest(this.resolveMonadNetwork(walletState.selectedNetwork), secret, { to: transactionRequest.to, data: transactionRequest.data, value: transactionRequest.value, customRpcUrl: walletState.chainState.monad.customRpcUrl });
      const estimate = genericQuote.estimate as { fromAmount?: string; toAmount?: string; fromToken?: { address?: string; decimals?: number }; toToken?: { address?: string; decimals?: number } } | undefined;
      return { signature, inputMint: estimate?.fromToken?.address ?? '', outputMint: estimate?.toToken?.address ?? '', inputAmountUi: formatUiAmount(estimate?.fromAmount ?? '0', estimate?.fromToken?.decimals ?? 18), outputAmountUi: formatUiAmount(estimate?.toAmount ?? '0', estimate?.toToken?.decimals ?? 18) };
    }
    if (selectedWallet.chain === 'sui') {
      if (selectedWallet.signer.kind === 'ledger') {
        throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger swaps are not yet available for Sui wallets.');
      }
      const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
      const client = createSuiClient(this.resolveSuiNetwork(walletState.selectedNetwork), walletState.chainState.sui.customRpcUrl);
      const freshQuote = await getSuiSwapQuote(client, { fromCoinType: String(genericQuote.fromCoinType), toCoinType: String(genericQuote.toCoinType), amountIn: BigInt(String(genericQuote.amountIn)) });
      const signature = await executeSuiSwap(client, resolveSuiVaultSecret(secret), { quote: freshQuote, slippageBps: Number(genericQuote.slippageBps ?? 50) });
      const outputMetadata = await client.getCoinMetadata({ coinType: freshQuote.toCoinType }).catch(() => null);
      const inputMetadata = await client.getCoinMetadata({ coinType: freshQuote.fromCoinType }).catch(() => null);
      return { signature, inputMint: freshQuote.fromCoinType, outputMint: freshQuote.toCoinType, inputAmountUi: formatUiAmount(freshQuote.amountIn, inputMetadata?.coinMetadata?.decimals ?? 0), outputAmountUi: formatUiAmount(freshQuote.amountOut, outputMetadata?.coinMetadata?.decimals ?? 0) };
    }
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const swap = await createJupiterSwapTransaction({
      quoteResponse: input.quoteResponse as JupiterQuoteResponse,
      userPublicKey: activeAccount.publicKey
    });

    let signature: string;
    try {
      const rpcEndpoint = this.resolveRpcEndpoint(walletState.selectedNetwork, walletState);
      if (selectedWallet.signer.kind === 'ledger') {
        signature = await signAndSendLedgerSerializedTransaction(
          swap.swapTransaction,
          activeAccount.publicKey,
          selectedWallet.signer.derivationPath,
          rpcEndpoint
        );
      } else {
        const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
        signature = await signAndSendSerializedTransaction(
          swap.swapTransaction,
          this.resolveSolanaSignerForWallet(secret, selectedWallet, activeAccount.publicKey),
          rpcEndpoint
        );
      }
    } catch (error) {
      throw normalizeSigningError(error);
    }

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      inputMint: (input.quoteResponse as JupiterQuoteResponse).inputMint,
      outputMint: (input.quoteResponse as JupiterQuoteResponse).outputMint,
      inputAmountUi: formatUiAmount((input.quoteResponse as JupiterQuoteResponse).inAmount, await getMintDecimals(connection, (input.quoteResponse as JupiterQuoteResponse).inputMint)),
      outputAmountUi: formatUiAmount((input.quoteResponse as JupiterQuoteResponse).outAmount, await getMintDecimals(connection, (input.quoteResponse as JupiterQuoteResponse).outputMint))
    };
  }

  async getBridgeQuote(input: {
    amount: string;
    toChain: GrapeChain;
    destinationWalletId?: string;
  }): Promise<WalletBridgeQuoteResponse> {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('BRIDGE_UNAVAILABLE', 'Bridge is currently available only on mainnet-beta.');
    }
    if (selectedWallet.chain === 'sui') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Bridge source is coming soon for Sui wallets.');
    }
    if (input.toChain === selectedWallet.chain) {
      throw new RpcError('INVALID_BRIDGE', 'Choose a different destination chain.');
    }
    if (!isBridgeRouteSupported(selectedWallet.chain, input.toChain)) {
      const supportedDestinations = getSupportedBridgeDestinations(selectedWallet.chain);
      const supportedList = supportedDestinations.length > 0 ? supportedDestinations.join(', ') : 'none';
      throw new RpcError(
        'UNSUPPORTED_BRIDGE_ROUTE',
        `Bridging from ${selectedWallet.chain} to ${input.toChain} is not supported yet. Supported destinations: ${supportedList}.`
      );
    }

    const destination = this.resolveBridgeDestination(walletState, input.toChain, input.destinationWalletId);
    const amountRaw = parseDecimalAmount(input.amount, LIFI_NATIVE_DECIMALS[selectedWallet.chain]).toString();

    try {
      return await fetchNativeBridgeQuote({
        fromChain: selectedWallet.chain,
        toChain: destination.wallet.chain,
        amountRaw,
        fromAddress: activeAccount.publicKey,
        toAddress: destination.account.publicKey
      });
    } catch (error) {
      throw new RpcError(
        'BRIDGE_QUOTE_FAILED',
        error instanceof Error ? error.message : 'Unable to fetch a bridge quote right now.'
      );
    }
  }

  async executeBridge(input: {
    quoteResponse: Record<string, unknown>;
    toChain: GrapeChain;
    destinationWalletId?: string;
    password?: string;
  }): Promise<WalletBridgeExecuteResponse> {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('BRIDGE_UNAVAILABLE', 'Bridge is currently available only on mainnet-beta.');
    }
    if (selectedWallet.chain === 'sui') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Bridge source is coming soon for Sui wallets.');
    }
    if (!isBridgeRouteSupported(selectedWallet.chain, input.toChain)) {
      const supportedDestinations = getSupportedBridgeDestinations(selectedWallet.chain);
      const supportedList = supportedDestinations.length > 0 ? supportedDestinations.join(', ') : 'none';
      throw new RpcError(
        'UNSUPPORTED_BRIDGE_ROUTE',
        `Bridging from ${selectedWallet.chain} to ${input.toChain} is not supported yet. Supported destinations: ${supportedList}.`
      );
    }
    if (selectedWallet.signer.kind === 'ledger') {
      throw new RpcError('LEDGER_UNSUPPORTED', 'Bridge execution is not available for Ledger wallets yet.');
    }

    const transactionRequest = extractExecutableBridgeTransactionRequest(input.quoteResponse, selectedWallet.chain);

    if (!transactionRequest) {
      throw new RpcError(
        'BRIDGE_UNSUPPORTED',
        'This bridge route requires an unsupported transaction format. Try a different route or amount.'
      );
    }

    const destination = this.resolveBridgeDestination(walletState, input.toChain, input.destinationWalletId);
    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);

    let signature: string;
    try {
      if (selectedWallet.chain === 'solana') {
        if (!transactionRequest.data) {
          throw new RpcError('BRIDGE_UNSUPPORTED', 'This bridge route is missing the Solana transaction payload.');
        }
        signature = await signAndSendSerializedTransaction(
          transactionRequest.data,
          this.resolveSolanaSignerForWallet(secret, selectedWallet, activeAccount.publicKey),
          this.resolveRpcEndpoint(walletState.selectedNetwork, walletState)
        );
      } else if (selectedWallet.chain === 'ethereum') {
        if (!transactionRequest.to) {
          throw new RpcError('BRIDGE_UNSUPPORTED', 'This bridge route is missing the transaction target.');
        }
        signature = await sendEthereumTransactionRequest(this.resolveEthereumNetwork(walletState.selectedNetwork), secret, {
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value,
          customRpcUrl: walletState.chainState.ethereum.customRpcUrl
        });
      } else if (selectedWallet.chain === 'monad') {
        if (!transactionRequest.to) {
          throw new RpcError('BRIDGE_UNSUPPORTED', 'This bridge route is missing the transaction target.');
        }
        signature = await sendMonadTransactionRequest(this.resolveMonadNetwork(walletState.selectedNetwork), secret, {
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value,
          customRpcUrl: walletState.chainState.monad.customRpcUrl
        });
      } else {
        throw new RpcError('UNSUPPORTED_CHAIN', 'Bridge source is not supported for this chain yet.');
      }
    } catch (error) {
      throw normalizeSigningError(error);
    }

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      fromChain: selectedWallet.chain,
      toChain: destination.wallet.chain,
      fromAmountUi: this.getBridgeAmountUi(input.quoteResponse, 'from', selectedWallet.chain),
      toAmountUi: this.getBridgeAmountUi(input.quoteResponse, 'to', destination.wallet.chain),
      fromSymbol: this.getBridgeSymbol(input.quoteResponse, 'from', selectedWallet.chain),
      toSymbol: this.getBridgeSymbol(input.quoteResponse, 'to', destination.wallet.chain),
      destinationAddress: destination.account.publicKey
    };
  }

  private resolveBridgeDestination(walletState: Awaited<ReturnType<typeof walletStateStorage.get>>, chain: GrapeChain, walletId?: string) {
    const chainWallets = walletState.wallets.filter((candidate) => candidate.chain === chain);
    const wallet = chainWallets.find((candidate) => candidate.id === walletId) ?? chainWallets[0];
    if (!wallet) {
      throw new RpcError('BRIDGE_DESTINATION_MISSING', `Add a ${chain} wallet before bridging to that chain.`);
    }

    const account = wallet.accounts.find((candidate) => candidate.id === wallet.selectedAccountId) ?? wallet.accounts[0];
    if (!account) {
      throw new RpcError('ACCOUNT_MISSING', 'The selected destination wallet does not have an active account.');
    }

    return { wallet, account };
  }

  private getBridgeAmountUi(
    quoteResponse: Record<string, unknown>,
    side: 'from' | 'to',
    chain: GrapeChain
  ) {
    const estimate =
      typeof quoteResponse.estimate === 'object' && quoteResponse.estimate
        ? (quoteResponse.estimate as { fromAmount?: string; toAmount?: string })
        : null;
    const rawAmount = side === 'from' ? estimate?.fromAmount : estimate?.toAmount;
    if (!rawAmount) {
      return '0';
    }

    return formatUiAmount(rawAmount, LIFI_NATIVE_DECIMALS[chain]);
  }

  private getBridgeSymbol(
    quoteResponse: Record<string, unknown>,
    side: 'from' | 'to',
    chain: GrapeChain
  ) {
    const estimate =
      typeof quoteResponse.estimate === 'object' && quoteResponse.estimate
        ? (quoteResponse.estimate as {
            fromToken?: { symbol?: string };
            toToken?: { symbol?: string };
          })
        : null;

    return side === 'from'
      ? estimate?.fromToken?.symbol ?? LIFI_NATIVE_SYMBOL[chain]
      : estimate?.toToken?.symbol ?? LIFI_NATIVE_SYMBOL[chain];
  }

  async handleProviderRequest(
    request: ProviderRequest,
    port: chrome.runtime.Port,
    debug?: (payload: ProviderDebugPayload) => void
  ): Promise<unknown> {
    debug?.({
      phase: 'handle_provider_request_start',
      requestId: request.id,
      method: request.method,
      origin: request.origin.origin
    });
    const walletState = await this.getWalletState();
    const requestChain = getProviderRequestChain(request, walletState, this.resolveEthereumNetworkFromChainId.bind(this), this.resolveMonadNetworkFromChainId.bind(this), this.getPreferredEvmChain.bind(this));
    const selectedWallet = getSelectedWalletForChain(walletState, requestChain);
    if (walletState.setup !== 'ready' || !selectedWallet || !selectedWallet.selectedAccountId) {
      throw new RpcError('WALLET_NOT_READY', 'Wallet has not been created or imported yet.');
    }
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    const selectedNetwork = this.getSelectedNetworkForChain(walletState, requestChain);
    const permissions = await permissionsStorage.get();
    const accountPermission = getAccountPermissionForChain(requestChain);
    const isTrusted = hasPermission(permissions, request.origin.origin, accountPermission);
    const isConnected = this.isProviderOriginConnected(port, request.origin.origin, requestChain);
    const allowsAutoConnect = isTrusted && walletState.autoConnectEnabled;

    if (request.method === 'disconnect' || request.method === 'sui_disconnect') {
      this.setProviderOriginConnected(port, request.origin.origin, requestChain, false);
      return { disconnected: true };
    }

    if (request.method === 'monad_chainId') {
      return requestChain === 'ethereum'
        ? this.resolveEthereumChainId(selectedNetwork)
        : this.resolveMonadChainId(selectedNetwork);
    }

    if (request.method === 'monad_switchChain' || request.method === 'monad_addChain') {
      const evmSelection = this.resolveEvmSelection(walletState, request);
      await this.setSelectedChainNetwork(evmSelection.chain, evmSelection.network);
      return null;
    }

    if (request.method === 'sui_getAccounts') {
      return allowsAutoConnect || isConnected ? [await this.getSuiProviderAccount(selectedWallet, activeAccount)] : [];
    }

    if (request.method === 'monad_accounts') {
      return allowsAutoConnect || isConnected ? [activeAccount.publicKey] : [];
    }

    if (isProviderConnectRequest(request)) {
      const silentConnect =
        request.method === 'connect' || request.method === 'sui_connect' ? !!request.params.silent : false;

      if (silentConnect) {
        if (!isTrusted) {
          throw new RpcError('NOT_CONNECTED', 'This site has not been approved yet.');
        }
        if (!walletState.autoConnectEnabled) {
          throw new RpcError('NOT_CONNECTED', 'Auto-connect is turned off for trusted sites.');
        }
        this.setProviderOriginConnected(port, request.origin.origin, requestChain, true);
        debug?.({
          phase: 'connect_silent_trusted',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        return this.buildProviderConnectResult(request, selectedWallet, activeAccount);
      }

      if (allowsAutoConnect) {
        this.setProviderOriginConnected(port, request.origin.origin, requestChain, true);
        debug?.({
          phase: 'connect_already_trusted',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        return this.buildProviderConnectResult(request, selectedWallet, activeAccount);
      }

      const approval = await this.createApproval(request, requestChain, selectedNetwork, selectedWallet.id, activeAccount.publicKey, {
        requestedPermissions: getRequestedPermissionLabels(requestChain, selectedWallet.signer)
      });
      debug?.({
        phase: 'approval_created',
        requestId: request.id,
        method: request.method,
        approvalId: approval.id,
        kind: approval.kind,
        origin: request.origin.origin,
        network: selectedNetwork
      });
      const result = await this.awaitApproval(approval.id, debug);
      this.setProviderOriginConnected(port, request.origin.origin, requestChain, true);
      return result;
    }

    if (!isTrusted || (!walletState.autoConnectEnabled && !isConnected)) {
      throw new RpcError('NOT_CONNECTED', 'Connect this site before signing.');
    }

    if (selectedWallet.signer.kind === 'watch-only') {
      throw new RpcError('WATCH_ONLY_WALLET', 'This wallet is watch-only and cannot sign messages or transactions.');
    }

    if (request.method === 'monad_sendTransaction') {
      const requestedFrom = request.params.transaction.from?.trim().toLowerCase();
      if (requestedFrom && requestedFrom !== activeAccount.publicKey.toLowerCase()) {
        throw new RpcError('ACCOUNT_MISMATCH', 'The requested sender does not match the active Monad wallet.');
      }
    }

    if (request.method === 'monad_signMessage') {
      const requestedAddress = request.params.address?.trim().toLowerCase();
      if (requestedAddress && requestedAddress !== activeAccount.publicKey.toLowerCase()) {
        throw new RpcError('ACCOUNT_MISMATCH', 'The requested signer does not match the active Monad wallet.');
      }
    }

    if (request.method === 'monad_signTypedData' && request.params.address.trim().toLowerCase() !== activeAccount.publicKey.toLowerCase()) {
      throw new RpcError('ACCOUNT_MISMATCH', 'The requested signer does not match the active Monad wallet.');
    }

    const connection = this.createConnection(selectedNetwork, walletState);
    const transactionSummary =
      request.method === 'signTransaction' || request.method === 'signAndSendTransaction' || request.method === 'sendTransaction'
        ? await enrichSolanaTransactionSummaryWithUsd(
            await enrichSolanaTransactionSummaryWithWalletContext(
              await inspectTransaction(request.params.transaction, connection),
              connection,
              selectedNetwork,
              activeAccount.publicKey
            )
          )
        : request.method === 'signAllTransactions'
          ? {
              ...(await enrichSolanaTransactionSummaryWithUsd(
                await enrichSolanaTransactionSummaryWithWalletContext(
                  await inspectTransaction(request.params.transactions[0], connection),
                  connection,
                  selectedNetwork,
                  activeAccount.publicKey
                )
              )),
              warnings: ['Only the first transaction in this batch was decoded and simulated.']
            }
          : undefined;

    const approval = await this.createApproval(request, requestChain, selectedNetwork, selectedWallet.id, activeAccount.publicKey, {
      transactionSummary
    });
    debug?.({
      phase: 'approval_created',
      requestId: request.id,
      method: request.method,
      approvalId: approval.id,
      kind: approval.kind,
      origin: request.origin.origin,
      network: selectedNetwork
    });
    return this.awaitApproval(approval.id, debug);
  }

  async getApproval(approvalId: string) {
    const approvals = await approvalsStorage.get();
    return approvals[approvalId];
  }

  async respondToApproval(approvalId: string, approved: boolean, password?: string) {
    const approvals = await approvalsStorage.get();
    const approval = approvals[approvalId];
    if (!approval) {
      throw new RpcError('APPROVAL_NOT_FOUND', 'Approval request could not be found.');
    }

    try {
      if (!approved) {
        this.emitPendingApprovalDebug(approvalId, {
          phase: 'approval_rejected',
          requestId: approval.request.id,
          method: approval.request.method,
          approvalId,
          kind: approval.kind,
          origin: approval.origin.origin,
          success: false,
          code: 'USER_REJECTED',
          message: 'User rejected the request.'
        });
        this.rejectPendingApproval(approvalId, new RpcError('USER_REJECTED', 'User rejected the request.'));
        return { approved: false };
      }

      this.emitPendingApprovalDebug(approvalId, {
        phase: 'approval_execute_start',
        requestId: approval.request.id,
        method: approval.request.method,
        approvalId,
        kind: approval.kind,
        origin: approval.origin.origin,
        network: approval.network
      });
      const trimmedPassword = password?.trim() || undefined;
      const session = await this.getSessionState();
      if (session.locked && trimmedPassword) {
        await this.unlockWallet(trimmedPassword);
      }
      const result = await this.executeApproval(approval, trimmedPassword);
      this.emitPendingApprovalDebug(approvalId, {
        phase: 'approval_execute_success',
        requestId: approval.request.id,
        method: approval.request.method,
        approvalId,
        kind: approval.kind,
        origin: approval.origin.origin,
        network: approval.network,
        success: true
      });
      this.resolvePendingApproval(approvalId, result);
      return { approved: true };
    } catch (error) {
      const normalized = normalizeError(error);
      this.emitPendingApprovalDebug(approvalId, {
        phase: 'approval_execute_error',
        requestId: approval.request.id,
        method: approval.request.method,
        approvalId,
        kind: approval.kind,
        origin: approval.origin.origin,
        network: approval.network,
        success: false,
        code: normalized.code,
        message: normalized.message
      });
      throw error;
    } finally {
      const nextApprovals = { ...approvals };
      delete nextApprovals[approvalId];
      await approvalsStorage.set(nextApprovals);
    }
  }

  async cancelApproval(approvalId: string) {
    const approvals = await approvalsStorage.get();
    const approval = approvals[approvalId];
    if (!approval) {
      return;
    }
    const nextApprovals = { ...approvals };
    delete nextApprovals[approvalId];
    await approvalsStorage.set(nextApprovals);
    this.rejectPendingApproval(approvalId, new RpcError('APPROVAL_CLOSED', 'Approval window was closed.'));
  }

  private async executeApproval(approval: ApprovalRecord, password?: string) {
    const walletState = await this.getWalletState();
    const approvalWallet =
      (approval.walletId ? walletState.wallets.find((wallet) => wallet.id === approval.walletId) : undefined) ??
      getSelectedWalletForChain(walletState, approval.chain);
    if (!approvalWallet) {
      throw new RpcError('WALLET_NOT_FOUND', 'The wallet for this approval could not be found.');
    }
    const approvalAccount = approvalWallet.accounts.find((account) => account.publicKey === approval.publicKey) ?? approvalWallet.accounts[0];
    if (!approvalAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available for this approval.');
    }

    if (approval.kind === 'connect') {
      const permissions = await permissionsStorage.get();
      const grantedPermissions = [getAccountPermissionForChain(approval.chain)];
      if (approvalWallet.signer.kind !== 'watch-only') {
        grantedPermissions.push(getSignPermissionForChain(approval.chain));
      }
      await permissionsStorage.set(
        grantPermissions(permissions, approval.origin.origin, grantedPermissions, {
          faviconUrl: approval.origin.faviconUrl,
          title: approval.origin.title
        })
      );
      return this.buildProviderConnectResult(approval.request, approvalWallet, approvalAccount);
    }

    this.assertInteractiveWallet(approvalWallet);
    const secret = await this.getUnlockedSecret(approvalWallet.id, approvalWallet.vault, password);
    switch (approval.request.method) {
      case 'signMessage': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger message signing is not supported in this MVP.');
        }

        const signer = this.resolveSolanaSignerForWallet(secret, approvalWallet, approvalAccount.publicKey);
        const messageRequest = approval.request as Extract<ProviderRequest, { method: 'signMessage' }>;
        const signature = signMessageBytes(
          atobBytes(messageRequest.params.message),
          signer
        );
        return {
          publicKey: signer.publicKey.toBase58(),
          signature: arrayBufferToBase64(signature)
        };
      }
      case 'sui_signPersonalMessage': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger message signing is not supported for Sui dapps.');
        }

        const signer = resolveSuiVaultSecret(secret);
        const signed = await signer.signPersonalMessage(atobBytes(approval.request.params.message));
        return {
          address: signer.toSuiAddress(),
          bytes: signed.bytes,
          signature: signed.signature
        };
      }
      case 'monad_signMessage': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', `Ledger message signing is not supported for ${formatChainLabel(approval.chain)} dapps.`);
        }

        const signer = approval.chain === 'ethereum' ? resolveEthereumVaultSecret(secret) : resolveMonadVaultSecret(secret);
        return signer.signMessage({
          message: normalizeMonadSignMessage(approval.request.params.message)
        });
      }
      case 'monad_signTypedData': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', `Ledger typed data signing is not supported for ${formatChainLabel(approval.chain)} dapps.`);
        }

        const signer = approval.chain === 'ethereum' ? resolveEthereumVaultSecret(secret) : resolveMonadVaultSecret(secret);
        return signer.signTypedData(JSON.parse(approval.request.params.typedData));
      }
      case 'signTransaction': {
        const transactionRequest = approval.request as Extract<ProviderRequest, { method: 'signTransaction' }>;
        return {
          transaction:
            approvalWallet.signer.kind === 'ledger'
              ? throwLedgerUnsupported()
              : signSerializedTransaction(
                  transactionRequest.params.transaction,
                  this.resolveSolanaSignerForWallet(secret, approvalWallet, approvalAccount.publicKey)
                )
        };
      }
      case 'sui_signTransaction': {
        const client = await this.createSuiClient(approval.network, walletState);
        const sender =
          approvalWallet.signer.kind === 'ledger'
            ? approvalAccount.publicKey
            : resolveSuiVaultSecret(secret).toSuiAddress();
        const transactionBytes = await resolveSuiTransactionBytes(approval.request.params.transaction, client, sender);
        const signed =
          approvalWallet.signer.kind === 'ledger'
            ? await signSuiTransactionBytesWithLedger(approvalWallet.signer.derivationPath, transactionBytes)
            : await resolveSuiVaultSecret(secret).signTransaction(transactionBytes);
        return {
          address: sender,
          bytes: signed.bytes,
          signature: signed.signature
        };
      }
      case 'signAllTransactions': {
        const transactionsRequest = approval.request as Extract<ProviderRequest, { method: 'signAllTransactions' }>;
        return {
          transactions:
            approvalWallet.signer.kind === 'ledger'
              ? throwLedgerUnsupported()
              : signSerializedTransactions(
                  transactionsRequest.params.transactions,
                  this.resolveSolanaSignerForWallet(secret, approvalWallet, approvalAccount.publicKey)
                )
        };
      }
      case 'signAndSendTransaction':
      case 'sendTransaction': {
        const transactionRequest = approval.request as Extract<
          ProviderRequest,
          { method: 'signAndSendTransaction' | 'sendTransaction' }
        >;
        try {
          return {
            signature:
              approvalWallet.signer.kind === 'ledger'
                ? throwLedgerUnsupported()
                : await signAndSendSerializedTransaction(
                    transactionRequest.params.transaction,
                    this.resolveSolanaSignerForWallet(secret, approvalWallet, approvalAccount.publicKey),
                    this.resolveRpcEndpoint(approval.network, walletState)
                  )
          };
        } catch (error) {
          throw normalizeSigningError(error);
        }
      }
      case 'sui_signAndExecuteTransaction': {
        const client = await this.createSuiClient(approval.network, walletState);
        const sender =
          approvalWallet.signer.kind === 'ledger'
            ? approvalAccount.publicKey
            : resolveSuiVaultSecret(secret).toSuiAddress();
        const transactionBytes = await resolveSuiTransactionBytes(approval.request.params.transaction, client, sender);
        const signed =
          approvalWallet.signer.kind === 'ledger'
            ? await signSuiTransactionBytesWithLedger(approvalWallet.signer.derivationPath, transactionBytes)
            : await resolveSuiVaultSecret(secret).signTransaction(transactionBytes);
        const result = await client.executeTransaction({
          transaction: transactionBytes,
          signatures: [signed.signature],
          include: {
            balanceChanges: true,
            effects: true,
            events: true,
            transaction: true
          }
        });
        const executed = result.Transaction ?? result.FailedTransaction;

        return {
          address: sender,
          balanceChanges: executed.balanceChanges ?? null,
          bytes: signed.bytes,
          signature: signed.signature,
          digest: executed.digest,
          errors: result.$kind === 'FailedTransaction' ? [executed.status.error?.message ?? 'Sui transaction failed.'] : undefined,
          events: executed.events ?? null,
          transaction: executed.transaction ?? null
        };
      }
      case 'monad_sendTransaction': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', `Ledger contract transaction execution is not supported for ${formatChainLabel(approval.chain)} dapps.`);
        }

        const transactionRequest = approval.request.params.transaction;
        if (!transactionRequest.to?.trim()) {
          throw new RpcError('INVALID_REQUEST', `${formatChainLabel(approval.chain)} transactions must include a destination address.`);
        }

        return {
          signature:
            approval.chain === 'ethereum'
              ? await sendEthereumTransactionRequest(this.resolveEthereumNetwork(approval.network), secret, {
                  to: transactionRequest.to,
                  data: transactionRequest.data,
                  value: transactionRequest.value,
                  gas: transactionRequest.gas,
                  gasPrice: transactionRequest.gasPrice,
                  maxFeePerGas: transactionRequest.maxFeePerGas,
                  maxPriorityFeePerGas: transactionRequest.maxPriorityFeePerGas,
                  nonce: transactionRequest.nonce,
                  customRpcUrl: walletState.chainState.ethereum.customRpcUrl
                })
              : await sendMonadTransactionRequest(this.resolveMonadNetwork(approval.network), secret, {
                  to: transactionRequest.to,
                  data: transactionRequest.data,
                  value: transactionRequest.value,
                  gas: transactionRequest.gas,
                  gasPrice: transactionRequest.gasPrice,
                  maxFeePerGas: transactionRequest.maxFeePerGas,
                  maxPriorityFeePerGas: transactionRequest.maxPriorityFeePerGas,
                  nonce: transactionRequest.nonce,
                  customRpcUrl: walletState.chainState.monad.customRpcUrl
                })
        };
      }
      default:
        throw new RpcError('UNKNOWN_APPROVAL', 'Unsupported approval kind.');
    }
  }

  private async createApproval(
    request: ProviderRequest,
    chain: WalletState['selectedChain'],
    network: 'mainnet-beta' | 'devnet',
    walletId: string,
    publicKey: string,
    extras?: Pick<ApprovalRecord, 'requestedPermissions' | 'transactionSummary'>
  ) {
    const session = await this.getSessionState();
    const walletState = await this.getWalletState();
    const unlockedWalletIds = await this.getUnlockedWalletIds(session.locked);
    const unlockedPassword = session.locked ? null : (await unlockedPasswordSessionStorage.get()).value;
    const kind = toApprovalKind(request);
    const approvalWallet = walletState.wallets.find((wallet) => wallet.id === walletId);
    const canUseUnlockedSession = !!(
      approvalWallet?.signer.kind === 'watch-only' ||
      approvalWallet?.signer.kind === 'ledger' ||
      unlockedWalletIds.includes(walletId) ||
      (approvalWallet?.vault && unlockedPassword)
    );
    const state = createPendingApproval(crypto.randomUUID(), kind);
    const approval: ApprovalRecord = {
      id: state.id,
      kind,
      state,
      chain,
      request,
      origin: request.origin,
      createdAt: state.createdAt,
      publicKey,
      walletId,
      network,
      requestedPermissions: extras?.requestedPermissions,
      transactionSummary: extras?.transactionSummary,
      requiresPassword:
        approvalWallet?.signer.kind === 'ledger'
          ? false
          : walletState.dappApprovalMode === 'non-strict' && kind !== 'connect'
            ? session.locked
          : !canUseUnlockedSession,
      hostSurfaceId: getPreferredApprovalSurface()?.surfaceId
    };

    const approvals = await approvalsStorage.get();
    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);

    if (!approval.hostSurfaceId) {
      const createdWindow = await chrome.windows.create({
        url: chrome.runtime.getURL(`approval.html?approvalId=${state.id}`),
        type: 'popup',
        focused: true,
        width: 520,
        height: 820
      });
      approval.windowId = createdWindow.id;
    }

    approvals[state.id] = approval;
    await approvalsStorage.set(approvals);
    return approval;
  }

  private awaitApproval(approvalId: string, debug?: (payload: ProviderDebugPayload) => void): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingApprovals.set(approvalId, { resolve, reject, debug });
    });
  }

  private resolvePendingApproval(approvalId: string, value: unknown) {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      pending.resolve(value);
      this.pendingApprovals.delete(approvalId);
    }
  }

  private rejectPendingApproval(approvalId: string, error: Error) {
    const pending = this.pendingApprovals.get(approvalId);
    if (pending) {
      pending.reject(error);
      this.pendingApprovals.delete(approvalId);
    }
  }

  private emitPendingApprovalDebug(approvalId: string, payload: ProviderDebugPayload) {
    this.pendingApprovals.get(approvalId)?.debug?.(payload);
  }

  private async getUnlockedSecret(walletId: string, vault: NonNullable<ReturnType<typeof getSelectedWallet>>['vault'], password?: string) {
    await this.ensureUnlockedSecretsLoaded();
    const cached = this.unlockedSecrets[walletId];
    if (cached) {
      return cached.secret;
    }
    if (!vault) {
      throw new RpcError('WATCH_ONLY_WALLET', 'This wallet does not have local signing secrets.');
    }

    const resolvedPassword = password ?? (await unlockedPasswordSessionStorage.get()).value ?? undefined;
    if (!resolvedPassword) {
      throw new RpcError('PASSWORD_REQUIRED', 'Password is required to sign.');
    }

    let secret: VaultSecret;
    try {
      secret = await unlockVaultRecord(vault, resolvedPassword);
    } catch (error) {
      if (!password) {
        await unlockedPasswordSessionStorage.set({ value: null });
        throw new RpcError('PASSWORD_REQUIRED', 'Password is required to sign.');
      }
      throw error;
    }
    this.unlockedSecrets[walletId] = {
      secret,
      unlockedAt: Date.now()
    };
    await this.persistUnlockedSecrets();
    return secret;
  }

  private async findUnlockedSecretForAccount(
    walletId: string,
    chain: GrapeChain,
    publicKey: string,
    derivationPath?: string
  ): Promise<VaultSecret | null> {
    await this.ensureUnlockedSecretsLoaded();

    const cached = this.unlockedSecrets[walletId];
    if (cached) {
      try {
        if (this.resolvePublicKeyFromSecret(cached.secret, chain, derivationPath) === publicKey) {
          return cached.secret;
        }
      } catch {
        // Ignore cached secrets that cannot be mapped to this chain/account.
      }
    }

    for (const entry of Object.values(this.unlockedSecrets)) {
      try {
        if (this.resolvePublicKeyFromSecret(entry.secret, chain, derivationPath) !== publicKey) {
          continue;
        }

        this.unlockedSecrets[walletId] = {
          secret: entry.secret,
          unlockedAt: Date.now()
        };
        await this.persistUnlockedSecrets();
        return entry.secret;
      } catch {
        // Ignore secrets that cannot be mapped to this chain/account.
      }
    }

    return null;
  }

  private async getUnlockedSecretForAccount(
    walletId: string,
    vault: NonNullable<ReturnType<typeof getSelectedWallet>>['vault'],
    chain: GrapeChain,
    publicKey: string,
    password?: string,
    derivationPath?: string
  ) {
    const resolved = await this.findUnlockedSecretForAccount(walletId, chain, publicKey, derivationPath);
    if (resolved) {
      return resolved;
    }

    if (!password) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await delay(150);
        this.unlockedSecrets = await unlockedSecretSessionStorage.get();
        const retried = await this.findUnlockedSecretForAccount(walletId, chain, publicKey, derivationPath);
        if (retried) {
          return retried;
        }
      }
    }

    return this.getUnlockedSecret(walletId, vault, password);
  }
}

function getSurfacePriority(page: string): number {
  switch (page) {
    case 'sidepanel':
      return 3;
    case 'popup':
      return 2;
    default:
      return 0;
  }
}

function canHostInlineApprovalSurface(page: string): boolean {
  return page === 'popup' || page === 'sidepanel';
}

function getPreferredApprovalSurface(): ActiveWalletSurface | undefined {
  const now = Date.now();
  return [...activeWalletSurfacePorts.values()]
    .filter(
      (surface) =>
        canHostInlineApprovalSurface(surface.page) &&
        surface.visible &&
        now - surface.lastSeenAt <= SURFACE_STALE_MS
    )
    .sort((left, right) => getSurfacePriority(right.page) - getSurfacePriority(left.page))[0];
}

async function assignPendingApprovalsToPreferredSurface() {
  const preferred = getPreferredApprovalSurface();
  if (!preferred) {
    return;
  }

  const approvals = await approvalsStorage.get();
  let changed = false;
  for (const approval of Object.values(approvals)) {
    if (!approval.hostSurfaceId) {
      approval.hostSurfaceId = preferred.surfaceId;
      changed = true;
    }
  }

  if (changed) {
    await approvalsStorage.set(approvals);
  }
}

async function reassignApprovalsFromSurface(surfaceId: string) {
  const approvals = await approvalsStorage.get();
  const preferred = getPreferredApprovalSurface();
  let changed = false;

  for (const approval of Object.values(approvals)) {
    if (approval.hostSurfaceId === surfaceId) {
      approval.hostSurfaceId = preferred?.surfaceId;
      changed = true;
      if (!preferred && !approval.windowId) {
        const createdWindow = await chrome.windows.create({
          url: chrome.runtime.getURL(`approval.html?approvalId=${approval.id}`),
          type: 'popup',
          focused: true,
          width: 520,
          height: 820
        });
        approval.windowId = createdWindow.id;
      }
    }
  }

  if (changed) {
    await approvalsStorage.set(approvals);
  }
}

function toApprovalKind(request: ProviderRequest) {
  switch (request.method) {
    case 'connect':
    case 'sui_connect':
    case 'monad_requestAccounts':
      return 'connect';
    case 'signMessage':
    case 'sui_signPersonalMessage':
    case 'monad_signMessage':
    case 'monad_signTypedData':
      return 'sign-message';
    case 'signTransaction':
    case 'sui_signTransaction':
      return 'sign-transaction';
    case 'signAllTransactions':
      return 'sign-all-transactions';
    case 'signAndSendTransaction':
    case 'sendTransaction':
    case 'sui_signAndExecuteTransaction':
    case 'monad_sendTransaction':
      return 'sign-and-send-transaction';
    default:
      throw new RpcError('UNKNOWN_REQUEST', 'Unsupported request type.');
  }
}

function shouldRequireReauthForApproval(
  kind: ApprovalRecord['kind'],
  mode: import('@grape/core').DappApprovalMode | undefined
) {
  if (mode !== 'strict') {
    return false;
  }

  return kind === 'sign-transaction' || kind === 'sign-all-transactions' || kind === 'sign-and-send-transaction';
}

function getProviderRequestChain(
  request: ProviderRequest,
  walletState: import('@grape/core').WalletState,
  resolveEthereumNetworkFromChainId: (chainId: string) => EthereumNetwork | null,
  resolveMonadNetworkFromChainId: (chainId: string) => MonadNetwork | null,
  getPreferredEvmChain: (walletState: import('@grape/core').WalletState) => 'monad' | 'ethereum'
): GrapeChain {
  switch (request.method) {
    case 'connect':
    case 'disconnect':
    case 'signMessage':
    case 'signTransaction':
    case 'signAllTransactions':
    case 'signAndSendTransaction':
    case 'sendTransaction':
      return 'solana';
    case 'sui_connect':
    case 'sui_disconnect':
    case 'sui_getAccounts':
    case 'sui_signPersonalMessage':
    case 'sui_signTransaction':
    case 'sui_signAndExecuteTransaction':
      return 'sui';
    case 'monad_accounts':
    case 'monad_requestAccounts':
    case 'monad_chainId':
    case 'monad_sendTransaction':
    case 'monad_signMessage':
    case 'monad_signTypedData':
      return getPreferredEvmChain(walletState);
    case 'monad_switchChain':
    case 'monad_addChain':
      if (resolveEthereumNetworkFromChainId(request.params.chainId)) {
        return 'ethereum';
      }
      if (resolveMonadNetworkFromChainId(request.params.chainId)) {
        return 'monad';
      }
      throw new RpcError('CHAIN_UNSUPPORTED', 'Grape only supports Ethereum, Sepolia, Monad, and Monad testnet.');
    default:
      throw new RpcError('UNKNOWN_REQUEST', 'Unsupported provider chain.');
  }
}

function isProviderConnectRequest(request: ProviderRequest) {
  return request.method === 'connect' || request.method === 'sui_connect' || request.method === 'monad_requestAccounts';
}

function getAccountPermissionForChain(chain: GrapeChain): import('@grape/core').PermissionKind {
  switch (chain) {
    case 'solana':
      return 'solana:accounts';
    case 'sui':
      return 'sui:accounts';
    case 'monad':
      return 'monad:accounts';
    case 'ethereum':
      return 'ethereum:accounts';
    default:
      return 'solana:accounts';
  }
}

function getSignPermissionForChain(chain: GrapeChain): import('@grape/core').PermissionKind {
  switch (chain) {
    case 'solana':
      return 'solana:sign';
    case 'sui':
      return 'sui:sign';
    case 'monad':
      return 'monad:sign';
    case 'ethereum':
      return 'ethereum:sign';
    default:
      return 'solana:sign';
  }
}

function getRequestedPermissionLabels(chain: GrapeChain, signer: import('@grape/core').WalletSigner): string[] {
  const viewPermission = chain === 'solana' ? 'View your public key' : 'View your wallet address';
  if (signer.kind === 'watch-only') {
    return [viewPermission];
  }

  return [viewPermission, 'Request signatures and transaction approvals'];
}

function normalizeMonadSignMessage(message: string) {
  if (message.startsWith('0x') && /^0x[0-9a-fA-F]*$/.test(message) && message.length % 2 === 0) {
    return { raw: message as `0x${string}` };
  }

  return message;
}

function formatChainLabel(chain: GrapeChain) {
  switch (chain) {
    case 'ethereum':
      return 'Ethereum';
    case 'monad':
      return 'Monad';
    case 'sui':
      return 'Sui';
    case 'solana':
      return 'Solana';
    default:
      return chain;
  }
}

function atobBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function arrayBufferToBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function normalizeError(error: unknown) {
  if (error instanceof RpcError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'An unknown error occurred.' };
}

function normalizeSigningError(error: unknown) {
  if (error instanceof RpcError) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeMessage = 'message' in error && typeof error.message === 'string' ? error.message : 'Transaction failed.';
    const maybeLogs = 'logs' in error && Array.isArray(error.logs) ? error.logs.filter((log): log is string => typeof log === 'string') : [];
    const compactLogs = maybeLogs.slice(0, 2).join(' ');

    if (maybeMessage.toLowerCase().includes('insufficient lamports') || compactLogs.toLowerCase().includes('insufficient lamports')) {
      return new RpcError('INSUFFICIENT_FUNDS', 'Not enough SOL to cover the transfer amount and network fee.');
    }

    return new RpcError('TRANSACTION_FAILED', compactLogs ? `${maybeMessage} ${compactLogs}` : maybeMessage);
  }

  return new RpcError('TRANSACTION_FAILED', 'Transaction failed.');
}

function emitProviderDebug(port: chrome.runtime.Port, payload: ProviderDebugPayload) {
  console.debug('[Grape][background]', payload);
  try {
    port.postMessage({
      __grapeDebug: true,
      payload
    });
  } catch {
    // Ignore debug transport failures.
  }
}

function normalizeRemoteUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  if (value.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${value.slice('ipfs://'.length)}`;
  }
  if (value.startsWith('ar://')) {
    return `https://arweave.net/${value.slice('ar://'.length)}`;
  }
  return value;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value);
}

function concatBytes(...arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((sum, entry) => sum + entry.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const entry of arrays) {
    merged.set(entry, offset);
    offset += entry.length;
  }
  return merged;
}

function u16leBytes(value: number) {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, value & 0xffff, true);
  return buffer;
}

async function sha256Bytes(value: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', value);
  return new Uint8Array(hash);
}

async function anchorAccountDiscriminator(name: string) {
  const preimage = new TextEncoder().encode(`account:${name}`);
  const hash = await sha256Bytes(preimage);
  return hash.slice(0, 8);
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint64LE(bytes: Uint8Array, offset: number) {
  let value = BigInt(0);
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << BigInt(8)) + BigInt(bytes[offset + index]);
  }
  return value;
}

function readInt64LE(bytes: Uint8Array, offset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigInt64(0, true);
}

function bigintToSafeNumber(value: bigint): number | null {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value < BigInt(0) || value > max) {
    return null;
  }
  return Number(value);
}

function bigintToSafeSignedNumber(value: bigint): number | null {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const min = BigInt(Number.MIN_SAFE_INTEGER);
  if (value < min || value > max) {
    return null;
  }
  return Number(value);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getVerificationPlatform(platform: number): WalletVerificationResponse['identities'][number]['platform'] {
  switch (platform) {
    case 0:
      return 'discord';
    case 1:
      return 'telegram';
    case 2:
      return 'twitter';
    case 3:
      return 'email';
    default:
      return 'unknown';
  }
}

async function decodeVerificationSpaceAccount(data: Uint8Array): Promise<VerificationSpaceAccount | null> {
  const discriminator = await anchorAccountDiscriminator('GrapeVerificationSpace');
  if (data.length < 139 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  const daoId = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  offset += 32;
  const attestor = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const isFrozen = data[offset] === 1;
  offset += 2;
  const salt = data.slice(offset, offset + 32);

  return {
    daoId,
    salt,
    attestor,
    isFrozen
  };
}

async function decodeVerificationIdentityAccount(data: Uint8Array): Promise<VerificationIdentityAccount | null> {
  const discriminator = await anchorAccountDiscriminator('GrapeVerificationIdentity');
  if (data.length < 124 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  const space = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const platform = data[offset];
  offset += 1;
  offset += 32;
  const verified = data[offset] === 1;
  offset += 1;
  const verifiedAt = bigintToSafeSignedNumber(readInt64LE(data, offset));
  offset += 8;
  const expiresAt = bigintToSafeSignedNumber(readInt64LE(data, offset));
  offset += 8;
  const attestedBy = new PublicKey(data.subarray(offset, offset + 32)).toBase58();

  return {
    space,
    platform,
    verified,
    verifiedAt,
    expiresAt,
    attestedBy
  };
}

async function decodeVerificationLinkAccount(data: Uint8Array): Promise<VerificationLinkAccount | null> {
  const discriminator = await anchorAccountDiscriminator('GrapeVerificationLink');
  if (data.length < 82 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  const identity = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const walletHash = data.slice(offset, offset + 32);
  offset += 32;
  const linkedAt = bigintToSafeSignedNumber(readInt64LE(data, offset));

  return {
    identity,
    walletHash,
    linkedAt
  };
}

async function decodeVineSpaceConfig(data: Uint8Array): Promise<VineSpaceConfig | null> {
  const discriminator = await anchorAccountDiscriminator('ReputationConfig');
  if (data.length < 113 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  const daoId = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  offset += 32;
  const repMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const currentSeason = readUint16LE(data, offset);
  offset += 2;
  const decayBps = readUint16LE(data, offset);

  return {
    daoId,
    repMint,
    currentSeason,
    decayBps,
    configPda: ''
  };
}

async function decodeVineReputationAccount(data: Uint8Array): Promise<VineReputationAccount | null> {
  const discriminator = await anchorAccountDiscriminator('Reputation');
  if (data.length < 64 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  if (data.length >= 92) {
    offset += 32;
  }
  offset += 32;
  const season = readUint16LE(data, offset);
  offset += 2;
  const points = readUint64LE(data, offset);

  return {
    season,
    points
  };
}

function getVineConfigPda(daoId: PublicKey) {
  return PublicKey.findProgramAddressSync([utf8Bytes('config'), daoId.toBytes()], VINE_REP_PROGRAM_ID)[0];
}

function getVineProjectMetaPda(daoId: PublicKey) {
  return PublicKey.findProgramAddressSync([utf8Bytes('project_meta'), daoId.toBytes()], VINE_REP_PROGRAM_ID)[0];
}

function getVineReputationPda(configPda: PublicKey, user: PublicKey, season: number) {
  return PublicKey.findProgramAddressSync(
    [utf8Bytes('reputation'), configPda.toBytes(), user.toBytes(), u16leBytes(season)],
    VINE_REP_PROGRAM_ID
  )[0];
}

async function decodeVineProjectMetadata(data: Uint8Array) {
  const discriminator = await anchorAccountDiscriminator('ProjectMetadata');
  if (data.length < 46 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  offset += 32;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const uriLength = view.getUint32(offset, true);
  offset += 4;
  if (offset + uriLength + 1 > data.length) {
    return null;
  }

  const metadataUri = new TextDecoder().decode(data.slice(offset, offset + uriLength));
  return {
    metadataUri
  };
}

async function fetchVineSpaceMetadata(
  connection: Connection,
  spaces: VineSpaceConfig[]
): Promise<Record<string, { name?: string; symbol?: string; description?: string; imageUri?: string; metadataUri?: string | null }>> {
  if (spaces.length === 0) {
    return {};
  }

  const metadataPdas = spaces.map((space) => getVineProjectMetaPda(new PublicKey(space.daoId)));

  const metadataAccounts = await connection.getMultipleAccountsInfo(metadataPdas, 'confirmed');
  const entries = await Promise.all(
    spaces.map(async (space, index) => {
      const parsedMetadata = metadataAccounts[index]?.data
        ? await decodeVineProjectMetadata(new Uint8Array(metadataAccounts[index]!.data))
        : null;
      const normalizedMetadataUri = normalizeRemoteUrl(parsedMetadata?.metadataUri ?? null);
      let description: string | undefined;
      let imageUri: string | undefined;
      let jsonName: string | undefined;
      let jsonSymbol: string | undefined;

      if (normalizedMetadataUri) {
        try {
          const response = await fetch(normalizedMetadataUri, { cache: 'no-store' });
          if (response.ok) {
            const payload = (await response.json()) as {
              name?: unknown;
              symbol?: unknown;
              description?: unknown;
              image?: unknown;
            };
            jsonName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined;
            jsonSymbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol.trim() : undefined;
            description =
              typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined;
            imageUri =
              typeof payload.image === 'string' && payload.image.trim()
                ? normalizeRemoteUrl(payload.image.trim()) ?? undefined
                : undefined;
          }
        } catch {
          imageUri = undefined;
        }
      }

      return [
        space.daoId,
        {
          name: jsonName ?? undefined,
          symbol: jsonSymbol ?? undefined,
          description,
          imageUri,
          metadataUri: normalizedMetadataUri
        }
      ] as const;
    })
  );

  return Object.fromEntries(entries);
}

async function fetchTrackedVineSpaceConfigs(connection: Connection, trackedDaoIds: string[]): Promise<VineSpaceConfig[]> {
  const uniqueDaoIds = Array.from(new Set(trackedDaoIds));
  const daoEntries = uniqueDaoIds.flatMap((daoId) => {
    try {
      const daoPublicKey = new PublicKey(daoId);
      return [{ daoId, daoPublicKey, configPda: getVineConfigPda(daoPublicKey) }];
    } catch {
      return [];
    }
  });

  if (daoEntries.length === 0) {
    return [];
  }

  const accounts = await connection.getMultipleAccountsInfo(
    daoEntries.map((entry) => entry.configPda),
    'confirmed'
  );

  const decodedEntries = await Promise.all(
    daoEntries.map(async (entry, index) => {
      const accountInfo = accounts[index];
      if (!accountInfo?.data) {
        return null;
      }
      const decoded = await decodeVineSpaceConfig(new Uint8Array(accountInfo.data));
      if (!decoded) {
        return null;
      }
      return {
        ...decoded,
        configPda: entry.configPda.toBase58()
      };
    })
  );

  return decodedEntries.filter((entry): entry is VineSpaceConfig => !!entry);
}

async function fetchAllVineSpaceConfigs(connection: Connection): Promise<VineSpaceConfig[]> {
  const configsResult = await connection.getProgramAccounts(VINE_REP_PROGRAM_ID, {
    commitment: 'confirmed'
  });

  const decodedEntries = await Promise.all(
    configsResult.map(async (account) => {
      const decoded = await decodeVineSpaceConfig(new Uint8Array(account.account.data));
      if (!decoded) {
        return null;
      }
      const expected = getVineConfigPda(new PublicKey(decoded.daoId)).toBase58();
      if (expected !== account.pubkey.toBase58()) {
        return null;
      }
      return {
        ...decoded,
        configPda: account.pubkey.toBase58()
      };
    })
  );

  return decodedEntries.filter((entry): entry is VineSpaceConfig => !!entry);
}

async function fetchOgReputationForWallet(
  connection: Connection,
  owner: PublicKey,
  trackedDaoIds: string[] = []
): Promise<WalletReputationResponse['spaces']> {
  const configs =
    trackedDaoIds.length > 0
      ? await fetchTrackedVineSpaceConfigs(connection, trackedDaoIds)
      : await fetchAllVineSpaceConfigs(connection);

  const reputationRequests = configs.flatMap((space) => {
    const configPda = new PublicKey(space.configPda);
    return Array.from({ length: Math.max(0, space.currentSeason) }, (_value, index) => {
      const season = index + 1;
      return {
        daoId: space.daoId,
        repMint: space.repMint,
        currentSeason: space.currentSeason,
        season,
        pda: getVineReputationPda(configPda, owner, season)
      };
    });
  });
  const decayByDao = new Map(configs.map((space) => [space.daoId, Math.max(0, Math.min(1, space.decayBps / 10000))] as const));

  const reputationByDao = new Map<
    string,
    {
      totalPoints: bigint;
      latestSeasonWithPoints: number;
      latestSeasonPoints: bigint;
      effectivePoints: bigint;
      seasonCount: number;
    }
  >();
  const chunkSize = 100;
  for (let startIndex = 0; startIndex < reputationRequests.length; startIndex += chunkSize) {
    const chunk = reputationRequests.slice(startIndex, startIndex + chunkSize);
    const accounts = await connection.getMultipleAccountsInfo(chunk.map((entry) => entry.pda), 'confirmed');
    for (let index = 0; index < chunk.length; index += 1) {
      const accountInfo = accounts[index];
      if (!accountInfo?.data) {
        continue;
      }
      const decoded = await decodeVineReputationAccount(new Uint8Array(accountInfo.data));
      if (!decoded || decoded.points <= BigInt(0)) {
        continue;
      }

      const daoId = chunk[index].daoId;
      const currentSeason = chunk[index].currentSeason;
      const seasonsAgo = Math.max(0, currentSeason - decoded.season);
      const multiplier = Math.pow(decayByDao.get(daoId) ?? 1, seasonsAgo);
      const effectivePointsNumber = bigintToSafeNumber(decoded.points);
      const effectivePoints =
        effectivePointsNumber === null ? decoded.points : BigInt(Math.round(effectivePointsNumber * multiplier));
      const current = reputationByDao.get(daoId);
      if (!current) {
        reputationByDao.set(daoId, {
          totalPoints: decoded.points,
          latestSeasonWithPoints: decoded.season,
          latestSeasonPoints: decoded.points,
          effectivePoints,
          seasonCount: 1
        });
        continue;
      }

      reputationByDao.set(daoId, {
        totalPoints: current.totalPoints + decoded.points,
        latestSeasonWithPoints: Math.max(current.latestSeasonWithPoints, decoded.season),
        latestSeasonPoints:
          decoded.season >= current.latestSeasonWithPoints ? decoded.points : current.latestSeasonPoints,
        effectivePoints: current.effectivePoints + effectivePoints,
        seasonCount: current.seasonCount + 1
      });
    }
  }

  const matchedSpaces = configs.filter((space) => reputationByDao.has(space.daoId));
  const metadataByDao = await fetchVineSpaceMetadata(connection, matchedSpaces);

  return matchedSpaces
    .map((space) => {
      const reputation = reputationByDao.get(space.daoId);
      if (!reputation) {
        return null;
      }

      const metadata = metadataByDao[space.daoId];
      return {
        daoId: space.daoId,
        repMint: space.repMint,
        currentSeason: space.currentSeason,
        latestSeasonWithPoints: reputation.latestSeasonWithPoints,
        seasonCount: reputation.seasonCount,
        points: reputation.totalPoints.toString(),
        latestSeasonPoints: reputation.latestSeasonPoints.toString(),
        effectivePoints: reputation.effectivePoints.toString(),
        metadataUri: metadata?.metadataUri ?? null,
        name: metadata?.name,
        symbol: metadata?.symbol,
        description: metadata?.description,
        imageUri: metadata?.imageUri
      };
    })
    .filter((entry): entry is WalletReputationResponse['spaces'][number] => !!entry)
    .sort((left, right) => {
      const leftPoints = BigInt(left.points);
      const rightPoints = BigInt(right.points);
      if (rightPoints > leftPoints) {
        return 1;
      }
      if (rightPoints < leftPoints) {
        return -1;
      }
      return left.daoId.localeCompare(right.daoId);
    });
}

async function fetchVerificationForWallet(
  connection: Connection,
  owner: PublicKey,
  trackedDaoIds: string[] = []
): Promise<WalletVerificationResponse['identities']> {
  const daoIds = Array.from(new Set(trackedDaoIds.map((entry) => entry.trim()).filter((entry) => !!entry)));
  if (daoIds.length === 0) {
    return [];
  }

  const spaceEntries = daoIds
    .map((daoId) => {
      const daoPk = tryParseSolanaPublicKey(daoId);
      if (!daoPk) {
        return null;
      }
      const [spacePda] = PublicKey.findProgramAddressSync(
        [utf8Bytes('space'), daoPk.toBytes()],
        VERIFICATION_REGISTRY_PROGRAM_ID
      );
      return { daoId, spacePda };
    })
    .filter((entry): entry is { daoId: string; spacePda: PublicKey } => !!entry);

  const identities: WalletVerificationResponse['identities'] = [];
  if (spaceEntries.length === 0) {
    return identities;
  }

  const linkDiscriminatorB64 = arrayBufferToBase64(await anchorAccountDiscriminator('GrapeVerificationLink'));
  const spaceAccounts = await connection.getMultipleAccountsInfo(spaceEntries.map((entry) => entry.spacePda), 'confirmed');

  for (let index = 0; index < spaceEntries.length; index += 1) {
    const spaceEntry = spaceEntries[index];
    const accountInfo = spaceAccounts[index];
    if (!accountInfo?.data) {
      continue;
    }

    const decodedSpace = await decodeVerificationSpaceAccount(new Uint8Array(accountInfo.data));
    if (!decodedSpace) {
      continue;
    }

    const walletHash = await sha256Bytes(concatBytes(decodedSpace.salt, utf8Bytes('wallet'), owner.toBytes()));
    const walletHashB64 = arrayBufferToBase64(walletHash);
    const linkAccounts = await connection.getProgramAccounts(VERIFICATION_REGISTRY_PROGRAM_ID, {
      commitment: 'confirmed',
      filters: [
        { memcmp: { offset: 0, bytes: linkDiscriminatorB64, encoding: 'base64' } },
        { memcmp: { offset: 41, bytes: walletHashB64, encoding: 'base64' } }
      ]
    });

    if (linkAccounts.length === 0) {
      continue;
    }

    const parsedLinks = await Promise.all(
      linkAccounts.map(async (account) => ({
        pubkey: account.pubkey.toBase58(),
        parsed: await decodeVerificationLinkAccount(new Uint8Array(account.account.data))
      }))
    );
    const validLinks = parsedLinks.filter(
      (entry): entry is { pubkey: string; parsed: VerificationLinkAccount } => !!entry.parsed
    );
    if (validLinks.length === 0) {
      continue;
    }

    const identityKeys = validLinks.map((entry) => new PublicKey(entry.parsed.identity));
    const identityAccounts = await connection.getMultipleAccountsInfo(identityKeys, 'confirmed');
    const linkedWalletCounts = new Map<string, number>();

    await Promise.all(
      identityKeys.map(async (identityKey) => {
        const linkedWallets = await connection.getProgramAccounts(VERIFICATION_REGISTRY_PROGRAM_ID, {
          commitment: 'confirmed',
          dataSlice: { offset: 0, length: 0 },
          filters: [
            { memcmp: { offset: 0, bytes: linkDiscriminatorB64, encoding: 'base64' } },
            { memcmp: { offset: 9, bytes: identityKey.toBase58() } }
          ]
        });
        linkedWalletCounts.set(identityKey.toBase58(), linkedWallets.length);
      })
    );

    for (let identityIndex = 0; identityIndex < identityAccounts.length; identityIndex += 1) {
      const identityAccount = identityAccounts[identityIndex];
      if (!identityAccount?.data) {
        continue;
      }

      const decodedIdentity = await decodeVerificationIdentityAccount(new Uint8Array(identityAccount.data));
      if (!decodedIdentity || decodedIdentity.space !== spaceEntry.spacePda.toBase58()) {
        continue;
      }

      const linkEntry = validLinks[identityIndex];
      identities.push({
        daoId: spaceEntry.daoId,
        spaceId: spaceEntry.spacePda.toBase58(),
        identityId: linkEntry.parsed.identity,
        linkId: linkEntry.pubkey,
        platform: getVerificationPlatform(decodedIdentity.platform),
        platformCode: decodedIdentity.platform,
        verified: decodedIdentity.verified,
        verifiedAt: decodedIdentity.verifiedAt && decodedIdentity.verifiedAt > 0 ? decodedIdentity.verifiedAt : null,
        expiresAt: decodedIdentity.expiresAt && decodedIdentity.expiresAt > 0 ? decodedIdentity.expiresAt : null,
        attestedBy: decodedIdentity.attestedBy,
        linkedAt: linkEntry.parsed.linkedAt && linkEntry.parsed.linkedAt > 0 ? linkEntry.parsed.linkedAt : null,
        linkedWalletCount: linkedWalletCounts.get(linkEntry.parsed.identity) ?? 1,
        currentWalletLinked: true,
        walletHashHex: bytesToHex(linkEntry.parsed.walletHash)
      });
    }
  }

  return sortVerificationIdentities(identities);
}

function parseVerificationNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function decodeGraphqlByteString(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
    return new Uint8Array(value);
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedHex = trimmed.startsWith('\\x')
    ? trimmed.slice(2)
    : trimmed.startsWith('0x')
      ? trimmed.slice(2)
      : trimmed;

  if (/^[0-9a-fA-F]+$/.test(normalizedHex) && normalizedHex.length % 2 === 0) {
    const bytes = new Uint8Array(normalizedHex.length / 2);
    for (let index = 0; index < normalizedHex.length; index += 2) {
      bytes[index / 2] = Number.parseInt(normalizedHex.slice(index, index + 2), 16);
    }
    return bytes;
  }

  try {
    return base64ToBytes(trimmed);
  } catch {
    return null;
  }
}

function matchesGraphqlByteString(value: unknown, expectedBytes: Uint8Array): boolean {
  const expectedBase64 = arrayBufferToBase64(expectedBytes);
  const expectedHex = bytesToHex(expectedBytes).toLowerCase();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed === expectedBase64) {
      return true;
    }

    const normalizedHex = trimmed.startsWith('\\x')
      ? trimmed.slice(2)
      : trimmed.startsWith('0x')
        ? trimmed.slice(2)
        : trimmed;
    if (normalizedHex.toLowerCase() === expectedHex) {
      return true;
    }
  }

  const decoded = decodeGraphqlByteString(value);
  return decoded ? bytesToHex(decoded).toLowerCase() === expectedHex : false;
}

function sortVerificationIdentities(
  identities: WalletVerificationResponse['identities']
): WalletVerificationResponse['identities'] {
  return identities.sort((left, right) => {
    if (left.verified !== right.verified) {
      return left.verified ? -1 : 1;
    }
    if ((right.linkedAt ?? 0) !== (left.linkedAt ?? 0)) {
      return (right.linkedAt ?? 0) - (left.linkedAt ?? 0);
    }
    if (left.daoId !== right.daoId) {
      return left.daoId.localeCompare(right.daoId);
    }
    return left.platform.localeCompare(right.platform);
  });
}

function buildVerificationSpacesQuery(spacePubkeys: string[]): string {
  const ids = spacePubkeys.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query VerificationSpaces {
      ${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationSpace(where: {pubkey: {_in: [${ids}]}}) {
        pubkey
        daoId
        salt
      }
    }
  `;
}

function buildVerificationIdentitiesBySpaceQuery(spacePubkeys: string[]): string {
  const ids = spacePubkeys.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query VerificationIdentitiesBySpace {
      ${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationIdentity(limit: 5000, where: {space: {_in: [${ids}]}}) {
        pubkey
        space
        platform
        verified
        verifiedAt
        expiresAt
        attestedBy
      }
    }
  `;
}

function buildVerificationLinksByIdentityQuery(identityPubkeys: string[]): string {
  const ids = identityPubkeys.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query VerificationLinksByIdentity {
      ${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationLink(limit: 5000, where: {identity: {_in: [${ids}]}}) {
        pubkey
        identity
        linkedAt
        walletHash
      }
    }
  `;
}

async function fetchVerificationForWalletIndexed(
  owner: PublicKey,
  trackedDaoIds: string[] = []
): Promise<WalletVerificationResponse['identities']> {
  const daoIds = Array.from(new Set(trackedDaoIds.map((entry) => entry.trim()).filter((entry) => !!entry)));
  if (daoIds.length === 0) {
    return [];
  }

  const requestedSpaces = daoIds
    .map((daoId) => {
      const daoPk = tryParseSolanaPublicKey(daoId);
      if (!daoPk) {
        return null;
      }
      const [spacePda] = PublicKey.findProgramAddressSync(
        [utf8Bytes('space'), daoPk.toBytes()],
        VERIFICATION_REGISTRY_PROGRAM_ID
      );
      return { daoId, spacePda: spacePda.toBase58() };
    })
    .filter((entry): entry is { daoId: string; spacePda: string } => !!entry);

  if (requestedSpaces.length === 0) {
    return [];
  }

  const requestedSpaceByPubkey = new Map(requestedSpaces.map((entry) => [entry.spacePda, entry] as const));
  const spacesData = await fetchGovernanceGraphql<Record<string, GraphqlVerificationSpaceRow[]>>(
    buildVerificationSpacesQuery(requestedSpaces.map((entry) => entry.spacePda))
  );
  const spaceRows = Array.isArray(spacesData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationSpace`])
    ? spacesData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationSpace`]
    : [];

  const walletHashBySpace = new Map<string, Uint8Array>();
  for (const row of spaceRows) {
    const pubkey = typeof row.pubkey === 'string' ? row.pubkey.trim() : '';
    if (!pubkey || !requestedSpaceByPubkey.has(pubkey)) {
      continue;
    }

    const salt = decodeGraphqlByteString(row.salt);
    if (!salt || salt.length === 0) {
      continue;
    }

    const walletHash = await sha256Bytes(concatBytes(salt, utf8Bytes('wallet'), owner.toBytes()));
    walletHashBySpace.set(pubkey, walletHash);
  }

  const spacePubkeys = Array.from(walletHashBySpace.keys());
  if (spacePubkeys.length === 0) {
    return [];
  }

  const identityData = await fetchGovernanceGraphql<Record<string, GraphqlVerificationIdentityRow[]>>(
    buildVerificationIdentitiesBySpaceQuery(spacePubkeys)
  );
  const identityRows = Array.isArray(identityData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationIdentity`])
    ? identityData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationIdentity`]
    : [];
  const identityPubkeys = Array.from(new Set(identityRows.map((entry) => (typeof entry.pubkey === 'string' ? entry.pubkey.trim() : '')).filter((entry) => !!entry)));

  if (identityPubkeys.length === 0) {
    return [];
  }

  const linksData = await fetchGovernanceGraphql<Record<string, GraphqlVerificationLinkRow[]>>(
    buildVerificationLinksByIdentityQuery(identityPubkeys)
  );
  const identityLinks = Array.isArray(linksData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationLink`])
    ? linksData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationLink`]
    : [];

  const walletLinksByIdentity = new Map<string, GraphqlVerificationLinkRow[]>();
  for (const link of identityLinks) {
    const identity = typeof link.identity === 'string' ? link.identity.trim() : '';
    if (!identity) {
      continue;
    }
    const existing = walletLinksByIdentity.get(identity);
    if (existing) {
      existing.push(link);
    } else {
      walletLinksByIdentity.set(identity, [link]);
    }
  }

  const linkedWalletCounts = new Map<string, number>();
  for (const link of identityLinks) {
    const identity = typeof link.identity === 'string' ? link.identity.trim() : '';
    if (!identity) {
      continue;
    }
    linkedWalletCounts.set(identity, (linkedWalletCounts.get(identity) ?? 0) + 1);
  }

  const identities: WalletVerificationResponse['identities'] = [];
  for (const row of identityRows) {
    const identityId = typeof row.pubkey === 'string' ? row.pubkey.trim() : '';
    const spaceId = typeof row.space === 'string' ? row.space.trim() : '';
    if (!identityId || !spaceId) {
      continue;
    }

    const requestedSpace = requestedSpaceByPubkey.get(spaceId);
    const expectedWalletHash = walletHashBySpace.get(spaceId);
    if (!requestedSpace || !expectedWalletHash) {
      continue;
    }

    // Shyft exposes walletHash as a byte-like column. Query links by identity and
    // compare the hash locally instead of relying on a GraphQL equality filter.
    const matchingLinks = (walletLinksByIdentity.get(identityId) ?? []).filter((entry) =>
      matchesGraphqlByteString(entry.walletHash, expectedWalletHash)
    );
    if (matchingLinks.length === 0) {
      continue;
    }

    for (const link of matchingLinks) {
      const linkId = typeof link.pubkey === 'string' ? link.pubkey.trim() : '';
      if (!linkId) {
        continue;
      }

      identities.push({
        daoId: requestedSpace.daoId,
        spaceId,
        identityId,
        linkId,
        platform: getVerificationPlatform(Number(row.platform ?? -1)),
        platformCode: Number(row.platform ?? -1),
        verified: row.verified === true,
        verifiedAt: parseVerificationNumber(row.verifiedAt),
        expiresAt: parseVerificationNumber(row.expiresAt),
        attestedBy: typeof row.attestedBy === 'string' && row.attestedBy.trim() ? row.attestedBy.trim() : null,
        linkedAt: parseVerificationNumber(link.linkedAt),
        linkedWalletCount: linkedWalletCounts.get(identityId) ?? matchingLinks.length,
        currentWalletLinked: true,
        walletHashHex: bytesToHex(expectedWalletHash)
      });
    }
  }

  return sortVerificationIdentities(identities);
}

function findGovernanceOwnerByDao(daoId: string): GovernanceOwner {
  return (
    GOVERNANCE_OWNERS.find((entry) => entry.dao === daoId) ?? {
      owner: DEFAULT_GOVERNANCE_PROGRAM_ID,
      name: DEFAULT_GOVERNANCE_PROGRAM_ID,
      dao: daoId
    }
  );
}

async function resolveGovernanceProgramVersion(
  connection: Connection,
  programId: PublicKey,
  realmPk: PublicKey
): Promise<number> {
  const programIdValue = programId.toBase58();

  try {
    const detectedVersion = await getGovernanceProgramVersion(connection, programId);
    if (detectedVersion > GOVERNANCE_PROGRAM_VERSION_V1) {
      return detectedVersion;
    }
  } catch {
    // Some RPC endpoints fail the metadata/simulation probe and spl-governance falls back to v1.
  }

  if (programIdValue === DEFAULT_GOVERNANCE_PROGRAM_ID) {
    return GOVERNANCE_PROGRAM_VERSION_V3;
  }

  if (GOVERNANCE_OWNERS.some((entry) => entry.owner === programIdValue)) {
    return GOVERNANCE_PROGRAM_VERSION_V2;
  }

  try {
    const realmConfigPk = await getRealmConfigAddress(programId, realmPk);
    const realmConfigInfo = await connection.getAccountInfo(realmConfigPk, 'confirmed');
    if (realmConfigInfo) {
      return GOVERNANCE_PROGRAM_VERSION_V2;
    }
  } catch {
    // Ignore and keep the conservative fallback below.
  }

  return GOVERNANCE_PROGRAM_VERSION_V1;
}

function getGovernanceNamespaces(): Array<{ namespace: string; programId: string }> {
  const seen = new Set<string>();
  const entries = [
    { namespace: DEFAULT_GOVERNANCE_PROGRAM_ID, programId: DEFAULT_GOVERNANCE_PROGRAM_ID },
    ...GOVERNANCE_OWNERS.map((entry) => ({ namespace: entry.name, programId: entry.owner }))
  ];

  return entries.filter((entry) => {
    const key = `${entry.namespace}:${entry.programId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchGovernanceRealmDirectory(): Promise<GovernanceRealmInfo[]> {
  if (governanceRealmDirectoryCache && governanceRealmDirectoryCache.expiresAt > Date.now()) {
    return governanceRealmDirectoryCache.realms;
  }

  const realms = (
    await Promise.all(
      getGovernanceNamespaces().map(async ({ namespace }) => {
        let offset = 0;
        const collected: GovernanceRealmInfo[] = [];

        while (offset < 10000) {
          let page: Record<string, unknown>;
          try {
            page = await fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceRealmDirectoryQuery(namespace, offset));
          } catch {
            break;
          }

          const pageV2 = Array.isArray(page[`${namespace}_RealmV2`]) ? (page[`${namespace}_RealmV2`] as Array<Record<string, unknown>>) : [];
          const pageV1 = Array.isArray(page[`${namespace}_RealmV1`]) ? (page[`${namespace}_RealmV1`] as Array<Record<string, unknown>>) : [];

          collected.push(
            ...[...pageV2, ...pageV1]
              .map((row) => {
                const daoId = typeof row.pubkey === 'string' ? row.pubkey.trim() : '';
                if (!daoId) {
                  return null;
                }

                return normalizeGovernanceRealmInfo(
                  {
                    [`${namespace}_RealmV2`]: [row]
                  },
                  namespace,
                  daoId
                );
              })
              .filter((entry): entry is GovernanceRealmInfo => !!entry)
          );

          if (pageV2.length < GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE && pageV1.length < GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE) {
            break;
          }

          offset += GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE;
        }

        return collected;
      })
    )
  )
    .flat()
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.daoId === entry.daoId) === index);

  governanceRealmDirectoryCache = {
    expiresAt: Date.now() + GOVERNANCE_REALM_DIRECTORY_CACHE_TTL_MS,
    realms
  };

  return realms;
}

function escapeGraphqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseGovernanceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^0x/i.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGovernanceBigIntString(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value)).toString();
  }
  if (typeof value !== 'string') {
    return '0';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '0';
  }
  try {
    return BigInt(trimmed).toString();
  } catch {
    try {
      return BigInt(`0x${trimmed.replace(/^0x/i, '')}`).toString();
    } catch {
      return '0';
    }
  }
}

function formatProposalStateLabel(stateCode: number): string {
  switch (stateCode) {
    case ProposalState.Draft:
      return 'Draft';
    case ProposalState.SigningOff:
      return 'Signing Off';
    case ProposalState.Voting:
      return 'Voting';
    case ProposalState.Succeeded:
      return 'Succeeded';
    case ProposalState.Executing:
      return 'Executing';
    case ProposalState.Completed:
      return 'Completed';
    case ProposalState.Cancelled:
      return 'Cancelled';
    case ProposalState.Defeated:
      return 'Defeated';
    case ProposalState.ExecutingWithErrors:
      return 'Executing With Errors';
    case ProposalState.Vetoed:
      return 'Vetoed';
    default:
      return 'Unknown';
  }
}

function parseGovernanceStateCode(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) {
      return n;
    }
    const stateMap: Record<string, number> = {
      draft: 0,
      signingoff: 1,
      voting: 2,
      succeeded: 3,
      executing: 4,
      completed: 5,
      cancelled: 6,
      defeated: 7,
      executingwitherrors: 8,
      vetoed: 9
    };
    const key = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
    return stateMap[key] ?? -1;
  }
  return -1;
}

function isActiveGovernanceProposalState(stateCode: number): boolean {
  return stateCode === ProposalState.Draft || stateCode === ProposalState.SigningOff || stateCode === ProposalState.Voting;
}

function isRecentGovernanceProposal(referenceTimestamp: number | null, recentWindowSeconds = 60 * 60 * 24 * 30): boolean {
  if (!referenceTimestamp || referenceTimestamp <= 0) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return referenceTimestamp >= now - recentWindowSeconds;
}

function shouldDisplayGovernanceProposal(input: {
  stateCode: number;
  draftAt: number | null;
  votingAt: number | null;
  maxVotingTime?: number | null;
}) {
  const votingEndsAt =
    input.votingAt !== null && input.maxVotingTime !== null && input.maxVotingTime !== undefined
      ? input.votingAt + input.maxVotingTime
      : null;

  if (input.stateCode === ProposalState.Voting) {
    if (!votingEndsAt) {
      return true;
    }
    return isRecentGovernanceProposal(votingEndsAt, 60 * 60 * 24 * 7);
  }

  if (isActiveGovernanceProposalState(input.stateCode)) {
    return true;
  }

  return isRecentGovernanceProposal(votingEndsAt ?? input.votingAt ?? input.draftAt);
}

function compareGovernanceProposalDisplayOrder(
  left: WalletGovernanceResponse['proposals'][number],
  right: WalletGovernanceResponse['proposals'][number]
) {
  const leftActive = isActiveGovernanceProposalState(left.stateCode) ? 1 : 0;
  const rightActive = isActiveGovernanceProposalState(right.stateCode) ? 1 : 0;
  if (leftActive !== rightActive) {
    return rightActive - leftActive;
  }

  return (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0);
}

function limitGovernanceProposalsForDisplay(
  proposals: WalletGovernanceResponse['proposals'],
  maxProposals = 50
): WalletGovernanceResponse['proposals'] {
  const deduped = new Map<string, WalletGovernanceResponse['proposals'][number]>();
  for (const proposal of proposals) {
    if (!proposal?.proposalId) {
      continue;
    }
    if (!deduped.has(proposal.proposalId)) {
      deduped.set(proposal.proposalId, proposal);
      continue;
    }

    const existing = deduped.get(proposal.proposalId);
    if (existing && compareGovernanceProposalDisplayOrder(proposal, existing) < 0) {
      deduped.set(proposal.proposalId, proposal);
    }
  }

  const sorted = Array.from(deduped.values()).sort(compareGovernanceProposalDisplayOrder);
  const active = sorted.filter((proposal) => isActiveGovernanceProposalState(proposal.stateCode));
  if (active.length >= maxProposals) {
    return active;
  }

  const activeIds = new Set(active.map((proposal) => proposal.proposalId));
  const recent = sorted.filter((proposal) => !activeIds.has(proposal.proposalId));
  return [...active, ...recent.slice(0, maxProposals - active.length)];
}

async function fetchGovernanceGraphql<T>(query: string): Promise<T> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(GOVERNANCE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'gzip'
      },
      body: JSON.stringify({ query }),
      cache: 'no-store'
    });

    if (!response.ok) {
      lastStatus = response.status;
      if (!GRAPHQL_RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
        throw new Error(`GraphQL request failed with ${response.status}.`);
      }
      await delay(250 * attempt);
      continue;
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
    }

    if (!payload.data) {
      throw new Error('GraphQL response did not include data.');
    }

    return payload.data;
  }

  throw new Error(`GraphQL request failed with ${lastStatus ?? 'unknown status'}.`);
}

function buildGovernanceRealmQuery(namespace: string, daoId: string): string {
  const escapedDaoId = escapeGraphqlString(daoId);
  return `
    query GovernanceRealm {
      ${namespace}_RealmV2(where: {pubkey: {_eq: "${escapedDaoId}"}}) {
        pubkey
        name
        communityMint
        config
      }
      ${namespace}_RealmV1(where: {pubkey: {_eq: "${escapedDaoId}"}}) {
        pubkey
        name
        communityMint
        config
      }
    }
  `;
}

function buildGovernanceGovernedAccountQuery(namespace: string, governedAccount: string): string {
  const escaped = escapeGraphqlString(governedAccount);
  return `
    query GovernanceByGovernedAccount {
      ${namespace}_GovernanceV2(limit: 200, where: {governedAccount: {_eq: "${escaped}"}}) {
        pubkey
        realm
      }
      ${namespace}_GovernanceV1(limit: 200, where: {governedAccount: {_eq: "${escaped}"}}) {
        pubkey
        realm
      }
    }
  `;
}

function buildGovernanceAllAccountsQuery(namespace: string, offset = 0): string {
  return `
    query GovernanceAllAccounts {
      ${namespace}_GovernanceV2(limit: 1000, offset: ${offset}) {
        pubkey
        realm
      }
      ${namespace}_GovernanceV1(limit: 1000, offset: ${offset}) {
        pubkey
        realm
      }
    }
  `;
}

function normalizeGovernanceGovernedDaoIds(data: Record<string, unknown>, namespace: string): string[] {
  const rows = [
    ...(Array.isArray(data[`${namespace}_GovernanceV2`]) ? (data[`${namespace}_GovernanceV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_GovernanceV1`]) ? (data[`${namespace}_GovernanceV1`] as Array<Record<string, unknown>>) : [])
  ];
  return Array.from(
    new Set(
      rows
        .map((row) => (typeof row.realm === 'string' && row.realm ? row.realm : ''))
        .filter((r) => !!r)
    )
  );
}

async function discoverGovernanceTreasuryDaosForNamespace(
  owner: PublicKey,
  namespace: string,
  programId: string
): Promise<string[]> {
  const programPk = new PublicKey(programId);
  const ownerKey = owner.toBase58();
  const treasuryRealms = new Set<string>();

  // Paginate through all governance accounts (Shyft caps at 1000 rows per page)
  // Default namespace has ~6200+ accounts, so we need up to 7 pages
  for (let offset = 0; offset < 10000; offset += 1000) {
    const data = await fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceAllAccountsQuery(namespace, offset));
    const v2 = Array.isArray(data[`${namespace}_GovernanceV2`]) ? (data[`${namespace}_GovernanceV2`] as Array<Record<string, unknown>>) : [];
    const v1 = Array.isArray(data[`${namespace}_GovernanceV1`]) ? (data[`${namespace}_GovernanceV1`] as Array<Record<string, unknown>>) : [];
    const rows = [...v2, ...v1];

    if (rows.length === 0) break;

    for (const row of rows) {
      const govPubkey = typeof row.pubkey === 'string' ? row.pubkey : null;
      const realm = typeof row.realm === 'string' ? row.realm : null;
      if (!govPubkey || !realm) continue;
      try {
        const treasury = await getNativeTreasuryAddress(programPk, new PublicKey(govPubkey));
        if (treasury.toBase58() === ownerKey) {
          treasuryRealms.add(realm);
        }
      } catch {
        continue;
      }
    }

    // Stop if the last page was not full (no more data)
    if (v2.length < 1000 && v1.length < 1000) break;
  }

  return Array.from(treasuryRealms);
}

function buildGovernanceDirectMemberQuery(namespace: string, owner: string, offset = 0): string {
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceDirectMembers {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        offset: ${offset},
        where: { governingTokenOwner: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        offset: ${offset},
        where: { governingTokenOwner: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceDelegateQuery(namespace: string, owner: string, offset = 0): string {
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceDelegateRecords {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        offset: ${offset},
        where: { governanceDelegate: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        offset: ${offset},
        where: { governanceDelegate: {_eq: "${escapedOwner}"} }
      ) {
        pubkey
        realm
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceMembershipQuery(namespace: string, daoId: string, owner: string): string {
  const escapedDaoId = escapeGraphqlString(daoId);
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceMembership {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          _or: [
            { governingTokenOwner: {_eq: "${escapedOwner}"} },
            { governanceDelegate: {_eq: "${escapedOwner}"} }
          ]
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          _or: [
            { governingTokenOwner: {_eq: "${escapedOwner}"} },
            { governanceDelegate: {_eq: "${escapedOwner}"} }
          ]
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceScopedDirectMembershipQuery(namespace: string, daoId: string, owner: string): string {
  const escapedDaoId = escapeGraphqlString(daoId);
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceScopedDirectMembership {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governingTokenOwner: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governingTokenOwner: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceScopedDelegateMembershipQuery(namespace: string, daoId: string, owner: string): string {
  const escapedDaoId = escapeGraphqlString(daoId);
  const escapedOwner = escapeGraphqlString(owner);
  return `
    query GovernanceScopedDelegateMembership {
      ${namespace}_TokenOwnerRecordV2(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governanceDelegate: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
      ${namespace}_TokenOwnerRecordV1(
        limit: 1000,
        where: {
          realm: {_eq: "${escapedDaoId}"},
          governanceDelegate: {_eq: "${escapedOwner}"}
        }
      ) {
        pubkey
        governingTokenMint
        governingTokenOwner
        governanceDelegate
        governingTokenDepositAmount
      }
    }
  `;
}

function buildGovernanceAccountsQuery(namespace: string, daoId: string): string {
  const escapedDaoId = escapeGraphqlString(daoId);
  return `
    query GovernanceAccounts {
      ${namespace}_GovernanceV2(limit: 500, where: {realm: {_eq: "${escapedDaoId}"}}) {
        pubkey
        realm
        config
      }
      ${namespace}_GovernanceV1(limit: 500, where: {realm: {_eq: "${escapedDaoId}"}}) {
        pubkey
        realm
        config
      }
    }
  `;
}

function buildGovernanceProposalsQuery(namespace: string, governanceIds: string[]): string {
  const ids = governanceIds.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query GovernanceProposals {
      ${namespace}_ProposalV2(
        limit: 500,
        order_by: {draftAt: desc},
        where: {governance: {_in: [${ids}]}}
      ) {
        pubkey
        governance
        governingTokenMint
        tokenOwnerRecord
        state
        descriptionLink
        draftAt
        votingAt
        maxVotingTime
        name
        options
        denyVoteWeight
        abstainVoteWeight
      }
      ${namespace}_ProposalV1(
        limit: 500,
        order_by: {draftAt: desc},
        where: {governance: {_in: [${ids}]}}
      ) {
        pubkey
        governance
        governingTokenMint
        tokenOwnerRecord
        state
        descriptionLink
        draftAt
        votingAt
        name
        yesVotesCount
        noVotesCount
      }
    }
  `;
}

function buildGovernanceVoteRecordsQuery(namespace: string, owners: string[]): string {
  const ownerList = owners.map((o) => `"${escapeGraphqlString(o)}"`).join(', ');
  return `
    query GovernanceVotesByOwner {
      ${namespace}_VoteRecordV2(limit: 5000, where: {governingTokenOwner: {_in: [${ownerList}]}}) {
        proposal
        governingTokenOwner
      }
      ${namespace}_VoteRecordV1(limit: 5000, where: {governingTokenOwner: {_in: [${ownerList}]}}) {
        proposal
        governingTokenOwner
      }
    }
  `;
}

function buildGovernanceRealmDirectoryQuery(namespace: string, offset = 0) {
  return `
    query GovernanceRealmDirectory {
      ${namespace}_RealmV2(limit: ${GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE}, offset: ${offset}) {
        pubkey
        name
        communityMint
        config
      }
      ${namespace}_RealmV1(limit: ${GOVERNANCE_REALM_DIRECTORY_PAGE_SIZE}, offset: ${offset}) {
        pubkey
        name
        communityMint
        config
      }
    }
  `;
}

function buildEmptyGovernanceMembershipResponse(namespace: string): Record<string, unknown> {
  return {
    [`${namespace}_TokenOwnerRecordV2`]: [],
    [`${namespace}_TokenOwnerRecordV1`]: []
  };
}

function normalizeGovernanceRealmInfo(
  data: Record<string, unknown>,
  namespace: string,
  daoId: string
): GovernanceRealmInfo | null {
  const v2 = Array.isArray(data[`${namespace}_RealmV2`]) ? (data[`${namespace}_RealmV2`] as Array<Record<string, unknown>>) : [];
  const v1 = Array.isArray(data[`${namespace}_RealmV1`]) ? (data[`${namespace}_RealmV1`] as Array<Record<string, unknown>>) : [];
  const row = v2[0] ?? v1[0];
  if (!row) {
    return null;
  }

  const communityMint = typeof row.communityMint === 'string' ? row.communityMint : null;
  if (!communityMint) {
    return null;
  }

  return {
    daoId,
    name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `DAO ${daoId.slice(0, 4)}`,
    communityMint,
    councilMint: typeof (row.config as Record<string, unknown> | undefined)?.councilMint === 'string'
      ? ((row.config as Record<string, unknown>).councilMint as string)
      : null
  };
}

function normalizeGovernanceMembershipRecords(
  data: Record<string, unknown>,
  namespace: string
): GovernanceMembershipRecord[] {
  const rows = [
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV2`]) ? (data[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV1`]) ? (data[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  const normalized = rows
    .map((row) => {
      const pubkey = typeof row.pubkey === 'string' ? row.pubkey : null;
      const governingTokenMint = typeof row.governingTokenMint === 'string' ? row.governingTokenMint : null;
      const governingTokenOwner = typeof row.governingTokenOwner === 'string' ? row.governingTokenOwner : null;
      if (!pubkey || !governingTokenMint || !governingTokenOwner) {
        return null;
      }

      return {
        pubkey,
        governingTokenMint,
        governingTokenOwner,
        governanceDelegate: typeof row.governanceDelegate === 'string' ? row.governanceDelegate : null,
        governingTokenDepositAmount: parseGovernanceBigIntString(row.governingTokenDepositAmount)
      } satisfies GovernanceMembershipRecord;
    })
    .filter((entry): entry is GovernanceMembershipRecord => !!entry);

  return Array.from(new Map(normalized.map((entry) => [entry.pubkey, entry] as const)).values());
}

function normalizeGovernanceOwnerDaoIds(
  data: Record<string, unknown>,
  namespace: string,
  ownerKey: string
): { directDaoIds: string[]; delegateDaoIds: string[] } {
  const rows = [
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV2`]) ? (data[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_TokenOwnerRecordV1`]) ? (data[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  const directDaoIds = new Set<string>();
  const delegateDaoIds = new Set<string>();

  for (const row of rows) {
    const realm = typeof row.realm === 'string' ? row.realm : '';
    if (!realm) {
      continue;
    }
    const isDelegate = typeof row.governanceDelegate === 'string' && row.governanceDelegate === ownerKey;
    const isDirect = typeof row.governingTokenOwner === 'string' && row.governingTokenOwner === ownerKey;

    if (isDelegate && !isDirect) {
      // Wallet is a delegate for this DAO — include regardless of own deposit
      delegateDaoIds.add(realm);
    } else if (isDirect) {
      directDaoIds.add(realm);
    }
  }

  // A direct member DAO should not also appear in delegateDaos
  for (const id of directDaoIds) {
    delegateDaoIds.delete(id);
  }

  return {
    directDaoIds: Array.from(directDaoIds),
    delegateDaoIds: Array.from(delegateDaoIds)
  };
}

async function discoverGovernanceDaoOwnersForWallet(
  connection: Connection,
  owner: PublicKey
): Promise<Map<string, { owner: GovernanceOwner; isDelegate: boolean; isNonMember: boolean }>> {
  const ownerKey = owner.toBase58();
  const discovered = await Promise.all(
    getGovernanceNamespaces().map(async ({ namespace, programId }) => {
      type Entry = { daoId: string; isDelegate: boolean; isNonMember: boolean; owner: GovernanceOwner };
      const governanceOwner = { owner: programId, name: namespace } as Omit<GovernanceOwner, 'dao'>;
      const makeEntry = (daoId: string, isDelegate: boolean, isNonMember: boolean): Entry => ({
        daoId,
        isDelegate,
        isNonMember,
        owner: { ...governanceOwner, dao: daoId } satisfies GovernanceOwner
      });

      try {
        const programKey = new PublicKey(programId);
        // Delegate is an Option<Pubkey> at byte 109; the pubkey begins after its tag.
        const [directRecords, delegateRecords, treasuryDaoIds] = await Promise.all([
          getTokenOwnerRecordsByOwner(connection, programKey, owner).catch(() => []),
          getGovernanceAccounts(connection, programKey, TokenOwnerRecord, [
            new MemcmpFilter(110, owner.toBuffer())
          ]).catch(() => []),
          discoverGovernanceTreasuryDaosForNamespace(owner, namespace, programId).catch(() => [])
        ]);
        const directDaoIds = Array.from(new Set(directRecords.map((entry) => entry.account.realm.toBase58())));
        const directDaoSet = new Set(directDaoIds);
        const delegateDaoIds = Array.from(new Set(
          delegateRecords
            .filter((entry) => entry.account.governingTokenOwner.toBase58() !== ownerKey)
            .map((entry) => entry.account.realm.toBase58())
        )).filter((id) => !directDaoSet.has(id));
        const governedDaoIds = treasuryDaoIds.filter(
          (id) => !directDaoSet.has(id) && !delegateDaoIds.includes(id)
        );

        const entries: Entry[] = [
          ...directDaoIds.map((id) => makeEntry(id, false, false)),
          ...delegateDaoIds.map((id) => makeEntry(id, true, false)),
          ...governedDaoIds.map((id) => makeEntry(id, false, true))
        ];

        return entries;
      } catch {
        return [] as Entry[];
      }
    })
  );

  const mapping = new Map<string, { owner: GovernanceOwner; isDelegate: boolean; isNonMember: boolean }>();
  discovered.flat().forEach((entry) => {
    if (!mapping.has(entry.daoId)) {
      mapping.set(entry.daoId, { owner: entry.owner, isDelegate: entry.isDelegate, isNonMember: entry.isNonMember });
    }
  });

  return mapping;
}

async function resolveGovernanceOwnerByRealm(connection: Connection, daoId: string): Promise<GovernanceOwner> {
  const mapped = GOVERNANCE_OWNERS.find((entry) => entry.dao === daoId);
  if (mapped) {
    return mapped;
  }

  for (const { namespace, programId } of getGovernanceNamespaces()) {
    try {
      const realmAccount = await connection.getAccountInfo(new PublicKey(daoId), 'confirmed');
      if (realmAccount?.owner.equals(new PublicKey(programId))) {
        return {
          owner: programId,
          name: namespace,
          dao: daoId
        };
      }
    } catch {
      continue;
    }
  }

  return {
    owner: DEFAULT_GOVERNANCE_PROGRAM_ID,
    name: DEFAULT_GOVERNANCE_PROGRAM_ID,
    dao: daoId
  };
}

function normalizeGovernanceAccounts(
  data: Record<string, unknown>,
  namespace: string
): GovernanceProgramAccount[] {
  const rows = [
    ...(Array.isArray(data[`${namespace}_GovernanceV2`]) ? (data[`${namespace}_GovernanceV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_GovernanceV1`]) ? (data[`${namespace}_GovernanceV1`] as Array<Record<string, unknown>>) : [])
  ];

  return rows
    .map((row) => {
      const pubkey = typeof row.pubkey === 'string' ? row.pubkey : null;
      const realm = typeof row.realm === 'string' ? row.realm : null;
      const baseVotingTimeRaw = (row.config as Record<string, unknown> | undefined)?.baseVotingTime;
      return pubkey && realm ? ({
        pubkey,
        realm,
        baseVotingTime: parseGovernanceNumber(baseVotingTimeRaw)
      } satisfies GovernanceProgramAccount) : null;
    })
    .filter((entry): entry is GovernanceProgramAccount => !!entry);
}

function normalizeGovernanceProposalRows(
  data: Record<string, unknown>,
  namespace: string
): GovernanceProposalRecord[] {
  const v2Rows = Array.isArray(data[`${namespace}_ProposalV2`]) ? (data[`${namespace}_ProposalV2`] as Array<Record<string, unknown>>) : [];
  const v1Rows = Array.isArray(data[`${namespace}_ProposalV1`]) ? (data[`${namespace}_ProposalV1`] as Array<Record<string, unknown>>) : [];

  const mappedV2 = v2Rows.map((row) => {
    const options = Array.isArray(row.options)
      ? row.options.map((option, index) => {
          const item = option as Record<string, unknown>;
          return {
            rank: index,
            label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : `Option ${index + 1}`,
            voteWeight: parseGovernanceBigIntString(item.voteWeight),
            voteResult: typeof item.voteResult === 'string' ? item.voteResult : null
          };
        })
      : [];

    return {
      pubkey: typeof row.pubkey === 'string' ? row.pubkey : '',
      governance: typeof row.governance === 'string' ? row.governance : '',
      governingTokenMint: typeof row.governingTokenMint === 'string' ? row.governingTokenMint : '',
      tokenOwnerRecord: typeof row.tokenOwnerRecord === 'string' ? row.tokenOwnerRecord : '',
      state: parseGovernanceStateCode(row.state),
      descriptionLink: typeof row.descriptionLink === 'string' ? row.descriptionLink : null,
      name: typeof row.name === 'string' ? row.name : 'Untitled proposal',
      draftAt: parseGovernanceNumber(row.draftAt),
      votingAt: parseGovernanceNumber(row.votingAt),
      maxVotingTime: parseGovernanceNumber(row.maxVotingTime),
      yesVotes: options[0]?.voteWeight ?? '0',
      noVotes: '0',
      abstainVotes: parseGovernanceBigIntString(row.abstainVoteWeight),
      denyVotes: parseGovernanceBigIntString(row.denyVoteWeight),
      options,
      hasDenyOption: row.denyVoteWeight !== undefined && row.denyVoteWeight !== null
    } satisfies GovernanceProposalRecord;
  });

  const mappedV1 = v1Rows.map((row) => ({
    pubkey: typeof row.pubkey === 'string' ? row.pubkey : '',
    governance: typeof row.governance === 'string' ? row.governance : '',
    governingTokenMint: typeof row.governingTokenMint === 'string' ? row.governingTokenMint : '',
    tokenOwnerRecord: typeof row.tokenOwnerRecord === 'string' ? row.tokenOwnerRecord : '',
    state: parseGovernanceStateCode(row.state),
    descriptionLink: typeof row.descriptionLink === 'string' ? row.descriptionLink : null,
    name: typeof row.name === 'string' ? row.name : 'Untitled proposal',
    draftAt: parseGovernanceNumber(row.draftAt),
    votingAt: parseGovernanceNumber(row.votingAt),
    maxVotingTime: parseGovernanceNumber(row.maxVotingTime),
    yesVotes: parseGovernanceBigIntString(row.yesVotesCount),
    noVotes: parseGovernanceBigIntString(row.noVotesCount),
    abstainVotes: '0',
    denyVotes: '0',
    options: [{ rank: 0, label: 'Approve', voteWeight: parseGovernanceBigIntString(row.yesVotesCount), voteResult: null }],
    hasDenyOption: true
  } satisfies GovernanceProposalRecord));

  return [...mappedV2, ...mappedV1].filter(
    (row) =>
      row.pubkey &&
      row.governance &&
      row.governingTokenMint &&
      shouldDisplayGovernanceProposal({
        stateCode: row.state,
        draftAt: row.draftAt,
        votingAt: row.votingAt,
        maxVotingTime: row.maxVotingTime
      })
  );
}

function normalizeGovernanceVoteOwnersByProposal(
  data: Record<string, unknown>,
  namespace: string
): Map<string, Set<string>> {
  const rows = [
    ...(Array.isArray(data[`${namespace}_VoteRecordV2`]) ? (data[`${namespace}_VoteRecordV2`] as Array<Record<string, unknown>>) : []),
    ...(Array.isArray(data[`${namespace}_VoteRecordV1`]) ? (data[`${namespace}_VoteRecordV1`] as Array<Record<string, unknown>>) : [])
  ];

  const votesByProposal = new Map<string, Set<string>>();
  for (const row of rows) {
    const proposal = typeof row.proposal === 'string' ? row.proposal : '';
    const governingTokenOwner = typeof row.governingTokenOwner === 'string' ? row.governingTokenOwner : '';
    if (!proposal || !governingTokenOwner) {
      continue;
    }
    if (!votesByProposal.has(proposal)) {
      votesByProposal.set(proposal, new Set<string>());
    }
    votesByProposal.get(proposal)?.add(governingTokenOwner);
  }

  return votesByProposal;
}

function getGovernanceEligibleVoteMemberships(
  proposalMint: string,
  ownerKey: string,
  memberships: GovernanceMembershipRecord[]
) {
  return memberships
    .filter((membership) => membership.governingTokenMint === proposalMint)
    .filter((membership) => BigInt(membership.governingTokenDepositAmount) > BigInt(0))
    .filter((membership) => {
      if (membership.governingTokenOwner === ownerKey) {
        return true;
      }
      return membership.governanceDelegate === ownerKey;
    });
}

function toGovernanceMembershipRecord(entry: {
  pubkey: { toBase58(): string };
  account: {
    governingTokenMint: { toBase58(): string };
    governingTokenOwner: { toBase58(): string };
    governanceDelegate?: { toBase58(): string } | null;
    governingTokenDepositAmount: { toString(): string };
  };
}): GovernanceMembershipRecord {
  return {
    pubkey: entry.pubkey.toBase58(),
    governingTokenMint: entry.account.governingTokenMint.toBase58(),
    governingTokenOwner: entry.account.governingTokenOwner.toBase58(),
    governanceDelegate: entry.account.governanceDelegate?.toBase58() ?? null,
    governingTokenDepositAmount: entry.account.governingTokenDepositAmount.toString()
  };
}

async function resolveGovernanceVoteSourceStatus(
  connection: Connection,
  programId: PublicKey,
  ownerKey: string,
  proposals: Array<{ proposalId: string; governingTokenMint: string }>,
  memberships: GovernanceMembershipRecord[]
): Promise<Map<string, Set<string>>> {
  const voteRecordEntries: Array<{ proposalId: string; tokenOwnerRecordId: string; voteRecordPk: PublicKey }> = [];

  for (const proposal of proposals) {
    const eligibleMemberships = getGovernanceEligibleVoteMemberships(proposal.governingTokenMint, ownerKey, memberships);
    for (const membership of eligibleMemberships) {
      voteRecordEntries.push({
        proposalId: proposal.proposalId,
        tokenOwnerRecordId: membership.pubkey,
        voteRecordPk: await getVoteRecordAddress(programId, new PublicKey(proposal.proposalId), new PublicKey(membership.pubkey))
      });
    }
  }

  const votedTokenOwnerRecordsByProposal = new Map<string, Set<string>>();
  for (let index = 0; index < voteRecordEntries.length; index += 100) {
    const batch = voteRecordEntries.slice(index, index + 100);
    const voteRecords = await Promise.all(
      batch.map((entry) =>
        getVoteRecord(connection, entry.voteRecordPk)
          .then((record) => (!record.account.isRelinquished ? record : null))
          .catch(() => null)
      )
    );

    voteRecords.forEach((record, accountIndex) => {
      if (!record) {
        return;
      }

      const entry = batch[accountIndex];
      if (!votedTokenOwnerRecordsByProposal.has(entry.proposalId)) {
        votedTokenOwnerRecordsByProposal.set(entry.proposalId, new Set<string>());
      }
      votedTokenOwnerRecordsByProposal.get(entry.proposalId)?.add(entry.tokenOwnerRecordId);
    });
  }

  return votedTokenOwnerRecordsByProposal;
}

function buildGovernanceProposalVoteSources(
  proposalMint: string,
  ownerKey: string,
  memberships: GovernanceMembershipRecord[],
  votedOwners: Set<string>,
  votedTokenOwnerRecordIds?: Set<string>
): WalletGovernanceResponse['proposals'][number]['voteSources'] {
  return getGovernanceEligibleVoteMemberships(proposalMint, ownerKey, memberships)
    .map((membership) => ({
      tokenOwnerRecordId: membership.pubkey,
      governingTokenOwner: membership.governingTokenOwner,
      isDelegate: membership.governingTokenOwner !== ownerKey,
      hasVoted:
        votedTokenOwnerRecordIds !== undefined
          ? votedTokenOwnerRecordIds.has(membership.pubkey)
          : votedOwners.has(membership.governingTokenOwner)
    }))
    .sort((left, right) => {
      if (left.isDelegate !== right.isDelegate) {
        return left.isDelegate ? 1 : -1;
      }
      return left.governingTokenOwner.localeCompare(right.governingTokenOwner);
    });
}

function resolveGovernanceProposalMembership(
  proposalMint: string,
  ownerKey: string,
  memberships: GovernanceMembershipRecord[]
): GovernanceMembershipRecord | null {
  const directMatch = memberships.find(
    (membership) =>
      membership.governingTokenMint === proposalMint &&
      membership.governingTokenOwner === ownerKey
  );
  if (directMatch) {
    return directMatch;
  }

  const delegatedMatch = memberships.find(
    (membership) =>
      membership.governingTokenMint === proposalMint &&
      membership.governanceDelegate === ownerKey &&
      membership.governingTokenOwner !== ownerKey
  );
  return delegatedMatch ?? null;
}

function getGovernanceProposalVotingPowerType(
  proposalMint: string,
  councilMint: string | null,
  membership: GovernanceMembershipRecord | null,
  ownerKey: string
): WalletGovernanceResponse['proposals'][number]['votingPowerType'] {
  const isCouncilProposal = !!councilMint && proposalMint === councilMint;
  if (!membership) {
    return 'unknown';
  }

  const isDelegate = membership.governingTokenOwner !== ownerKey;
  if (isCouncilProposal) {
    return isDelegate ? 'delegated-council' : 'council';
  }

  return isDelegate ? 'delegated-community' : 'community';
}

function buildGovernanceDaoSummary(
  daoId: string,
  realmName: string,
  communityMint: string,
  ownerKey: string,
  membershipRecords: GovernanceMembershipRecord[],
  isNonMemberDao: boolean,
  isDelegateDao: boolean
): WalletGovernanceResponse['daos'][number] {
  const ownTors = membershipRecords.filter((r) => r.governingTokenOwner === ownerKey);
  const delegatedToMeTors = membershipRecords.filter(
    (r) => r.governanceDelegate === ownerKey && r.governingTokenOwner !== ownerKey
  );
  const communityVotingPower = ownTors
    .filter((r) => r.governingTokenMint === communityMint)
    .reduce((sum, r) => sum + BigInt(r.governingTokenDepositAmount), BigInt(0))
    .toString();
  const councilVotingPower = ownTors
    .filter((r) => r.governingTokenMint !== communityMint)
    .reduce((sum, r) => sum + BigInt(r.governingTokenDepositAmount), BigInt(0))
    .toString();
  const delegateCommunityVotingPower = delegatedToMeTors
    .filter((r) => r.governingTokenMint === communityMint)
    .reduce((sum, r) => sum + BigInt(r.governingTokenDepositAmount), BigInt(0))
    .toString();
  const delegateCouncilVotingPower = delegatedToMeTors
    .filter((r) => r.governingTokenMint !== communityMint)
    .reduce((sum, r) => sum + BigInt(r.governingTokenDepositAmount), BigInt(0))
    .toString();
  const delegateCount = delegatedToMeTors.length;
  const role: WalletGovernanceResponse['daos'][number]['role'] = isNonMemberDao
    ? 'treasury'
    : isDelegateDao || delegateCount > 0
      ? 'delegate'
      : 'member';
  // communityTokenDecimals defaults to 0 — enriched later in fetchGovernanceForWallet
  return {
    daoId,
    realmName,
    communityMint,
    councilMint: null,
    communityTokenDecimals: 0,
    role,
    communityVotingPower,
    councilVotingPower,
    delegateCommunityVotingPower,
    delegateCouncilVotingPower,
    delegateCount
  };
}

async function resolveGovernanceRealmInfo(
  connection: Connection,
  daoId: string,
  governanceOwner?: GovernanceOwner
): Promise<GovernanceRealmInfo | null> {
  try {
    const realmAccount = await getRealm(connection, new PublicKey(daoId));
    return {
      daoId,
      name: realmAccount.account.name,
      communityMint: realmAccount.account.communityMint.toBase58(),
      councilMint: realmAccount.account.config.councilMint?.toBase58() ?? null
    };
  } catch {
    if (!governanceOwner) {
      return null;
    }
  }

  try {
    const data = await fetchGovernanceGraphql<Record<string, unknown>>(
      buildGovernanceRealmQuery(governanceOwner.name, daoId)
    );
    return normalizeGovernanceRealmInfo(data, governanceOwner.name, daoId);
  } catch {
    return null;
  }
}

async function fetchGovernanceForDaoViaGraphql(
  _connection: Connection,
  owner: PublicKey,
  daoId: string,
  governanceOwner: GovernanceOwner,
  isDelegateDao = false,
  isNonMemberDao = false,
  supplementalMemberships?: GovernanceMembershipRecord[]
): Promise<{
  source: 'shyft';
  member: boolean;
  membershipRecords: GovernanceMembershipRecord[];
  proposals: WalletGovernanceResponse['proposals'];
  daoSummary: WalletGovernanceResponse['daos'][number] | null;
}> {
  const namespace = governanceOwner.name;
  const ownerKey = owner.toBase58();

  const [realmData, directMembershipData, delegateMembershipData, governanceData] = await Promise.all([
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceRealmQuery(namespace, daoId)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceScopedDirectMembershipQuery(namespace, daoId, ownerKey)),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceScopedDelegateMembershipQuery(namespace, daoId, ownerKey)).catch(
      () => buildEmptyGovernanceMembershipResponse(namespace)
    ),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceAccountsQuery(namespace, daoId))
  ]);

  const realm = normalizeGovernanceRealmInfo(realmData, namespace, daoId);
  const membershipRecords = Array.from(
    new Map(
      [
        ...normalizeGovernanceMembershipRecords(directMembershipData, namespace),
        ...normalizeGovernanceMembershipRecords(delegateMembershipData, namespace),
        ...(supplementalMemberships ?? [])
      ].map((entry) => [entry.pubkey, entry] as const)
    ).values()
  );
  const governanceAccounts = normalizeGovernanceAccounts(governanceData, namespace);

  // Once a DAO is discovered for the wallet, still fetch its proposals even if the
  // realm-scoped membership query is incomplete. Delegate-only council/community cases
  // can otherwise lose proposals entirely while membership resolution catches up.
  const hasMembership = membershipRecords.length > 0;
  if (!realm || governanceAccounts.length === 0) {
    // Still surface a daoSummary so DAOs with deposits but no governance accounts show in the UI
    const earlyDaoSummary = realm && membershipRecords.length > 0
      ? {
          ...buildGovernanceDaoSummary(daoId, realm.name, realm.communityMint, ownerKey, membershipRecords, isNonMemberDao, isDelegateDao),
          councilMint: realm.councilMint
        }
      : null;
    return { source: 'shyft', member: hasMembership, membershipRecords, proposals: [], daoSummary: earlyDaoSummary };
  }

  // For delegate memberships, vote records are stored under the original owner's address,
  // so we must query by each delegator's governingTokenOwner in addition to our own key.
  const delegatorAddresses = membershipRecords
    .filter((r) => r.governanceDelegate === ownerKey && r.governingTokenOwner !== ownerKey)
    .map((r) => r.governingTokenOwner);
  const voteQueryAddresses = Array.from(new Set([ownerKey, ...delegatorAddresses]));

  const [proposalData, voteData] = await Promise.all([
    fetchGovernanceGraphql<Record<string, unknown>>(
      buildGovernanceProposalsQuery(
        namespace,
        governanceAccounts.map((entry) => entry.pubkey)
      )
    ),
    fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceVoteRecordsQuery(namespace, voteQueryAddresses))
  ]);

  const proposalRows = normalizeGovernanceProposalRows(proposalData, namespace);
  const governanceConfigById = new Map(governanceAccounts.map((entry) => [entry.pubkey, entry] as const));
  const votedOwnersByProposal = normalizeGovernanceVoteOwnersByProposal(voteData, namespace);

  const proposals = proposalRows
    .map((proposal) => {
      const proposalMemberships = membershipRecords;
      const votedOwners = votedOwnersByProposal.get(proposal.pubkey) ?? new Set<string>();
      const voteSources = buildGovernanceProposalVoteSources(
        proposal.governingTokenMint,
        ownerKey,
        proposalMemberships,
        votedOwners
      );
      const membership = resolveGovernanceProposalMembership(proposal.governingTokenMint, ownerKey, proposalMemberships);
      const governanceConfig = governanceConfigById.get(proposal.governance);
      const resolvedVotingTime =
        proposal.maxVotingTime !== null && proposal.maxVotingTime !== undefined
          ? proposal.maxVotingTime
          : governanceConfig?.baseVotingTime ?? null;
      const votingEndsAt =
        proposal.votingAt !== null && resolvedVotingTime !== null
          ? proposal.votingAt + resolvedVotingTime
          : null;
      const hasVoted = voteSources.some((source) => source.hasVoted);
      // isDelegate: wallet is acting as a delegate for another wallet's TOR
      const proposalIsDelegate = membership !== null && membership.governingTokenOwner !== ownerKey;
      const canVote =
        proposal.state === ProposalState.Voting &&
        voteSources.some((source) => !source.hasVoted);
      const votingPowerType = getGovernanceProposalVotingPowerType(
        proposal.governingTokenMint,
        realm.councilMint,
        membership,
        ownerKey
      );

      return {
        daoId,
        realmName: realm.name,
        governanceProgramId: governanceOwner.owner,
        governanceId: proposal.governance,
        proposalId: proposal.pubkey,
        proposalName: proposal.name,
        descriptionLink: proposal.descriptionLink,
        state: formatProposalStateLabel(proposal.state),
        stateCode: proposal.state,
        draftAt: proposal.draftAt,
        votingAt: proposal.votingAt,
        votingEndsAt,
        governingTokenMint: proposal.governingTokenMint,
        proposalOwnerRecordId: proposal.tokenOwnerRecord,
        tokenOwnerRecordId: membership?.pubkey ?? null,
        canVote,
        hasVoted,
        hasDenyOption: proposal.hasDenyOption,
        isDelegate: proposalIsDelegate,
        votingPowerType,
        voteSources,
        choices: proposal.options,
        yesVotes: proposal.yesVotes,
        noVotes: proposal.noVotes,
        abstainVotes: proposal.abstainVotes,
        denyVotes: proposal.denyVotes
      } satisfies WalletGovernanceResponse['proposals'][number];
    })
    .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0));

  const daoSummary = buildGovernanceDaoSummary(
    daoId, realm.name, realm.communityMint, ownerKey, membershipRecords, isNonMemberDao, isDelegateDao
  );

  return {
    source: 'shyft',
    member: membershipRecords.length > 0,
    membershipRecords,
    proposals,
    daoSummary: {
      ...daoSummary,
      councilMint: realm.councilMint
    }
  };
}

async function fetchGovernanceForDaoViaRpc(
  connection: Connection,
  owner: PublicKey,
  daoId: string,
  governanceOwner: GovernanceOwner,
  preloadedMemberships?: GovernanceMembershipRecord[],
  isNonMemberDao = false,
  // When provided, skip getTokenOwnerRecordsByOwner — caller already has the data
  skipTorFetch = false
): Promise<{
  source: 'rpc';
  member: boolean;
  proposals: WalletGovernanceResponse['proposals'];
  daoSummary: WalletGovernanceResponse['daos'][number] | null;
}> {
  const programId = new PublicKey(governanceOwner.owner);
  const realmPk = new PublicKey(daoId);
  const ownerKey = owner.toBase58();

  const [realmAccount, tokenOwnerRecords, realmScopedTokenOwnerRecords, governanceAccounts, voteRecords] = await Promise.all([
    getRealm(connection, realmPk),
    skipTorFetch ? Promise.resolve([]) : getTokenOwnerRecordsByOwner(connection, programId, owner).catch(() => []),
    getGovernanceAccounts(connection, programId, TokenOwnerRecord, [
      new MemcmpFilter(1, realmPk.toBuffer())
    ]).catch(() => []),
    getAllGovernances(connection, programId, realmPk).catch(() => []),
    (async () => {
      const delegatorKeys = Array.from(
        new Set(
          (preloadedMemberships ?? [])
            .filter((entry) => entry.governanceDelegate === ownerKey && entry.governingTokenOwner !== ownerKey)
            .map((entry) => entry.governingTokenOwner)
        )
      );
      const voters = [owner.toBase58(), ...delegatorKeys];
      const voteRecordBatches = await Promise.all(
        voters.map((address) =>
          getVoteRecordsByVoter(connection, programId, new PublicKey(address)).catch(() => [])
        )
      );
      return voteRecordBatches.flat();
    })()
  ]);

  const directRealmTokenOwnerRecords = skipTorFetch
    ? []
    : tokenOwnerRecords.filter((entry) => entry.account.realm.toBase58() === daoId);
  const delegatedRealmTokenOwnerRecords = realmScopedTokenOwnerRecords.filter((entry) => {
    const governingTokenOwner = entry.account.governingTokenOwner.toBase58();
    const governanceDelegate = entry.account.governanceDelegate?.toBase58() ?? null;
    return governingTokenOwner === ownerKey || governanceDelegate === ownerKey;
  });
  const realmTokenOwnerRecords = [...directRealmTokenOwnerRecords, ...delegatedRealmTokenOwnerRecords]
    .filter((entry, index, allEntries) => allEntries.findIndex((candidate) => candidate.pubkey.equals(entry.pubkey)) === index);

  // Use direct TOR records if found; otherwise fall back to preloaded memberships (delegate case)
  // For non-member DAOs (treasury wallets), skip membership check and fetch proposals directly
  let effectiveMemberships: GovernanceMembershipRecord[];
  let isDelegateViaRpc = false;
  if (realmTokenOwnerRecords.length > 0) {
    const rpcMemberships = realmTokenOwnerRecords.map((entry) => ({
      pubkey: entry.pubkey.toBase58(),
      governingTokenMint: entry.account.governingTokenMint.toBase58(),
      governingTokenOwner: entry.account.governingTokenOwner.toBase58(),
      governanceDelegate: entry.account.governanceDelegate?.toBase58() ?? null,
      governingTokenDepositAmount: entry.account.governingTokenDepositAmount.toString()
    } satisfies GovernanceMembershipRecord));
    effectiveMemberships = Array.from(
      new Map(
        [...rpcMemberships, ...(preloadedMemberships ?? [])].map((entry) => [entry.pubkey, entry] as const)
      ).values()
    );
  } else if (preloadedMemberships && preloadedMemberships.length > 0) {
    effectiveMemberships = preloadedMemberships;
    // Only treat as delegate when the preloaded records are NOT owned by this wallet
    isDelegateViaRpc = preloadedMemberships.every((r) => r.governingTokenOwner !== ownerKey);
  } else if (isNonMemberDao) {
    effectiveMemberships = [];
  } else {
    return { source: 'rpc', member: false, proposals: [], daoSummary: null };
  }

  const realmCommunityMint = realmAccount.account.communityMint.toBase58();
  const daoSummary = effectiveMemberships.length > 0
    ? buildGovernanceDaoSummary(daoId, realmAccount.account.name, realmCommunityMint, ownerKey, effectiveMemberships, isNonMemberDao, isDelegateViaRpc)
    : null;

  if (governanceAccounts.length === 0) {
    return { source: 'rpc', member: effectiveMemberships.length > 0, proposals: [], daoSummary };
  }

  const proposalBatches = await getAllProposals(connection, programId, realmPk).catch(() => []);
  const proposals = proposalBatches.flatMap((batch) => batch);
  const votedOwnersByProposal = new Map<string, Set<string>>();
  for (const entry of voteRecords) {
    const proposalId = entry.account.proposal.toBase58();
    const governingTokenOwner = entry.account.governingTokenOwner.toBase58();
    if (!votedOwnersByProposal.has(proposalId)) {
      votedOwnersByProposal.set(proposalId, new Set<string>());
    }
    votedOwnersByProposal.get(proposalId)?.add(governingTokenOwner);
  }
  const votedTokenOwnerRecordsByProposal = await resolveGovernanceVoteSourceStatus(
    connection,
    programId,
    ownerKey,
    proposals.map((proposal) => ({
      proposalId: proposal.pubkey.toBase58(),
      governingTokenMint: proposal.account.governingTokenMint.toBase58()
    })),
    effectiveMemberships
  ).catch(() => new Map<string, Set<string>>());

  return {
    source: 'rpc',
    member: effectiveMemberships.length > 0,
    daoSummary: daoSummary
      ? {
          ...daoSummary,
          councilMint: realmAccount.account.config.councilMint?.toBase58() ?? null
        }
      : null,
    proposals: proposals
      .filter((entry) =>
        shouldDisplayGovernanceProposal({
          stateCode: entry.account.state,
          draftAt: entry.account.draftAt ? entry.account.draftAt.toNumber() : null,
          votingAt: entry.account.votingAt ? entry.account.votingAt.toNumber() : null,
          maxVotingTime: entry.account.maxVotingTime ?? null
        })
      )
      .map((entry) => {
        const proposalMint = entry.account.governingTokenMint.toBase58();
        const votedOwners = votedOwnersByProposal.get(entry.pubkey.toBase58()) ?? new Set<string>();
        const votedTokenOwnerRecordIds = votedTokenOwnerRecordsByProposal.get(entry.pubkey.toBase58()) ?? new Set<string>();
        const voteSources = buildGovernanceProposalVoteSources(
          proposalMint,
          ownerKey,
          effectiveMemberships,
          votedOwners,
          votedTokenOwnerRecordIds
        );
        const membership = resolveGovernanceProposalMembership(proposalMint, ownerKey, effectiveMemberships);
        const votingAt = entry.account.votingAt ? entry.account.votingAt.toNumber() : null;
        const votingEndsAt =
          votingAt !== null && entry.account.maxVotingTime !== null ? votingAt + entry.account.maxVotingTime : null;
        const hasVoted = voteSources.some((source) => source.hasVoted);
        const proposalIsDelegate = membership !== null && membership.governingTokenOwner !== ownerKey;
        const votingPowerType = getGovernanceProposalVotingPowerType(
          proposalMint,
          realmAccount.account.config.councilMint?.toBase58() ?? null,
          membership,
          ownerKey
        );
        const options =
          Array.isArray(entry.account.options) && entry.account.options.length > 0
            ? entry.account.options.map((option, index) => ({
                rank: index,
                label: option.label,
                voteWeight: option.voteWeight.toString(),
                voteResult: option.voteResult != null ? String(option.voteResult) : null
              }))
            : [{ rank: 0, label: 'Approve', voteWeight: entry.account.yesVotesCount.toString(), voteResult: null }];

        return {
          daoId,
          realmName: realmAccount.account.name,
          governanceProgramId: governanceOwner.owner,
          governanceId: entry.account.governance.toBase58(),
          proposalId: entry.pubkey.toBase58(),
          proposalName: entry.account.name,
          descriptionLink: entry.account.descriptionLink,
          state: formatProposalStateLabel(entry.account.state),
          stateCode: entry.account.state,
          draftAt: entry.account.draftAt ? entry.account.draftAt.toNumber() : null,
          votingAt,
          votingEndsAt,
          governingTokenMint: entry.account.governingTokenMint.toBase58(),
          proposalOwnerRecordId: entry.account.tokenOwnerRecord.toBase58(),
          tokenOwnerRecordId: membership?.pubkey ?? null,
          canVote:
            entry.account.state === ProposalState.Voting &&
            voteSources.some((source) => !source.hasVoted),
          hasVoted,
          hasDenyOption: entry.account.denyVoteWeight !== undefined,
          isDelegate: proposalIsDelegate,
          votingPowerType,
          voteSources,
          choices: options,
          yesVotes: entry.account.yesVotesCount.toString(),
          noVotes: entry.account.noVotesCount.toString(),
          abstainVotes: entry.account.abstainVoteWeight?.toString() ?? '0',
          denyVotes: entry.account.denyVoteWeight?.toString() ?? '0'
        } satisfies WalletGovernanceResponse['proposals'][number];
      })
      .sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0))
  };
}

async function fetchGovernanceForWallet(
  connection: Connection,
  owner: PublicKey,
  trackedDaoIds: string[]
): Promise<WalletGovernanceResponse> {
  const uniqueTrackedDaoIds = Array.from(
    new Set(
      trackedDaoIds
        .map((entry) => entry.trim())
        .filter((entry) => !!entry)
    )
  );
  const discoveredDaoOwnerMap = await discoverGovernanceDaoOwnersForWallet(connection, owner);

  const discoveredDaoIds = [...discoveredDaoOwnerMap.keys()];
  const delegateDaoIds = discoveredDaoIds.filter((id) => discoveredDaoOwnerMap.get(id)?.isDelegate === true);
  const governedDaoIds = discoveredDaoIds.filter((id) => discoveredDaoOwnerMap.get(id)?.isNonMember === true);
  const uniqueDaoIds = Array.from(new Set([...discoveredDaoIds, ...uniqueTrackedDaoIds]));

  if (uniqueDaoIds.length === 0) {
    return {
      trackedDaos: uniqueTrackedDaoIds,
      discoveredDaos: [],
      delegateDaos: [],
      governedDaos: [],
      memberDaos: 0,
      proposals: [],
      daos: [],
      source: 'none',
      network: connection.rpcEndpoint.includes('devnet') ? 'devnet' : 'mainnet-beta',
      refreshedAt: Date.now()
    };
  }

  const results = await Promise.all(
    uniqueDaoIds.map(async (daoId) => {
      const discovered = discoveredDaoOwnerMap.get(daoId);
        const governanceOwner = discovered?.owner ?? (await resolveGovernanceOwnerByRealm(connection, daoId));
        const isDelegateDao = discovered?.isDelegate === true;
        // Non-member: treasury/governed wallet, OR manually tracked but not discovered
        const isNonMemberDao = discovered?.isNonMember === true || (!discovered && uniqueTrackedDaoIds.includes(daoId));
        try {
          return await fetchGovernanceForDaoViaRpc(
            connection,
            owner,
            daoId,
            governanceOwner,
            undefined,
            isNonMemberDao
          );
        } catch {
          return {
            source: 'none' as const,
            member: false,
            proposals: [],
            daoSummary: null
          };
        }
    })
  );

  const aggregatedProposals = results.flatMap((entry) => entry.proposals);
  const proposals = limitGovernanceProposalsForDisplay(aggregatedProposals);
  const memberDaos = results.filter((entry) => entry.member).length;
  let daos = results
    .map((entry) => ('daoSummary' in entry ? entry.daoSummary : null))
    .filter((s): s is WalletGovernanceResponse['daos'][number] => s !== null);

  // Batch-fetch community token decimals so voting power can be displayed correctly.
  // SPL Mint layout: decimals is a single u8 at byte offset 44.
  if (daos.length > 0) {
    try {
      const uniqueMints = Array.from(new Set(daos.map((d) => d.communityMint)));
      const validMintPairs = uniqueMints.flatMap((m) => {
        try { return [{ mint: m, key: new PublicKey(m) }]; } catch { return []; }
      });
      const mintAccounts = await connection.getMultipleAccountsInfo(
        validMintPairs.map((p) => p.key), 'confirmed'
      );
      const mintDecimals = new Map<string, number>();
      mintAccounts.forEach((acct, i) => {
        if (acct?.data && acct.data.length >= 45) {
          mintDecimals.set(validMintPairs[i].mint, new Uint8Array(acct.data)[44]);
        }
      });
      daos = daos.map((d) => ({
        ...d,
        communityTokenDecimals: mintDecimals.get(d.communityMint) ?? d.communityTokenDecimals
      }));
    } catch {
      // Best-effort — decimals stay 0, raw amounts shown
    }
  }

  const source = results.some((entry) => entry.source === 'rpc') ? 'rpc' : 'none';

  return {
    trackedDaos: uniqueTrackedDaoIds,
    discoveredDaos: discoveredDaoIds,
    delegateDaos: delegateDaoIds,
    governedDaos: governedDaoIds,
    memberDaos,
    proposals,
    daos,
    source,
    network: connection.rpcEndpoint.includes('devnet') ? 'devnet' : 'mainnet-beta',
    refreshedAt: Date.now()
  };
}

function readBorshString(bytes: Uint8Array, offset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(offset, true);
  const start = offset + 4;
  const end = start + length;
  const value = new TextDecoder().decode(bytes.slice(start, end)).replace(/\0/g, '').trim();
  return {
    value: value || null,
    offset: end
  };
}

function parseMetaplexMetadataAccount(bytes: Uint8Array): ParsedMetaplexMetadata | null {
  if (bytes.byteLength < 65) {
    return null;
  }

  let offset = 1;
  const updateAuthority = new PublicKey(bytes.slice(offset, offset + 32)).toBase58();
  offset += 32;
  const mint = new PublicKey(bytes.slice(offset, offset + 32)).toBase58();
  offset += 32;

  const name = readBorshString(bytes, offset);
  const symbol = readBorshString(bytes, name.offset);
  const uri = readBorshString(bytes, symbol.offset);

  if (uri.offset + 2 > bytes.byteLength) {
    return {
      updateAuthority,
      mint,
      name: name.value,
      symbol: symbol.value,
      uri: uri.value,
      sellerFeeBasisPoints: null
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sellerFeeBasisPoints = view.getUint16(uri.offset, true);

  return {
    updateAuthority,
    mint,
    name: name.value,
    symbol: symbol.value,
    uri: uri.value,
    sellerFeeBasisPoints
  };
}

async function fetchCollectibleMetadataHints(
  connection: Connection,
  items: CollectibleItem[]
): Promise<Record<string, CollectibleMetadataHint>> {
  const uniqueMintsNeedingHints = Array.from(
    new Set(
      items
        .filter((item) => !item.imageUri || !item.name || !item.symbol)
        .map((item) => item.mint)
        .filter((mint): mint is string => !!mint)
    )
  );

  const entries = await Promise.all(
    uniqueMintsNeedingHints.map(async (mint) => {
      try {
        const mintPublicKey = tryParseSolanaPublicKey(mint);
        if (!mintPublicKey) {
          return [mint, {}] as const;
        }
        const metadataPda = PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mintPublicKey.toBytes()],
          METADATA_PROGRAM_ID
        )[0];
        const metadataAccountInfo = await connection.getAccountInfo(metadataPda, 'confirmed');
        const parsedMetadata = metadataAccountInfo?.data ? parseMetaplexMetadataAccount(metadataAccountInfo.data) : null;
        let imageUri: string | undefined;
        let jsonName: string | undefined;
        let jsonSymbol: string | undefined;

        if (parsedMetadata?.uri) {
          try {
            const response = await fetch(parsedMetadata.uri, { cache: 'no-store' });
            if (response.ok) {
              const payload = (await response.json()) as { image?: unknown; name?: unknown; symbol?: unknown };
              imageUri = typeof payload.image === 'string' && payload.image.trim() ? payload.image.trim() : undefined;
              jsonName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined;
              jsonSymbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol.trim() : undefined;
            }
          } catch {
            imageUri = undefined;
          }
        }

        return [
          mint,
          {
            name: jsonName ?? parsedMetadata?.name ?? undefined,
            symbol: jsonSymbol ?? parsedMetadata?.symbol ?? undefined,
            imageUri
          }
        ] as const;
      } catch {
        return [mint, {}] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}

async function getMintDecimals(connection: Connection, mint: string): Promise<number> {
  if (mint === JUPITER_SOL_MINT) {
    return 9;
  }

  const mintPublicKey = tryParseSolanaPublicKey(mint);
  if (!mintPublicKey) {
    return 9;
  }

  const accountInfo = await connection.getParsedAccountInfo(mintPublicKey, 'confirmed');
  const parsedData = accountInfo.value?.data;
  if (!parsedData || typeof parsedData !== 'object' || !('parsed' in parsedData)) {
    return 9;
  }

  const parsed = parsedData.parsed;
  if (!parsed || typeof parsed !== 'object' || !('info' in parsed) || !parsed.info || typeof parsed.info !== 'object') {
    return 9;
  }

  return 'decimals' in parsed.info && typeof parsed.info.decimals === 'number' ? parsed.info.decimals : 9;
}

function formatUiAmountExact(rawAmount: string, decimals: number): string {
  const normalized = rawAmount.trim();
  if (!/^\d+$/.test(normalized)) {
    return rawAmount;
  }

  const amount = BigInt(normalized);
  if (decimals <= 0) {
    return amount.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fractionText}`;
}

function formatUiAmount(rawAmount: string, decimals: number): string {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    return rawAmount;
  }

  return (amount / 10 ** decimals).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(Math.max(decimals, 0), 6)
  });
}

function chunkStrings(values: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchSuiNativePrice(): Promise<NativeUsdPriceQuote> {
  const url = new URL(COINGECKO_SIMPLE_PRICE_URL);
  url.searchParams.set('ids', 'sui');
  url.searchParams.set('vs_currencies', 'usd');
  url.searchParams.set('include_24hr_change', 'true');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Sui pricing request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    sui?: {
      usd?: unknown;
      usd_24h_change?: unknown;
    };
  };

  return {
    usdPrice: typeof payload.sui?.usd === 'number' ? payload.sui.usd : null,
    priceChange24h: typeof payload.sui?.usd_24h_change === 'number' ? payload.sui.usd_24h_change : null
  };
}

function getSuiStablecoinPriceUsd(symbol?: string): number | null {
  const normalized = symbol?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return normalized === 'USDC' || normalized === 'USDT' ? 1 : null;
}

function getSolanaStablecoinPriceUsd(mint?: string, symbol?: string): number | null {
  const normalizedSymbol = symbol?.trim().toUpperCase();
  if (normalizedSymbol === 'USDC' || normalizedSymbol === 'USDT') {
    return 1;
  }

  const normalizedMint = mint?.trim();
  if (!normalizedMint) {
    return null;
  }

  const knownSymbol = KNOWN_TOKEN_SYMBOLS[normalizedMint]?.trim().toUpperCase();
  return knownSymbol === 'USDC' || knownSymbol === 'USDT' ? 1 : null;
}

type SolanaTokenAccountContext = {
  accountAddress: string;
  ownerAddress: string;
  mint: string;
  decimals: number;
  name?: string;
  symbol?: string;
};

async function fetchSolanaMintDisplayHints(
  connection: Connection,
  mints: string[]
): Promise<Record<string, { name?: string; symbol?: string }>> {
  const uniqueMints = [...new Set(mints.map((mint) => mint.trim()).filter(Boolean))];
  const entries = await Promise.all(
    uniqueMints.map(async (mint) => {
      try {
        const mintPublicKey = tryParseSolanaPublicKey(mint);
        if (!mintPublicKey) {
          return [mint, {}] as const;
        }

        const metadataPda = PublicKey.findProgramAddressSync(
          [new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mintPublicKey.toBytes()],
          METADATA_PROGRAM_ID
        )[0];
        const metadataAccountInfo = await connection.getAccountInfo(metadataPda, 'confirmed');
        const parsedMetadata = metadataAccountInfo?.data ? parseMetaplexMetadataAccount(metadataAccountInfo.data) : null;

        return [
          mint,
          {
            name: parsedMetadata?.name ?? undefined,
            symbol: parsedMetadata?.symbol ?? undefined
          }
        ] as const;
      } catch {
        return [mint, {}] as const;
      }
    })
  );

  return Object.fromEntries(entries);
}

async function fetchSolanaWalletTokenAccountContexts(
  connection: Connection,
  network: string,
  ownerAddress: string
): Promise<Map<string, SolanaTokenAccountContext>> {
  const owner = tryParseSolanaPublicKey(ownerAddress);
  if (!owner) {
    return new Map();
  }

  let shyftMetadata: Record<string, { name?: string; symbol?: string; logoUri?: string }> = {};
  if (network === 'mainnet-beta' || network === 'devnet') {
    try {
      shyftMetadata = await fetchShyftWalletTokens(network, ownerAddress);
    } catch {
      shyftMetadata = {};
    }
  }

  const tokenResponses = await Promise.all(
    TOKEN_PROGRAM_IDS.map(async (programId) => {
      try {
        return await connection.getParsedTokenAccountsByOwner(owner, {
          programId: new PublicKey(programId)
        });
      } catch {
        return null;
      }
    })
  );

  const entries = tokenResponses.flatMap((response) =>
    response?.value.map((accountInfo) => {
      const parsed = accountInfo.account.data.parsed.info as {
        mint: string;
        tokenAmount: {
          decimals: number;
        };
      };
      const mint = parsed.mint;
      return [
        accountInfo.pubkey.toBase58(),
        {
          accountAddress: accountInfo.pubkey.toBase58(),
          ownerAddress,
          mint,
          decimals: parsed.tokenAmount.decimals,
          name: shyftMetadata[mint]?.name,
          symbol: shyftMetadata[mint]?.symbol ?? KNOWN_TOKEN_SYMBOLS[mint]
        } satisfies SolanaTokenAccountContext
      ] as const;
    }) ?? []
  );

  return new Map(entries);
}

function collectCreatedAssociatedTokenAccountContexts(
  summary: TransactionSummary,
  ownerAddress: string
): Map<string, SolanaTokenAccountContext> {
  const normalizedOwner = ownerAddress.trim().toLowerCase();
  const entries = summary.instructions.flatMap((instruction) => {
    if (
      instruction.title !== 'Create associated token account' &&
      instruction.title !== 'Create associated token account (idempotent)'
    ) {
      return [];
    }

    const accountAddress = instruction.details?.find((detail) => detail.label === 'Account')?.value;
    const accountOwner = instruction.details?.find((detail) => detail.label === 'Owner')?.value;
    const mint = instruction.details?.find((detail) => detail.label === 'Mint')?.value;
    if (!accountAddress || !mint || accountOwner?.trim().toLowerCase() !== normalizedOwner) {
      return [];
    }

    return [
      [
        accountAddress,
        {
          accountAddress,
          ownerAddress,
          mint,
          decimals: 0,
          symbol: KNOWN_TOKEN_SYMBOLS[mint]
        } satisfies SolanaTokenAccountContext
      ] as const
    ];
  });

  return new Map(entries);
}

async function enrichSolanaTransactionSummaryWithWalletContext(
  summary: TransactionSummary,
  connection: Connection,
  network: string,
  ownerAddress: string
): Promise<TransactionSummary> {
  const tokenAccountContexts = collectCreatedAssociatedTokenAccountContexts(summary, ownerAddress);
  const existingTokenAccountContexts = await fetchSolanaWalletTokenAccountContexts(connection, network, ownerAddress);
  for (const [accountAddress, context] of existingTokenAccountContexts.entries()) {
    tokenAccountContexts.set(accountAddress, context);
  }

  const contextValues = Array.from(tokenAccountContexts.values());
  const relevantMints = [
    ...new Set(
      [
        ...summary.balanceChanges.map((change) => change.assetAddress?.trim()).filter((mint): mint is string => !!mint),
        ...contextValues.map((context) => context.mint)
      ]
    )
  ];

  const mintsNeedingDisplayHints = relevantMints.filter((mint) => {
    if (KNOWN_TOKEN_SYMBOLS[mint]) {
      return false;
    }

    return !contextValues.some((context) => context.mint === mint && context.symbol);
  });
  const [mintDisplayHints, mintDecimalsEntries] = await Promise.all([
    fetchSolanaMintDisplayHints(connection, mintsNeedingDisplayHints),
    Promise.all(
      relevantMints.map(async (mint) => {
        try {
          return [mint, await getMintDecimals(connection, mint)] as const;
        } catch {
          return [mint, 0] as const;
        }
      })
    )
  ]);
  const mintDecimals = Object.fromEntries(mintDecimalsEntries);

  return {
    ...summary,
    balanceChanges: summary.balanceChanges.map((change) => {
      const context = tokenAccountContexts.get(change.account);
      const assetAddress = change.assetAddress?.trim() || context?.mint;
      const decimals =
        change.decimals > 0
          ? change.decimals
          : context?.decimals || (assetAddress ? mintDecimals[assetAddress] ?? change.decimals : change.decimals);
      const symbolHint =
        (assetAddress ? KNOWN_TOKEN_SYMBOLS[assetAddress] : undefined) ??
        context?.symbol ??
        (assetAddress ? mintDisplayHints[assetAddress]?.symbol : undefined);
      const nameHint = context?.name ?? (assetAddress ? mintDisplayHints[assetAddress]?.name : undefined);

      return {
        ...change,
        ownerAddress: change.ownerAddress ?? context?.ownerAddress,
        assetAddress: assetAddress ?? change.assetAddress,
        assetLabel:
          change.assetLabel === 'Token' || !change.assetLabel ? symbolHint ?? nameHint ?? change.assetLabel : change.assetLabel,
        decimals,
        amount: decimals !== change.decimals ? formatUiAmountExact(change.rawAmount, decimals) : change.amount
      };
    })
  };
}

function getEvmStablecoinPriceUsd(symbol?: string): number | null {
  const normalized = symbol?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return normalized === 'USDC' || normalized === 'USDT' ? 1 : null;
}

async function enrichSolanaTransactionSummaryWithUsd(summary: TransactionSummary): Promise<TransactionSummary> {
  const pricingMints = [
    ...new Set(
      [
        summary.estimatedFeeLamports != null ? JUPITER_SOL_MINT : null,
        ...summary.balanceChanges.map((change) => change.assetAddress?.trim() || (change.assetLabel === 'SOL' ? JUPITER_SOL_MINT : null))
      ].filter((mint): mint is string => !!mint)
    )
  ];

  if (pricingMints.length === 0) {
    return summary;
  }

  let pricing: Record<string, { usdPrice: number | null; priceChange24h: number | null }> = {};
  try {
    pricing = await fetchJupiterPrices(pricingMints);
  } catch {
    pricing = {};
  }

  const feeNativeUsdPrice = pricing[JUPITER_SOL_MINT]?.usdPrice ?? getSolanaStablecoinPriceUsd(JUPITER_SOL_MINT, 'SOL');
  const feeUsd =
    typeof summary.estimatedFeeLamports === 'number' &&
    Number.isFinite(summary.estimatedFeeLamports) &&
    typeof feeNativeUsdPrice === 'number' &&
    Number.isFinite(feeNativeUsdPrice)
      ? (summary.estimatedFeeLamports / LAMPORTS_PER_SOL) * feeNativeUsdPrice
      : null;

  return {
    ...summary,
    feeUsd,
    balanceChanges: summary.balanceChanges.map((change) => {
      const pricingMint = change.assetAddress?.trim() || (change.assetLabel === 'SOL' ? JUPITER_SOL_MINT : undefined);
      const priceUsd =
        (pricingMint ? pricing[pricingMint]?.usdPrice ?? null : null) ??
        getSolanaStablecoinPriceUsd(pricingMint, change.assetLabel);
      const rawAmountNumber = Number(change.rawAmount);
      const amountUi = Number.isFinite(rawAmountNumber) ? rawAmountNumber / 10 ** change.decimals : null;
      const valueUsd =
        amountUi !== null && typeof priceUsd === 'number' && Number.isFinite(priceUsd)
          ? amountUi * priceUsd
          : null;

      return {
        ...change,
        priceUsd,
        valueUsd
      };
    })
  };
}

async function fetchSuiTokenPrices(
  coinTypes: string[]
): Promise<Record<string, { usdPrice: number | null; priceChange24h: number | null }>> {
  const uniqueCoinTypes = [...new Set(coinTypes.map((coinType) => coinType.trim()).filter(Boolean))];
  if (uniqueCoinTypes.length === 0) {
    return {};
  }

  const responses = await Promise.all(
    chunkStrings(uniqueCoinTypes, GECKOTERMINAL_TOKEN_BATCH_SIZE).map(async (batch) => {
      const url = `${GECKOTERMINAL_BASE_URL}/networks/sui-network/tokens/multi/${encodeURIComponent(batch.join(','))}`;
      const response = await fetch(url, {
        headers: {
          accept: 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Sui token pricing request failed with ${response.status}.`);
      }
      return (await response.json()) as {
        data?: Array<{
          attributes?: {
            address?: string;
            price_usd?: string | null;
            price_change_percentage?: {
              h24?: string | null;
            } | null;
          } | null;
        }>;
      };
    })
  );

  return Object.assign(
    {},
    ...responses.map((response) =>
      Object.fromEntries(
        (response.data ?? [])
          .map((entry) => {
            const address = entry.attributes?.address?.trim();
            if (!address) {
              return null;
            }

            const usdPriceRaw = entry.attributes?.price_usd;
            const priceChangeRaw = entry.attributes?.price_change_percentage?.h24;
            const usdPrice = usdPriceRaw === null || usdPriceRaw === undefined ? null : Number(usdPriceRaw);
            const priceChange24h = priceChangeRaw === null || priceChangeRaw === undefined ? null : Number(priceChangeRaw);

            return [
              address.toLowerCase(),
              {
                usdPrice: Number.isFinite(usdPrice) ? usdPrice : null,
                priceChange24h: Number.isFinite(priceChange24h) ? priceChange24h : null
              }
            ] as const;
          })
          .filter((entry): entry is readonly [string, { usdPrice: number | null; priceChange24h: number | null }] => entry !== null)
      )
    )
  );
}

async function fetchSolanaTokenMarket(mint: string): Promise<{
  history: Array<{ timestamp: number; priceUsd: number }>;
  marketData: { marketCapUsd: number | null; volume24hUsd: number | null; liquidityUsd: number | null };
}> {
  const poolsResponse = await fetch(
    `${GECKOTERMINAL_BASE_URL}/networks/solana/tokens/${encodeURIComponent(mint)}/pools?page=1`
  );
  if (!poolsResponse.ok) {
    throw new Error(`Token pool lookup failed with ${poolsResponse.status}.`);
  }

  const poolsPayload = (await poolsResponse.json()) as {
    data?: Array<{
      id?: string;
      attributes?: {
        market_cap_usd?: string | null;
        fdv_usd?: string | null;
        reserve_in_usd?: string | null;
        volume_usd?: { h24?: string | null };
      };
      relationships?: {
        base_token?: { data?: { id?: string } };
        quote_token?: { data?: { id?: string } };
      };
    }>;
  };
  const pool = poolsPayload.data?.[0];
  const poolAddress = pool?.id?.replace(/^solana_/, '');
  if (!poolAddress) {
    return {
      history: [],
      marketData: { marketCapUsd: null, volume24hUsd: null, liquidityUsd: null }
    };
  }

  const baseTokenId = pool?.relationships?.base_token?.data?.id?.replace(/^solana_/, '');
  const tokenSide = baseTokenId === mint ? 'base' : 'quote';
  const historyUrl = new URL(
    `${GECKOTERMINAL_BASE_URL}/networks/solana/pools/${encodeURIComponent(poolAddress)}/ohlcv/day`
  );
  historyUrl.searchParams.set('aggregate', '1');
  historyUrl.searchParams.set('limit', '90');
  historyUrl.searchParams.set('currency', 'usd');
  historyUrl.searchParams.set('token', tokenSide);

  const historyResponse = await fetch(historyUrl);
  if (!historyResponse.ok) {
    throw new Error(`Token price history request failed with ${historyResponse.status}.`);
  }
  const historyPayload = (await historyResponse.json()) as {
    data?: { attributes?: { ohlcv_list?: unknown[][] } };
  };

  const history = (historyPayload.data?.attributes?.ohlcv_list ?? [])
    .map((row) => {
      const timestamp = Number(row[0]);
      const priceUsd = Number(row[4]);
      return { timestamp, priceUsd };
    })
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.priceUsd) && point.priceUsd >= 0)
    .sort((left, right) => left.timestamp - right.timestamp);
  const numberOrNull = (value: string | null | undefined) => {
    const parsed = value == null ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    history,
    marketData: {
      marketCapUsd: numberOrNull(pool?.attributes?.market_cap_usd ?? pool?.attributes?.fdv_usd),
      volume24hUsd: numberOrNull(pool?.attributes?.volume_usd?.h24),
      liquidityUsd: numberOrNull(pool?.attributes?.reserve_in_usd)
    }
  };
}

function getEthereumBlockscoutBaseUrl(network: 'mainnet-beta' | 'devnet'): string {
  return network === 'devnet' ? ETHEREUM_SEPOLIA_BLOCKSCOUT_BASE_URL : ETHEREUM_BLOCKSCOUT_BASE_URL;
}

function normalizeNftImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const url = value.trim();
  if (url.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${url.slice(7)}`;
  if (url.startsWith('ar://')) return `https://arweave.net/${url.slice(5)}`;
  return url;
}

function groupCollectibles(items: CollectibleItem[]): CollectionHolding[] {
  const groups = new Map<string, CollectionHolding>();
  for (const item of items) {
    const id = item.collectionId ?? item.programId ?? 'uncollected';
    const current = groups.get(id);
    if (current) {
      current.items.push(item);
      current.itemCount = current.items.length;
    } else {
      groups.set(id, { id, name: item.collectionName ?? item.symbol ?? 'Collectibles', symbol: item.collectionSymbol ?? item.symbol, imageUri: item.imageUri, itemCount: 1, items: [item] });
    }
  }
  return [...groups.values()];
}

async function fetchEvmNftCollections(baseUrl: string, owner: string): Promise<CollectionHolding[]> {
  const response = await fetch(`${baseUrl}/addresses/${encodeURIComponent(owner)}/nft?type=ERC-721,ERC-1155`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`NFT lookup failed with ${response.status}.`);
  const payload = await response.json() as { items?: Array<Record<string, unknown>> };
  const items = (payload.items ?? []).map((entry): CollectibleItem | null => {
    const token = (entry.token && typeof entry.token === 'object' ? entry.token : {}) as Record<string, unknown>;
    const metadata = (entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}) as Record<string, unknown>;
    const contract = String(token.address_hash ?? token.address ?? entry.token_contract_address_hash ?? '');
    const tokenId = String(entry.id ?? entry.token_id ?? '');
    if (!contract || !tokenId) return null;
    const collectionName = typeof token.name === 'string' ? token.name : undefined;
    const symbol = typeof token.symbol === 'string' ? token.symbol : undefined;
    return {
      mint: tokenId, accountAddress: `${contract}:${tokenId}`, programId: contract,
      name: typeof metadata.name === 'string' ? metadata.name : collectionName ? `${collectionName} #${tokenId}` : `NFT #${tokenId}`,
      symbol, imageUri: normalizeNftImageUrl(metadata.image_url ?? metadata.image ?? entry.image_url),
      collectionId: contract, collectionName, collectionSymbol: symbol
    };
  }).filter((item): item is CollectibleItem => item !== null);
  return groupCollectibles(items);
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatBaseUnitDecimal(rawAmount: string, decimals: number): string {
  const normalizedRaw = rawAmount.trim().replace(/^0+/, '') || '0';
  if (decimals <= 0) {
    return normalizedRaw;
  }

  const padded = normalizedRaw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '') || '0';
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

async function fetchEthereumNativePrice(network: 'mainnet-beta' | 'devnet'): Promise<NativeUsdPriceQuote> {
  if (network !== 'mainnet-beta') {
    return {
      usdPrice: null,
      priceChange24h: null
    };
  }

  const response = await fetch(`${getEthereumBlockscoutBaseUrl(network)}/stats`, {
    headers: {
      accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Ethereum pricing request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    coin_price?: unknown;
  };

  return {
    usdPrice: normalizeNumber(payload.coin_price),
    priceChange24h: null
  };
}

type EthereumBlockscoutToken = {
  name?: string | null;
  symbol?: string | null;
  decimals?: string | number | null;
  type?: string | null;
  exchange_rate?: string | number | null;
  address_hash?: string | null;
  icon_url?: string | null;
};

type EthereumBlockscoutTokenBalance = {
  value?: string | null;
  token?: EthereumBlockscoutToken | null;
  token_instance?: {
    token?: EthereumBlockscoutToken | null;
  } | null;
};

async function fetchEthereumTokenBalances(
  network: 'mainnet-beta' | 'devnet',
  owner: string
): Promise<TokenHolding[]> {
  const url = new URL(`${getEthereumBlockscoutBaseUrl(network)}/addresses/${owner}/tokens`);
  url.searchParams.set('type', 'ERC-20');

  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Ethereum token balance request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    items?: EthereumBlockscoutTokenBalance[];
  };

  return (payload.items ?? []).reduce<TokenHolding[]>((tokens, entry) => {
    const token = entry.token_instance?.token ?? entry.token;
    const tokenType = token?.type?.trim().toUpperCase();
    if (tokenType !== 'ERC-20') {
      return tokens;
    }

    const mint = token?.address_hash?.trim();
    if (!mint) {
      return tokens;
    }

    const decimals = normalizeNumber(token?.decimals);
    if (decimals === null || !Number.isInteger(decimals) || decimals < 0) {
      return tokens;
    }

    const rawAmount = entry.value?.trim();
    if (!rawAmount || rawAmount === '0') {
      return tokens;
    }

    const amount = formatBaseUnitDecimal(rawAmount, decimals);
    const amountNumber = Number(amount);
    const priceUsd = normalizeNumber(token?.exchange_rate) ?? getEvmStablecoinPriceUsd(token?.symbol ?? undefined);

    tokens.push({
      mint,
      amount,
      decimals,
      programId: 'erc20',
      accountAddress: owner,
      name: token?.name?.trim() || token?.symbol?.trim() || undefined,
      symbol: token?.symbol?.trim() || undefined,
      logoUri: token?.icon_url?.trim() || undefined,
      priceUsd,
      valueUsd: priceUsd === null || !Number.isFinite(amountNumber) ? null : amountNumber * priceUsd,
      priceChange24h: null,
      delegate: null,
      delegatedAmount: null,
      closeAuthority: null
    } satisfies TokenHolding);
    return tokens;
  }, []);
}

function extractSwapRouteLabels(quoteResponse: JupiterQuoteResponse): string[] {
  return Array.isArray(quoteResponse.routePlan)
    ? quoteResponse.routePlan
        .map((route) => (typeof route?.swapInfo?.label === 'string' ? route.swapInfo.label : null))
        .filter((label): label is string => !!label)
    : [];
}

const controller = new WalletController();

const WEB_PROVIDER_TAB_PATTERNS = ['http://*/*', 'https://*/*'];

function isInjectableProviderTab(url?: string | null): boolean {
  if (!url) {
    return false;
  }

  return url.startsWith('http://') || url.startsWith('https://');
}

async function ensureProviderInjectedIntoTab(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['assets/content-script.js']
    });
  } catch {
    // Ignore unsupported or closed tabs. The declarative content script still
    // covers future page loads for the same origin.
  }
}

async function ensureProviderInjectedIntoExistingTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: WEB_PROVIDER_TAB_PATTERNS });
    await Promise.all(
      tabs
        .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number' && isInjectableProviderTab(tab.url))
        .map((tab) => ensureProviderInjectedIntoTab(tab.id))
    );
  } catch {
    // If tab enumeration is unavailable, fall back to normal page-load injection.
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await Promise.all([walletStateStorage.get(), permissionsStorage.get(), sessionStorage.get()]);
  await ensureProviderInjectedIntoExistingTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureProviderInjectedIntoExistingTabs();
});

chrome.runtime.onMessage.addListener((rawMessage: RuntimeMessage, _sender, sendResponse) => {
  const message = runtimeMessageSchema.parse(rawMessage);

  void (async () => {
    try {
      switch (message.type) {
        case 'wallet_get_state':
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_create':
          await controller.createMnemonicWalletSet(message.mnemonic, message.password, 'created', message.biometricUnlockConfig);
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import':
          await controller.createMnemonicWalletSet(
            message.mnemonic,
            message.password,
            'imported-mnemonic',
            message.biometricUnlockConfig,
            message.solanaAccounts
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_scan_mnemonic_accounts':
          sendResponse(await controller.scanMnemonicAccounts(message.mnemonic, message.count));
          break;
        case 'wallet_import_private_key':
          await controller.createWallet(
            { kind: 'private-key', secretKey: message.privateKey },
            message.password,
            message.publicKey,
            message.chain,
            { kind: 'software' },
            'imported-private-key'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_ledger':
          await controller.createWallet(
            { kind: 'auth-token', token: crypto.randomUUID() },
            message.password,
            message.publicKey,
            message.chain,
            {
              kind: 'ledger',
              transport: 'webhid',
              derivationPath: message.derivationPath
            },
            'ledger'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_ledger_batch':
          for (const account of message.accounts) {
            await controller.createWallet(
              { kind: 'auth-token', token: crypto.randomUUID() },
              message.password,
              account.publicKey,
              message.chain,
              {
                kind: 'ledger',
                transport: 'webhid',
                derivationPath: account.derivationPath
              },
              'ledger'
            );
          }
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_import_watch_only':
          await controller.createWallet(
            { kind: 'auth-token', token: crypto.randomUUID() },
            undefined,
            message.publicKey,
            message.chain,
            { kind: 'watch-only' },
            'watch-only'
          );
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_scan_ledger_accounts': {
          throwLedgerUnsupported();
          break;
        }
        case 'wallet_unlock':
          await controller.unlockWallet(message.password);
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_lock':
          await controller.lockWallet();
          sendResponse(await controller.getStateResponse());
          break;
        case 'wallet_reset':
          sendResponse(await controller.resetWallet());
          break;
        case 'wallet_set_network':
          sendResponse(await controller.setNetwork(message.network));
          break;
        case 'wallet_set_chain':
          sendResponse(await controller.setChain(message.chain));
          break;
        case 'wallet_set_theme':
          sendResponse(await controller.setTheme(message.theme));
          break;
        case 'wallet_set_custom_theme':
          sendResponse(await controller.setCustomTheme(message.customTheme));
          break;
        case 'wallet_set_theme_background_style':
          sendResponse(await controller.setThemeBackgroundStyle(message.style));
          break;
        case 'wallet_set_theme_motion_intensity':
          sendResponse(await controller.setThemeMotionIntensity(message.intensity));
          break;
        case 'wallet_set_privacy_mode':
          sendResponse(await controller.setPrivacyMode(message.enabled));
          break;
        case 'wallet_set_hide_low_value_tokens':
          sendResponse(await controller.setHideLowValueTokens(message.enabled));
          break;
        case 'wallet_set_auto_connect':
          sendResponse(await controller.setAutoConnect(message.enabled));
          break;
        case 'wallet_set_dapp_approval_mode':
          sendResponse(await controller.setDappApprovalMode(message.mode));
          break;
        case 'wallet_set_custom_rpc':
          sendResponse(await controller.setCustomRpc(message.network, message.rpcUrl));
          break;
        case 'wallet_set_sui_custom_rpc':
          sendResponse(await controller.setSuiCustomRpc(message.rpcUrl));
          break;
        case 'wallet_set_monad_custom_rpc':
          sendResponse(await controller.setMonadCustomRpc(message.rpcUrl));
          break;
        case 'wallet_set_ethereum_custom_rpc':
          sendResponse(await controller.setEthereumCustomRpc(message.rpcUrl));
          break;
        case 'wallet_select':
          sendResponse(await controller.selectWallet(message.walletId));
          break;
        case 'wallet_set_label':
          sendResponse(await controller.setWalletLabel(message.walletId, message.name));
          break;
        case 'wallet_remove':
          sendResponse(await controller.removeWallet(message.walletId));
          break;
        case 'wallet_remove_recent_recipient':
          sendResponse(await controller.removeRecentRecipient(message.address));
          break;
        case 'wallet_add_contact':
          sendResponse(
            await controller.addContact({
              label: message.label,
              recipient: message.recipient
            })
          );
          break;
        case 'wallet_remove_contact':
          sendResponse(await controller.removeContact(message.contactId));
          break;
        case 'wallet_set_idle_timeout':
          sendResponse(await controller.setIdleTimeout(message.idleTimeoutMs));
          break;
        case 'wallet_set_reputation_spaces':
          sendResponse(await controller.setTrackedReputationSpaces(message.daoIds));
          break;
        case 'wallet_set_verification_spaces':
          sendResponse(await controller.setTrackedVerificationSpaces(message.daoIds));
          break;
        case 'wallet_set_governance_daos':
          sendResponse(await controller.setTrackedGovernanceDaos(message.daoIds));
          break;
        case 'wallet_set_biometric_unlock':
          sendResponse(await controller.setBiometricUnlock(message.config));
          break;
        case 'wallet_get_balance':
          sendResponse({ lamports: await controller.getBalanceLamports() });
          break;
        case 'wallet_get_assets':
          sendResponse(await controller.getAssets({ staleWhileRevalidate: message.staleWhileRevalidate }));
          break;
        case 'wallet_refresh_asset_values':
          sendResponse(await controller.refreshAssetValues(message.chain));
          break;
        case 'wallet_get_reputation':
          sendResponse(await controller.getReputation());
          break;
        case 'wallet_get_verification':
          sendResponse(await controller.getVerification());
          break;
        case 'wallet_refresh_access':
          sendResponse(await controller.refreshAccessSession());
          break;
        case 'wallet_clear_access':
          sendResponse(await controller.clearAccessSession());
          break;
        case 'wallet_get_governance':
          sendResponse(await controller.getGovernance());
          break;
        case 'wallet_scan_governance_eligibility':
          sendResponse(await controller.scanGovernanceEligibility());
          break;
        case 'wallet_get_activity':
          sendResponse(await controller.getActivity(message.limit));
          break;
        case 'wallet_cast_governance_vote':
          sendResponse(await controller.castGovernanceVote(message));
          break;
        case 'wallet_preview_chain_token':
          sendResponse(await controller.previewChainToken(message.tokenAddress));
          break;
        case 'wallet_get_stake_accounts':
          sendResponse(await controller.getStakeAccounts());
          break;
        case 'wallet_get_stake_validators':
          sendResponse(await controller.getStakeValidators());
          break;
        case 'wallet_get_token_details':
          sendResponse(
            await controller.getTokenDetails({
              mint: message.mint,
              accountAddress: message.accountAddress,
              programId: message.programId
            })
          );
          break;
        case 'wallet_get_token_activity':
          sendResponse(await controller.getTokenActivity(message.accountAddress, message.limit));
          break;
        case 'wallet_stake_create':
          sendResponse(
            await controller.stakeCreate({
              amount: message.amount,
              voteAccount: message.voteAccount,
              password: message.password
            })
          );
          break;
        case 'wallet_stake_deactivate':
          sendResponse(
            await controller.stakeDeactivate({
              stakeAccount: message.stakeAccount,
              password: message.password
            })
          );
          break;
        case 'wallet_stake_withdraw':
          sendResponse(
            await controller.stakeWithdraw({
              stakeAccount: message.stakeAccount,
              amount: message.amount,
              password: message.password
            })
          );
          break;
        case 'wallet_resolve_recipient':
          sendResponse(
            await controller.resolveRecipient({
              recipient: message.recipient
            })
          );
          break;
        case 'wallet_send_transfer':
          sendResponse(
            await controller.sendTransfer({
              recipient: message.recipient,
              amount: message.amount,
              password: message.password,
              asset: message.asset
            })
          );
          break;
        case 'wallet_burn_token':
          sendResponse(
            await controller.burnToken({
              mint: message.mint,
              accountAddress: message.accountAddress,
              amount: message.amount,
              decimals: message.decimals,
              programId: message.programId,
              password: message.password
            })
          );
          break;
        case 'wallet_close_token_account':
          sendResponse(
            await controller.closeTokenAccount({
              mint: message.mint,
              accountAddress: message.accountAddress,
              programId: message.programId,
              password: message.password
            })
          );
          break;
        case 'wallet_get_reclaimable_token_accounts':
          sendResponse(await controller.getReclaimableTokenAccounts());
          break;
        case 'wallet_reclaim_token_accounts':
          sendResponse(await controller.reclaimTokenAccounts({
            accounts: message.accounts,
            password: message.password
          }));
          break;
        case 'wallet_get_swap_quote':
          sendResponse(
            await controller.getSwapQuote({
              amount: message.amount,
              slippageBps: message.slippageBps,
              inputAsset: message.inputAsset,
              outputMint: message.outputMint
            })
          );
          break;
        case 'wallet_execute_swap':
          sendResponse(
            await controller.executeSwap({
              quoteResponse: message.quoteResponse,
              password: message.password
            })
          );
          break;
        case 'wallet_get_bridge_quote':
          sendResponse(
            await controller.getBridgeQuote({
              amount: message.amount,
              toChain: message.toChain,
              destinationWalletId: message.destinationWalletId
            })
          );
          break;
        case 'wallet_execute_bridge':
          sendResponse(
            await controller.executeBridge({
              quoteResponse: message.quoteResponse,
              toChain: message.toChain,
              destinationWalletId: message.destinationWalletId,
              password: message.password
            })
          );
          break;
        case 'wallet_get_security_report':
          sendResponse(await controller.getSecurityReport());
          break;
        case 'wallet_run_incident_response':
          sendResponse(
            await controller.runIncidentResponse({
              safeWallet: message.safeWallet,
              reserveSol: message.reserveSol,
              password: message.password,
              revokeDelegates: message.revokeDelegates,
              sweepSplTokens: message.sweepSplTokens,
              sweepSol: message.sweepSol,
              rotateCloseAuthorities: message.rotateCloseAuthorities,
              rotateMintAuthorities: message.rotateMintAuthorities
            })
          );
          break;
        case 'wallet_export_secret':
          sendResponse(await controller.exportWalletSecret(message.password));
          break;
        case 'wallet_create_device_link_session':
          sendResponse(await controller.createDeviceLinkSession(message.password));
          break;
        case 'wallet_list_device_link_sessions':
          sendResponse(await controller.listDeviceLinkSessions());
          break;
        case 'wallet_delete_device_link_session':
          sendResponse(await controller.deleteDeviceLinkSession(message.sessionId));
          break;
        case 'wallet_import_device_link':
          sendResponse(
            await controller.importDeviceLink({
              payload: message.payload,
              pairingCode: message.pairingCode,
              password: message.password
            })
          );
          break;
        case 'wallet_list_permissions':
          sendResponse((await controller.getStateResponse()).permissions);
          break;
        case 'wallet_revoke_permission':
          sendResponse(await controller.revokePermission(message.origin));
          break;
        case 'wallet_revoke_all_permissions':
          sendResponse(await controller.revokeAllPermissions());
          break;
        case 'approval_get':
          sendResponse(await controller.getApproval(message.approvalId));
          break;
        case 'approval_respond':
          sendResponse(await controller.respondToApproval(message.approvalId, message.approved, message.password));
          break;
        default:
          sendResponse(undefined);
      }
    } catch (error) {
      sendResponse({ error: normalizeError(error) });
    }
  })();

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'grape-surface') {
    port.onMessage.addListener((message) => {
      if (
        message &&
        typeof message === 'object' &&
        message.type === 'register-surface' &&
        typeof message.surfaceId === 'string' &&
        typeof message.page === 'string'
      ) {
        activeWalletSurfacePorts.set(port, {
          port,
          surfaceId: message.surfaceId,
          page: message.page,
          visible: message.visible !== false,
          lastSeenAt: Date.now()
        });
        void assignPendingApprovalsToPreferredSurface();
      } else if (
        message &&
        typeof message === 'object' &&
        message.type === 'surface-visibility' &&
        typeof message.surfaceId === 'string'
      ) {
        const current = activeWalletSurfacePorts.get(port);
        if (current && current.surfaceId === message.surfaceId) {
          current.visible = message.visible !== false;
          current.lastSeenAt = Date.now();
          if (!current.visible) {
            void reassignApprovalsFromSurface(current.surfaceId);
          } else {
            void assignPendingApprovalsToPreferredSurface();
          }
        }
      }
    });
    port.onDisconnect.addListener(() => {
      const surface = activeWalletSurfacePorts.get(port);
      activeWalletSurfacePorts.delete(port);
      if (surface) {
        void reassignApprovalsFromSurface(surface.surfaceId);
      }
    });
    return;
  }

  if (port.name !== 'grape-provider') {
    return;
  }

  port.onMessage.addListener((rawMessage) => {
    void (async () => {
      try {
        const requestId = typeof rawMessage?.id === 'string' ? rawMessage.id : undefined;
        const requestMethod = typeof rawMessage?.method === 'string' ? rawMessage.method : undefined;
        emitProviderDebug(port, {
          phase: 'port_message_received',
          requestId,
          method: requestMethod as ProviderRequest['method'] | undefined,
          origin: typeof rawMessage?.origin?.origin === 'string' ? rawMessage.origin.origin : undefined
        });
        const request = providerRequestSchema.parse(rawMessage);
        emitProviderDebug(port, {
          phase: 'provider_request_parsed',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin
        });
        const result = await controller.handleProviderRequest(request, port, (payload) => emitProviderDebug(port, payload));
        emitProviderDebug(port, {
          phase: 'provider_request_resolved',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        port.postMessage({
          id: request.id,
          success: true,
          result
        });
      } catch (error) {
        const requestId = typeof rawMessage?.id === 'string' ? rawMessage.id : crypto.randomUUID();
        const normalized = normalizeError(error);
        emitProviderDebug(port, {
          phase: 'provider_request_error',
          requestId,
          method: typeof rawMessage?.method === 'string' ? (rawMessage.method as ProviderRequest['method']) : undefined,
          origin: typeof rawMessage?.origin?.origin === 'string' ? rawMessage.origin.origin : undefined,
          success: false,
          code: normalized.code,
          message: normalized.message
        });
        port.postMessage({
          id: requestId,
          success: false,
          error: normalized
        });
      }
    })();
  });
  port.onDisconnect.addListener(() => {
    providerConnectionState.delete(port);
  });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const approvals = await approvalsStorage.get();
  const pendingApproval = Object.values(approvals).find((approval) => approval.windowId === windowId);
  if (!pendingApproval) {
    return;
  }
  await controller.cancelApproval(pendingApproval.id);
});

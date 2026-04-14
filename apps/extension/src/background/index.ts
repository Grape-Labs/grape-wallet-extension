import {
  GRAPE_VERIFICATION_REQUIRED_DAO_ID,
  hasRequiredGrapeVerificationAccess,
  createEmptyWalletState,
  createInitialSessionState,
  createDeviceLinkPayloadText,
  createVaultRecord,
  createPendingApproval,
  decryptText,
  encryptText,
  getSelectedWallet,
  getSelectedWalletForChain,
  parseDeviceLinkPayloadText,
  type DeviceLinkHandoffPayload,
  type DeviceLinkPreferencesSnapshot,
  type DeviceLinkSessionRecord,
  type GrapeChain,
  grantPermissions,
  hasPermission,
  isSessionExpired,
  listPermissions,
  migrateWalletState,
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
  unlockVaultRecord,
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
  signSerializedTransactions
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
  TransactionInstruction
} from '@solana/web3.js';
import {
  getAllGovernances,
  getAllProposals,
  getGovernance,
  getGovernanceProgramVersion,
  getRealmConfigAddress,
  getProposal,
  getRealm,
  getTokenOwnerRecordForRealm,
  getVoteRecord,
  getVoteRecordAddress,
  getVoteRecordsByVoter,
  getTokenOwnerRecordsByOwner,
  getGovernanceAccounts,
  TokenOwnerRecord,
  MemcmpFilter,
  getNativeTreasuryAddress,
  ProposalState,
  Vote,
  VoteChoice,
  VoteKind,
  withCastVote
} from '@solana/spl-governance';
import { sendEthereumTokenWithLedger, sendEthereumWithLedger } from '../../../../packages/ethereum/src/ledger';
import { sendMonadTokenWithLedger, sendMonadWithLedger } from '../../../../packages/monad/src/ledger';
import {
  createSuiClient,
  deriveSuiAccount0,
  getSuiHoldings,
  importSuiPrivateKey,
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
import {
  createJupiterSwapTransaction,
  fetchJupiterPrices,
  fetchJupiterQuote,
  JUPITER_SOL_MINT,
  type JupiterQuoteResponse
} from '../shared/jupiter';
import { fetchNativeBridgeQuote, getSupportedBridgeDestinations, isBridgeRouteSupported, LIFI_NATIVE_DECIMALS, LIFI_NATIVE_SYMBOL } from '../shared/lifi';
import { getRpcEndpoint } from '../shared/rpc';
import {
  fetchShyftCollections,
  fetchShyftStakeAccounts,
  fetchShyftTransactionHistory,
  fetchShyftWalletTokens,
  hasShyftApiKey
} from '../shared/shyft';

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
    granted: false,
    requiredDaoId: GRAPE_VERIFICATION_REQUIRED_DAO_ID,
    grantedAt: null,
    lastCheckedAt: null
  }
);
const unlockedSecretSessionStorage = new ChromeStorageArea<UnlockedSecretCache>(
  chrome.storage.session,
  'grape:unlocked-secrets',
  {}
);
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

function tryParseSolanaPublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

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
    await unlockedSecretSessionStorage.set({});
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
    return Object.keys(this.unlockedSecrets);
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
      recentRecipients: []
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
    const totalMist = BigInt(holdings.totalMist);
    const safeLamports = totalMist > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(totalMist);
    const result: WalletAssetsResponse = {
      lamports: safeLamports,
      tokens: holdings.coins.map((coin) => ({
        mint: coin.coinType,
        amount: coin.amount,
        decimals: coin.decimals,
        programId: 'sui-coin',
        accountAddress: publicKey,
        name: coin.name,
        symbol: coin.symbol,
        logoUri: coin.logoUri,
        priceUsd: null,
        valueUsd: null,
        priceChange24h: null,
        delegate: null,
        delegatedAmount: null,
        closeAuthority: null
      })),
      collections: [],
      nativeName: 'Sui',
      nativeSymbol: 'SUI',
      nativeDecimals: 9,
      totalUsdValue: null,
      nativePriceUsd: null,
      nativeValueUsd: null,
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

  private async refreshMonadAssetsOnly(
    walletId: string,
    network: 'mainnet-beta' | 'devnet',
    publicKey: string,
    walletState: Awaited<ReturnType<WalletController['getWalletState']>>
  ): Promise<WalletAssetsResponse> {
    const client = await this.createMonadClient(network, walletState);
    const holdings = await getMonadHoldings(client, publicKey);
    const safeBaseUnits = holdings.totalWei > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(holdings.totalWei);
    const result: WalletAssetsResponse = {
      lamports: safeBaseUnits,
      tokens: [],
      collections: [],
      nativeName: 'Monad',
      nativeSymbol: 'MON',
      nativeDecimals: 18,
      totalUsdValue: null,
      nativePriceUsd: null,
      nativeValueUsd: null,
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
    const result: WalletAssetsResponse = {
      lamports: safeBaseUnits,
      tokens: [],
      collections: [],
      nativeName: 'Ethereum',
      nativeSymbol: 'ETH',
      nativeDecimals: 18,
      totalUsdValue: null,
      nativePriceUsd: null,
      nativeValueUsd: null,
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
      try {
        pricing = await fetchJupiterPrices([JUPITER_SOL_MINT, ...fungibleTokens.map((token) => token.mint)]);
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
    if (isSessionExpired(session, wallet.idleTimeoutMs)) {
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
    }
    return session;
  }

  async setSessionState(partial: Partial<{ locked: boolean; lastActivityAt: number }>) {
    const current = await this.getSessionState();
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
      await this.persistUnlockedSecrets();
    }
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
  }

  async createMnemonicWalletSet(
    mnemonic: string,
    password: string,
    source: 'created' | 'imported-mnemonic',
    biometricUnlock?: import('@grape/core').BiometricUnlockConfig
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

    const nextState = {
      ...current,
      setup: 'ready' as const,
      wallets: [...current.wallets, solanaProfile, suiProfile, monadProfile, ethereumProfile],
      selectedChain: 'solana' as const,
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
    await this.persistUnlockedSecrets();
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    return nextState;
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
    const [primaryWallet, ...remainingWallets] = prioritizedWallets;

    if (!primaryWallet?.vault) {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
      return true;
    }

    const primarySecret = await unlockVaultRecord(primaryWallet.vault, password).catch(() => null);
    if (!primarySecret) {
      throw new RpcError('INVALID_PASSWORD', 'Password is incorrect.');
    }

    const unlockedAt = Date.now();
    const nextUnlockedSecrets: typeof this.unlockedSecrets = {
      [primaryWallet.id]: {
        secret: primarySecret,
        unlockedAt
      }
    };

    if (primarySecret.kind === 'mnemonic') {
      for (const wallet of walletState.wallets) {
        if (
          !wallet.vault ||
          nextUnlockedSecrets[wallet.id] ||
          wallet.id === primaryWallet.id ||
          wallet.signer.kind !== 'software' ||
          wallet.source !== primaryWallet.source ||
          wallet.name !== primaryWallet.name
        ) {
          continue;
        }

        nextUnlockedSecrets[wallet.id] = {
          secret: primarySecret,
          unlockedAt
        };
      }
    }

    this.unlockedSecrets = nextUnlockedSecrets;
    await this.persistUnlockedSecrets();
    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });

    void (async () => {
      for (const wallet of remainingWallets) {
        if (!wallet.vault || this.unlockedSecrets[wallet.id]) {
          continue;
        }

        try {
          const secret = await unlockVaultRecord(wallet.vault, password);
          this.unlockedSecrets[wallet.id] = {
            secret,
            unlockedAt: Date.now()
          };
          await this.persistUnlockedSecrets();
        } catch {
          // Ignore secondary-wallet failures and keep the primary unlock fast.
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();

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
    const unlockedWalletIds = await this.getUnlockedWalletIds(session.locked);

    return {
      wallet,
      session,
      permissions: listPermissions(permissions),
      access,
      activeWallet:
        activeWallet && activeAccount
          ? {
              id: activeWallet.id,
              name: activeWallet.name,
              publicKey: activeAccount.publicKey,
              chain: activeWallet.chain,
              biometricEnabled: !!activeWallet.biometricUnlock,
              source: activeWallet.source,
              signerKind: activeWallet.signer.kind
            }
          : undefined,
      activeAccount: activeAccount ? { publicKey: activeAccount.publicKey } : undefined,
      recentRecipients: activeWallet?.recentRecipients ?? [],
      canUseUnlockedSigner: !!(activeWallet && activeWallet.signer.kind !== 'watch-only' && unlockedWalletIds.includes(activeWallet.id)),
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
          selectedNetwork: selectedChain === 'sui' ? network : walletState.chainState.selectedNetwork
        },
        monad: {
          ...walletState.chainState.monad,
          selectedNetwork: selectedChain === 'monad' ? network : walletState.chainState.selectedNetwork
        },
        ethereum: {
          ...walletState.chainState.ethereum,
          selectedNetwork: selectedChain === 'ethereum' ? network : walletState.chainState.selectedNetwork
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

  async setPrivacyMode(enabled: boolean) {
    const walletState = await this.getWalletState();
    await walletStateStorage.set({
      ...walletState,
      privacyMode: enabled
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
            ? walletState.chainState.selectedNetwork
            : chain === 'monad'
              ? walletState.chainState.selectedNetwork
              : walletState.chainState.selectedNetwork,
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
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id
          ? {
              ...wallet,
              biometricUnlock: config ?? undefined
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
      const total = BigInt(balance.totalBalance);
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
    secret: VaultSecret,
    connection: Connection,
    transaction: Transaction
  ) {
    try {
      return selectedWallet.signer.kind === 'ledger'
        ? throwLedgerUnsupported()
        : await signAndSendTransaction(transaction, resolveSolanaVaultSecret(secret), connection);
    } catch (error) {
      throw normalizeSigningError(error);
    } finally {
      await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    }
  }

  private async submitInstructionBatches(
    selectedWallet: NonNullable<ReturnType<typeof getSelectedWallet>>,
    activePublicKey: string,
    secret: VaultSecret,
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

      const connection = this.createConnection(network, walletState);
      let identities: WalletVerificationResponse['identities'] = [];
      try {
        identities = await fetchVerificationForWallet(connection, owner, trackedSpaces);
      } catch {
        identities = [];
      }

      const result: WalletVerificationResponse = {
        trackedSpaces,
        identities,
        totalVerified: identities.filter((identity) => identity.verified).length,
        source: trackedSpaces.length > 0 ? 'onchain' : 'none',
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
    const walletState = await this.getWalletState();
    const currentAccess = await accessSessionStorage.get();
    const verificationTarget = this.getAccessVerificationTarget(walletState);
    if (!verificationTarget) {
      throw new RpcError('ACCESS_UNAVAILABLE', 'Create or import a Solana wallet before checking Grape access.');
    }

    const owner = tryParseSolanaPublicKey(verificationTarget.publicKey);
    if (!owner) {
      throw new RpcError('ACCESS_UNAVAILABLE', 'The selected Solana wallet address is invalid.');
    }

    const connection = this.createConnection('mainnet-beta', walletState);
    const identities = await fetchVerificationForWallet(connection, owner, [GRAPE_VERIFICATION_REQUIRED_DAO_ID]);
    const now = Date.now();

    if (!hasRequiredGrapeVerificationAccess(identities)) {
      await accessSessionStorage.set({
        ...currentAccess,
        granted: currentAccess.granted,
        lastCheckedAt: now
      });

      if (currentAccess.granted) {
        return this.getStateResponse();
      }

      throw new RpcError(
        'ACCESS_REQUIRED',
        'Verify one of your Solana wallets in Grape Verification to unlock Grape on this device.'
      );
    }

    await accessSessionStorage.set({
      granted: true,
      requiredDaoId: GRAPE_VERIFICATION_REQUIRED_DAO_ID,
      grantedAt: currentAccess.grantedAt ?? now,
      lastCheckedAt: now,
      qualifyingWalletPublicKey: verificationTarget.publicKey
    });

    return this.getStateResponse();
  }

  async clearAccessSession() {
    await accessSessionStorage.set({
      granted: false,
      requiredDaoId: GRAPE_VERIFICATION_REQUIRED_DAO_ID,
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

    const governanceOwner = findGovernanceOwnerByDao(input.daoId);
    const programId = new PublicKey(governanceOwner.owner);
    const realmPk = new PublicKey(input.daoId);
    const governancePk = new PublicKey(input.governanceId);
    const proposalPk = new PublicKey(input.proposalId);
    const proposalOwnerRecordPk = new PublicKey(input.proposalOwnerRecordId);
    const tokenOwnerRecordPk = new PublicKey(input.tokenOwnerRecordId);
    const governingTokenMintPk = new PublicKey(input.governingTokenMint);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);

    const [programVersion, proposalAccount, governanceAccount, realmAccount] = await Promise.all([
      resolveGovernanceProgramVersion(connection, programId, realmPk),
      getProposal(connection, proposalPk),
      getGovernance(connection, governancePk),
      getRealm(connection, realmPk)
    ]);

    if (proposalAccount.account.state !== ProposalState.Voting) {
      throw new RpcError('PROPOSAL_NOT_VOTING', 'This proposal is not in the voting window anymore.');
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
      owner
    );

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: owner,
      recentBlockhash: blockhash
    });
    transaction.add(...instructions);
    const signature = await this.submitTransactionForWallet(selectedWallet, activeAccount.publicKey, secret, connection, transaction);

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
    const [shyftMetadataResult, tokenAccountInfo, mintAccountInfo] = await Promise.all([
      hasShyftApiKey()
        ? fetchShyftWalletTokens(walletState.selectedNetwork, activeAccount.publicKey).catch(() => ({}))
        : Promise.resolve({}),
      connection.getParsedAccountInfo(accountAddress, 'confirmed'),
      connection.getParsedAccountInfo(mintAddress, 'confirmed')
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
      updateAuthority: parsedMetadata?.updateAuthority ?? null
    };
  }

  async revokePermission(origin: string) {
    const permissions = await permissionsStorage.get();
    await permissionsStorage.set(revokeOriginPermissions(permissions, origin));
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

  private resolvePublicKeyFromSecret(secret: VaultSecret, chain: GrapeChain): string {
    if (secret.kind === 'mnemonic') {
      switch (chain) {
        case 'solana':
          return deriveSolanaAccount0(secret.mnemonic).publicKey;
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
        transaction.partialSign(resolveSolanaVaultSecret(secret));
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

  async sendTransfer(input: { recipient: string; amount: string; password?: string; asset: SendAsset }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }
    let signature: string;

    if (selectedWallet.chain === 'sui') {
      if (!validateSuiAddress(input.recipient)) {
        throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Sui wallet address.');
      }

      try {
        const client = await this.createSuiClient(walletState.selectedNetwork, walletState);
        if (selectedWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Sui Ledger support is not available in this build yet.');
        } else {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          const signer = resolveSuiVaultSecret(secret);
          if (input.asset.kind === 'sui') {
            signature = await sendSui(client, signer, {
              recipient: input.recipient,
              amountMist: parseDecimalAmount(input.amount, 9)
            });
          } else if (input.asset.kind === 'sui-coin') {
            signature = await sendSuiCoin(client, signer, {
              recipient: input.recipient,
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
      if (!validateMonadAddress(input.recipient)) {
        throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Monad wallet address.');
      }

      try {
        if (selectedWallet.signer.kind === 'ledger') {
          if (input.asset.kind === 'mon') {
            signature = await sendMonadWithLedger(this.resolveMonadNetwork(walletState.selectedNetwork), selectedWallet.signer.derivationPath, {
              recipient: input.recipient,
              amountEther: input.amount,
              customRpcUrl: walletState.chainState.monad.customRpcUrl
            });
          } else if (input.asset.kind === 'evm-token') {
            signature = await sendMonadTokenWithLedger(
              this.resolveMonadNetwork(walletState.selectedNetwork),
              selectedWallet.signer.derivationPath,
              {
                recipient: input.recipient,
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
            recipient: input.recipient,
            amountEther: input.amount,
            customRpcUrl: walletState.chainState.monad.customRpcUrl
          });
        } else if (input.asset.kind === 'evm-token') {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          signature = await sendMonadToken(this.resolveMonadNetwork(walletState.selectedNetwork), secret, {
            recipient: input.recipient,
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
      if (!validateEthereumAddress(input.recipient)) {
        throw new RpcError('INVALID_RECIPIENT', 'Enter a valid Ethereum wallet address.');
      }

      try {
        if (selectedWallet.signer.kind === 'ledger') {
          if (input.asset.kind === 'eth') {
            signature = await sendEthereumWithLedger(this.resolveEthereumNetwork(walletState.selectedNetwork), selectedWallet.signer.derivationPath, {
              recipient: input.recipient,
              amountEther: input.amount,
              customRpcUrl: walletState.chainState.ethereum.customRpcUrl
            });
          } else if (input.asset.kind === 'evm-token') {
            signature = await sendEthereumTokenWithLedger(
              this.resolveEthereumNetwork(walletState.selectedNetwork),
              selectedWallet.signer.derivationPath,
              {
                recipient: input.recipient,
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
            recipient: input.recipient,
            amountEther: input.amount,
            customRpcUrl: walletState.chainState.ethereum.customRpcUrl
          });
        } else if (input.asset.kind === 'evm-token') {
          const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
          signature = await sendEthereumToken(this.resolveEthereumNetwork(walletState.selectedNetwork), secret, {
            recipient: input.recipient,
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
              recipient: input.recipient,
              amount: input.amount
            })
          : await buildSplTokenTransferTransaction(connection, owner, {
              recipient: input.recipient,
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
            : await signAndSendTransaction(transaction, resolveSolanaVaultSecret(secret), connection);
      } catch (error) {
        throw normalizeSigningError(error);
      }
    }

    await walletStateStorage.set({
      ...walletState,
      wallets: walletState.wallets.map((wallet) =>
        wallet.id === selectedWallet.id ? rememberWalletRecipient(wallet, input.recipient) : wallet
      )
    });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });

    return {
      signature,
      recipient: input.recipient,
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
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Swaps are currently available for Solana only.');
    }
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('SWAP_UNAVAILABLE', 'Native swaps are currently available only on mainnet-beta.');
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

  async executeSwap(input: { quoteResponse: JupiterQuoteResponse; password?: string }) {
    const { walletState, selectedWallet } = await this.ensureReadyWallet();
    this.assertInteractiveWallet(selectedWallet);
    if (selectedWallet.chain !== 'solana') {
      throw new RpcError('UNSUPPORTED_CHAIN', 'Swaps are currently available for Solana only.');
    }
    if (walletState.selectedNetwork !== 'mainnet-beta') {
      throw new RpcError('SWAP_UNAVAILABLE', 'Native swaps are currently available only on mainnet-beta.');
    }

    const activeAccount = selectedWallet.accounts.find((account) => account.id === selectedWallet.selectedAccountId);
    if (!activeAccount) {
      throw new RpcError('ACCOUNT_MISSING', 'No active account is available.');
    }

    const secret = await this.getUnlockedSecret(selectedWallet.id, selectedWallet.vault, input.password);
    const connection = this.createConnection(walletState.selectedNetwork, walletState);
    const swap = await createJupiterSwapTransaction({
      quoteResponse: input.quoteResponse,
      userPublicKey: activeAccount.publicKey
    });

    let signature: string;
    try {
      signature =
        selectedWallet.signer.kind === 'ledger'
          ? throwLedgerUnsupported()
          : await signAndSendSerializedTransaction(
              swap.swapTransaction,
              resolveSolanaVaultSecret(secret),
              this.resolveRpcEndpoint(walletState.selectedNetwork, walletState)
            );
    } catch (error) {
      throw normalizeSigningError(error);
    }

    await this.setSessionState({ locked: false, lastActivityAt: Date.now() });
    await this.invalidateAssetCache(this.getAssetCacheKey(selectedWallet.id, walletState.selectedNetwork, activeAccount.publicKey));

    return {
      signature,
      inputMint: input.quoteResponse.inputMint,
      outputMint: input.quoteResponse.outputMint,
      inputAmountUi: formatUiAmount(input.quoteResponse.inAmount, await getMintDecimals(connection, input.quoteResponse.inputMint)),
      outputAmountUi: formatUiAmount(input.quoteResponse.outAmount, await getMintDecimals(connection, input.quoteResponse.outputMint))
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

    const transactionRequest = this.extractBridgeTransactionRequest(input.quoteResponse);

    if (!transactionRequest?.to || !transactionRequest.data) {
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
        signature = await signAndSendSerializedTransaction(
          transactionRequest.data,
          resolveSolanaVaultSecret(secret),
          this.resolveRpcEndpoint(walletState.selectedNetwork, walletState)
        );
      } else if (selectedWallet.chain === 'ethereum') {
        signature = await sendEthereumTransactionRequest(this.resolveEthereumNetwork(walletState.selectedNetwork), secret, {
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value,
          customRpcUrl: walletState.chainState.ethereum.customRpcUrl
        });
      } else if (selectedWallet.chain === 'monad') {
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

  private extractBridgeTransactionRequest(quoteResponse: Record<string, unknown>) {
    const directTransactionRequest =
      typeof quoteResponse.transactionRequest === 'object' && quoteResponse.transactionRequest
        ? (quoteResponse.transactionRequest as { to?: string; data?: string; value?: string })
        : null;

    if (directTransactionRequest?.to && directTransactionRequest.data) {
      return directTransactionRequest;
    }

    const candidateCollections = [quoteResponse.includedSteps, quoteResponse.steps];
    for (const collection of candidateCollections) {
      if (!Array.isArray(collection)) {
        continue;
      }

      for (const step of collection) {
        if (typeof step !== 'object' || !step) {
          continue;
        }

        const transactionRequest =
          typeof (step as { transactionRequest?: unknown }).transactionRequest === 'object' &&
          (step as { transactionRequest?: unknown }).transactionRequest
            ? ((step as { transactionRequest: { to?: string; data?: string; value?: string } }).transactionRequest)
            : null;

        if (transactionRequest?.to && transactionRequest.data) {
          return transactionRequest;
        }
      }
    }

    return null;
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

  async handleProviderRequest(request: ProviderRequest, debug?: (payload: ProviderDebugPayload) => void): Promise<unknown> {
    debug?.({
      phase: 'handle_provider_request_start',
      requestId: request.id,
      method: request.method,
      origin: request.origin.origin
    });
    const walletState = await this.getWalletState();
    const requestChain = getProviderRequestChain(request);
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

    if (request.method === 'disconnect' || request.method === 'sui_disconnect') {
      return { disconnected: true };
    }

    if (request.method === 'monad_chainId') {
      return this.resolveMonadChainId(selectedNetwork);
    }

    if (request.method === 'monad_switchChain' || request.method === 'monad_addChain') {
      const nextNetwork = this.resolveMonadNetworkFromChainId(request.params.chainId);
      if (!nextNetwork) {
        throw new RpcError('CHAIN_UNSUPPORTED', 'Grape only supports Monad mainnet and testnet.');
      }

      await this.setChainNetwork('monad', nextNetwork === 'testnet' ? 'devnet' : 'mainnet-beta');
      return null;
    }

    const isTrusted = hasPermission(permissions, request.origin.origin, accountPermission);

    if (request.method === 'sui_getAccounts') {
      return isTrusted ? [await this.getSuiProviderAccount(selectedWallet, activeAccount)] : [];
    }

    if (request.method === 'monad_accounts') {
      return isTrusted ? [activeAccount.publicKey] : [];
    }

    if (isProviderConnectRequest(request)) {
      const silentConnect =
        request.method === 'connect' || request.method === 'sui_connect' ? !!request.params.silent : false;

      if (silentConnect) {
        if (!isTrusted) {
          throw new RpcError('NOT_CONNECTED', 'This site has not been approved yet.');
        }
        debug?.({
          phase: 'connect_silent_trusted',
          requestId: request.id,
          method: request.method,
          origin: request.origin.origin,
          success: true
        });
        return this.buildProviderConnectResult(request, selectedWallet, activeAccount);
      }

      if (isTrusted) {
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
        requestedPermissions: getRequestedPermissionLabels(requestChain, selectedWallet.signer.kind)
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

    if (!hasPermission(permissions, request.origin.origin, accountPermission)) {
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

    const transactionSummary =
      request.method === 'signTransaction' || request.method === 'signAndSendTransaction' || request.method === 'sendTransaction'
        ? await inspectTransaction(request.params.transaction, this.createConnection(selectedNetwork, walletState))
        : request.method === 'signAllTransactions'
          ? {
              ...(await inspectTransaction(
                request.params.transactions[0],
                this.createConnection(selectedNetwork, walletState)
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
      const result = await this.executeApproval(approval, password);
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

        const signer = resolveSolanaVaultSecret(secret);
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
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger message signing is not supported for Monad dapps.');
        }

        const signer = resolveMonadVaultSecret(secret);
        return signer.signMessage({
          message: normalizeMonadSignMessage(approval.request.params.message)
        });
      }
      case 'monad_signTypedData': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger typed data signing is not supported for Monad dapps.');
        }

        const signer = resolveMonadVaultSecret(secret);
        return signer.signTypedData(JSON.parse(approval.request.params.typedData));
      }
      case 'signTransaction': {
        const transactionRequest = approval.request as Extract<ProviderRequest, { method: 'signTransaction' }>;
        return {
          transaction:
            approvalWallet.signer.kind === 'ledger'
              ? throwLedgerUnsupported()
              : signSerializedTransaction(transactionRequest.params.transaction, resolveSolanaVaultSecret(secret))
        };
      }
      case 'sui_signTransaction': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger transaction signing is not supported for Sui dapps.');
        }

        const signer = resolveSuiVaultSecret(secret);
        const signed = await signer.signTransaction(atobBytes(approval.request.params.transaction));
        return {
          address: signer.toSuiAddress(),
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
              : signSerializedTransactions(transactionsRequest.params.transactions, resolveSolanaVaultSecret(secret))
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
                    resolveSolanaVaultSecret(secret),
                    this.resolveRpcEndpoint(approval.network, walletState)
                  )
          };
        } catch (error) {
          throw normalizeSigningError(error);
        }
      }
      case 'sui_signAndExecuteTransaction': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger transaction execution is not supported for Sui dapps.');
        }

        const signer = resolveSuiVaultSecret(secret);
        const client = await this.createSuiClient(approval.network, walletState);
        const signed = await signer.signTransaction(atobBytes(approval.request.params.transaction));
        const result = await client.executeTransactionBlock({
          transactionBlock: signed.bytes,
          signature: signed.signature,
          options: {
            showRawEffects: true
          }
        });

        return {
          address: signer.toSuiAddress(),
          bytes: signed.bytes,
          signature: signed.signature,
          digest: result.digest,
          effects: result.rawEffects ? arrayBufferToBase64(new Uint8Array(result.rawEffects)) : undefined
        };
      }
      case 'monad_sendTransaction': {
        if (approvalWallet.signer.kind === 'ledger') {
          throw new RpcError('LEDGER_UNSUPPORTED', 'Ledger contract transaction execution is not supported for Monad dapps.');
        }

        const transactionRequest = approval.request.params.transaction;
        if (!transactionRequest.to?.trim()) {
          throw new RpcError('INVALID_REQUEST', 'Monad transactions must include a destination address.');
        }

        return {
          signature: await sendMonadTransactionRequest(this.resolveMonadNetwork(approval.network), secret, {
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
    const unlockedWalletIds = await this.getUnlockedWalletIds(session.locked);
    const kind = toApprovalKind(request);
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
      requiresPassword: !unlockedWalletIds.includes(walletId),
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

    if (!password) {
      throw new RpcError('PASSWORD_REQUIRED', 'Password is required to sign.');
    }

    const secret = await unlockVaultRecord(vault, password);
    this.unlockedSecrets[walletId] = {
      secret,
      unlockedAt: Date.now()
    };
    await this.persistUnlockedSecrets();
    return secret;
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

function getProviderRequestChain(request: ProviderRequest): GrapeChain {
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
    case 'monad_switchChain':
    case 'monad_addChain':
    case 'monad_sendTransaction':
    case 'monad_signMessage':
    case 'monad_signTypedData':
      return 'monad';
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
    throw new Error(`Governance GraphQL request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
  }

  if (!payload.data) {
    throw new Error('Governance GraphQL response did not include data.');
  }

  return payload.data;
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
        const loadPagedTokenOwnerRows = async (queryBuilder: (offset: number) => string) => {
          const mergedV2: Array<Record<string, unknown>> = [];
          const mergedV1: Array<Record<string, unknown>> = [];

          for (let offset = 0; offset < 10000; offset += 1000) {
            const page = await fetchGovernanceGraphql<Record<string, unknown>>(queryBuilder(offset));
            const pageV2 = Array.isArray(page[`${namespace}_TokenOwnerRecordV2`])
              ? (page[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>)
              : [];
            const pageV1 = Array.isArray(page[`${namespace}_TokenOwnerRecordV1`])
              ? (page[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>)
              : [];

            mergedV2.push(...pageV2);
            mergedV1.push(...pageV1);

            if (pageV2.length < 1000 && pageV1.length < 1000) {
              break;
            }
          }

          return {
            [`${namespace}_TokenOwnerRecordV2`]: mergedV2,
            [`${namespace}_TokenOwnerRecordV1`]: mergedV1
          } satisfies Record<string, unknown>;
        };

        // Direct + delegate are paginated independently so large delegate sets don't crowd out
        // the wallet's own memberships under the indexer's page caps.
        const [directData, delegateData, governedData] = await Promise.all([
          loadPagedTokenOwnerRows((offset) => buildGovernanceDirectMemberQuery(namespace, ownerKey, offset)),
          loadPagedTokenOwnerRows((offset) => buildGovernanceDelegateQuery(namespace, ownerKey, offset)).catch(() => ({} as Record<string, unknown>)),
          fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceGovernedAccountQuery(namespace, ownerKey)).catch(() => ({} as Record<string, unknown>))
        ]);

        const directV2 = Array.isArray(directData[`${namespace}_TokenOwnerRecordV2`])
          ? (directData[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>)
          : [];
        const directV1 = Array.isArray(directData[`${namespace}_TokenOwnerRecordV1`])
          ? (directData[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>)
          : [];
        const delegateV2 = Array.isArray(delegateData[`${namespace}_TokenOwnerRecordV2`])
          ? (delegateData[`${namespace}_TokenOwnerRecordV2`] as Array<Record<string, unknown>>)
          : [];
        const delegateV1 = Array.isArray(delegateData[`${namespace}_TokenOwnerRecordV1`])
          ? (delegateData[`${namespace}_TokenOwnerRecordV1`] as Array<Record<string, unknown>>)
          : [];

        const mergedData: Record<string, unknown> = {
          [`${namespace}_TokenOwnerRecordV2`]: [...directV2, ...delegateV2],
          [`${namespace}_TokenOwnerRecordV1`]: [...directV1, ...delegateV1]
        };

        const { directDaoIds, delegateDaoIds } = normalizeGovernanceOwnerDaoIds(mergedData, namespace, ownerKey);
        const governedDaoIds = normalizeGovernanceGovernedDaoIds(governedData, namespace).filter(
          (id) => !directDaoIds.includes(id) && !delegateDaoIds.includes(id)
        );

        const entries: Entry[] = [
          ...directDaoIds.map((id) => makeEntry(id, false, false)),
          ...delegateDaoIds.map((id) => makeEntry(id, true, false)),
          ...governedDaoIds.map((id) => makeEntry(id, false, true))
        ];

        // Step 2: If nothing found yet, try native treasury PDA discovery
        if (entries.length === 0) {
          try {
            const treasuryDaoIds = await discoverGovernanceTreasuryDaosForNamespace(owner, namespace, programId);
            entries.push(...treasuryDaoIds.map((id) => makeEntry(id, false, true)));
          } catch {
            // Treasury discovery is best-effort
          }
        }

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

async function resolveGovernanceOwnerByRealm(daoId: string): Promise<GovernanceOwner> {
  const mapped = GOVERNANCE_OWNERS.find((entry) => entry.dao === daoId);
  if (mapped) {
    return mapped;
  }

  for (const { namespace, programId } of getGovernanceNamespaces()) {
    try {
      const data = await fetchGovernanceGraphql<Record<string, unknown>>(buildGovernanceRealmQuery(namespace, daoId));
      const realm = normalizeGovernanceRealmInfo(data, namespace, daoId);
      if (realm) {
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

async function resolveGovernanceProposalMemberships(
  connection: Connection,
  programId: PublicKey,
  realmPk: PublicKey,
  proposalMint: string,
  ownerKey: string,
  memberships: GovernanceMembershipRecord[],
  loadRealmTokenOwnerRecords: () => Promise<TokenOwnerRecord[]>
): Promise<GovernanceMembershipRecord[]> {
  if (getGovernanceEligibleVoteMemberships(proposalMint, ownerKey, memberships).length > 0) {
    return memberships;
  }

  const merged = new Map(memberships.map((entry) => [entry.pubkey, entry] as const));
  const ownerPk = tryParseSolanaPublicKey(ownerKey);
  const proposalMintPk = tryParseSolanaPublicKey(proposalMint);

  if (ownerPk && proposalMintPk) {
    try {
      const directRecord = await getTokenOwnerRecordForRealm(connection, programId, realmPk, proposalMintPk, ownerPk);
      const normalized = toGovernanceMembershipRecord(directRecord);
      if (
        BigInt(normalized.governingTokenDepositAmount) > 0n &&
        (!normalized.governanceDelegate || normalized.governanceDelegate === ownerKey)
      ) {
        merged.set(normalized.pubkey, normalized);
      }
    } catch {
      // Ignore and keep the indexed memberships if the direct TOR lookup misses.
    }
  }

  try {
    const realmTokenOwnerRecords = await loadRealmTokenOwnerRecords();
    for (const entry of realmTokenOwnerRecords) {
      const normalized = toGovernanceMembershipRecord(entry);
      if (normalized.governingTokenMint !== proposalMint) {
        continue;
      }
      if (BigInt(normalized.governingTokenDepositAmount) <= 0n) {
        continue;
      }

      const isDirect = normalized.governingTokenOwner === ownerKey;
      if (isDirect) {
        if (!normalized.governanceDelegate || normalized.governanceDelegate === ownerKey) {
          merged.set(normalized.pubkey, normalized);
        }
        continue;
      }

      if (normalized.governanceDelegate === ownerKey) {
        merged.set(normalized.pubkey, normalized);
      }
    }
  } catch {
    // Ignore RPC fallback failure and keep the existing memberships.
  }

  return Array.from(merged.values());
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
  connection: Connection,
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
  const programId = new PublicKey(governanceOwner.owner);
  const realmPk = new PublicKey(daoId);
  let realmTokenOwnerRecordCachePromise: Promise<TokenOwnerRecord[]> | null = null;
  const loadRealmTokenOwnerRecords = () => {
    if (!realmTokenOwnerRecordCachePromise) {
      realmTokenOwnerRecordCachePromise = getGovernanceAccounts(connection, programId, TokenOwnerRecord, [
        new MemcmpFilter(1, realmPk.toBuffer())
      ]).catch(() => []);
    }
    return realmTokenOwnerRecordCachePromise;
  };
  const votedOwnersByProposal = normalizeGovernanceVoteOwnersByProposal(voteData, namespace);

  const proposals = (
    await Promise.all(
    proposalRows.map(async (proposal) => {
      const proposalMemberships = await resolveGovernanceProposalMemberships(
        connection,
        programId,
        realmPk,
        proposal.governingTokenMint,
        ownerKey,
        membershipRecords,
        loadRealmTokenOwnerRecords
      );
      const votedOwners = votedOwnersByProposal.get(proposal.pubkey) ?? new Set<string>();
      const votedTokenOwnerRecordsByProposal = await resolveGovernanceVoteSourceStatus(
        connection,
        programId,
        ownerKey,
        [{ proposalId: proposal.pubkey, governingTokenMint: proposal.governingTokenMint }],
        proposalMemberships
      ).catch(() => new Map<string, Set<string>>());
      const votedTokenOwnerRecordIds = votedTokenOwnerRecordsByProposal.get(proposal.pubkey) ?? new Set<string>();
      const voteSources = buildGovernanceProposalVoteSources(
        proposal.governingTokenMint,
        ownerKey,
        proposalMemberships,
        votedOwners,
        votedTokenOwnerRecordIds
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
    )
  ).sort((left, right) => (right.votingAt ?? right.draftAt ?? 0) - (left.votingAt ?? left.draftAt ?? 0));

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
  const discoveredDaoOwnerMap = await discoverGovernanceDaoOwnersForWallet(owner);

  // ── RPC-based global TOR discovery ──────────────────────────────────────────
  // Shyft may not index all TokenOwnerRecords. We query every known governance
  // program in parallel — one getProgramAccounts call per program — so DAOs on
  // custom programs (Marinade, Jito, Helium, etc.) are found even when Shyft
  // has no entry for them.
  // We also fetch TORs where the wallet is the delegate (offset 122 in TOR layout:
  //   1 accountType + 32 realm + 32 mint + 32 owner + 8 deposit + 4+4+1+1+6 misc + 1 option = 122).
  const rpcTorsByRealm = new Map<string, GovernanceMembershipRecord[]>();
  const allProgramIds = Array.from(
    new Set([DEFAULT_GOVERNANCE_PROGRAM_ID, ...GOVERNANCE_OWNERS.map((e) => e.owner)])
  );
  const [torResults, delegateTorResults] = await Promise.all([
    Promise.allSettled(
      allProgramIds.map((pid) => getTokenOwnerRecordsByOwner(connection, new PublicKey(pid), owner))
    ),
    Promise.allSettled(
      allProgramIds.map((pid) =>
        getGovernanceAccounts(connection, new PublicKey(pid), TokenOwnerRecord, [
          new MemcmpFilter(122, owner.toBuffer())
        ]).catch(() => [])
      )
    )
  ]);

  const addTorToMap = (tor: { pubkey: { toBase58(): string }; account: { realm: { toBase58(): string }; governingTokenMint: { toBase58(): string }; governingTokenOwner: { toBase58(): string }; governanceDelegate?: { toBase58(): string } | null; governingTokenDepositAmount: { toString(): string } } }, programId: string, isDelegate: boolean) => {
    const realmId = tor.account.realm.toBase58();
    const rec: GovernanceMembershipRecord = {
      pubkey: tor.pubkey.toBase58(),
      governingTokenMint: tor.account.governingTokenMint.toBase58(),
      governingTokenOwner: tor.account.governingTokenOwner.toBase58(),
      governanceDelegate: tor.account.governanceDelegate?.toBase58() ?? null,
      governingTokenDepositAmount: tor.account.governingTokenDepositAmount.toString()
    };
    if (!rpcTorsByRealm.has(realmId)) rpcTorsByRealm.set(realmId, []);
    // Avoid duplicates (an owner TOR already in the map)
    const existing = rpcTorsByRealm.get(realmId)!;
    if (!existing.some((r) => r.pubkey === rec.pubkey)) {
      existing.push(rec);
    }
    if (!discoveredDaoOwnerMap.has(realmId)) {
      const knownOwner = GOVERNANCE_OWNERS.find((e) => e.owner === programId && e.dao === realmId)
        ?? GOVERNANCE_OWNERS.find((e) => e.owner === programId);
      discoveredDaoOwnerMap.set(realmId, {
        owner: { owner: programId, name: knownOwner?.name ?? programId, dao: realmId },
        isDelegate,
        isNonMember: false
      });
    }
  };

  for (let i = 0; i < allProgramIds.length; i++) {
    const programId = allProgramIds[i];
    const ownerResult = torResults[i];
    if (ownerResult.status === 'fulfilled') {
      for (const tor of ownerResult.value) addTorToMap(tor, programId, false);
    }
    const delegateResult = delegateTorResults[i];
    if (delegateResult.status === 'fulfilled') {
      for (const tor of delegateResult.value) addTorToMap(tor, programId, true);
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

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
        const governanceOwner = discovered?.owner ?? (await resolveGovernanceOwnerByRealm(daoId));
        const isDelegateDao = discovered?.isDelegate === true;
        // Non-member: treasury/governed wallet, OR manually tracked but not discovered
        const isNonMemberDao = discovered?.isNonMember === true || (!discovered && uniqueTrackedDaoIds.includes(daoId));
        // Pre-fetched TORs for this realm (from the global getTokenOwnerRecordsByOwner call)
        const preloadedRpcTors = rpcTorsByRealm.get(daoId);
        try {
        return await fetchGovernanceForDaoViaGraphql(
          connection,
          owner,
          daoId,
          governanceOwner,
          isDelegateDao,
          isNonMemberDao,
          preloadedRpcTors
        );
      } catch {
        const fallbackRealm = preloadedRpcTors && preloadedRpcTors.length > 0
          ? await resolveGovernanceRealmInfo(connection, daoId, governanceOwner).catch(() => null)
          : null;
        const fallbackDaoSummary = fallbackRealm && preloadedRpcTors && preloadedRpcTors.length > 0
          ? {
              ...buildGovernanceDaoSummary(
                daoId,
                fallbackRealm.name,
                fallbackRealm.communityMint,
                owner.toBase58(),
                preloadedRpcTors,
                isNonMemberDao,
                isDelegateDao
              ),
              councilMint: fallbackRealm.councilMint
            }
          : null;
        return {
          source: 'none' as const,
          member: (preloadedRpcTors?.length ?? 0) > 0,
          proposals: [],
          daoSummary: fallbackDaoSummary
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

  const knownDaoSummaryIds = new Set(daos.map((dao) => dao.daoId));
  const fallbackDaoSummaryPromises = Array.from(rpcTorsByRealm.entries())
    .filter(([daoId, memberships]) => memberships.length > 0 && !knownDaoSummaryIds.has(daoId))
    .map(async ([daoId, memberships]) => {
      const discovered = discoveredDaoOwnerMap.get(daoId);
      const governanceOwner = discovered?.owner ?? (await resolveGovernanceOwnerByRealm(daoId));
      const realm = await resolveGovernanceRealmInfo(connection, daoId, governanceOwner);
      if (!realm) {
        return null;
      }

      const isDelegateDao = discovered?.isDelegate === true || memberships.every((record) => record.governingTokenOwner !== owner.toBase58());
      return {
        ...buildGovernanceDaoSummary(
          daoId,
          realm.name,
          realm.communityMint,
          owner.toBase58(),
          memberships,
          false,
          isDelegateDao
        ),
        councilMint: realm.councilMint
      };
    });

  if (fallbackDaoSummaryPromises.length > 0) {
    const fallbackDaos = (await Promise.all(fallbackDaoSummaryPromises)).filter(
      (entry): entry is WalletGovernanceResponse['daos'][number] => entry !== null
    );
    daos = [...daos, ...fallbackDaos];
  }

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

  const source = results.some((entry) => entry.source === 'shyft')
    ? 'shyft'
    : results.some((entry) => entry.source === 'rpc')
      ? 'rpc'
      : 'none';

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

function extractSwapRouteLabels(quoteResponse: JupiterQuoteResponse): string[] {
  return Array.isArray(quoteResponse.routePlan)
    ? quoteResponse.routePlan
        .map((route) => (typeof route?.swapInfo?.label === 'string' ? route.swapInfo.label : null))
        .filter((label): label is string => !!label)
    : [];
}

const controller = new WalletController();

chrome.runtime.onInstalled.addListener(async () => {
  await Promise.all([walletStateStorage.get(), permissionsStorage.get(), sessionStorage.get()]);
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
          await controller.createMnemonicWalletSet(message.mnemonic, message.password, 'imported-mnemonic', message.biometricUnlockConfig);
          sendResponse(await controller.getStateResponse());
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
        case 'wallet_set_privacy_mode':
          sendResponse(await controller.setPrivacyMode(message.enabled));
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
        case 'wallet_get_token_details':
          sendResponse(
            await controller.getTokenDetails({
              mint: message.mint,
              accountAddress: message.accountAddress,
              programId: message.programId
            })
          );
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
        const result = await controller.handleProviderRequest(request, (payload) => emitProviderDebug(port, payload));
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
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const approvals = await approvalsStorage.get();
  const pendingApproval = Object.values(approvals).find((approval) => approval.windowId === windowId);
  if (!pendingApproval) {
    return;
  }
  await controller.cancelApproval(pendingApproval.id);
});

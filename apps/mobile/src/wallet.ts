import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import {
  base64ToBytes,
  bytesToBase64,
  createDeviceLinkPayloadText,
  decryptText,
  DEFAULT_THEME,
  encryptText,
  parseDeviceLinkPayloadText,
  type DeviceLinkHandoffPayload,
  type DeviceLinkPreferencesSnapshot,
  type DeviceLinkSessionRecord,
  type GrapeChain,
  type GrapeTheme,
  type VaultSecret,
  type WalletSetupState
} from '@grape/core';
import { generateWalletMnemonic, type WalletMnemonicLength, validateWalletMnemonic } from '../../../packages/solana/src/mnemonic';
import {
  createMobileJupiterSwapTransaction,
  fetchMobileJupiterQuote,
  fetchMobileJupiterPrices,
  fetchMobileNativeBridgeQuote,
  fetchMobileShyftTransactionHistory,
  fetchMobileShyftWalletTokens,
  formatUsdValue,
  getMobileEthereumRpcUrl,
  getMobileSupportedBridgeDestinations,
  getMobileMonadRpcUrl,
  getMobileSolanaRpcUrl,
  type MobileBridgeQuoteSummary,
  type MobileJupiterQuoteResponse
} from './config';
import {
  deriveMobileSuiAccount0,
  exportMobileSuiWalletSecret,
  formatMobileSuiAmount,
  getMobileSuiHoldings,
  getMobileSuiSendUnsupportedMessage,
  importMobileSuiPrivateKey
} from './sui';
import type {
  MobileGovernanceResponse,
  MobileGovernanceVoteResponse
} from './governance';
import type { MobileReputationResponse } from './reputation';
import type { MobilePasskeyWalletConfig } from './passkeys';
import { GRAPE_PASSKEY_WALLET_SPEC_VERSION } from '../../../packages/core/src/passkeys';

export type MobileWalletSource = 'created' | 'imported-mnemonic' | 'imported-private-key';

export type MobileWallet = {
  id: string;
  name: string;
  chain: GrapeChain;
  address: string;
  derivationPath: string;
  source: MobileWalletSource;
  secretRef: string;
};

export type MobileActivity = {
  id: string;
  chain: GrapeChain;
  walletId: string;
  type: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  timestamp: number;
  signature: string;
  status: 'success' | 'failed' | 'unknown';
  source?: 'local' | 'shyft' | 'rpc';
};

export type MobileWalletState = {
  setup: WalletSetupState;
  selectedChain: GrapeChain;
  selectedTheme: GrapeTheme;
  selectedWalletIds: Partial<Record<GrapeChain, string>>;
  trustedDappOrigins: string[];
  trackedReputationSpaceIds: string[];
  trackedVerificationSpaceIds: string[];
  trackedGovernanceDaoIds: string[];
  wallets: MobileWallet[];
  passwordSalt: string;
  passwordHash: string;
  passkeyWallet?: MobilePasskeyWalletConfig;
  privacyMode: boolean;
  biometricEnabled: boolean;
  activities: MobileActivity[];
};

export type MobileAsset = {
  id: string;
  name: string;
  symbol: string;
  amountLabel: string;
  amountUi?: number;
  valueLabel: string;
  logoUri?: string;
  chain: GrapeChain;
  address?: string;
  metadataSource?: 'native' | 'shyft' | 'rpc';
  decimals?: number;
  description?: string;
  tokenType?: 'native' | 'spl' | 'erc20' | 'sui-coin';
  accountAddress?: string;
  programId?: string;
};

export type MobileWalletExport = {
  chain: GrapeChain;
  privateKey: string;
  sourceKind: 'mnemonic' | 'private-key';
};

export type MobileDeviceLinkSession = DeviceLinkSessionRecord;

export type MobileSwapQuote = {
  inputMint: string;
  outputMint: string;
  inputAmountUi: string;
  slippageBps: number;
  selectedRouteId: string;
  routes: Array<{
    id: string;
    label: string;
    quoteResponse: MobileJupiterQuoteResponse;
    outputAmountUi: string;
    priceImpactPct: string | null;
    routeLabels: string[];
  }>;
};

export type MobileSwapExecuteResponse = {
  signature: string;
  inputMint: string;
  outputMint: string;
  inputAmountUi: string;
  outputAmountUi: string;
};

export type MobileBridgeExecuteResponse = {
  signature: string;
  fromChain: GrapeChain;
  toChain: GrapeChain;
  fromAmountUi: string;
  toAmountUi: string;
  fromSymbol: string;
  toSymbol: string;
  destinationAddress: string;
};

type StoredSecretPayload =
  | {
      kind: 'mnemonic';
      mnemonic: string;
    }
  | {
      kind: 'private-key';
      secretKey: string;
    };

const STORAGE_KEY = 'grape:mobile:state';
const SECRET_PREFIX = 'grapemobilesecret';
const DEFAULT_CHAIN: GrapeChain = 'solana';
const DEFAULT_SOLANA_NETWORK = 'mainnet-beta';
const DEFAULT_SUI_NETWORK = 'mainnet';
const DEFAULT_EVM_NETWORK = 'mainnet';
const SOLANA_LEGACY_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOLANA_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const JUPITER_SOL_MINT = 'So11111111111111111111111111111111111111112';
const MOBILE_SOLANA_ASSET_CACHE_TTL_MS = 30_000;
const mobileSolanaAssetCache = new Map<string, { expiresAt: number; assets: MobileAsset[] }>();
const MOBILE_REPUTATION_CACHE_TTL_MS = 30_000;
const mobileReputationCache = new Map<string, { expiresAt: number; data: MobileReputationResponse }>();
const MOBILE_GOVERNANCE_CACHE_TTL_MS = 30_000;
const mobileGovernanceCache = new Map<string, { expiresAt: number; data: MobileGovernanceResponse }>();
const MOBILE_DEVICE_LINK_TTL_MS = 10 * 60 * 1000;

function normalizeWalletAddressKey(chain: GrapeChain, address: string) {
  const trimmed = address.trim();
  if (chain === 'solana' || chain === 'sui') {
    return trimmed;
  }

  return trimmed.toLowerCase();
}

function dedupeWallets(wallets: MobileWallet[]) {
  const seen = new Map<string, MobileWallet>();
  const duplicateWalletIdMap = new Map<string, string>();

  wallets.forEach((wallet) => {
    const dedupeKey = `${wallet.chain}:${normalizeWalletAddressKey(wallet.chain, wallet.address)}`;
    const existing = seen.get(dedupeKey);
    if (!existing) {
      seen.set(dedupeKey, wallet);
      return;
    }

    duplicateWalletIdMap.set(wallet.id, existing.id);
  });

  return {
    wallets: [...seen.values()],
    duplicateWalletIdMap
  };
}

function findExistingWalletByAddress(wallets: MobileWallet[], chain: GrapeChain, address: string) {
  const normalizedAddress = normalizeWalletAddressKey(chain, address);
  return wallets.find(
    (wallet) => wallet.chain === chain && normalizeWalletAddressKey(wallet.chain, wallet.address) === normalizedAddress
  );
}

function loadSolanaDeriveModule() {
  return require('../../../packages/solana/src/derive') as typeof import('../../../packages/solana/src/derive');
}

function loadSolanaNetworksModule() {
  return require('../../../packages/solana/src/networks') as typeof import('../../../packages/solana/src/networks');
}

function loadSolanaSigningModule() {
  return require('../../../packages/solana/src/signing') as typeof import('../../../packages/solana/src/signing');
}

function loadSolanaTransfersModule() {
  return require('../../../packages/solana/src/transfers') as typeof import('../../../packages/solana/src/transfers');
}

function loadSolanaWeb3Module() {
  return require('@solana/web3.js') as typeof import('@solana/web3.js');
}

function loadEthereumModule() {
  return require('@grape/ethereum') as typeof import('@grape/ethereum');
}

function loadMonadModule() {
  return require('@grape/monad') as typeof import('@grape/monad');
}

export function createEmptyMobileWalletState(): MobileWalletState {
  return {
    setup: 'empty',
    selectedChain: DEFAULT_CHAIN,
    selectedTheme: DEFAULT_THEME,
    selectedWalletIds: {},
    trustedDappOrigins: [],
    trackedReputationSpaceIds: [],
    trackedVerificationSpaceIds: [],
    trackedGovernanceDaoIds: [],
    wallets: [],
    passwordSalt: '',
    passwordHash: '',
    passkeyWallet: undefined,
    privacyMode: false,
    biometricEnabled: false,
    activities: []
  };
}

export function createWalletMnemonic(length: WalletMnemonicLength = 12): string {
  return generateWalletMnemonic(length);
}

export function isValidMnemonic(value: string) {
  return validateWalletMnemonic(value.trim());
}

export async function loadMobileWalletState(): Promise<MobileWalletState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyMobileWalletState();
  }

  const parsed = JSON.parse(raw) as Partial<MobileWalletState>;
  const baseState: MobileWalletState = {
    ...createEmptyMobileWalletState(),
    ...parsed,
    wallets: Array.isArray(parsed.wallets) ? parsed.wallets : [],
    selectedWalletIds: parsed.selectedWalletIds ?? {},
    trustedDappOrigins: Array.isArray(parsed.trustedDappOrigins) ? parsed.trustedDappOrigins : [],
    trackedReputationSpaceIds: Array.isArray(parsed.trackedReputationSpaceIds) ? parsed.trackedReputationSpaceIds : [],
    trackedVerificationSpaceIds: Array.isArray(parsed.trackedVerificationSpaceIds) ? parsed.trackedVerificationSpaceIds : [],
    trackedGovernanceDaoIds: Array.isArray(parsed.trackedGovernanceDaoIds) ? parsed.trackedGovernanceDaoIds : [],
    activities: Array.isArray(parsed.activities) ? parsed.activities : []
  };

  return normalizeMobileWalletState(baseState);
}

export async function persistMobileWalletState(state: MobileWalletState) {
  const normalized = normalizeMobileWalletState(state);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export async function createWalletSet(input: {
  mnemonic: string;
  password: string;
  source: MobileWalletSource;
  passkeyWallet?: MobilePasskeyWalletConfig;
}): Promise<MobileWalletState> {
  const mnemonic = input.mnemonic.trim();
  if (!validateWalletMnemonic(mnemonic)) {
    throw new Error('Recovery phrase is invalid.');
  }

  const secretRef = createSecretRef();
  const payload: StoredSecretPayload = { kind: 'mnemonic', mnemonic };
  await setItemAsync(toSecureStoreKey(secretRef), JSON.stringify(payload));

  const passwordSalt = createSecretRef();
  const passwordHash = await createPasswordHash(input.password, passwordSalt);
  const walletLabel = getNextWalletLabel([]);
  const wallets = await createDerivedWallets(secretRef, mnemonic, input.source, walletLabel);

  const state: MobileWalletState = {
    setup: 'ready',
    selectedChain: DEFAULT_CHAIN,
    selectedTheme: DEFAULT_THEME,
    selectedWalletIds: Object.fromEntries(wallets.map((wallet) => [wallet.chain, wallet.id])),
    trustedDappOrigins: [],
    trackedReputationSpaceIds: [],
    trackedVerificationSpaceIds: [],
    trackedGovernanceDaoIds: [],
    wallets,
    passwordSalt,
    passwordHash,
    passkeyWallet: input.passkeyWallet,
    privacyMode: false,
    biometricEnabled: false,
    activities: []
  };

  const normalized = normalizeMobileWalletState(state);
  await persistMobileWalletState(normalized);
  return normalized;
}

export async function addWalletSet(input: {
  state: MobileWalletState;
  mnemonic: string;
  source: MobileWalletSource;
}): Promise<MobileWalletState> {
  const mnemonic = input.mnemonic.trim();
  if (!validateWalletMnemonic(mnemonic)) {
    throw new Error('Recovery phrase is invalid.');
  }

  const walletLabel = getNextWalletLabel(input.state.wallets);
  const secretRef = createSecretRef();
  const addedWallets = await createDerivedWallets(secretRef, mnemonic, input.source, walletLabel);
  const duplicateWallet = addedWallets.find((wallet) => findExistingWalletByAddress(input.state.wallets, wallet.chain, wallet.address));
  if (duplicateWallet) {
    throw new Error(`This ${duplicateWallet.chain} wallet already exists in Grape.`);
  }

  const payload: StoredSecretPayload = { kind: 'mnemonic', mnemonic };
  await setItemAsync(toSecureStoreKey(secretRef), JSON.stringify(payload));
  const nextState: MobileWalletState = {
    ...input.state,
    setup: 'ready',
    wallets: [...input.state.wallets, ...addedWallets],
    selectedWalletIds: {
      ...input.state.selectedWalletIds,
      ...Object.fromEntries(addedWallets.map((wallet) => [wallet.chain, wallet.id]))
    }
  };

  const normalized = normalizeMobileWalletState(nextState);
  await persistMobileWalletState(normalized);
  return normalized;
}

export async function createPrivateKeyWallet(input: {
  chain: GrapeChain;
  privateKey: string;
  password: string;
}): Promise<MobileWalletState> {
  const importedWallet = await importPrivateKeyWallet(input.chain, input.privateKey.trim());
  const secretRef = createSecretRef();
  const payload: StoredSecretPayload = { kind: 'private-key', secretKey: importedWallet.secretKey };
  await setItemAsync(toSecureStoreKey(secretRef), JSON.stringify(payload));

  const walletLabel = getNextWalletLabel([]);
  const wallet = createWallet(walletLabel, input.chain, importedWallet.address, importedWallet.derivationPath, 'imported-private-key', secretRef);
  const passwordSalt = createSecretRef();
  const passwordHash = await createPasswordHash(input.password, passwordSalt);

  const state: MobileWalletState = {
    setup: 'ready',
    selectedChain: input.chain,
    selectedTheme: DEFAULT_THEME,
    selectedWalletIds: {
      [input.chain]: wallet.id
    },
    trustedDappOrigins: [],
    trackedReputationSpaceIds: [],
    trackedVerificationSpaceIds: [],
    trackedGovernanceDaoIds: [],
    wallets: [wallet],
    passwordSalt,
    passwordHash,
    passkeyWallet: undefined,
    privacyMode: false,
    biometricEnabled: false,
    activities: []
  };

  const normalized = normalizeMobileWalletState(state);
  await persistMobileWalletState(normalized);
  return normalized;
}

export async function addPrivateKeyWallet(input: {
  state: MobileWalletState;
  chain: GrapeChain;
  privateKey: string;
}): Promise<MobileWalletState> {
  const importedWallet = await importPrivateKeyWallet(input.chain, input.privateKey.trim());
  const existingWallet = findExistingWalletByAddress(input.state.wallets, input.chain, importedWallet.address);
  if (existingWallet) {
    throw new Error(`This ${input.chain} wallet already exists in Grape.`);
  }

  const secretRef = createSecretRef();
  const payload: StoredSecretPayload = { kind: 'private-key', secretKey: importedWallet.secretKey };
  await setItemAsync(toSecureStoreKey(secretRef), JSON.stringify(payload));

  const walletLabel = getNextWalletLabel(input.state.wallets);
  const wallet = createWallet(walletLabel, input.chain, importedWallet.address, importedWallet.derivationPath, 'imported-private-key', secretRef);
  const nextState: MobileWalletState = {
    ...input.state,
    setup: 'ready',
    selectedChain: input.chain,
    wallets: [...input.state.wallets, wallet],
    selectedWalletIds: {
      ...input.state.selectedWalletIds,
      [input.chain]: wallet.id
    }
  };

  const normalized = normalizeMobileWalletState(nextState);
  await persistMobileWalletState(normalized);
  return normalized;
}

export async function removeMobileWallet(input: {
  state: MobileWalletState;
  walletId: string;
}): Promise<MobileWalletState> {
  const targetWallet = input.state.wallets.find((wallet) => wallet.id === input.walletId);
  if (!targetWallet) {
    return normalizeMobileWalletState(input.state);
  }

  const nextWallets = input.state.wallets.filter((wallet) => wallet.id !== input.walletId);
  const nextActivities = input.state.activities.filter((activity) => activity.walletId !== input.walletId);

  await deleteStoredSecretIfUnused(input.state.wallets, targetWallet.secretRef, input.walletId);

  if (nextWallets.length === 0) {
    const emptyState = createEmptyMobileWalletState();
    await persistMobileWalletState(emptyState);
    return emptyState;
  }

  const nextSelectedWalletIds = { ...input.state.selectedWalletIds };
  if (nextSelectedWalletIds[targetWallet.chain] === targetWallet.id) {
    const replacement = nextWallets.find((wallet) => wallet.chain === targetWallet.chain);
    if (replacement) {
      nextSelectedWalletIds[targetWallet.chain] = replacement.id;
    } else {
      delete nextSelectedWalletIds[targetWallet.chain];
    }
  }

  const nextSelectedChain =
    nextWallets.some((wallet) => wallet.chain === input.state.selectedChain)
      ? input.state.selectedChain
      : nextWallets[0]?.chain ?? DEFAULT_CHAIN;

  const nextState = normalizeMobileWalletState({
    ...input.state,
    setup: 'ready',
    wallets: nextWallets,
    activities: nextActivities,
    selectedWalletIds: nextSelectedWalletIds,
    selectedChain: nextSelectedChain
  });

  await persistMobileWalletState(nextState);
  return nextState;
}

export async function unlockMobileWalletState(state: MobileWalletState, password: string): Promise<boolean> {
  const passwordHash = await createPasswordHash(password, state.passwordSalt);
  return passwordHash === state.passwordHash;
}

export function getSelectedWallet(state: MobileWalletState, chain = state.selectedChain): MobileWallet | undefined {
  const selectedWalletId = state.selectedWalletIds[chain];
  return state.wallets.find((wallet) => wallet.chain === chain && wallet.id === selectedWalletId) ??
    state.wallets.find((wallet) => wallet.chain === chain);
}

export async function loadWalletAssets(wallet: MobileWallet): Promise<MobileAsset[]> {
  switch (wallet.chain) {
    case 'solana':
      return loadSolanaAssets(wallet.address);
    case 'sui':
      return loadSuiAssets(wallet.address);
    case 'ethereum':
      return loadEthereumAssets(wallet.address);
    case 'monad':
      return loadMonadAssets(wallet.address);
    default:
      return [];
  }
}

export async function loadWalletAssetsFast(wallet: MobileWallet): Promise<MobileAsset[]> {
  switch (wallet.chain) {
    case 'solana':
      return loadSolanaAssetsFast(wallet.address);
    default:
      return loadWalletAssets(wallet);
  }
}

export async function loadWalletActivity(wallet: MobileWallet): Promise<MobileActivity[]> {
  switch (wallet.chain) {
    case 'solana': {
      const history = await fetchMobileShyftTransactionHistory(wallet.address, DEFAULT_SOLANA_NETWORK, 30).catch(() => []);
      if (history.length > 0) {
        return history.map((entry) => ({
          ...entry,
          chain: 'solana' as const,
          walletId: wallet.id
        }));
      }

      return loadMobileSolanaRpcActivity(wallet, 30);
    }
    default:
      return [];
  }
}

function formatMobileActivityType(type: string): string {
  const normalized = type.replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return 'Activity';
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSolAmountFromLamports(lamports: number): string {
  const sol = Math.abs(lamports) / 1_000_000_000;
  const formatted = sol.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: sol >= 1 ? 4 : 6
  });
  return `${lamports >= 0 ? '+' : '-'}${formatted} SOL`;
}

function shortenActivityAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
}

function extractAccountKeyString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const pubkey = (value as { pubkey?: unknown }).pubkey;
    if (typeof pubkey === 'string' && pubkey.trim()) {
      return pubkey.trim();
    }
    if (pubkey && typeof (pubkey as { toBase58?: unknown }).toBase58 === 'function') {
      return ((pubkey as { toBase58: () => string }).toBase58() || '').trim() || null;
    }
  }

  return null;
}

function detectSolanaActivityType(transaction: Record<string, unknown>): string {
  const message = (transaction.transaction as { message?: Record<string, unknown> } | undefined)?.message;
  const instructions = Array.isArray(message?.instructions) ? (message.instructions as Array<Record<string, unknown>>) : [];

  for (const instruction of instructions) {
    const parsed = instruction.parsed as { type?: unknown } | undefined;
    const parsedType = typeof parsed?.type === 'string' ? parsed.type.toLowerCase() : null;
    const program = typeof instruction.program === 'string' ? instruction.program.toLowerCase() : '';
    const programId = extractAccountKeyString(instruction.programId)?.toLowerCase() ?? '';

    if (parsedType?.includes('transfer') || program.includes('system')) {
      return 'transfer';
    }
    if (parsedType?.includes('swap') || program.includes('jupiter')) {
      return 'swap';
    }
    if (parsedType?.includes('stake') || program.includes('stake')) {
      return 'stake';
    }
    if (parsedType?.includes('mint')) {
      return 'mint';
    }
    if (program.includes('spl-token') || programId === SOLANA_LEGACY_TOKEN_PROGRAM.toLowerCase() || programId === SOLANA_TOKEN_2022_PROGRAM.toLowerCase()) {
      return parsedType ?? 'token';
    }
  }

  return 'activity';
}

function buildSolanaActivityAmountLabel(transaction: Record<string, unknown>, walletAddress: string, type: string): string {
  const accountKeysRaw = ((transaction.transaction as { message?: { accountKeys?: unknown[] } } | undefined)?.message?.accountKeys ?? []) as unknown[];
  const accountKeys = accountKeysRaw.map(extractAccountKeyString);
  const walletIndex = accountKeys.findIndex((value) => value === walletAddress);
  const meta = (transaction.meta as {
    preBalances?: unknown[];
    postBalances?: unknown[];
  } | undefined) ?? {};

  if (
    walletIndex >= 0 &&
    Array.isArray(meta.preBalances) &&
    Array.isArray(meta.postBalances) &&
    typeof meta.preBalances[walletIndex] === 'number' &&
    typeof meta.postBalances[walletIndex] === 'number'
  ) {
    const delta = meta.postBalances[walletIndex] - meta.preBalances[walletIndex];
    if (delta !== 0) {
      return formatSolAmountFromLamports(delta);
    }
  }

  return formatMobileActivityType(type);
}

async function loadMobileSolanaRpcActivity(wallet: MobileWallet, limit: number): Promise<MobileActivity[]> {
  try {
    const web3 = loadSolanaWeb3Module();
    const { Connection, PublicKey } = web3;
    const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
    const owner = new PublicKey(wallet.address);
    const signatures = await connection.getSignaturesForAddress(owner, { limit });

    if (signatures.length === 0) {
      return [];
    }

    const transactions = await connection.getParsedTransactions(
      signatures.map((entry) => entry.signature),
      {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      }
    );

    const items: MobileActivity[] = [];

    transactions.forEach((transaction, index) => {
        const signature = signatures[index]?.signature;
        if (!transaction || !signature) {
          return;
        }

        const type = detectSolanaActivityType(transaction as unknown as Record<string, unknown>);
        const title = formatMobileActivityType(type);
        const timestamp = typeof signatures[index]?.blockTime === 'number' ? signatures[index].blockTime! * 1000 : Date.now();

        items.push({
          id: signature,
          chain: 'solana' as const,
          walletId: wallet.id,
          type,
          title,
          subtitle: `RPC • ${shortenActivityAddress(signature)}`,
          amountLabel: buildSolanaActivityAmountLabel(transaction as unknown as Record<string, unknown>, wallet.address, type),
          timestamp,
          signature,
          status: signatures[index]?.err ? 'failed' : 'success',
          source: 'rpc' as const
        } satisfies MobileActivity);
    });

    return items.sort((left, right) => right.timestamp - left.timestamp);
  } catch {
    return [];
  }
}

function parseDecimalAmount(amount: string, decimals: number): bigint {
  const normalized = amount.trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    throw new Error('Amount must be a positive decimal value.');
  }

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  if (fractionalPart.length > decimals) {
    throw new Error(`Amount exceeds the maximum precision for this asset (${decimals} decimals).`);
  }

  const whole = wholePart && wholePart !== '.' ? wholePart : '0';
  const fraction = fractionalPart.padEnd(decimals, '0');
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  return BigInt(digits || '0');
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

async function getSolanaMintDecimals(mint: string) {
  const web3 = loadSolanaWeb3Module();
  const { Connection, PublicKey } = web3;
  const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
  const accountInfo = await connection.getParsedAccountInfo(new PublicKey(mint), 'confirmed');
  const parsed = accountInfo.value?.data;
  if (!parsed || typeof parsed !== 'object' || !('parsed' in parsed) || !parsed.parsed) {
    return 9;
  }

  const parsedInfo = (parsed as { parsed?: { info?: { decimals?: number } } }).parsed?.info;
  return typeof parsedInfo?.decimals === 'number' ? parsedInfo.decimals : 9;
}

function extractSwapRouteLabels(quoteResponse: MobileJupiterQuoteResponse): string[] {
  return Array.isArray(quoteResponse.routePlan)
    ? quoteResponse.routePlan
        .map((route) => (typeof route?.swapInfo?.label === 'string' ? route.swapInfo.label : null))
        .filter((label): label is string => !!label)
    : [];
}

function resolveBridgeDestination(state: MobileWalletState, chain: GrapeChain, walletId?: string) {
  const chainWallets = state.wallets.filter((candidate) => candidate.chain === chain);
  const wallet = chainWallets.find((candidate) => candidate.id === walletId) ?? chainWallets[0];
  if (!wallet) {
    throw new Error(`Add a ${chain} wallet before bridging to that chain.`);
  }

  return wallet;
}

function extractBridgeTransactionRequest(quoteResponse: Record<string, unknown>) {
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

function getBridgeAmountUi(
  quoteResponse: Record<string, unknown>,
  side: 'from' | 'to',
  fallback: string
) {
  const estimate =
    typeof quoteResponse.estimate === 'object' && quoteResponse.estimate
      ? (quoteResponse.estimate as { fromAmount?: string; toAmount?: string })
      : null;
  return side === 'from' ? estimate?.fromAmount ?? fallback : estimate?.toAmount ?? '0';
}

function getBridgeSymbol(
  quoteResponse: Record<string, unknown>,
  side: 'from' | 'to',
  fallback: string
) {
  const estimate =
    typeof quoteResponse.estimate === 'object' && quoteResponse.estimate
      ? (quoteResponse.estimate as {
          fromToken?: { symbol?: string };
          toToken?: { symbol?: string };
        })
      : null;

  return side === 'from' ? estimate?.fromToken?.symbol ?? fallback : estimate?.toToken?.symbol ?? fallback;
}

export async function getWalletSwapQuote(input: {
  wallet: MobileWallet;
  inputAsset: MobileAsset;
  outputAsset: MobileAsset;
  amount: string;
  slippageBps: number;
}): Promise<MobileSwapQuote> {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Swaps are currently available for Solana only.');
  }

  const inputMint = input.inputAsset.tokenType === 'spl' ? input.inputAsset.address ?? '' : JUPITER_SOL_MINT;
  const outputMint = input.outputAsset.tokenType === 'spl' ? input.outputAsset.address ?? '' : JUPITER_SOL_MINT;
  if (!inputMint || !outputMint) {
    throw new Error('Choose valid assets before requesting a swap quote.');
  }
  if (inputMint === outputMint) {
    throw new Error('Choose a different output asset.');
  }

  const inputDecimals = input.inputAsset.tokenType === 'spl' ? input.inputAsset.decimals ?? 0 : 9;
  const outputDecimals =
    input.outputAsset.tokenType === 'spl'
      ? input.outputAsset.decimals ?? (await getSolanaMintDecimals(outputMint))
      : 9;
  const amountBaseUnits = parseDecimalAmount(input.amount, inputDecimals).toString();
  const quoteResponse = await fetchMobileJupiterQuote({
    inputMint,
    outputMint,
    amount: amountBaseUnits,
    slippageBps: input.slippageBps
  });
  const directQuoteResponse =
    quoteResponse.routePlan && quoteResponse.routePlan.length === 1
      ? null
      : await fetchMobileJupiterQuote({
          inputMint,
          outputMint,
          amount: amountBaseUnits,
          slippageBps: input.slippageBps,
          onlyDirectRoutes: true
        }).catch(() => null);

  const routes = [quoteResponse, directQuoteResponse]
    .filter((entry): entry is MobileJupiterQuoteResponse => !!entry)
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

  if (routes.length === 0) {
    throw new Error('Unable to fetch a swap quote right now.');
  }

  return {
    inputMint,
    outputMint,
    inputAmountUi: input.amount,
    slippageBps: input.slippageBps,
    selectedRouteId: routes[0].id,
    routes
  };
}

export async function executeWalletSwap(input: {
  wallet: MobileWallet;
  quoteResponse: MobileJupiterQuoteResponse;
}): Promise<MobileSwapExecuteResponse> {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Swaps are currently available for Solana only.');
  }

  const secret = await loadWalletSecret(input.wallet.secretRef);
  const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
  const { signAndSendSerializedTransaction } = loadSolanaSigningModule();
  const keypair =
    secret.kind === 'mnemonic'
      ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
      : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });
  const swap = await createMobileJupiterSwapTransaction({
    quoteResponse: input.quoteResponse,
    userPublicKey: input.wallet.address
  });
  const signature = await signAndSendSerializedTransaction(
    swap.swapTransaction,
    keypair,
    getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK)
  );

  const [inputDecimals, outputDecimals] = await Promise.all([
    getSolanaMintDecimals(input.quoteResponse.inputMint),
    getSolanaMintDecimals(input.quoteResponse.outputMint)
  ]);

  return {
    signature,
    inputMint: input.quoteResponse.inputMint,
    outputMint: input.quoteResponse.outputMint,
    inputAmountUi: formatUiAmount(input.quoteResponse.inAmount, inputDecimals),
    outputAmountUi: formatUiAmount(input.quoteResponse.outAmount, outputDecimals)
  };
}

export async function getWalletBridgeQuote(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  amount: string;
  toChain: GrapeChain;
  destinationWalletId?: string;
}): Promise<MobileBridgeQuoteSummary> {
  if (input.wallet.chain === 'sui') {
    throw new Error('Bridge source is coming soon for Sui wallets.');
  }
  if (input.toChain === input.wallet.chain) {
    throw new Error('Choose a different destination chain.');
  }

  const supported = getMobileSupportedBridgeDestinations(input.wallet.chain as 'solana' | 'ethereum' | 'monad');
  if (!supported.includes(input.toChain as never)) {
    throw new Error(`Bridging from ${input.wallet.chain} to ${input.toChain} is not supported yet.`);
  }

  const destinationWallet = resolveBridgeDestination(input.state, input.toChain, input.destinationWalletId);
  const decimals = input.wallet.chain === 'solana' ? 9 : 18;
  const amountRaw = parseDecimalAmount(input.amount, decimals).toString();

  return fetchMobileNativeBridgeQuote({
    fromChain: input.wallet.chain as 'solana' | 'ethereum' | 'monad',
    toChain: destinationWallet.chain as 'solana' | 'ethereum' | 'monad' | 'sui',
    amountRaw,
    fromAddress: input.wallet.address,
    toAddress: destinationWallet.address
  });
}

export async function executeWalletBridge(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  quoteResponse: Record<string, unknown>;
  toChain: GrapeChain;
  destinationWalletId?: string;
}): Promise<MobileBridgeExecuteResponse> {
  const destinationWallet = resolveBridgeDestination(input.state, input.toChain, input.destinationWalletId);
  const transactionRequest = extractBridgeTransactionRequest(input.quoteResponse);
  if (!transactionRequest?.to || !transactionRequest.data) {
    throw new Error('This bridge route requires an unsupported transaction format. Try a different route or amount.');
  }

  const secret = await loadWalletSecret(input.wallet.secretRef);
  let signature: string;

  if (input.wallet.chain === 'solana') {
    const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
    const { signAndSendSerializedTransaction } = loadSolanaSigningModule();
    const keypair =
      secret.kind === 'mnemonic'
        ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
        : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });
    signature = await signAndSendSerializedTransaction(
      transactionRequest.data,
      keypair,
      getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK)
    );
  } else if (input.wallet.chain === 'ethereum') {
    signature = await loadEthereumModule().sendEthereumTransactionRequest(
      DEFAULT_EVM_NETWORK,
      secret as VaultSecret,
      {
        to: transactionRequest.to,
        data: transactionRequest.data,
        value: transactionRequest.value,
        customRpcUrl: getMobileEthereumRpcUrl(DEFAULT_EVM_NETWORK)
      }
    );
  } else if (input.wallet.chain === 'monad') {
    signature = await loadMonadModule().sendMonadTransactionRequest(
      DEFAULT_EVM_NETWORK,
      secret as VaultSecret,
      {
        to: transactionRequest.to,
        data: transactionRequest.data,
        value: transactionRequest.value,
        customRpcUrl: getMobileMonadRpcUrl(DEFAULT_EVM_NETWORK)
      }
    );
  } else {
    throw new Error('Bridge source is not supported for this chain yet.');
  }

  return {
    signature,
    fromChain: input.wallet.chain,
    toChain: destinationWallet.chain,
    fromAmountUi: getBridgeAmountUi(input.quoteResponse, 'from', '0'),
    toAmountUi: getBridgeAmountUi(input.quoteResponse, 'to', '0'),
    fromSymbol: getBridgeSymbol(input.quoteResponse, 'from', input.wallet.chain === 'solana' ? 'SOL' : input.wallet.chain === 'ethereum' ? 'ETH' : 'MON'),
    toSymbol: getBridgeSymbol(input.quoteResponse, 'to', destinationWallet.chain === 'solana' ? 'SOL' : destinationWallet.chain === 'ethereum' ? 'ETH' : destinationWallet.chain === 'monad' ? 'MON' : 'SUI'),
    destinationAddress: destinationWallet.address
  };
}

export async function updateTrackedReputationSpaces(input: {
  state: MobileWalletState;
  daoIds: string[];
}): Promise<MobileWalletState> {
  const nextState = normalizeMobileWalletState({
    ...input.state,
    trackedReputationSpaceIds: input.daoIds
  });
  await persistMobileWalletState(nextState);
  return nextState;
}

export async function updateTrackedVerificationSpaces(input: {
  state: MobileWalletState;
  daoIds: string[];
}): Promise<MobileWalletState> {
  const nextState = normalizeMobileWalletState({
    ...input.state,
    trackedVerificationSpaceIds: input.daoIds
  });
  await persistMobileWalletState(nextState);
  return nextState;
}

export async function updateTrackedGovernanceDaos(input: {
  state: MobileWalletState;
  daoIds: string[];
}): Promise<MobileWalletState> {
  const nextState = normalizeMobileWalletState({
    ...input.state,
    trackedGovernanceDaoIds: input.daoIds
  });
  await persistMobileWalletState(nextState);
  return nextState;
}

export async function loadWalletReputation(
  wallet: MobileWallet,
  trackedDaoIds: string[]
): Promise<MobileReputationResponse> {
  if (wallet.chain !== 'solana' || trackedDaoIds.length === 0) {
    return {
      spaces: [],
      totalPoints: '0',
      totalEffectivePoints: '0',
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  const normalizedDaoIds = normalizeTrackedReputationSpaceIds(trackedDaoIds);
  const cacheKey = `${wallet.address}:${normalizedDaoIds.join(',')}`;
  const cached = mobileReputationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const { fetchMobileOgReputationForWallet } = require('./reputation') as typeof import('./reputation');
  const data = await fetchMobileOgReputationForWallet(wallet.address, normalizedDaoIds);
  mobileReputationCache.set(cacheKey, {
    expiresAt: Date.now() + MOBILE_REPUTATION_CACHE_TTL_MS,
    data
  });
  return data;
}

export async function loadWalletGovernance(
  wallet: MobileWallet,
  trackedDaoIds: string[]
): Promise<MobileGovernanceResponse> {
  if (wallet.chain !== 'solana') {
    return {
      trackedDaos: normalizeTrackedDaoIds(trackedDaoIds),
      discoveredDaos: [],
      daos: [],
      memberDaos: 0,
      proposals: [],
      source: 'none',
      network: DEFAULT_SOLANA_NETWORK,
      refreshedAt: Date.now()
    };
  }

  const normalizedDaoIds = normalizeTrackedDaoIds(trackedDaoIds);
  const cacheKey = `${wallet.address}:${normalizedDaoIds.join(',')}`;
  const cached = mobileGovernanceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const { fetchMobileGovernanceForWallet } = require('./governance') as typeof import('./governance');
  const data = await fetchMobileGovernanceForWallet(wallet.address, normalizedDaoIds);
  mobileGovernanceCache.set(cacheKey, {
    expiresAt: Date.now() + MOBILE_GOVERNANCE_CACHE_TTL_MS,
    data
  });
  return data;
}

export async function castWalletGovernanceVote(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  daoId: string;
  governanceId: string;
  proposalId: string;
  proposalOwnerRecordId: string;
  tokenOwnerRecordId: string;
  governingTokenMint: string;
  voteKind: 'approve' | 'deny' | 'abstain';
  choiceRank?: number;
}): Promise<MobileGovernanceVoteResponse> {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Governance voting is currently supported for Solana wallets only.');
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);
  const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
  const { signAndSendTransaction } = loadSolanaTransfersModule();
  const web3 = loadSolanaWeb3Module();
  const { Connection, PublicKey, Transaction } = web3;
  const {
    getGovernance,
    getGovernanceProgramVersion,
    getRealm,
    getProposal,
    ProposalState,
    Vote,
    VoteChoice,
    VoteKind,
    withCastVote
  } = require('@solana/spl-governance') as typeof import('@solana/spl-governance');
  const keypair =
    secret.kind === 'mnemonic'
      ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
      : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });
  const owner = new PublicKey(input.wallet.address);
  const governanceOwner = findGovernanceOwnerByDao(input.daoId);
  const programId = new PublicKey(governanceOwner.owner);
  const realmPk = new PublicKey(input.daoId);
  const governancePk = new PublicKey(input.governanceId);
  const proposalPk = new PublicKey(input.proposalId);
  const proposalOwnerRecordPk = new PublicKey(input.proposalOwnerRecordId);
  const tokenOwnerRecordPk = new PublicKey(input.tokenOwnerRecordId);
  const governingTokenMintPk = new PublicKey(input.governingTokenMint);
  const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');

  const [programVersion, proposalAccount, governanceAccount, realmAccount] = await Promise.all([
    getGovernanceProgramVersion(connection, programId),
    getProposal(connection, proposalPk),
    getGovernance(connection, governancePk),
    getRealm(connection, realmPk)
  ]);

  if (proposalAccount.account.state !== ProposalState.Voting) {
    throw new Error('This proposal is not in the voting window anymore.');
  }

  const instructions: import('@solana/web3.js').TransactionInstruction[] = [];
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

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash
  });
  transaction.add(...instructions);
  const signature = await signAndSendTransaction(transaction, keypair, connection);
  mobileGovernanceCache.clear();

  return {
    signature,
    daoId: input.daoId,
    proposalId: input.proposalId,
    voteKind: input.voteKind,
    choiceLabel: input.voteKind === 'approve' ? `Option ${input.choiceRank ?? 0}` : undefined,
    network: DEFAULT_SOLANA_NETWORK
  };
}

export async function sendNativeAsset(input: {
  wallet: MobileWallet;
  recipient: string;
  amount: string;
}): Promise<string> {
  return sendWalletAsset({
    ...input,
    asset: {
      id: input.wallet.chain,
      name: input.wallet.chain,
      symbol:
        input.wallet.chain === 'solana'
          ? 'SOL'
          : input.wallet.chain === 'ethereum'
            ? 'ETH'
            : input.wallet.chain === 'monad'
              ? 'MON'
              : 'SUI',
      amountLabel: '',
      valueLabel: '',
      chain: input.wallet.chain,
      metadataSource: 'native',
      tokenType: 'native'
    }
  });
}

export async function sendWalletAsset(input: {
  wallet: MobileWallet;
  asset: MobileAsset;
  recipient: string;
  amount: string;
}): Promise<string> {
  const secret = await loadWalletSecret(input.wallet.secretRef);

  switch (input.wallet.chain) {
    case 'solana': {
      const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
      const { signAndSendTransaction } = loadSolanaSigningModule();
      const {
        ASSOCIATED_TOKEN_PROGRAM_ID,
        buildSolTransferTransaction,
        buildSplTokenTransferTransaction,
        estimateLegacyTransactionFee,
        parseDecimalAmount
      } = loadSolanaTransfersModule();
      const web3 = loadSolanaWeb3Module();
      const { Connection, PublicKey } = web3;
      const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
      const keypair = secret.kind === 'mnemonic'
        ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
        : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });
      const owner = new PublicKey(input.wallet.address);
      const transaction =
        input.asset.tokenType === 'spl'
          ? await buildSplTokenTransferTransaction(connection, owner, {
              recipient: input.recipient,
              mint: input.asset.address ?? '',
              accountAddress: input.asset.accountAddress ?? '',
              decimals: input.asset.decimals ?? 0,
              programId: input.asset.programId ?? SOLANA_LEGACY_TOKEN_PROGRAM,
              amount: input.amount
            })
          : await buildSolTransferTransaction(connection, owner, {
              recipient: input.recipient,
              amount: input.amount
            });
      const [balanceLamports, feeLamports] = await Promise.all([
        connection.getBalance(owner, 'confirmed'),
        estimateLegacyTransactionFee(connection, transaction)
      ]);
      const createsRecipientTokenAccount = transaction.instructions.some((instruction) =>
        instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)
      );
      const ataRentLamports = createsRecipientTokenAccount
        ? await connection.getMinimumBalanceForRentExemption(165)
        : 0;
      const requiredLamports =
        input.asset.tokenType === 'spl'
          ? BigInt(feeLamports + ataRentLamports)
          : parseDecimalAmount(input.amount, 9) + BigInt(feeLamports);
      if (BigInt(balanceLamports) < requiredLamports) {
        if (input.asset.tokenType === 'spl') {
          throw new Error(
            createsRecipientTokenAccount
              ? `Not enough SOL. You need ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL for network fees and recipient token account creation, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
              : `Not enough SOL. You need at least ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL for network fees, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
          );
        }
        throw new Error(
          `Not enough SOL. You need ${(Number(requiredLamports) / 1_000_000_000).toFixed(9)} SOL including network fee, but only ${(balanceLamports / 1_000_000_000).toFixed(9)} SOL is available.`
        );
      }
      return signAndSendTransaction(transaction, keypair, connection);
    }
    case 'sui': {
      if (input.asset.tokenType === 'sui-coin') {
        throw new Error('Sui token send is not available on mobile yet.');
      }
      throw new Error(getMobileSuiSendUnsupportedMessage());
    }
    case 'ethereum': {
      const { sendEthereum, sendEthereumToken } = loadEthereumModule();
      const vaultSecret = secret.kind === 'mnemonic'
        ? { kind: 'mnemonic' as const, mnemonic: secret.mnemonic }
        : { kind: 'private-key' as const, secretKey: secret.secretKey };
      return input.asset.tokenType === 'erc20' && input.asset.address && typeof input.asset.decimals === 'number'
        ? sendEthereumToken(DEFAULT_EVM_NETWORK, vaultSecret, {
            recipient: input.recipient,
            amount: input.amount,
            tokenAddress: input.asset.address,
            decimals: input.asset.decimals,
            customRpcUrl: getMobileEthereumRpcUrl(DEFAULT_EVM_NETWORK)
          })
        : sendEthereum(DEFAULT_EVM_NETWORK, vaultSecret, {
            recipient: input.recipient,
            amountEther: input.amount,
            customRpcUrl: getMobileEthereumRpcUrl(DEFAULT_EVM_NETWORK)
          });
    }
    case 'monad': {
      const { sendMonad, sendMonadToken } = loadMonadModule();
      const vaultSecret = secret.kind === 'mnemonic'
        ? { kind: 'mnemonic' as const, mnemonic: secret.mnemonic }
        : { kind: 'private-key' as const, secretKey: secret.secretKey };
      return input.asset.tokenType === 'erc20' && input.asset.address && typeof input.asset.decimals === 'number'
        ? sendMonadToken(DEFAULT_EVM_NETWORK, vaultSecret, {
            recipient: input.recipient,
            amount: input.amount,
            tokenAddress: input.asset.address,
            decimals: input.asset.decimals,
            customRpcUrl: getMobileMonadRpcUrl(DEFAULT_EVM_NETWORK)
          })
        : sendMonad(DEFAULT_EVM_NETWORK, vaultSecret, {
            recipient: input.recipient,
            amountEther: input.amount,
            customRpcUrl: getMobileMonadRpcUrl(DEFAULT_EVM_NETWORK)
          });
    }
    default:
      throw new Error('Unsupported chain.');
  }
}

export async function exportMobileWalletPrivateKey(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  password?: string;
  allowUnlockedSession?: boolean;
}): Promise<MobileWalletExport> {
  const password = input.password?.trim() ?? '';
  if (password) {
    const valid = await unlockMobileWalletState(input.state, password);
    if (!valid) {
      throw new Error('Password is incorrect.');
    }
  } else if (!input.allowUnlockedSession) {
    throw new Error('Password is required.');
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);

  switch (input.wallet.chain) {
    case 'solana': {
      const { exportSolanaSoftwareWalletSecret } = loadSolanaDeriveModule();
      const exported = exportSolanaSoftwareWalletSecret(secret as VaultSecret);
      return {
        chain: 'solana',
        privateKey: exported.privateKeyBase58,
        sourceKind: exported.kind
      };
    }
    case 'sui': {
      const exported = exportMobileSuiWalletSecret(secret as VaultSecret);
      return {
        chain: 'sui',
        privateKey: exported.privateKey,
        sourceKind: secret.kind
      };
    }
    case 'ethereum': {
      return {
        chain: 'ethereum',
        privateKey: exportEvmPrivateKey(secret, loadEthereumModule().resolveEthereumVaultSecret(secret as VaultSecret)),
        sourceKind: secret.kind
      };
    }
    case 'monad': {
      return {
        chain: 'monad',
        privateKey: exportEvmPrivateKey(secret, loadMonadModule().resolveMonadVaultSecret(secret as VaultSecret)),
        sourceKind: secret.kind
      };
    }
    default:
      throw new Error('This wallet cannot be exported.');
  }
}

export async function signMobileSolanaProviderMessage(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  message: string;
}) {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Grape Discover currently supports Solana wallet injection only.');
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);
  const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
  const { signMessageBytes } = loadSolanaSigningModule();
  const keypair =
    secret.kind === 'mnemonic'
      ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
      : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });

  return {
    publicKey: input.wallet.address,
    signature: bytesToBase64(signMessageBytes(base64ToBytes(input.message), keypair))
  };
}

export async function signMobileSolanaProviderTransaction(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  transaction: string;
}) {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Grape Discover currently supports Solana wallet injection only.');
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);
  const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
  const { signSerializedTransaction } = loadSolanaSigningModule();
  const keypair =
    secret.kind === 'mnemonic'
      ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
      : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });

  return {
    transaction: signSerializedTransaction(input.transaction, keypair)
  };
}

export async function signMobileSolanaProviderTransactions(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  transactions: string[];
}) {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Grape Discover currently supports Solana wallet injection only.');
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);
  const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
  const { signSerializedTransactions } = loadSolanaSigningModule();
  const keypair =
    secret.kind === 'mnemonic'
      ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
      : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });

  return {
    transactions: signSerializedTransactions(input.transactions, keypair)
  };
}

export async function signAndSendMobileSolanaProviderTransaction(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  transaction: string;
}) {
  if (input.wallet.chain !== 'solana') {
    throw new Error('Grape Discover currently supports Solana wallet injection only.');
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);
  const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
  const { signAndSendSerializedTransaction } = loadSolanaSigningModule();
  const web3 = loadSolanaWeb3Module();
  const { Connection } = web3;
  const keypair =
    secret.kind === 'mnemonic'
      ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
      : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });
  const rpcEndpoint = getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK);
  const signature = await signAndSendSerializedTransaction(input.transaction, keypair, rpcEndpoint);
  const connection = new Connection(rpcEndpoint, 'confirmed');

  try {
    await connection.confirmTransaction(signature, 'confirmed');
  } catch {
    // Some RPCs can broadcast successfully but fail the follow-up confirm call.
    // Return the signature so the dapp can continue its own confirmation flow.
  }

  return {
    signature
  };
}

export async function createMobileDeviceLinkSession(input: {
  state: MobileWalletState;
  wallet: MobileWallet;
  password?: string;
  allowUnlockedSession?: boolean;
}): Promise<MobileDeviceLinkSession> {
  if (!input.allowUnlockedSession) {
    if (!input.password?.trim()) {
      throw new Error('Password is required to link a new device.');
    }
    const valid = await unlockMobileWalletState(input.state, input.password);
    if (!valid) {
      throw new Error('Password is incorrect.');
    }
  }

  const secret = await loadWalletSecretWithWalletFallback(input.state, input.wallet);
  const publicKey = await resolveWalletAddressFromSecret(secret, input.wallet.chain);
  if (publicKey !== input.wallet.address) {
    throw new Error('Wallet secret does not match the selected wallet.');
  }

  const sessionId = createSecretRef();
  const createdAt = Date.now();
  const expiresAt = createdAt + MOBILE_DEVICE_LINK_TTL_MS;
  const pairingCode = createDeviceLinkPairingCode();
  const payload: DeviceLinkHandoffPayload = {
    version: 1,
    type: 'grape-device-link',
    sessionId,
    createdAt,
    expiresAt,
    wallet: {
      walletName: input.wallet.name,
      chain: input.wallet.chain,
      publicKey: input.wallet.address,
      derivationPath: input.wallet.derivationPath,
      source: secret.kind === 'mnemonic' ? input.wallet.source : 'imported-private-key',
      secret: secret.kind === 'mnemonic'
        ? { kind: 'mnemonic', mnemonic: secret.mnemonic }
        : { kind: 'private-key', secretKey: secret.secretKey }
    },
    preferences: getMobileDeviceLinkPreferencesSnapshot(input.state)
  };
  const handoff = await encryptText(JSON.stringify(payload), normalizeDeviceLinkPairingCode(pairingCode));
  const envelope = {
    version: 1 as const,
    type: 'grape-device-link-qr' as const,
    sessionId,
    createdAt,
    expiresAt,
    walletName: input.wallet.name,
    chain: input.wallet.chain,
    publicKey: input.wallet.address,
    handoff
  };

  return {
    id: sessionId,
    walletId: input.wallet.id,
    walletName: input.wallet.name,
    chain: input.wallet.chain,
    publicKey: input.wallet.address,
    pairingCode,
    createdAt,
    expiresAt,
    qrPayload: createDeviceLinkPayloadText(envelope),
    envelope,
    status: 'ready'
  };
}

export async function importMobileDeviceLink(input: {
  state: MobileWalletState;
  payload: string;
  pairingCode: string;
  password?: string;
}): Promise<MobileWalletState> {
  const envelope = parseDeviceLinkPayloadText(input.payload);
  if (envelope.expiresAt <= Date.now()) {
    throw new Error('This restore payload has expired. Create a new link from your existing device.');
  }

  const raw = await decryptText(envelope.handoff, normalizeDeviceLinkPairingCode(input.pairingCode)).catch(() => {
    throw new Error('Pairing code is incorrect.');
  });
  const payload = JSON.parse(raw) as DeviceLinkHandoffPayload;
  if (
    payload.version !== 1 ||
    payload.type !== 'grape-device-link' ||
    payload.sessionId !== envelope.sessionId ||
    payload.expiresAt <= Date.now()
  ) {
    throw new Error('Restore payload is invalid or expired.');
  }

  const hasExistingWallets = input.state.setup === 'ready' && input.state.wallets.length > 0;
  if (!hasExistingWallets && (!input.password || input.password.length < 8)) {
    throw new Error('Use a password with at least 8 characters.');
  }
  let nextState: MobileWalletState;

  if (payload.wallet.secret.kind === 'mnemonic') {
    nextState = hasExistingWallets
      ? await addWalletSet({
          state: input.state,
          mnemonic: payload.wallet.secret.mnemonic,
          source: payload.wallet.source === 'created' ? 'created' : 'imported-mnemonic'
        })
      : await createWalletSet({
          mnemonic: payload.wallet.secret.mnemonic,
          password: input.password ?? '',
          source: payload.wallet.source === 'created' ? 'created' : 'imported-mnemonic'
        });
  } else {
    nextState = hasExistingWallets
      ? await addPrivateKeyWallet({
          state: input.state,
          chain: payload.wallet.chain,
          privateKey: payload.wallet.secret.secretKey
        })
      : await createPrivateKeyWallet({
          chain: payload.wallet.chain,
          privateKey: payload.wallet.secret.secretKey,
          password: input.password ?? ''
        });
  }

  const mergedState = normalizeMobileWalletState({
    ...applyMobileDeviceLinkPreferences(nextState, payload.preferences)
  });
  await persistMobileWalletState(mergedState);
  return mergedState;
}

export function createSendActivity(input: {
  wallet: MobileWallet;
  asset: MobileAsset;
  recipient: string;
  amountLabel: string;
  signature: string;
}): MobileActivity {
  return {
    id: `activity-${createSecretRef()}`,
    chain: input.wallet.chain,
    walletId: input.wallet.id,
    type: 'send',
    title: `Sent ${input.asset.symbol}`,
    subtitle: shortenAddress(input.recipient),
    amountLabel: input.amountLabel,
    timestamp: Date.now(),
    signature: input.signature,
    status: 'success'
    ,
    source: 'local'
  };
}

export function createSwapActivity(input: {
  wallet: MobileWallet;
  inputAsset: MobileAsset;
  outputAsset: MobileAsset;
  inputAmountLabel: string;
  outputAmountLabel: string;
  signature: string;
}): MobileActivity {
  return {
    id: `activity-${createSecretRef()}`,
    chain: input.wallet.chain,
    walletId: input.wallet.id,
    type: 'swap',
    title: `Swapped ${input.inputAsset.symbol} to ${input.outputAsset.symbol}`,
    subtitle: `${input.inputAmountLabel} -> ${input.outputAmountLabel}`,
    amountLabel: input.outputAmountLabel,
    timestamp: Date.now(),
    signature: input.signature,
    status: 'success',
    source: 'local'
  };
}

export function createBridgeActivity(input: {
  wallet: MobileWallet;
  destinationWallet: MobileWallet;
  fromAmountLabel: string;
  toAmountLabel: string;
  signature: string;
}): MobileActivity {
  return {
    id: `activity-${createSecretRef()}`,
    chain: input.wallet.chain,
    walletId: input.wallet.id,
    type: 'bridge',
    title: `Bridged to ${input.destinationWallet.chain}`,
    subtitle: shortenAddress(input.destinationWallet.address),
    amountLabel: `${input.fromAmountLabel} -> ${input.toAmountLabel}`,
    timestamp: Date.now(),
    signature: input.signature,
    status: 'success',
    source: 'local'
  };
}

async function createDerivedWallets(
  secretRef: string,
  mnemonic: string,
  source: MobileWalletSource,
  walletLabel: string
): Promise<MobileWallet[]> {
  const wallets: MobileWallet[] = [];
  const { deriveSolanaAccount0 } = loadSolanaDeriveModule();
  const solana = deriveSolanaAccount0(mnemonic);
  wallets.push(createWallet(walletLabel, 'solana', solana.publicKey, solana.derivationPath, source, secretRef));

  await tryAddDerivedWallet(wallets, async () => {
    const sui = deriveMobileSuiAccount0(mnemonic);
    return createWallet(walletLabel, 'sui', sui.address, sui.derivationPath, source, secretRef);
  }, 'sui');

  await tryAddDerivedWallet(wallets, async () => {
    const { deriveEthereumAccount0 } = loadEthereumModule();
    const ethereum = deriveEthereumAccount0(mnemonic);
    return createWallet(walletLabel, 'ethereum', ethereum.address, ethereum.derivationPath, source, secretRef);
  }, 'ethereum');

  await tryAddDerivedWallet(wallets, async () => {
    const { deriveMonadAccount0 } = loadMonadModule();
    const monad = deriveMonadAccount0(mnemonic);
    return createWallet(walletLabel, 'monad', monad.address, monad.derivationPath, source, secretRef);
  }, 'monad');

  return wallets;
}

function createWallet(
  name: string,
  chain: GrapeChain,
  address: string,
  derivationPath: string,
  source: MobileWalletSource,
  secretRef: string
): MobileWallet {
  return {
    id: `${chain}-${createSecretRef()}`,
    name,
    chain,
    address,
    derivationPath,
    source,
    secretRef
  };
}

function getNextWalletLabel(existingWallets: MobileWallet[]) {
  const maxIndex = existingWallets.reduce((currentMax, wallet) => {
    const match = /^Wallet (\d+)$/.exec(wallet.name);
    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, 0);

  return `Wallet ${maxIndex + 1}`;
}

function shortenAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function loadWalletSecret(secretRef: string): Promise<StoredSecretPayload> {
  const candidates = getSecureStoreKeyCandidates(secretRef);

  for (const key of candidates) {
    const raw = await getItemAsync(key);
    if (!raw) {
      continue;
    }

    const preferredKey = toSecureStoreKey(secretRef);
    if (key !== preferredKey) {
      await setItemAsync(preferredKey, raw).catch(() => undefined);
    }

    return JSON.parse(raw) as StoredSecretPayload;
  }

  throw new Error('Wallet secret could not be found on this device.');
}

async function loadWalletSecretWithWalletFallback(state: MobileWalletState, wallet: MobileWallet): Promise<StoredSecretPayload> {
  try {
    return await loadWalletSecret(wallet.secretRef);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('Wallet secret could not be found on this device')) {
      throw error;
    }

    const siblingCandidates = state.wallets.filter(
      (candidate) =>
        candidate.id !== wallet.id &&
        candidate.name === wallet.name &&
        candidate.source === wallet.source &&
        candidate.secretRef &&
        candidate.secretRef !== wallet.secretRef
    );

    for (const candidate of siblingCandidates) {
      try {
        return await loadWalletSecret(candidate.secretRef);
      } catch {
        continue;
      }
    }

    throw error;
  }
}

async function importPrivateKeyWallet(chain: GrapeChain, privateKey: string) {
  switch (chain) {
    case 'solana': {
      const { importSolanaPrivateKey } = loadSolanaDeriveModule();
      const imported = importSolanaPrivateKey(privateKey);
      return {
        secretKey: imported.secretKey,
        derivationPath: imported.derivationPath,
        address: imported.publicKey
      };
    }
    case 'sui':
      return importMobileSuiPrivateKey(privateKey);
    case 'ethereum': {
      const { importEthereumPrivateKey } = loadEthereumModule();
      return importEthereumPrivateKey(privateKey);
    }
    case 'monad': {
      const { importMonadPrivateKey } = loadMonadModule();
      return importMonadPrivateKey(privateKey);
    }
    default:
      throw new Error('Unsupported chain for private key import.');
  }
}

function exportEvmPrivateKey(
  secret: StoredSecretPayload,
  account: { getHdKey?: () => { privateKey?: Uint8Array | null } } | { address: string }
) {
  if (secret.kind === 'private-key') {
    return secret.secretKey;
  }

  const hdKey = (account as { getHdKey?: () => { privateKey?: Uint8Array | null } }).getHdKey?.();
  if (hdKey?.privateKey) {
    return bytesToHexPrivateKey(hdKey.privateKey);
  }

  throw new Error('Private key export is not available for this wallet.');
}

function bytesToHexPrivateKey(bytes: Uint8Array) {
  return `0x${Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

function getMobileDeviceLinkPreferencesSnapshot(state: MobileWalletState): DeviceLinkPreferencesSnapshot {
  return {
    trackedReputationSpaceIds: [...state.trackedReputationSpaceIds],
    trackedVerificationSpaceIds: [...state.trackedVerificationSpaceIds],
    trackedGovernanceDaoIds: [...state.trackedGovernanceDaoIds],
    selectedChain: state.selectedChain,
    selectedNetwork: 'mainnet-beta',
    selectedTheme: state.selectedTheme,
    privacyMode: state.privacyMode
  };
}

function applyMobileDeviceLinkPreferences(state: MobileWalletState, preferences: DeviceLinkPreferencesSnapshot): MobileWalletState {
  return {
    ...state,
    trackedReputationSpaceIds: Array.from(new Set([...state.trackedReputationSpaceIds, ...preferences.trackedReputationSpaceIds])),
    trackedVerificationSpaceIds: Array.from(new Set([...state.trackedVerificationSpaceIds, ...preferences.trackedVerificationSpaceIds])),
    trackedGovernanceDaoIds: Array.from(new Set([...state.trackedGovernanceDaoIds, ...preferences.trackedGovernanceDaoIds])),
    selectedChain: preferences.selectedChain,
    selectedTheme: preferences.selectedTheme,
    privacyMode: preferences.privacyMode
  };
}

function normalizeDeviceLinkPairingCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
}

function createDeviceLinkPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomBytes = Crypto.getRandomBytes(8);
  const raw = Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

async function resolveWalletAddressFromSecret(secret: StoredSecretPayload, chain: GrapeChain): Promise<string> {
  if (secret.kind === 'mnemonic') {
    switch (chain) {
      case 'solana':
        return loadSolanaDeriveModule().deriveSolanaAccount0(secret.mnemonic).publicKey;
      case 'sui':
        return deriveMobileSuiAccount0(secret.mnemonic).address;
      case 'ethereum':
        return loadEthereumModule().deriveEthereumAccount0(secret.mnemonic).address;
      case 'monad':
        return loadMonadModule().deriveMonadAccount0(secret.mnemonic).address;
    }
  }

  const wallet = await importPrivateKeyWallet(chain, secret.secretKey);
  return wallet.address;
}

async function createPasswordHash(password: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

async function loadSolanaAssets(address: string): Promise<MobileAsset[]> {
  const web3 = loadSolanaWeb3Module();
  const { Connection, PublicKey } = web3;
  if (!isValidSolanaPublicKey(address)) {
    console.warn('[Grape mobile] Skipping Solana asset load for invalid address', address);
    return [];
  }

  const cached = mobileSolanaAssetCache.get(address);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.assets;
  }

  const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
  const owner = new PublicKey(address);
  type SolanaRpcTokenEntry = {
    mint: string;
    amountLabel: string;
    numericAmount: number;
    accountAddress: string;
    programId: string;
    decimals?: number;
  };
  const [lamports, shyftTokens, rpcTokenEntries] = await Promise.all([
    connection.getBalance(owner, 'confirmed').catch(() => 0),
    fetchMobileShyftWalletTokens(address, DEFAULT_SOLANA_NETWORK).catch(() => []),
    Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: new PublicKey(SOLANA_LEGACY_TOKEN_PROGRAM)
      }),
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: new PublicKey(SOLANA_TOKEN_2022_PROGRAM)
      })
    ])
      .then(([legacyTokenAccounts, token2022Accounts]) => {
        const parsedEntries: SolanaRpcTokenEntry[] = [];
        [...legacyTokenAccounts.value, ...token2022Accounts.value].forEach((account) => {
            const parsed = account.account.data.parsed.info as {
              mint: string;
              tokenAmount: { uiAmountString?: string; amount: string; uiAmount?: number; decimals?: number };
            };
            const amount = parsed.tokenAmount.uiAmountString ?? parsed.tokenAmount.amount;
            const numericAmount = Number(parsed.tokenAmount.uiAmount ?? amount);
            if (!amount || amount === '0' || numericAmount <= 0) {
              return;
            }

            parsedEntries.push({
              mint: parsed.mint,
              amountLabel: amount,
              numericAmount,
              accountAddress: account.pubkey.toBase58(),
              programId: account.account.owner.toBase58(),
              decimals: parsed.tokenAmount.decimals
            });
          });
        return parsedEntries;
      })
      .catch(() => [] as SolanaRpcTokenEntry[])
  ]);

  const mergedTokenEntries = new Map<
    string,
    {
      mint: string;
      amountLabel: string;
      numericAmount: number;
      name?: string;
      symbol?: string;
      logoUri?: string;
      decimals?: number;
      metadataSource: 'shyft' | 'rpc';
      accountAddress?: string;
      programId?: string;
    }
  >();

  const shyftTokenMap = new Map(
    shyftTokens.map((token) => [token.mint.trim(), token] as const)
  );

  rpcTokenEntries.forEach((entry) => {
    const mint = entry.mint.trim();
    const shyftToken = shyftTokenMap.get(mint);
    const symbol = shyftToken?.symbol || shortenAddress(entry.mint);
    mergedTokenEntries.set(mint, {
      mint,
      amountLabel: `${entry.amountLabel} ${symbol}`.trim(),
      numericAmount: entry.numericAmount,
      name: shyftToken?.name,
      symbol: shyftToken?.symbol,
      logoUri: shyftToken?.logoUri,
      decimals: shyftToken?.decimals ?? entry.decimals,
      accountAddress: entry.accountAddress,
      programId: entry.programId,
      metadataSource: shyftToken ? 'shyft' : 'rpc'
    });
  });

  shyftTokens.forEach((token) => {
    const mint = token.mint.trim();
    const existing = mergedTokenEntries.get(mint);
    if (existing) {
      mergedTokenEntries.set(mint, {
        ...existing,
        name: token.name || existing.name,
        symbol: token.symbol || existing.symbol,
        logoUri: token.logoUri || existing.logoUri,
        decimals: token.decimals ?? existing.decimals,
        metadataSource: 'shyft'
      });
      return;
    }

    const symbol = token.symbol || shortenAddress(mint);
    mergedTokenEntries.set(mint, {
      mint,
      amountLabel: token.balanceLabel ?? `${token.balanceUi ?? 0}`,
      numericAmount: token.balanceUi ?? 0,
      name: token.name,
      symbol,
        logoUri: token.logoUri,
        decimals: token.decimals,
        metadataSource: 'shyft'
      });
  });

  const tokenEntries = [...mergedTokenEntries.values()].sort(
    (left, right) => right.numericAmount - left.numericAmount
  );

  const jupiterPrices: Record<string, { usdPrice: number | null; priceChange24h: number | null }> =
    await fetchMobileJupiterPrices([JUPITER_SOL_MINT, ...tokenEntries.map((entry) => entry.mint)]).catch(
      () => ({})
    );
  const solUsdPrice = jupiterPrices[JUPITER_SOL_MINT]?.usdPrice ?? null;
  const solAmount = lamports / 1_000_000_000;
  const assets: MobileAsset[] = [
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      amountLabel: `${solAmount.toFixed(4).replace(/\.?0+$/, '')} SOL`,
      amountUi: solAmount,
      valueLabel: formatUsdValue(solUsdPrice ? solAmount * solUsdPrice : null),
      logoUri: 'https://media.solana-cdn.com/image/width=100/https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
      chain: 'solana',
      address: JUPITER_SOL_MINT,
      metadataSource: 'native',
      decimals: 9,
      description: 'Native SOL balance on this wallet.',
      tokenType: 'native'
    }
  ];

  tokenEntries.forEach((entry) => {
    const tokenUsdPrice = jupiterPrices[entry.mint]?.usdPrice ?? null;
    const symbol = entry.symbol || shortenAddress(entry.mint);
    assets.push({
      id: entry.mint,
      name: entry.name || shortenAddress(entry.mint),
      symbol,
      amountLabel: entry.amountLabel,
      amountUi: entry.numericAmount,
      valueLabel: formatUsdValue(tokenUsdPrice ? entry.numericAmount * tokenUsdPrice : null),
      logoUri: entry.logoUri,
      chain: 'solana',
      address: entry.mint,
      metadataSource: entry.metadataSource,
      decimals: entry.decimals,
      description: entry.metadataSource === 'shyft' ? `Metadata powered by Shyft for ${symbol}.` : undefined,
      tokenType: 'spl',
      accountAddress: entry.accountAddress,
      programId: entry.programId
    });
  });

  mobileSolanaAssetCache.set(address, {
    expiresAt: Date.now() + (assets.length > 1 ? MOBILE_SOLANA_ASSET_CACHE_TTL_MS : 5_000),
    assets
  });

  return assets;
}

async function loadSolanaAssetsFast(address: string): Promise<MobileAsset[]> {
  if (!isValidSolanaPublicKey(address)) {
    console.warn('[Grape mobile] Skipping fast Solana asset load for invalid address', address);
    return [];
  }

  const { Connection, PublicKey } = loadSolanaWeb3Module();
  const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
  const owner = new PublicKey(address);
  const [lamports, shyftTokens] = await Promise.all([
    connection.getBalance(owner, 'confirmed').catch(() => 0),
    fetchMobileShyftWalletTokens(address, DEFAULT_SOLANA_NETWORK).catch(() => [])
  ]);

  const solAmount = lamports / 1_000_000_000;
  const assets: MobileAsset[] = [
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      amountLabel: `${solAmount.toFixed(4).replace(/\.?0+$/, '')} SOL`,
      amountUi: solAmount,
      valueLabel: formatUsdValue(null),
      logoUri: 'https://media.solana-cdn.com/image/width=100/https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
      chain: 'solana',
      address: JUPITER_SOL_MINT,
      metadataSource: 'native',
      decimals: 9,
      description: 'Native SOL balance on this wallet.',
      tokenType: 'native'
    }
  ];

  shyftTokens.forEach((token) => {
    const mint = token.mint.trim();
    const symbol = token.symbol || shortenAddress(mint);
    assets.push({
      id: mint,
      name: token.name || shortenAddress(mint),
      symbol,
      amountLabel: token.balanceLabel ?? `${token.balanceUi ?? 0}`,
      amountUi: token.balanceUi ?? 0,
      valueLabel: formatUsdValue(null),
      logoUri: token.logoUri,
      chain: 'solana',
      address: mint,
      metadataSource: 'shyft',
      decimals: token.decimals,
      description: `Metadata powered by Shyft for ${symbol}.`,
      tokenType: 'spl'
    });
  });

  return assets;
}

function normalizeMobileWalletState(state: MobileWalletState): MobileWalletState {
  const validChains = new Set<GrapeChain>(['solana', 'sui', 'ethereum', 'monad']);
  const deduped = dedupeWallets(
    state.wallets
    .filter(
      (wallet): wallet is MobileWallet =>
        Boolean(wallet) &&
        typeof wallet.id === 'string' &&
        typeof wallet.name === 'string' &&
        typeof wallet.address === 'string' &&
        typeof wallet.chain === 'string' &&
        validChains.has(wallet.chain as GrapeChain)
    )
  );
  const wallets = deduped.wallets;
  const duplicateWalletIdMap = deduped.duplicateWalletIdMap;

  const selectedWalletIds = Object.fromEntries(
    Object.entries(state.selectedWalletIds)
      .map(([chain, walletId]) => [chain, duplicateWalletIdMap.get(walletId) ?? walletId] as const)
      .filter(([chain, walletId]) =>
        wallets.some((wallet) => wallet.chain === chain && wallet.id === walletId)
      )
  ) as Partial<Record<GrapeChain, string>>;

  const preferredChain =
    validChains.has(state.selectedChain)
      ? state.selectedChain
      : wallets[0]?.chain ?? DEFAULT_CHAIN;
  const selectedChain = wallets.some((wallet) => wallet.chain === preferredChain)
    ? preferredChain
    : wallets[0]?.chain ?? DEFAULT_CHAIN;

  return {
    ...state,
    wallets,
    selectedChain,
    selectedWalletIds,
    passkeyWallet: normalizePasskeyWalletConfig(state.passkeyWallet),
    trustedDappOrigins: normalizeTrustedDappOrigins(state.trustedDappOrigins),
    trackedReputationSpaceIds: normalizeTrackedReputationSpaceIds(state.trackedReputationSpaceIds),
    trackedVerificationSpaceIds: normalizeTrackedDaoIds(state.trackedVerificationSpaceIds),
    trackedGovernanceDaoIds: normalizeTrackedDaoIds(state.trackedGovernanceDaoIds)
  };
}

function normalizePasskeyWalletConfig(value: MobilePasskeyWalletConfig | null | undefined): MobilePasskeyWalletConfig | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<MobilePasskeyWalletConfig>;
  if (
    candidate.mode !== 'deterministic-passkey' ||
    candidate.version !== GRAPE_PASSKEY_WALLET_SPEC_VERSION ||
    typeof candidate.credentialId !== 'string' ||
    typeof candidate.rpId !== 'string' ||
    typeof candidate.createdAt !== 'number'
  ) {
    return undefined;
  }

  return {
    mode: 'deterministic-passkey',
    version: GRAPE_PASSKEY_WALLET_SPEC_VERSION,
    credentialId: candidate.credentialId,
    credentialIdB64Url: typeof candidate.credentialIdB64Url === 'string' && candidate.credentialIdB64Url ? candidate.credentialIdB64Url : undefined,
    rpId: candidate.rpId,
    createdAt: candidate.createdAt
  };
}

function normalizeTrustedDappOrigins(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
        .filter(Boolean)
    )
  );
}

function normalizeTrackedReputationSpaceIds(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
}

function normalizeTrackedDaoIds(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  );
}

function findGovernanceOwnerByDao(daoId: string) {
  const governanceOwners = [
    { owner: 'GovMaiHfpVPw8BAM1mbdzgmSZYDw2tdP32J2fapoQoYs', dao: '899YG3yk4F66ZgbNWLHriZHTXSKk9e1kvsKEquW7L6Mo' },
    { owner: 'GqTPL6qRf5aUuqscLh8Rg2HTxPUXfhhAXDptTLhp1t2J', dao: 'DPiH3H3c7t47BMxqTxLsuPQpEC6Kne8GA9VXbxpnZxFE' },
    { owner: 'GovHgfDPyQ1GwazJTDY2avSVY8GGcpmCapmmCsymRaGe', dao: 'FiG6YoqWnVzUmxFNukcRVXZC51HvLr6mts8nxcm7ScR8' },
    { owner: 'JPGov2SBA6f7XSJF5R4Si5jEJekGiyrwP2m7gSEqLUs', dao: 'FbpwgUzRPTneoZHDMNnM1zXb7Jm9iY8MzX2mAM8L6f43' },
    { owner: 'JPGov2SBA6f7XSJF5R4Si5jEJekGiyrwP2m7gSEqLUs', dao: 'ATnhhZJ74xg4mzxDyNQ5YAE1BZ98PhrhAsMS4xNXquvX' },
    { owner: 'pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U', dao: '4ct8XU5tKbMNRphWy4rePsS9kBqPhDdvZoGpmprPaug4' },
    { owner: 'GMnke6kxYvqoAXgbFGnu84QzvNHoqqTnijWSXYYTFQbB', dao: 'B1CxhV1khhj7n5mi5hebbivesqH9mvXr5Hfh2nD2UCh6' },
    { owner: 'hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S', dao: '2VfPJn8ML1hNBnsEBo7SzmG11UJc7gbY8b23A3K8expd' },
    { owner: 'MGovW65tDhMMcpEmsegpsdgvzb6zUwGsNjhXFxRAnjd', dao: '5o6gEoeJBpuXT1H1ijFTq3KcSGx7ayabdG2hji7cB3FG' },
    { owner: 'J9uWvULFL47gtCPvgR3oN7W357iehn5WF2Vn9MJvcSxz', dao: '66Du7mXgS2KMQBUk6m9h3TszMjqZqdWhsG3Duuf69VNW' },
    { owner: 'ALLGnZikNaJQeN4KCAbDjZRSzvSefUdeTpk18yfizZvT', dao: 'A7nud4wxpAySc7Ai11vwXtkez79tHvcEvSquFBxw4iDh' },
    { owner: 'AEauWRrpn9Cs6GXujzdp1YhMmv2288kBt3SdEcPYEerr', dao: 'DA5G7QQbFioZ6K33wQcH8fVdgFcnaDjLD7DLQkapZg5X' },
    { owner: 'GMpXgTSJt2nJ7zjD1RwbT2QyPhKqD2MjAZuEaLsfPYLF', dao: 'Cdui9Va8XnKVng3VGZXcfBFF6XSxbqSi2XruMc7iu817' },
    { owner: 'GmtpXy362L8cZfkRmTZMYunWVe8TyRjX5B7sodPZ63LJ', dao: '2sEcHwzsNBwNoTM1yAXjtF1HTMQKUAXf8ivtdpSpo9Fv' },
    { owner: 'AVoAYTs36yB5izAaBkxRG67wL1AMwG3vo41hKtUSb8is', dao: '3MMDxjv1SzEFQDKryT7csAvaydYtrgMAc3L9xL9CVLCg' },
    { owner: '5hAykmD4YGcQ7Am3N7nC9kyELq6CThAkU82nhNKDJiCy', dao: '759qyfKDMMuo9v36tW7fbGanL63mZFPNbhU7zjPrkuGK' },
    { owner: 'jdaoDN37BrVRvxuXSeyR7xE5Z9CAoQApexGrQJbnj6V', dao: '5g94Ver64ruf9CGBL3k2oQGdKCUt4QKjN7NQojSrHAwH' },
    { owner: 'jtogvBNH3WBSWDYD5FJfQP2ZxNTuf82zL8GkEhPeaJx', dao: 'jjCAwuuNpJCNMLAanpwgJZ6cdXzLPXe2GfD6TaDQBXt' }
  ];

  return governanceOwners.find((entry) => entry.dao === daoId) ?? {
    owner: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
    dao: daoId
  };
}

function isValidSolanaPublicKey(value: string) {
  try {
    const { PublicKey } = loadSolanaWeb3Module();
    void new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

async function loadSuiAssets(address: string): Promise<MobileAsset[]> {
  const holdings = await getMobileSuiHoldings(address, DEFAULT_SUI_NETWORK);
  return [
    {
      id: 'sui',
      name: 'Sui',
      symbol: 'SUI',
      amountLabel: `${formatMobileSuiAmount(holdings.totalMist, 9)} SUI`,
      valueLabel: '',
      chain: 'sui',
      address,
      metadataSource: 'native',
      decimals: 9,
      tokenType: 'native'
    },
    ...holdings.coins.map((coin) => ({
      id: coin.coinType,
      name: coin.name,
      symbol: coin.symbol,
      amountLabel: `${coin.amount} ${coin.symbol}`,
      valueLabel: '',
      chain: 'sui' as const,
      address: coin.coinType,
      metadataSource: 'rpc' as const,
      decimals: coin.decimals,
      tokenType: coin.coinType === '0x2::sui::SUI' ? 'native' as const : 'sui-coin' as const
    }))
  ];
}

async function loadEthereumAssets(address: string): Promise<MobileAsset[]> {
  const { createEthereumPublicClient, getEthereumHoldings } = loadEthereumModule();
  const client = createEthereumPublicClient(DEFAULT_EVM_NETWORK, getMobileEthereumRpcUrl(DEFAULT_EVM_NETWORK));
  const holdings = await getEthereumHoldings(client, address);
  return [
    {
      id: 'eth',
      name: 'Ethereum',
      symbol: 'ETH',
      amountLabel: `${holdings.formatted} ETH`,
      valueLabel: '',
      chain: 'ethereum',
      address,
      metadataSource: 'native',
      decimals: 18,
      tokenType: 'native'
    }
  ];
}

async function loadMonadAssets(address: string): Promise<MobileAsset[]> {
  const { createMonadPublicClient, getMonadHoldings } = loadMonadModule();
  const client = createMonadPublicClient(DEFAULT_EVM_NETWORK, getMobileMonadRpcUrl(DEFAULT_EVM_NETWORK));
  const holdings = await getMonadHoldings(client, address);
  return [
    {
      id: 'mon',
      name: 'Monad',
      symbol: 'MON',
      amountLabel: `${holdings.formatted} MON`,
      valueLabel: '',
      chain: 'monad',
      address,
      metadataSource: 'native',
      decimals: 18,
      tokenType: 'native'
    }
  ];
}

function createSecretRef() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, '');
  }

  return `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

function toSecureStoreKey(secretRef: string) {
  return `${SECRET_PREFIX}${secretRef}`.replace(/[^a-zA-Z0-9]/g, '');
}

function getSecureStoreKeyCandidates(secretRef: string) {
  const candidates = new Set<string>();
  const trimmed = secretRef.trim();

  if (trimmed) {
    candidates.add(toSecureStoreKey(trimmed));
    candidates.add(trimmed);
    candidates.add(`${SECRET_PREFIX}${trimmed}`);
    candidates.add(`grape:mobile:secret:${trimmed}`);
    candidates.add(`grape-mobile-secret-${trimmed}`);

    const alphanumeric = trimmed.replace(/[^a-zA-Z0-9]/g, '');
    if (alphanumeric) {
      candidates.add(toSecureStoreKey(alphanumeric));
      candidates.add(`${SECRET_PREFIX}${alphanumeric}`);
      candidates.add(`grape:mobile:secret:${alphanumeric}`);
      candidates.add(`grape-mobile-secret-${alphanumeric}`);
    }
  }

  return [...candidates].filter((candidate) => isValidSecureStoreKey(candidate));
}

function isValidSecureStoreKey(value: string) {
  return /^[a-zA-Z0-9]+$/.test(value);
}

async function deleteStoredSecretIfUnused(wallets: MobileWallet[], secretRef: string, removedWalletId: string) {
  const stillUsed = wallets.some((wallet) => wallet.id !== removedWalletId && wallet.secretRef === secretRef);
  if (stillUsed) {
    return;
  }

  const preferredKey = toSecureStoreKey(secretRef);
  await deleteItemAsync(preferredKey).catch(() => undefined);
}

async function tryAddDerivedWallet(
  wallets: MobileWallet[],
  factory: () => Promise<MobileWallet>,
  chain: GrapeChain
) {
  try {
    wallets.push(await factory());
  } catch (error) {
    console.warn(`[Grape mobile] Skipping ${chain} wallet derivation`, error);
  }
}

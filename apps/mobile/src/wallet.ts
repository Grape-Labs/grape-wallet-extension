import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getItemAsync, setItemAsync } from 'expo-secure-store';

import { DEFAULT_THEME, type GrapeChain, type GrapeTheme, type WalletSetupState } from '@grape/core';
import { generateWalletMnemonic, type WalletMnemonicLength, validateWalletMnemonic } from '../../../packages/solana/src/mnemonic';
import {
  deriveMobileSuiAccount0,
  formatMobileSuiAmount,
  getMobileSuiHoldings,
  getMobileSuiSendUnsupportedMessage,
  importMobileSuiPrivateKey
} from './sui';

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
  type: 'send';
  title: string;
  subtitle: string;
  amountLabel: string;
  timestamp: number;
  signature: string;
  status: 'success';
};

export type MobileWalletState = {
  setup: WalletSetupState;
  selectedChain: GrapeChain;
  selectedTheme: GrapeTheme;
  selectedWalletIds: Partial<Record<GrapeChain, string>>;
  wallets: MobileWallet[];
  passwordSalt: string;
  passwordHash: string;
  privacyMode: boolean;
  biometricEnabled: boolean;
  activities: MobileActivity[];
};

export type MobileAsset = {
  id: string;
  name: string;
  symbol: string;
  amountLabel: string;
  valueLabel: string;
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
    wallets: [],
    passwordSalt: '',
    passwordHash: '',
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
  return {
    ...createEmptyMobileWalletState(),
    ...parsed,
    wallets: Array.isArray(parsed.wallets) ? parsed.wallets : [],
    selectedWalletIds: parsed.selectedWalletIds ?? {},
    activities: Array.isArray(parsed.activities) ? parsed.activities : []
  };
}

export async function persistMobileWalletState(state: MobileWalletState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function createWalletSet(input: {
  mnemonic: string;
  password: string;
  source: MobileWalletSource;
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
    wallets,
    passwordSalt,
    passwordHash,
    privacyMode: false,
    biometricEnabled: false,
    activities: []
  };

  await persistMobileWalletState(state);
  return state;
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

  const secretRef = createSecretRef();
  const payload: StoredSecretPayload = { kind: 'mnemonic', mnemonic };
  await setItemAsync(toSecureStoreKey(secretRef), JSON.stringify(payload));

  const walletLabel = getNextWalletLabel(input.state.wallets);
  const addedWallets = await createDerivedWallets(secretRef, mnemonic, input.source, walletLabel);
  const nextState: MobileWalletState = {
    ...input.state,
    setup: 'ready',
    wallets: [...input.state.wallets, ...addedWallets],
    selectedWalletIds: {
      ...input.state.selectedWalletIds,
      ...Object.fromEntries(addedWallets.map((wallet) => [wallet.chain, wallet.id]))
    }
  };

  await persistMobileWalletState(nextState);
  return nextState;
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
    wallets: [wallet],
    passwordSalt,
    passwordHash,
    privacyMode: false,
    biometricEnabled: false,
    activities: []
  };

  await persistMobileWalletState(state);
  return state;
}

export async function addPrivateKeyWallet(input: {
  state: MobileWalletState;
  chain: GrapeChain;
  privateKey: string;
}): Promise<MobileWalletState> {
  const importedWallet = await importPrivateKeyWallet(input.chain, input.privateKey.trim());
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

export async function sendNativeAsset(input: {
  wallet: MobileWallet;
  recipient: string;
  amount: string;
}): Promise<string> {
  const secret = await loadWalletSecret(input.wallet.secretRef);

  switch (input.wallet.chain) {
    case 'solana': {
      const { resolveSolanaVaultSecret } = loadSolanaDeriveModule();
      const { SOLANA_RPC_ENDPOINTS } = loadSolanaNetworksModule();
      const { signAndSendTransaction } = loadSolanaSigningModule();
      const { buildSolTransferTransaction } = loadSolanaTransfersModule();
      const web3 = loadSolanaWeb3Module();
      const { Connection, PublicKey } = web3;
      const connection = new Connection(SOLANA_RPC_ENDPOINTS[DEFAULT_SOLANA_NETWORK], 'confirmed');
      const keypair = secret.kind === 'mnemonic'
        ? resolveSolanaVaultSecret({ kind: 'mnemonic', mnemonic: secret.mnemonic })
        : resolveSolanaVaultSecret({ kind: 'private-key', secretKey: secret.secretKey });
      const transaction = await buildSolTransferTransaction(connection, new PublicKey(input.wallet.address), {
        recipient: input.recipient,
        amount: input.amount
      });
      return signAndSendTransaction(transaction, keypair, connection);
    }
    case 'sui': {
      throw new Error(getMobileSuiSendUnsupportedMessage());
    }
    case 'ethereum': {
      const { sendEthereum } = loadEthereumModule();
      const vaultSecret = secret.kind === 'mnemonic'
        ? { kind: 'mnemonic' as const, mnemonic: secret.mnemonic }
        : { kind: 'private-key' as const, secretKey: secret.secretKey };
      return sendEthereum(DEFAULT_EVM_NETWORK, vaultSecret, {
        recipient: input.recipient,
        amountEther: input.amount
      });
    }
    case 'monad': {
      const { sendMonad } = loadMonadModule();
      const vaultSecret = secret.kind === 'mnemonic'
        ? { kind: 'mnemonic' as const, mnemonic: secret.mnemonic }
        : { kind: 'private-key' as const, secretKey: secret.secretKey };
      return sendMonad(DEFAULT_EVM_NETWORK, vaultSecret, {
        recipient: input.recipient,
        amountEther: input.amount
      });
    }
    default:
      throw new Error('Unsupported chain.');
  }
}

export function createSendActivity(input: {
  wallet: MobileWallet;
  recipient: string;
  amountLabel: string;
  signature: string;
}): MobileActivity {
  return {
    id: `activity-${createSecretRef()}`,
    chain: input.wallet.chain,
    walletId: input.wallet.id,
    type: 'send',
    title: `Sent ${input.wallet.chain === 'solana' ? 'asset' : input.wallet.chain === 'sui' ? 'SUI' : input.wallet.chain === 'ethereum' ? 'ETH' : 'MON'}`,
    subtitle: shortenAddress(input.recipient),
    amountLabel: input.amountLabel,
    timestamp: Date.now(),
    signature: input.signature,
    status: 'success'
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
  const raw = await getItemAsync(toSecureStoreKey(secretRef));
  if (!raw) {
    throw new Error('Wallet secret could not be found on this device.');
  }

  return JSON.parse(raw) as StoredSecretPayload;
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

async function createPasswordHash(password: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
}

async function loadSolanaAssets(address: string): Promise<MobileAsset[]> {
  const { SOLANA_RPC_ENDPOINTS } = loadSolanaNetworksModule();
  const web3 = loadSolanaWeb3Module();
  const { Connection, PublicKey } = web3;
  const connection = new Connection(SOLANA_RPC_ENDPOINTS[DEFAULT_SOLANA_NETWORK], 'confirmed');
  const owner = new PublicKey(address);
  const [lamports, tokenAccounts] = await Promise.all([
    connection.getBalance(owner, 'confirmed'),
    connection.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    })
  ]);

  const assets: MobileAsset[] = [
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      amountLabel: `${(lamports / 1_000_000_000).toFixed(4).replace(/\.?0+$/, '')} SOL`,
      valueLabel: ''
    }
  ];

  tokenAccounts.value.forEach((account) => {
    const parsed = account.account.data.parsed.info;
    const tokenAmount = parsed.tokenAmount as { uiAmountString?: string; amount: string };
    const amount = tokenAmount.uiAmountString ?? tokenAmount.amount;
    if (amount === '0') {
      return;
    }

    const mint = parsed.mint as string;
    assets.push({
      id: mint,
      name: shortenAddress(mint),
      symbol: shortenAddress(mint),
      amountLabel: amount,
      valueLabel: ''
    });
  });

  return assets;
}

async function loadSuiAssets(address: string): Promise<MobileAsset[]> {
  const holdings = await getMobileSuiHoldings(address);
  return [
    {
      id: 'sui',
      name: 'Sui',
      symbol: 'SUI',
      amountLabel: `${formatMobileSuiAmount(holdings.totalMist, 9)} SUI`,
      valueLabel: ''
    },
    ...holdings.coins.map((coin) => ({
      id: coin.coinType,
      name: coin.name,
      symbol: coin.symbol,
      amountLabel: `${coin.amount} ${coin.symbol}`,
      valueLabel: ''
    }))
  ];
}

async function loadEthereumAssets(address: string): Promise<MobileAsset[]> {
  const { createEthereumPublicClient, getEthereumHoldings } = loadEthereumModule();
  const client = createEthereumPublicClient(DEFAULT_EVM_NETWORK);
  const holdings = await getEthereumHoldings(client, address);
  return [
    {
      id: 'eth',
      name: 'Ethereum',
      symbol: 'ETH',
      amountLabel: `${holdings.formatted} ETH`,
      valueLabel: ''
    }
  ];
}

async function loadMonadAssets(address: string): Promise<MobileAsset[]> {
  const { createMonadPublicClient, getMonadHoldings } = loadMonadModule();
  const client = createMonadPublicClient(DEFAULT_EVM_NETWORK);
  const holdings = await getMonadHoldings(client, address);
  return [
    {
      id: 'mon',
      name: 'Monad',
      symbol: 'MON',
      amountLabel: `${holdings.formatted} MON`,
      valueLabel: ''
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

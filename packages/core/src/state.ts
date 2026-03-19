import type { EncryptedPayload } from './crypto';

export const STORAGE_KEYS = {
  state: 'grape:state',
  permissions: 'grape:permissions',
  approvals: 'grape:approvals',
  session: 'grape:session'
} as const;

export type WalletSetupState = 'empty' | 'ready';
export type GrapeChain = 'solana' | 'sui' | 'monad' | 'ethereum';
export type GrapeNetwork = 'mainnet-beta' | 'devnet';
export type GrapeTheme =
  | 'grape'
  | 'comic'
  | 'sunset'
  | 'matrix'
  | 'tron'
  | 'apple'
  | 'aurora'
  | 'champagne'
  | 'liquid-chrome'
  | 'obsidian';

export const SUPPORTED_THEMES = [
  'grape',
  'comic',
  'sunset',
  'matrix',
  'tron',
  'apple',
  'aurora',
  'champagne',
  'liquid-chrome',
  'obsidian'
] as const satisfies readonly GrapeTheme[];

export const SUPPORTED_CHAINS = ['solana', 'sui', 'monad', 'ethereum'] as const satisfies readonly GrapeChain[];

export type VaultRecord = {
  version: 1;
  encryptedSecret: EncryptedPayload;
  createdAt: number;
  updatedAt: number;
};

export type WalletAccount = {
  id: string;
  index: number;
  publicKey: string;
  derivationPath: string;
};

export type WalletRecipient = {
  address: string;
  lastUsedAt: number;
};

export type BiometricUnlockConfig = {
  credentialId: string;
  credentialIdB64Url: string;
  keySalt: string;
  wrappedPassword: EncryptedPayload;
  createdAt: number;
};

export type WalletSigner =
  | {
      kind: 'software';
    }
  | {
      kind: 'watch-only';
    }
  | {
      kind: 'ledger';
      transport: 'webhid';
      derivationPath: string;
    };

export type WalletProfile = {
  id: string;
  name: string;
  chain: GrapeChain;
  vault?: VaultRecord;
  signer: WalletSigner;
  source: 'created' | 'imported-mnemonic' | 'imported-private-key' | 'watch-only' | 'ledger';
  biometricUnlock?: BiometricUnlockConfig;
  accounts: WalletAccount[];
  selectedAccountId: string;
  recentRecipients: WalletRecipient[];
};

export type SolanaChainState = {
  selectedNetwork: GrapeNetwork;
  customRpcUrls: Partial<Record<GrapeNetwork, string>>;
};

export type SuiChainState = {
  selectedNetwork: GrapeNetwork;
  customRpcUrl?: string;
};

export type MonadChainState = {
  selectedNetwork: GrapeNetwork;
  customRpcUrl?: string;
};

export type WalletState = {
  setup: WalletSetupState;
  wallets: WalletProfile[];
  selectedChain: GrapeChain;
  selectedWalletIds: Partial<Record<GrapeChain, string>>;
  trackedReputationSpaceIds: string[];
  trackedVerificationSpaceIds: string[];
  trackedGovernanceDaoIds: string[];
  chainState: {
    solana: SolanaChainState;
    sui: SuiChainState;
    monad: MonadChainState;
    ethereum: MonadChainState;
  };
  selectedWalletId?: string;
  selectedNetwork: GrapeNetwork;
  selectedTheme: GrapeTheme;
  privacyMode: boolean;
  customRpcUrls: Partial<Record<GrapeNetwork, string>>;
  idleTimeoutMs: number;
};

export type LegacyWalletState = {
  setup: WalletSetupState;
  vault?: VaultRecord;
  accounts?: WalletAccount[];
  selectedAccountId?: string;
  selectedChain?: GrapeChain;
  selectedWalletIds?: Partial<Record<GrapeChain, string>>;
  trackedReputationSpaceIds?: string[];
  trackedVerificationSpaceIds?: string[];
  trackedGovernanceDaoIds?: string[];
  chainState?: Partial<WalletState['chainState']>;
  selectedNetwork?: GrapeNetwork;
  selectedTheme?: GrapeTheme;
  privacyMode?: boolean;
  customRpcUrls?: Partial<Record<GrapeNetwork, string>>;
  idleTimeoutMs?: number;
};

export type SessionState = {
  locked: boolean;
  lastActivityAt: number;
};

export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_RECENT_RECIPIENTS = 8;
export const DEFAULT_THEME: GrapeTheme = 'aurora';
export const DEFAULT_CHAIN: GrapeChain = 'solana';

export function normalizeTheme(theme: unknown): GrapeTheme {
  switch (theme) {
    case 'grape':
    case 'comic':
    case 'sunset':
    case 'matrix':
    case 'tron':
    case 'apple':
    case 'aurora':
    case 'champagne':
    case 'liquid-chrome':
    case 'obsidian':
      return theme;
    case 'modern':
      return 'aurora';
    case 'space':
      return 'liquid-chrome';
    case 'dark':
      return 'obsidian';
    case 'light':
      return 'champagne';
    default:
      return DEFAULT_THEME;
  }
}

export function createEmptyWalletState(): WalletState {
  return {
    setup: 'empty',
    wallets: [],
    selectedChain: DEFAULT_CHAIN,
    selectedWalletIds: {},
    trackedReputationSpaceIds: [],
    trackedVerificationSpaceIds: [],
    trackedGovernanceDaoIds: [],
    chainState: {
      solana: {
        selectedNetwork: 'devnet',
        customRpcUrls: {}
      },
      sui: {
        selectedNetwork: 'mainnet-beta'
      },
      monad: {
        selectedNetwork: 'mainnet-beta'
      },
      ethereum: {
        selectedNetwork: 'mainnet-beta'
      }
    },
    selectedNetwork: 'devnet',
    selectedTheme: DEFAULT_THEME,
    privacyMode: false,
    customRpcUrls: {},
    idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS
  };
}

export function createInitialSessionState(): SessionState {
  return {
    locked: true,
    lastActivityAt: 0
  };
}

export function isSessionExpired(session: SessionState, idleTimeoutMs: number, now = Date.now()): boolean {
  if (session.locked) {
    return true;
  }
  return now - session.lastActivityAt > idleTimeoutMs;
}

export function getSelectedWallet(state: WalletState): WalletProfile | undefined {
  return getSelectedWalletForChain(state, state.selectedChain);
}

export function getSelectedWalletForChain(state: WalletState, chain: GrapeChain): WalletProfile | undefined {
  const chainWallets = state.wallets.filter((wallet) => wallet.chain === chain);
  const selectedWalletId = getSelectedWalletIdForChain(state, chain);
  return chainWallets.find((wallet) => wallet.id === selectedWalletId) ?? chainWallets[0];
}

export function getSelectedWalletIdForChain(state: WalletState, chain: GrapeChain): string | undefined {
  return state.selectedWalletIds[chain] ?? (chain === 'solana' ? state.selectedWalletId : undefined);
}

export function getSelectedSolanaChainState(state: WalletState): SolanaChainState {
  return state.chainState.solana;
}

export function rememberWalletRecipient(wallet: WalletProfile, address: string, lastUsedAt = Date.now()): WalletProfile {
  const normalizedAddress = address.trim();
  const recentRecipients = [
    { address: normalizedAddress, lastUsedAt },
    ...wallet.recentRecipients.filter((recipient) => recipient.address !== normalizedAddress)
  ].slice(0, MAX_RECENT_RECIPIENTS);

  return {
    ...wallet,
    recentRecipients
  };
}

export function removeWalletProfile(state: WalletState, walletId: string): WalletState {
  const removedWallet = state.wallets.find((wallet) => wallet.id === walletId);
  const nextWallets = state.wallets.filter((wallet) => wallet.id !== walletId);

  if (nextWallets.length === 0) {
    return {
      ...state,
      setup: 'empty',
      wallets: [],
      selectedWalletIds: {},
      selectedWalletId: undefined
    };
  }

  const nextState: WalletState = {
    ...state,
    setup: 'ready',
    wallets: nextWallets
  };

  if (removedWallet) {
    const chainWallets = nextWallets.filter((wallet) => wallet.chain === removedWallet.chain);
    const nextSelectedWalletIds = {
      ...state.selectedWalletIds
    };
    if (nextSelectedWalletIds[removedWallet.chain] === walletId) {
      if (chainWallets[0]?.id) {
        nextSelectedWalletIds[removedWallet.chain] = chainWallets[0].id;
      } else {
        delete nextSelectedWalletIds[removedWallet.chain];
      }
    }
    nextState.selectedWalletIds = nextSelectedWalletIds;
  }

  const nextSelectedSolanaWalletId = getSelectedWalletIdForChain(nextState, 'solana') ?? nextWallets[0]?.id;

  return {
    ...nextState,
    selectedWalletId: nextSelectedSolanaWalletId
  };
}

export function migrateWalletState(input: WalletState | LegacyWalletState | undefined): WalletState {
  if (!input) {
    return createEmptyWalletState();
  }

  if ('wallets' in input && Array.isArray(input.wallets)) {
    const { wallets: normalizedWallets, selectedWalletId } = normalizeWalletIdentity(
      input.wallets.map(normalizeWalletProfile),
      input.selectedWalletId
    );
    const selectedChain = input.selectedChain ?? DEFAULT_CHAIN;
    const chainState = normalizeChainState(input.chainState, input.selectedNetwork, input.customRpcUrls);
    const selectedWalletIds = normalizeSelectedWalletIds(
      input.selectedWalletIds,
      normalizedWallets,
      selectedWalletId
    );
    return {
      setup: normalizedWallets.length > 0 ? 'ready' : input.setup,
      wallets: normalizedWallets,
      selectedChain,
      selectedWalletIds,
      trackedReputationSpaceIds: normalizeTrackedReputationSpaceIds(input.trackedReputationSpaceIds),
      trackedVerificationSpaceIds: normalizeTrackedVerificationSpaceIds(input.trackedVerificationSpaceIds),
      trackedGovernanceDaoIds: normalizeTrackedDaoIds(input.trackedGovernanceDaoIds),
      chainState,
      selectedWalletId: selectedWalletId ?? selectedWalletIds.solana ?? normalizedWallets.find((wallet) => wallet.chain === 'solana')?.id,
      selectedNetwork: chainState.solana.selectedNetwork,
      selectedTheme: normalizeTheme(input.selectedTheme),
      privacyMode: input.privacyMode ?? false,
      customRpcUrls: chainState.solana.customRpcUrls,
      idleTimeoutMs: input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    };
  }

  if (isLegacyReadyWalletState(input)) {
    const firstAccount = input.accounts[0];
    return {
      setup: 'ready',
      wallets: [
        {
          id: 'wallet-1',
          name: 'Wallet 1',
          chain: 'solana',
          vault: input.vault,
          signer: { kind: 'software' },
          source: 'created',
          accounts: input.accounts,
          selectedAccountId: input.selectedAccountId ?? firstAccount.id,
          recentRecipients: []
        }
      ],
      selectedChain: DEFAULT_CHAIN,
      selectedWalletIds: {
        solana: 'wallet-1'
      },
      trackedReputationSpaceIds: normalizeTrackedReputationSpaceIds(input.trackedReputationSpaceIds),
      trackedVerificationSpaceIds: normalizeTrackedVerificationSpaceIds(input.trackedVerificationSpaceIds),
      trackedGovernanceDaoIds: normalizeTrackedDaoIds(input.trackedGovernanceDaoIds),
      chainState: {
        solana: {
          selectedNetwork: input.selectedNetwork ?? 'devnet',
          customRpcUrls: normalizeCustomRpcUrls(input.customRpcUrls)
        },
        sui: {
          selectedNetwork: 'mainnet-beta'
        },
      monad: {
        selectedNetwork: 'mainnet-beta'
      },
      ethereum: {
        selectedNetwork: 'mainnet-beta'
      }
      },
      selectedWalletId: 'wallet-1',
      selectedNetwork: input.selectedNetwork ?? 'devnet',
      selectedTheme: normalizeTheme(input.selectedTheme),
      privacyMode: input.privacyMode ?? false,
      customRpcUrls: normalizeCustomRpcUrls(input.customRpcUrls),
      idleTimeoutMs: input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    };
  }

  return {
    setup: 'empty',
    wallets: [],
    selectedChain: input.selectedChain ?? DEFAULT_CHAIN,
    selectedWalletIds: {},
    trackedReputationSpaceIds: normalizeTrackedReputationSpaceIds(input.trackedReputationSpaceIds),
    trackedVerificationSpaceIds: normalizeTrackedVerificationSpaceIds(input.trackedVerificationSpaceIds),
    trackedGovernanceDaoIds: normalizeTrackedDaoIds(input.trackedGovernanceDaoIds),
    chainState: normalizeChainState(input.chainState, input.selectedNetwork, input.customRpcUrls),
    selectedNetwork: input.selectedNetwork ?? 'devnet',
    selectedTheme: normalizeTheme(input.selectedTheme),
    privacyMode: input.privacyMode ?? false,
    customRpcUrls: normalizeCustomRpcUrls(input.customRpcUrls),
    idleTimeoutMs: input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  };
}

function normalizeTrackedReputationSpaceIds(value: string[] | undefined): string[] {
  return normalizeTrackedDaoIds(value);
}

function normalizeTrackedVerificationSpaceIds(value: string[] | undefined): string[] {
  return normalizeTrackedDaoIds(value);
}

function normalizeTrackedDaoIds(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
    )
  );
}

function isLegacyReadyWalletState(input: WalletState | LegacyWalletState): input is LegacyWalletState & {
  setup: 'ready';
  vault: VaultRecord;
  accounts: WalletAccount[];
} {
  return (
    !('wallets' in input) &&
    input.setup === 'ready' &&
    !!input.vault &&
    Array.isArray(input.accounts) &&
    input.accounts.length > 0
  );
}

function normalizeWalletProfile(wallet: WalletProfile): WalletProfile {
  return {
    ...wallet,
    chain: wallet.chain ?? 'solana',
    signer: wallet.signer ?? { kind: 'software' },
    source: wallet.source ?? (wallet.signer?.kind === 'ledger' ? 'ledger' : wallet.signer?.kind === 'watch-only' ? 'watch-only' : 'created'),
    biometricUnlock: wallet.biometricUnlock,
    recentRecipients: Array.isArray(wallet.recentRecipients) ? wallet.recentRecipients : []
  };
}

function normalizeCustomRpcUrls(
  customRpcUrls: Partial<Record<GrapeNetwork, string>> | undefined
): Partial<Record<GrapeNetwork, string>> {
  if (!customRpcUrls) {
    return {};
  }

  const next: Partial<Record<GrapeNetwork, string>> = {};
  for (const network of ['mainnet-beta', 'devnet'] as const) {
    const value = customRpcUrls[network]?.trim();
    if (value) {
      next[network] = value;
    }
  }
  return next;
}

function normalizeChainState(
  chainState: Partial<WalletState['chainState']> | undefined,
  selectedNetwork: GrapeNetwork | undefined,
  customRpcUrls: Partial<Record<GrapeNetwork, string>> | undefined
): WalletState['chainState'] {
  const normalizedSolanaCustomRpc = normalizeCustomRpcUrls(
    chainState?.solana?.customRpcUrls ?? customRpcUrls
  );
  return {
    solana: {
      selectedNetwork: chainState?.solana?.selectedNetwork ?? selectedNetwork ?? 'devnet',
      customRpcUrls: normalizedSolanaCustomRpc
    },
    sui: {
      selectedNetwork: chainState?.sui?.selectedNetwork ?? 'mainnet-beta',
      customRpcUrl: chainState?.sui?.customRpcUrl?.trim() || undefined
    },
    monad: {
      selectedNetwork: chainState?.monad?.selectedNetwork ?? 'mainnet-beta',
      customRpcUrl: chainState?.monad?.customRpcUrl?.trim() || undefined
    },
    ethereum: {
      selectedNetwork: chainState?.ethereum?.selectedNetwork ?? 'mainnet-beta',
      customRpcUrl: chainState?.ethereum?.customRpcUrl?.trim() || undefined
    }
  };
}

function normalizeSelectedWalletIds(
  selectedWalletIds: Partial<Record<GrapeChain, string>> | undefined,
  wallets: WalletProfile[],
  fallbackSelectedWalletId?: string
): Partial<Record<GrapeChain, string>> {
  const next: Partial<Record<GrapeChain, string>> = {
    ...selectedWalletIds
  };

  if (!next.solana) {
    next.solana =
      fallbackSelectedWalletId && wallets.some((wallet) => wallet.chain === 'solana' && wallet.id === fallbackSelectedWalletId)
        ? fallbackSelectedWalletId
        : wallets.find((wallet) => wallet.chain === 'solana')?.id;
  }

  if (!next.sui) {
    next.sui = wallets.find((wallet) => wallet.chain === 'sui')?.id;
  }

  if (!next.monad) {
    next.monad = wallets.find((wallet) => wallet.chain === 'monad')?.id;
  }

  if (!next.ethereum) {
    next.ethereum = wallets.find((wallet) => wallet.chain === 'ethereum')?.id;
  }

  return next;
}

function normalizeWalletNames(wallets: WalletProfile[]): WalletProfile[] {
  let nextDefaultName = 1;
  return wallets.map((wallet) => {
    if (/^Wallet \d+$/.test(wallet.name)) {
      const normalizedName = `Wallet ${nextDefaultName}`;
      nextDefaultName += 1;
      if (wallet.name !== normalizedName) {
        return {
          ...wallet,
          name: normalizedName
        };
      }
    }
    return wallet;
  });
}

function normalizeWalletIdentity(
  wallets: WalletProfile[],
  selectedWalletId?: string
): { wallets: WalletProfile[]; selectedWalletId?: string } {
  const seenIds = new Set<string>();
  let resolvedSelectedWalletId: string | undefined;

  const dedupedWallets = normalizeWalletNames(
    wallets.map((wallet) => {
      let nextId = wallet.id;
      if (!nextId || seenIds.has(nextId)) {
        nextId = `wallet-${crypto.randomUUID()}`;
      }
      seenIds.add(nextId);

      if (selectedWalletId === wallet.id && !resolvedSelectedWalletId) {
        resolvedSelectedWalletId = nextId;
      }

      if (nextId !== wallet.id) {
        return {
          ...wallet,
          id: nextId
        };
      }

      return wallet;
    })
  );

  return {
    wallets: dedupedWallets,
    selectedWalletId: resolvedSelectedWalletId ?? selectedWalletId
  };
}

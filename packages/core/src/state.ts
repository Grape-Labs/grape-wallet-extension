import type { EncryptedPayload } from './crypto';

export const STORAGE_KEYS = {
  state: 'grape:state',
  permissions: 'grape:permissions',
  approvals: 'grape:approvals',
  session: 'grape:session'
} as const;

export type WalletSetupState = 'empty' | 'ready';
export type GrapeNetwork = 'mainnet-beta' | 'devnet';
export type GrapeTheme =
  | 'grape'
  | 'comic'
  | 'sunset'
  | 'matrix'
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
  'apple',
  'aurora',
  'champagne',
  'liquid-chrome',
  'obsidian'
] as const satisfies readonly GrapeTheme[];

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
  vault?: VaultRecord;
  signer: WalletSigner;
  source: 'created' | 'imported-mnemonic' | 'imported-private-key' | 'watch-only' | 'ledger';
  biometricUnlock?: BiometricUnlockConfig;
  accounts: WalletAccount[];
  selectedAccountId: string;
  recentRecipients: WalletRecipient[];
};

export type WalletState = {
  setup: WalletSetupState;
  wallets: WalletProfile[];
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

export function normalizeTheme(theme: unknown): GrapeTheme {
  switch (theme) {
    case 'grape':
    case 'comic':
    case 'sunset':
    case 'matrix':
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
  return state.wallets.find((wallet) => wallet.id === state.selectedWalletId) ?? state.wallets[0];
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
  const nextWallets = state.wallets.filter((wallet) => wallet.id !== walletId);

  if (nextWallets.length === 0) {
    return {
      ...state,
      setup: 'empty',
      wallets: [],
      selectedWalletId: undefined
    };
  }

  const nextSelectedWalletId =
    state.selectedWalletId === walletId ? nextWallets[0]?.id : state.selectedWalletId ?? nextWallets[0]?.id;

  return {
    ...state,
    setup: 'ready',
    wallets: nextWallets,
    selectedWalletId: nextSelectedWalletId
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
    return {
      setup: normalizedWallets.length > 0 ? 'ready' : input.setup,
      wallets: normalizedWallets,
      selectedWalletId: selectedWalletId ?? normalizedWallets[0]?.id,
      selectedNetwork: input.selectedNetwork ?? 'devnet',
      selectedTheme: normalizeTheme(input.selectedTheme),
      privacyMode: input.privacyMode ?? false,
      customRpcUrls: normalizeCustomRpcUrls(input.customRpcUrls),
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
          vault: input.vault,
          signer: { kind: 'software' },
          source: 'created',
          accounts: input.accounts,
          selectedAccountId: input.selectedAccountId ?? firstAccount.id,
          recentRecipients: []
        }
      ],
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
    selectedNetwork: input.selectedNetwork ?? 'devnet',
    selectedTheme: normalizeTheme(input.selectedTheme),
    privacyMode: input.privacyMode ?? false,
    customRpcUrls: normalizeCustomRpcUrls(input.customRpcUrls),
    idleTimeoutMs: input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
  };
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

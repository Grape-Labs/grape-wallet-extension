import type { EncryptedPayload } from './crypto';

export const STORAGE_KEYS = {
  state: 'grape:state',
  permissions: 'grape:permissions',
  approvals: 'grape:approvals',
  session: 'grape:session'
} as const;

export type WalletSetupState = 'empty' | 'ready';
export type GrapeNetwork = 'mainnet-beta' | 'devnet';

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

export type WalletState = {
  setup: WalletSetupState;
  vault?: VaultRecord;
  accounts: WalletAccount[];
  selectedAccountId?: string;
  selectedNetwork: GrapeNetwork;
  idleTimeoutMs: number;
};

export type SessionState = {
  locked: boolean;
  lastActivityAt: number;
};

export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function createEmptyWalletState(): WalletState {
  return {
    setup: 'empty',
    accounts: [],
    selectedNetwork: 'devnet',
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


import {
  createEmptyWalletState,
  createInitialSessionState,
  createPermissionsState,
  type RuntimeMessage,
  runtimeMessageSchema,
  type SessionState,
  STORAGE_KEYS,
  type WalletState
} from '@grape/core';
import type { OriginPermission, PermissionsState } from '@grape/core';

export class ChromeStorageArea<T extends object> {
  private readonly area: chrome.storage.StorageArea;
  private readonly fallback: T;
  private readonly key: string;

  constructor(area: chrome.storage.StorageArea, key: string, fallback: T) {
    this.area = area;
    this.key = key;
    this.fallback = fallback;
  }

  async get(): Promise<T> {
    const result = await this.area.get(this.key);
    return (result[this.key] as T | undefined) ?? structuredClone(this.fallback);
  }

  async set(value: T): Promise<void> {
    await this.area.set({ [this.key]: value });
  }
}

export const walletStateStorage = new ChromeStorageArea<WalletState>(
  chrome.storage.local,
  STORAGE_KEYS.state,
  createEmptyWalletState()
);

export const permissionsStorage = new ChromeStorageArea<PermissionsState>(
  chrome.storage.local,
  STORAGE_KEYS.permissions,
  createPermissionsState()
);

export const sessionStorage = new ChromeStorageArea<SessionState>(
  chrome.storage.session,
  STORAGE_KEYS.session,
  createInitialSessionState()
);

export type WalletViewModel = {
  wallet: WalletState;
  session: SessionState;
  permissions: OriginPermission[];
  activeAccount?: { publicKey: string };
};

export async function sendRuntimeMessage<T>(message: RuntimeMessage): Promise<T> {
  runtimeMessageSchema.parse(message);
  const response = (await chrome.runtime.sendMessage(message)) as T | { error?: { code: string; message: string } };
  if (typeof response === 'object' && response !== null && 'error' in response && response.error) {
    throw new Error(response.error.message);
  }
  return response as T;
}

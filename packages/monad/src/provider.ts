import './ledger-polyfills';

import type { PageOrigin } from '@grape/core';

const GRAPE_PROVIDER_ICON = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const EIP6963_ANNOUNCE_EVENT = 'eip6963:announceProvider';
const EIP6963_REQUEST_EVENT = 'eip6963:requestProvider';

type MonadProviderTransport = {
  request<T>(request: {
    id: string;
    method:
      | 'monad_accounts'
      | 'monad_requestAccounts'
      | 'monad_chainId'
      | 'monad_switchChain'
      | 'monad_addChain'
      | 'monad_sendTransaction'
      | 'monad_signMessage'
      | 'monad_signTypedData';
    origin: PageOrigin;
    params: Record<string, unknown>;
  }): Promise<T>;
};

type MonadProviderEventMap = {
  connect: (info: { chainId: string }) => void;
  disconnect: (error?: { code: number; message: string }) => void;
  accountsChanged: (accounts: string[]) => void;
  chainChanged: (chainId: string) => void;
  message: (message: { type: string; data: unknown }) => void;
};

type MonadRequestArgs =
  | { method: 'eth_requestAccounts'; params?: unknown[] }
  | { method: 'eth_accounts'; params?: unknown[] }
  | { method: 'eth_coinbase'; params?: unknown[] }
  | { method: 'eth_chainId'; params?: unknown[] }
  | { method: 'wallet_switchEthereumChain'; params?: Array<{ chainId: string }> }
  | {
      method: 'wallet_addEthereumChain';
      params?: Array<{
        chainId: string;
        chainName?: string;
        rpcUrls?: string[];
        blockExplorerUrls?: string[];
        nativeCurrency?: { name: string; symbol: string; decimals: number };
      }>;
    }
  | { method: 'eth_sendTransaction'; params?: Array<Record<string, unknown>> }
  | { method: 'personal_sign'; params?: [string, string?] | [string] }
  | { method: 'eth_signTypedData_v4'; params?: [string, string | Record<string, unknown>] };

type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

function randomId() {
  return crypto.randomUUID();
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class GrapeMonadProvider {
  readonly isGrape = true;
  readonly isGrapeMonad = true;
  readonly name = 'Grape';
  readonly transport: MonadProviderTransport;
  readonly origin: PageOrigin;

  private accounts: string[] = [];
  private chainId = '0x8f';
  private readonly listeners: {
    [K in keyof MonadProviderEventMap]: Set<MonadProviderEventMap[K]>;
  } = {
    connect: new Set(),
    disconnect: new Set(),
    accountsChanged: new Set(),
    chainChanged: new Set(),
    message: new Set()
  };

  constructor(transport: MonadProviderTransport, origin: PageOrigin) {
    this.transport = transport;
    this.origin = origin;
  }

  get selectedAddress() {
    return this.accounts[0] ?? null;
  }

  isConnected() {
    return this.accounts.length > 0;
  }

  on<K extends keyof MonadProviderEventMap>(event: K, listener: MonadProviderEventMap[K]) {
    this.listeners[event].add(listener);
  }

  off<K extends keyof MonadProviderEventMap>(event: K, listener: MonadProviderEventMap[K]) {
    this.listeners[event].delete(listener);
  }

  addListener<K extends keyof MonadProviderEventMap>(event: K, listener: MonadProviderEventMap[K]) {
    this.on(event, listener);
  }

  removeListener<K extends keyof MonadProviderEventMap>(event: K, listener: MonadProviderEventMap[K]) {
    this.off(event, listener);
  }

  async request<T = unknown>(args: MonadRequestArgs): Promise<T> {
    switch (args.method) {
      case 'eth_requestAccounts': {
        const accounts = await this.transport.request<string[]>({
          id: randomId(),
          method: 'monad_requestAccounts',
          origin: this.origin,
          params: {}
        });
        await this.syncChainId();
        this.setAccounts(accounts);
        return accounts as T;
      }
      case 'eth_accounts': {
        const accounts = await this.transport.request<string[]>({
          id: randomId(),
          method: 'monad_accounts',
          origin: this.origin,
          params: {}
        });
        this.setAccounts(accounts);
        return accounts as T;
      }
      case 'eth_coinbase': {
        const accounts = await this.request<string[]>({ method: 'eth_accounts' });
        return (accounts[0] ?? null) as T;
      }
      case 'eth_chainId': {
        const chainId = await this.syncChainId();
        return chainId as T;
      }
      case 'wallet_switchEthereumChain': {
        const chainId = args.params?.[0]?.chainId;
        if (!chainId) {
          throw new Error('wallet_switchEthereumChain requires a chainId.');
        }

        await this.transport.request<null>({
          id: randomId(),
          method: 'monad_switchChain',
          origin: this.origin,
          params: { chainId }
        });
        this.setChainId(chainId);
        return null as T;
      }
      case 'wallet_addEthereumChain': {
        const chain = args.params?.[0];
        if (!chain?.chainId) {
          throw new Error('wallet_addEthereumChain requires a chainId.');
        }

        await this.transport.request<null>({
          id: randomId(),
          method: 'monad_addChain',
          origin: this.origin,
          params: chain
        });
        this.setChainId(chain.chainId);
        return null as T;
      }
      case 'eth_sendTransaction': {
        const transaction = args.params?.[0];
        if (!transaction || typeof transaction !== 'object') {
          throw new Error('eth_sendTransaction requires a transaction object.');
        }

        const result = await this.transport.request<{ signature: string }>({
          id: randomId(),
          method: 'monad_sendTransaction',
          origin: this.origin,
          params: {
            transaction
          }
        });
        return result.signature as T;
      }
      case 'personal_sign': {
        const [message, address] = args.params ?? [];
        if (typeof message !== 'string') {
          throw new Error('personal_sign requires a message string.');
        }

        return this.transport.request<T>({
          id: randomId(),
          method: 'monad_signMessage',
          origin: this.origin,
          params: {
            message,
            address
          }
        });
      }
      case 'eth_signTypedData_v4': {
        const [address, typedData] = args.params ?? [];
        if (typeof address !== 'string' || (!typedData || (typeof typedData !== 'string' && typeof typedData !== 'object'))) {
          throw new Error('eth_signTypedData_v4 requires an address and typed data payload.');
        }

        return this.transport.request<T>({
          id: randomId(),
          method: 'monad_signTypedData',
          origin: this.origin,
          params: {
            address,
            typedData: typeof typedData === 'string' ? typedData : JSON.stringify(typedData)
          }
        });
      }
      default:
        throw new Error(`Unsupported Monad provider method: ${String((args as { method: string }).method)}`);
    }
  }

  async enable() {
    return this.request<string[]>({ method: 'eth_requestAccounts' });
  }

  private async syncChainId() {
    const chainId = await this.transport.request<string>({
      id: randomId(),
      method: 'monad_chainId',
      origin: this.origin,
      params: {}
    });
    this.setChainId(chainId);
    return chainId;
  }

  private setAccounts(nextAccounts: string[]) {
    if (arraysEqual(this.accounts, nextAccounts)) {
      return;
    }

    const hadAccounts = this.accounts.length > 0;
    this.accounts = [...nextAccounts];
    this.emit('accountsChanged', [...this.accounts]);
    if (!hadAccounts && this.accounts.length > 0) {
      this.emit('connect', { chainId: this.chainId });
    }
    if (hadAccounts && this.accounts.length === 0) {
      this.emit('disconnect', { code: 4900, message: 'Provider disconnected.' });
    }
  }

  private setChainId(nextChainId: string) {
    const normalized = nextChainId.trim().toLowerCase().startsWith('0x')
      ? nextChainId.trim().toLowerCase()
      : `0x${BigInt(nextChainId.trim()).toString(16)}`;
    if (this.chainId === normalized) {
      return;
    }

    this.chainId = normalized;
    this.emit('chainChanged', normalized);
  }

  private emit<K extends keyof MonadProviderEventMap>(event: K, ...args: Parameters<MonadProviderEventMap[K]>) {
    for (const listener of this.listeners[event]) {
      (listener as (...input: Parameters<MonadProviderEventMap[K]>) => void)(...args);
    }
  }
}

function defineProvider(name: 'ethereum' | 'grapeMonad', provider: GrapeMonadProvider, overwrite = true) {
  if (!overwrite && name in window && window[name]) {
    return;
  }

  try {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: provider
    });
  } catch {
    if (overwrite || !window[name]) {
      window[name] = provider;
    }
  }
}

function announceEip6963Provider(provider: GrapeMonadProvider) {
  const info: Eip6963ProviderInfo = {
    uuid: crypto.randomUUID(),
    name: 'Grape',
    icon: GRAPE_PROVIDER_ICON,
    rdns: 'wallet.grape.monad'
  };

  const announce = () => {
    window.dispatchEvent(
      new CustomEvent(EIP6963_ANNOUNCE_EVENT, {
        detail: {
          info,
          provider
        }
      })
    );
  };

  window.addEventListener(EIP6963_REQUEST_EVENT, announce);
  announce();
}

declare global {
  interface Window {
    ethereum?: GrapeMonadProvider;
    grapeMonad?: GrapeMonadProvider;
  }
}

export function initializeMonadProvider(provider: GrapeMonadProvider) {
  defineProvider('grapeMonad', provider);
  defineProvider('ethereum', provider, false);
  announceEip6963Provider(provider);
  return provider;
}

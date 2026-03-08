import {
  BaseMessageSignerWalletAdapter,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
  WalletSignMessageError,
  WalletSignTransactionError,
  type WalletName,
  scopePollingDetectionStrategy
} from '@solana/wallet-adapter-base';
import type { SupportedTransactionVersions } from '@solana/wallet-adapter-base';
import { PublicKey, type TransactionVersion, type Transaction, type VersionedTransaction } from '@solana/web3.js';

import { GRAPE_WALLET_ADAPTER_ICON } from './icon';

export type GrapeWalletAdapterName = 'Grape';

export const GRAPE_WALLET_NAME = 'Grape' as WalletName<GrapeWalletAdapterName>;

type GrapeProviderConnectOptions = {
  onlyIfTrusted?: boolean;
};

type GrapeProviderMessageResult = {
  publicKey: PublicKey | { toBase58(): string } | string;
  signature: Uint8Array;
};

type GrapeInjectedProvider = {
  isGrape?: boolean;
  publicKey: PublicKey | { toBase58(): string } | string | null;
  isConnected?: boolean;
  connect(options?: GrapeProviderConnectOptions): Promise<{ publicKey: PublicKey | { toBase58(): string } | string }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array): Promise<GrapeProviderMessageResult>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions?<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
  on?(event: 'connect' | 'disconnect' | 'accountChanged', listener: (...args: unknown[]) => void): void;
  off?(event: 'connect' | 'disconnect' | 'accountChanged', listener: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    grape?: GrapeInjectedProvider;
    grapeSolana?: GrapeInjectedProvider;
    solana?: GrapeInjectedProvider;
  }
}

function getGrapeProvider(): GrapeInjectedProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (window.grape?.isGrape) {
    return window.grape;
  }

  if (window.grapeSolana?.isGrape) {
    return window.grapeSolana;
  }

  if (window.solana?.isGrape) {
    return window.solana;
  }

  return null;
}

function normalizePublicKey(input: PublicKey | { toBase58(): string } | string | null): PublicKey | null {
  if (!input) {
    return null;
  }

  if (input instanceof PublicKey) {
    return input;
  }

  if (typeof input === 'string') {
    return new PublicKey(input);
  }

  return new PublicKey(input.toBase58());
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export class GrapeWalletAdapter extends BaseMessageSignerWalletAdapter<GrapeWalletAdapterName> {
  name = GRAPE_WALLET_NAME;
  url = 'https://github.com/kirkgrape/grape-wallet-extension';
  icon = GRAPE_WALLET_ADAPTER_ICON;
  supportedTransactionVersions: SupportedTransactionVersions = new Set<TransactionVersion>(['legacy', 0]);

  private _readyState: WalletReadyState =
    typeof window === 'undefined'
      ? WalletReadyState.Unsupported
      : getGrapeProvider()
        ? WalletReadyState.Installed
        : WalletReadyState.NotDetected;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _provider: GrapeInjectedProvider | null = null;
  private _disconnectListener?: (...args: unknown[]) => void;
  private _accountChangedListener?: (...args: unknown[]) => void;

  constructor() {
    super();

    if (this._readyState !== WalletReadyState.Unsupported && this._readyState !== WalletReadyState.Installed) {
      scopePollingDetectionStrategy(() => {
        const provider = getGrapeProvider();
        if (provider) {
          this._readyState = WalletReadyState.Installed;
          this.emit('readyStateChange', this._readyState);
          return true;
        }
        return false;
      });
    }
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get readyState(): WalletReadyState {
    return this._readyState;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  async autoConnect(): Promise<void> {
    await this.performConnect(true);
  }

  async connect(): Promise<void> {
    await this.performConnect(false);
  }

  async disconnect(): Promise<void> {
    const provider = this._provider ?? getGrapeProvider();

    this.detachProviderListeners();

    try {
      if (provider) {
        await provider.disconnect();
      }
    } catch (error) {
      const wrapped = new WalletDisconnectionError(toErrorMessage(error, 'Failed to disconnect from Grape.'), error);
      this.emit('error', wrapped);
      throw wrapped;
    } finally {
      this._provider = null;
      this._publicKey = null;
      this._connecting = false;
      this.emit('disconnect');
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const provider = this.requireProvider();

    try {
      return await provider.signTransaction(transaction);
    } catch (error) {
      const wrapped = new WalletSignTransactionError(toErrorMessage(error, 'Failed to sign transaction.'), error);
      this.emit('error', wrapped);
      throw wrapped;
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    const provider = this.requireProvider();

    try {
      if (provider.signAllTransactions) {
        return await provider.signAllTransactions(transactions);
      }

      return Promise.all(transactions.map((transaction) => provider.signTransaction(transaction)));
    } catch (error) {
      const wrapped = new WalletSignTransactionError(toErrorMessage(error, 'Failed to sign transactions.'), error);
      this.emit('error', wrapped);
      throw wrapped;
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const provider = this.requireProvider();

    try {
      const result = await provider.signMessage(message);
      return result.signature;
    } catch (error) {
      const wrapped = new WalletSignMessageError(toErrorMessage(error, 'Failed to sign message.'), error);
      this.emit('error', wrapped);
      throw wrapped;
    }
  }

  private async performConnect(onlyIfTrusted: boolean): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    if (this._readyState !== WalletReadyState.Installed) {
      throw new WalletNotReadyError();
    }

    const provider = getGrapeProvider();
    if (!provider) {
      throw new WalletNotReadyError();
    }

    this._connecting = true;

    try {
      const response = await provider.connect(onlyIfTrusted ? { onlyIfTrusted: true } : undefined);
      const publicKey = normalizePublicKey(response.publicKey ?? provider.publicKey);
      if (!publicKey) {
        throw new WalletPublicKeyError();
      }

      this._provider = provider;
      this._publicKey = publicKey;
      this.attachProviderListeners(provider);
      this.emit('connect', publicKey);
    } catch (error) {
      const wrapped =
        error instanceof WalletPublicKeyError
          ? error
          : new WalletConnectionError(toErrorMessage(error, 'Failed to connect to Grape.'), error);
      this.emit('error', wrapped);
      throw wrapped;
    } finally {
      this._connecting = false;
    }
  }

  private requireProvider(): GrapeInjectedProvider {
    const provider = this._provider ?? getGrapeProvider();
    if (!provider || !this._publicKey) {
      throw new WalletNotConnectedError();
    }
    return provider;
  }

  private attachProviderListeners(provider: GrapeInjectedProvider) {
    if (!provider.on) {
      return;
    }

    this.detachProviderListeners();

    this._disconnectListener = () => {
      this._provider = null;
      this._publicKey = null;
      this.emit('disconnect');
    };

    this._accountChangedListener = (nextPublicKey) => {
      const normalized = normalizePublicKey(nextPublicKey as PublicKey | { toBase58(): string } | string | null);
      if (!normalized) {
        this._provider = null;
        this._publicKey = null;
        this.emit('disconnect');
        return;
      }
      this._publicKey = normalized;
      this.emit('connect', normalized);
    };

    provider.on('disconnect', this._disconnectListener);
    provider.on('accountChanged', this._accountChangedListener);
  }

  private detachProviderListeners() {
    if (!this._provider?.off) {
      return;
    }

    if (this._disconnectListener) {
      this._provider.off('disconnect', this._disconnectListener);
    }

    if (this._accountChangedListener) {
      this._provider.off('accountChanged', this._accountChangedListener);
    }

    this._disconnectListener = undefined;
    this._accountChangedListener = undefined;
  }
}

export function getInjectedGrapeProvider(): GrapeInjectedProvider | null {
  return getGrapeProvider();
}

import { base64ToBytes, bytesToBase64, type PageOrigin, type ProviderRequest } from '@grape/core';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export type ProviderTransport = {
  request<T>(request: ProviderRequest): Promise<T>;
};

type ProviderEventMap = {
  connect: (publicKey: PublicKey) => void;
  disconnect: () => void;
  accountChanged: (publicKey: PublicKey | null) => void;
};

type ProviderRequestArgs = {
  method:
    | 'connect'
    | 'disconnect'
    | 'signMessage'
    | 'signTransaction'
    | 'signAllTransactions'
    | 'signAndSendTransaction'
    | 'sendTransaction';
  params?: Record<string, unknown>;
};

function randomId(): string {
  return crypto.randomUUID();
}

function serializeForTransport(transaction: Transaction | VersionedTransaction): string {
  if (transaction instanceof VersionedTransaction) {
    return bytesToBase64(transaction.serialize());
  }

  return bytesToBase64(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })
  );
}

export class GrapeInpageProvider {
  readonly isGrape = true;
  readonly name = 'Grape';
  readonly transport: ProviderTransport;
  readonly origin: PageOrigin;
  readonly providers: GrapeInpageProvider[];

  publicKey: PublicKey | null = null;
  isConnected = false;

  private readonly eventListeners: {
    [K in keyof ProviderEventMap]: Set<ProviderEventMap[K]>;
  } = {
    connect: new Set(),
    disconnect: new Set(),
    accountChanged: new Set()
  };

  constructor(transport: ProviderTransport, origin: PageOrigin) {
    this.transport = transport;
    this.origin = origin;
    this.providers = [this];
  }

  on<K extends keyof ProviderEventMap>(event: K, listener: ProviderEventMap[K]): void {
    this.eventListeners[event].add(listener);
  }

  off<K extends keyof ProviderEventMap>(event: K, listener: ProviderEventMap[K]): void {
    this.eventListeners[event].delete(listener);
  }

  once<K extends keyof ProviderEventMap>(event: K, listener: ProviderEventMap[K]): void {
    const next = ((...args: Parameters<ProviderEventMap[K]>) => {
      this.off(event, next as ProviderEventMap[K]);
      (listener as (...listenerArgs: Parameters<ProviderEventMap[K]>) => void)(...args);
    }) as ProviderEventMap[K];
    this.on(event, next);
  }

  addListener<K extends keyof ProviderEventMap>(event: K, listener: ProviderEventMap[K]): void {
    this.on(event, listener);
  }

  removeListener<K extends keyof ProviderEventMap>(event: K, listener: ProviderEventMap[K]): void {
    this.off(event, listener);
  }

  listeners<K extends keyof ProviderEventMap>(event: K): ProviderEventMap[K][] {
    return Array.from(this.eventListeners[event]);
  }

  async connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }> {
    const result = await this.transport.request<{ publicKey: string }>({
      id: randomId(),
      method: 'connect',
      origin: this.origin,
      params: {
        silent: options?.onlyIfTrusted
      }
    });

    const publicKey = new PublicKey(result.publicKey);
    this.publicKey = publicKey;
    this.isConnected = true;
    this.emit('connect', publicKey);
    this.emit('accountChanged', publicKey);
    return { publicKey };
  }

  async disconnect(): Promise<void> {
    await this.transport.request({
      id: randomId(),
      method: 'disconnect',
      origin: this.origin,
      params: {}
    });
    this.publicKey = null;
    this.isConnected = false;
    this.emit('disconnect');
    this.emit('accountChanged', null);
  }

  async signMessage(message: Uint8Array): Promise<{ publicKey: PublicKey; signature: Uint8Array }> {
    const result = await this.transport.request<{ publicKey: string; signature: string }>({
      id: randomId(),
      method: 'signMessage',
      origin: this.origin,
      params: {
        message: bytesToBase64(message)
      }
    });
    return {
      publicKey: new PublicKey(result.publicKey),
      signature: base64ToBytes(result.signature)
    };
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const result = await this.transport.request<{ transaction: string }>({
      id: randomId(),
      method: 'signTransaction',
      origin: this.origin,
      params: {
        transaction: serializeForTransport(transaction)
      }
    });

    if (transaction instanceof VersionedTransaction) {
      return VersionedTransaction.deserialize(base64ToBytes(result.transaction)) as T;
    }
    return Transaction.from(base64ToBytes(result.transaction)) as T;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    const serializedTransactions = transactions.map((transaction) => serializeForTransport(transaction));
    const result = await this.transport.request<{ transactions: string[] }>({
      id: randomId(),
      method: 'signAllTransactions',
      origin: this.origin,
      params: {
        transactions: serializedTransactions
      }
    });

    return result.transactions.map((serialized, index) => {
      const transaction = transactions[index];
      if (transaction instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(base64ToBytes(serialized)) as T;
      }
      return Transaction.from(base64ToBytes(serialized)) as T;
    });
  }

  async signAndSendTransaction(transaction: Transaction | VersionedTransaction): Promise<{ signature: string }> {
    return this.transport.request<{ signature: string }>({
      id: randomId(),
      method: 'signAndSendTransaction',
      origin: this.origin,
      params: {
        transaction: serializeForTransport(transaction)
      }
    });
  }

  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    _connection?: unknown,
    _options?: unknown
  ): Promise<{ signature: string }> {
    return this.signAndSendTransaction(transaction);
  }

  async request<T = unknown>(args: ProviderRequestArgs): Promise<T> {
    if (args.method === 'connect') {
      return this.connect(args.params as { onlyIfTrusted?: boolean }) as Promise<T>;
    }
    if (args.method === 'disconnect') {
      return this.disconnect() as Promise<T>;
    }
    if (args.method === 'signMessage') {
      const message = args.params?.message;
      if (!(message instanceof Uint8Array)) {
        throw new Error('signMessage requires a Uint8Array message.');
      }
      return this.signMessage(message) as Promise<T>;
    }
    if (args.method === 'signTransaction') {
      const transaction = args.params?.transaction;
      if (!(transaction instanceof Transaction) && !(transaction instanceof VersionedTransaction)) {
        throw new Error('signTransaction requires a Transaction or VersionedTransaction.');
      }
      return this.signTransaction(transaction) as Promise<T>;
    }
    if (args.method === 'signAllTransactions') {
      const transactions = args.params?.transactions;
      if (
        !Array.isArray(transactions) ||
        transactions.some((transaction) => !(transaction instanceof Transaction) && !(transaction instanceof VersionedTransaction))
      ) {
        throw new Error('signAllTransactions requires an array of Transaction or VersionedTransaction values.');
      }
      return this.signAllTransactions(transactions as Array<Transaction | VersionedTransaction>) as Promise<T>;
    }
    if (args.method === 'signAndSendTransaction') {
      const transaction = args.params?.transaction;
      if (!(transaction instanceof Transaction) && !(transaction instanceof VersionedTransaction)) {
        throw new Error('signAndSendTransaction requires a Transaction or VersionedTransaction.');
      }
      return this.signAndSendTransaction(transaction) as Promise<T>;
    }
    if (args.method === 'sendTransaction') {
      const transaction = args.params?.transaction;
      if (!(transaction instanceof Transaction) && !(transaction instanceof VersionedTransaction)) {
        throw new Error('sendTransaction requires a Transaction or VersionedTransaction.');
      }
      return this.sendTransaction(transaction, args.params?.connection, args.params?.options) as Promise<T>;
    }
    throw new Error(`Unsupported provider request method: ${args.method}`);
  }

  private emit<K extends keyof ProviderEventMap>(event: K, ...args: Parameters<ProviderEventMap[K]>): void {
    for (const listener of this.eventListeners[event]) {
      (listener as (...listenerArgs: Parameters<ProviderEventMap[K]>) => void)(...args);
    }
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { WalletReadyState } from '@solana/wallet-adapter-base';

import { GrapeWalletAdapter, getInjectedGrapeProvider } from '../src/adapter';

const PUBLIC_KEY = new PublicKey('11111111111111111111111111111111');

type MockProvider = {
  isGrape: true;
  publicKey: PublicKey | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  signMessage: ReturnType<typeof vi.fn>;
  signTransaction: ReturnType<typeof vi.fn>;
  signAllTransactions: ReturnType<typeof vi.fn>;
  signAndSendTransaction: ReturnType<typeof vi.fn>;
  sendTransaction: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

function createMockProvider(): MockProvider {
  return {
    isGrape: true,
    publicKey: PUBLIC_KEY,
    connect: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    signMessage: vi.fn().mockResolvedValue({ publicKey: PUBLIC_KEY, signature: new Uint8Array([1, 2, 3]) }),
    signTransaction: vi.fn().mockImplementation(async <T>(transaction: T) => transaction),
    signAllTransactions: vi.fn().mockImplementation(async <T>(transactions: T[]) => transactions),
    signAndSendTransaction: vi.fn().mockResolvedValue({ signature: 'mock-signature' }),
    sendTransaction: vi.fn().mockResolvedValue({ signature: 'provider-send-signature' }),
    on: vi.fn(),
    off: vi.fn()
  };
}

beforeEach(() => {
  Object.assign(globalThis, {
    window: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      grape: undefined,
      grapeSolana: undefined,
      solana: undefined
    },
    document: {
      readyState: 'complete',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as Record<string, unknown>).window;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as Record<string, unknown>).document;
});

describe('@grape/wallet-adapter', () => {
  it('detects the injected provider and connects', async () => {
    const provider = createMockProvider();
    (window as unknown as { grape: MockProvider }).grape = provider;

    const adapter = new GrapeWalletAdapter();
    const connectSpy = vi.fn();
    adapter.on('connect', connectSpy);

    expect(adapter.readyState).toBe(WalletReadyState.Installed);
    expect(getInjectedGrapeProvider()).toBe(provider);

    await adapter.connect();

    expect(adapter.publicKey?.toBase58()).toBe(PUBLIC_KEY.toBase58());
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(provider.connect).toHaveBeenCalledWith(undefined);
  });

  it('uses onlyIfTrusted during autoConnect', async () => {
    const provider = createMockProvider();
    (window as unknown as { grape: MockProvider }).grape = provider;

    const adapter = new GrapeWalletAdapter();
    await adapter.autoConnect();

    expect(provider.connect).toHaveBeenCalledWith({ onlyIfTrusted: true });
  });

  it('signs messages and transactions through the injected provider', async () => {
    const provider = createMockProvider();
    (window as unknown as { grape: MockProvider }).grape = provider;

    const adapter = new GrapeWalletAdapter();
    await adapter.connect();

    const signature = await adapter.signMessage(new Uint8Array([9, 9, 9]));
    const transaction = new Transaction();
    const signedTransaction = await adapter.signTransaction(transaction);
    const allSigned = await adapter.signAllTransactions([transaction]);

    expect(signature).toEqual(new Uint8Array([1, 2, 3]));
    expect(signedTransaction).toBe(transaction);
    expect(allSigned).toHaveLength(1);
    expect(provider.signMessage).toHaveBeenCalledTimes(1);
    expect(provider.signTransaction).toHaveBeenCalledTimes(1);
    expect(provider.signAllTransactions).toHaveBeenCalledTimes(1);
  });

  it('sends transactions through the injected provider and the supplied connection', async () => {
    const provider = createMockProvider();
    (window as unknown as { grape: MockProvider }).grape = provider;

    const adapter = new GrapeWalletAdapter();
    await adapter.connect();

    const transaction = new Transaction();
    const prepareTransactionSpy = vi.spyOn(adapter as never, 'prepareTransaction').mockResolvedValue(transaction);
    const connection = {
      sendRawTransaction: vi.fn().mockResolvedValue('tx-signature')
    } as unknown as Connection;

    const signature = await adapter.sendTransaction(transaction, connection);

    expect(signature).toBe('provider-send-signature');
    expect(prepareTransactionSpy).toHaveBeenCalledTimes(1);
    expect(provider.sendTransaction).toHaveBeenCalledWith(transaction, connection, {});
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('recovers connected state from the injected provider publicKey', async () => {
    const provider = createMockProvider();
    (window as unknown as { grape: MockProvider }).grape = provider;

    const adapter = new GrapeWalletAdapter();
    await adapter.connect();

    (adapter as unknown as { _publicKey: PublicKey | null })._publicKey = null;

    const transaction = new Transaction();
    const prepareTransactionSpy = vi.spyOn(adapter as never, 'prepareTransaction').mockResolvedValue(transaction);
    const connection = {
      sendRawTransaction: vi.fn().mockResolvedValue('tx-signature')
    } as unknown as Connection;

    const signature = await adapter.sendTransaction(transaction, connection);

    expect(signature).toBe('provider-send-signature');
    expect(prepareTransactionSpy).toHaveBeenCalledTimes(1);
    expect(adapter.publicKey?.toBase58()).toBe(PUBLIC_KEY.toBase58());
  });

  it('falls back to signTransaction when wallet-managed sendTransaction fails', async () => {
    const provider = createMockProvider();
    provider.sendTransaction.mockRejectedValueOnce(new Error('wallet-managed send failed'));
    (window as unknown as { grape: MockProvider }).grape = provider;

    const adapter = new GrapeWalletAdapter();
    await adapter.connect();

    const transaction = new Transaction({
      recentBlockhash: PUBLIC_KEY.toBase58(),
      feePayer: PUBLIC_KEY
    });
    vi.spyOn(adapter as never, 'prepareTransaction').mockResolvedValue(transaction);
    const connection = {
      sendRawTransaction: vi.fn().mockResolvedValue('tx-signature')
    } as unknown as Connection;

    const signature = await adapter.sendTransaction(transaction, connection);

    expect(signature).toBe('tx-signature');
    expect(provider.sendTransaction).toHaveBeenCalledTimes(1);
    expect(provider.signTransaction).toHaveBeenCalledWith(transaction);
    expect(connection.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
});

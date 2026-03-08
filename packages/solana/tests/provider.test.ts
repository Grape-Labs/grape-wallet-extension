import { describe, expect, it, vi } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';

import { createWalletStandardWallet, initializeWalletStandard } from '../src/wallet-standard';
import { GrapeInpageProvider } from '../src/provider';

describe('provider', () => {
  it('connects through the transport and emits connection state', async () => {
    const transport = {
      request: vi.fn().mockResolvedValue({ publicKey: '11111111111111111111111111111111' })
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });

    const connectSpy = vi.fn();
    provider.on('connect', connectSpy);
    const result = await provider.connect();

    expect(result.publicKey.toBase58()).toBe('11111111111111111111111111111111');
    expect(provider.isConnected).toBe(true);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('exposes live wallet-standard accounts after connect', async () => {
    const transport = {
      request: vi.fn().mockResolvedValue({ publicKey: '11111111111111111111111111111111' })
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });
    const wallet = createWalletStandardWallet(provider);

    expect(wallet.accounts).toHaveLength(0);

    await provider.connect();

    expect(wallet.accounts).toHaveLength(1);
    expect(wallet.accounts[0]?.address).toBe('11111111111111111111111111111111');
  });

  it('emits wallet-standard change events with accounts payload', async () => {
    const transport = {
      request: vi.fn().mockResolvedValue({ publicKey: '11111111111111111111111111111111' })
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });
    const wallet = createWalletStandardWallet(provider);
    const listener = vi.fn();
    const eventsFeature = wallet.features['standard:events'] as {
      on: (event: 'change', listener: (properties: { accounts?: typeof wallet.accounts }) => void) => () => void;
    };
    eventsFeature.on('change', listener);

    await provider.connect();

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0]).toEqual({
      accounts: wallet.accounts
    });
  });

  it('does not take over or mutate window.solana when another wallet already exists', () => {
    const transport = {
      request: vi.fn()
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });

    const existingWallet = { isPhantom: true } as { isPhantom: boolean; providers?: unknown[] };
    const windowStub = {
      solana: existingWallet,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn()
    } as unknown as Window & {
      solana: typeof existingWallet;
      grape?: GrapeInpageProvider;
      grapeSolana?: GrapeInpageProvider;
    };

    vi.stubGlobal('window', windowStub);

    initializeWalletStandard(provider);

    expect(windowStub.solana).toBe(existingWallet);
    expect(windowStub.grape).toBe(provider);
    expect(windowStub.grapeSolana).toBe(provider);
    expect(windowStub.solana.providers).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('sets window.solana when no legacy provider exists', () => {
    const transport = {
      request: vi.fn()
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });

    const windowStub = {
      navigator: {},
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn()
    } as unknown as Window & {
      solana?: GrapeInpageProvider;
      grape?: GrapeInpageProvider;
      grapeSolana?: GrapeInpageProvider;
    };

    vi.stubGlobal('window', windowStub);

    initializeWalletStandard(provider);

    expect(windowStub.solana).toBe(provider);
    expect(windowStub.solana?.providers).toEqual([provider]);
    expect(windowStub.grape).toBe(provider);
    expect(windowStub.grapeSolana).toBe(provider);

    vi.unstubAllGlobals();
  });

  it('supports legacy event aliases', () => {
    const transport = {
      request: vi.fn()
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });

    const listener = vi.fn();
    provider.addListener('connect', listener);

    expect(provider.listeners('connect')).toHaveLength(1);

    provider.removeListener('connect', listener);

    expect(provider.listeners('connect')).toHaveLength(0);
  });

  it('supports legacy request signTransaction flow', async () => {
    const transaction = new Transaction();
    const transport = {
      request: vi.fn()
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });
    const signTransactionSpy = vi.spyOn(provider, 'signTransaction').mockResolvedValue(transaction);

    const signed = await provider.request<Transaction>({
      method: 'signTransaction',
      params: { transaction }
    });

    expect(signed).toBe(transaction);
    expect(signTransactionSpy).toHaveBeenCalledWith(transaction);
  });

  it('serializes unsigned legacy transactions safely for transport', async () => {
    const feePayer = Keypair.generate().publicKey;
    const recipient = Keypair.generate().publicKey;
    const transaction = new Transaction({
      feePayer,
      recentBlockhash: '11111111111111111111111111111111'
    }).add(
      SystemProgram.transfer({
        fromPubkey: feePayer,
        toPubkey: recipient,
        lamports: 1
      })
    );

    let capturedSerialized = '';
    const transport = {
      request: vi.fn().mockImplementation(async (request) => {
        capturedSerialized = String(request.params?.transaction ?? '');
        return { transaction: capturedSerialized };
      })
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });

    const signed = await provider.signTransaction(transaction);

    expect(transport.request).toHaveBeenCalledTimes(1);
    expect(capturedSerialized.length).toBeGreaterThan(0);
    expect(signed).toBeInstanceOf(Transaction);
  });

  it('supports legacy sendTransaction by routing to signAndSendTransaction', async () => {
    const transaction = new Transaction({
      feePayer: Keypair.generate().publicKey,
      recentBlockhash: '11111111111111111111111111111111'
    }).add(
      SystemProgram.transfer({
        fromPubkey: Keypair.generate().publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports: 1
      })
    );
    const transport = {
      request: vi.fn().mockResolvedValue({ signature: 'tx-signature' })
    };

    const provider = new GrapeInpageProvider(transport, {
      origin: 'https://example.com',
      href: 'https://example.com',
      title: 'Example'
    });

    const response = await provider.sendTransaction(transaction);

    expect(response).toEqual({ signature: 'tx-signature' });
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'signAndSendTransaction'
      })
    );
  });
});

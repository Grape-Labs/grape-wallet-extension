import { describe, expect, it, vi } from 'vitest';

import { createWalletStandardWallet } from '../src/wallet-standard';
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
});

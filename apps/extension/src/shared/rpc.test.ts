import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOLANA_MAINNET_RPC_URL } from '@grape/core';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('wallet RPC defaults', () => {
  it('uses the shared mainnet provider without a build override', async () => {
    vi.stubEnv('VITE_GRAPE_MAINNET_RPC_URL', '');
    const { getRpcEndpoint } = await import('./rpc');
    expect(getRpcEndpoint('mainnet-beta')).toBe(DEFAULT_SOLANA_MAINNET_RPC_URL);
    expect(getRpcEndpoint('devnet')).toBe('https://api.devnet.solana.com');
  });
  it('preserves an explicitly configured custom connection', async () => {
    const { getRpcEndpoint } = await import('./rpc');
    expect(getRpcEndpoint('mainnet-beta', { 'mainnet-beta': 'https://custom.example/' })).toBe('https://custom.example/');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { EXTENSION_RPC_ENDPOINTS, getPrivacyRpcEndpoint } from './rpc';

const original = { ...EXTENSION_RPC_ENDPOINTS };
afterEach(() => Object.assign(EXTENSION_RPC_ENDPOINTS, original));

describe('configured Privacy Rings RPC', () => {
  it('reuses the mainnet environment RPC without requiring another endpoint', () => {
    EXTENSION_RPC_ENDPOINTS['mainnet-beta'] = 'https://mainnet.helius-rpc.com/?api-key=test';
    expect(getPrivacyRpcEndpoint('mainnet-beta')).toBe('https://mainnet.helius-rpc.com/?api-key=test');
  });
  it('prefers a compatible wallet override', () => {
    EXTENSION_RPC_ENDPOINTS['mainnet-beta'] = 'https://mainnet.helius-rpc.com/?api-key=env';
    expect(getPrivacyRpcEndpoint('mainnet-beta', { 'mainnet-beta': 'https://mainnet.helius-rpc.com/v1/spr/getUserRecords?api-key=custom' })).toBe('https://mainnet.helius-rpc.com/?api-key=custom');
  });
  it('uses the Helius environment default if the normal wallet override is another provider', () => {
    EXTENSION_RPC_ENDPOINTS['mainnet-beta'] = 'https://mainnet.helius-rpc.com/?api-key=env';
    expect(getPrivacyRpcEndpoint('mainnet-beta', { 'mainnet-beta': 'https://rpc.shyft.to/?api_key=test' })).toBe('https://mainnet.helius-rpc.com/?api-key=env');
  });
  it('does not reuse another provider, network, or unauthenticated endpoint', () => {
    for (const endpoint of ['https://rpc.shyft.to/?api_key=test', 'https://devnet.helius-rpc.com/?api-key=test', 'https://mainnet.helius-rpc.com/', 'https://mainnet.helius-rpc.com.evil.test/?api-key=test']) {
      EXTENSION_RPC_ENDPOINTS['mainnet-beta'] = endpoint;
      expect(getPrivacyRpcEndpoint('mainnet-beta')).toBeUndefined();
    }
  });
});

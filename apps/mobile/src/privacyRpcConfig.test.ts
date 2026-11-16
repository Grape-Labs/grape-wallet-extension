import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePrivacyRpc } from '../privacy-rpc-config.cjs';
const manifest = vi.hoisted(() => ({ expoConfig: { extra: { env: {} as Record<string,string> } }, manifest2: { extra: {} as any } }));
vi.mock('expo-constants', () => ({ default: manifest }));
const helius = 'https://mainnet.helius-rpc.com/?api-key=test-key';
const shyft = 'https://rpc.shyft.to/?api_key=test-other';
beforeEach(() => {
  vi.resetModules(); manifest.expoConfig.extra.env = {}; manifest.manifest2.extra = {};
  vi.stubEnv('EXPO_PUBLIC_SOLANA_RPC_URL', shyft); vi.stubEnv('EXPO_PUBLIC_PRIVACY_RPC_URL', '');
});
afterEach(() => vi.unstubAllEnvs());
describe('mobile Helius privacy routing', () => {
  it('uses the manifest privacy fallback even when Expo inlines Shyft as the general RPC', async () => {
    manifest.expoConfig.extra.env.EXPO_PUBLIC_PRIVACY_RPC_URL = helius;
    const config = await import('./config');
    expect(config.getMobileSolanaRpcUrl()).toBe(shyft);
    expect(config.getMobilePrivacyRpcUrl()).toBe(helius);
  });
  it('inlines a dedicated privacy RPC independently of the regular provider', async () => {
    vi.stubEnv('EXPO_PUBLIC_PRIVACY_RPC_URL', helius);
    const config = await import('./config'); expect(config.getMobilePrivacyRpcUrl()).toBe(helius); expect(config.getMobileSolanaRpcUrl()).toBe(shyft);
  });
  it('does not let an invalid inline privacy value hide a valid build fallback', async () => {
    vi.stubEnv('EXPO_PUBLIC_PRIVACY_RPC_URL', shyft); manifest.expoConfig.extra.env.EXPO_PUBLIC_PRIVACY_RPC_URL = helius;
    const config = await import('./config'); expect(config.getMobilePrivacyRpcUrl()).toBe(helius);
  });
  it('allows a configured Helius override but ignores unrelated overrides for privacy', async () => {
    manifest.expoConfig.extra.env.EXPO_PUBLIC_PRIVACY_RPC_URL = helius;
    const config = await import('./config'); config.setMobileSolanaCustomRpcUrl('https://mainnet.helius-rpc.com/v1/spr/getUserRecords?api-key=override');
    expect(config.getMobilePrivacyRpcUrl()).toBe('https://mainnet.helius-rpc.com/?api-key=override');
    config.setMobileSolanaCustomRpcUrl(shyft); expect(config.getMobilePrivacyRpcUrl()).toBe(helius);
  });
  it('reads standalone EAS manifests at extra.expoClient.extra.env', async () => {
    manifest.manifest2.extra = { expoClient: { extra: { env: { EXPO_PUBLIC_PRIVACY_RPC_URL: helius } } } };
    const config = await import('./config'); expect(config.getMobilePrivacyRpcUrl()).toBe(helius);
  });
  it('reuses a normal Helius RPC when no dedicated URL is set', async () => {
    vi.stubEnv('EXPO_PUBLIC_SOLANA_RPC_URL', helius);
    const config = await import('./config'); expect(config.getMobilePrivacyRpcUrl()).toBe(helius);
  });
  it('does not fall back to a public or wrong-network endpoint for private operations', async () => {
    expect(resolvePrivacyRpc(['http://mainnet.helius-rpc.com/?api-key=bad','https://devnet.helius-rpc.com/?api-key=wrong','https://mainnet.helius-rpc.com/','https://mainnet.helius-rpc.com.attacker.example/?api-key=bad',shyft])).toBeUndefined();
    const config = await import('./config'); expect(config.getMobilePrivacyRpcUrl()).toBeUndefined();
  });
});

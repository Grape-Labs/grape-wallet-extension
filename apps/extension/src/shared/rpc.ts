import { DEFAULT_SOLANA_MAINNET_RPC_URL, type GrapeNetwork, type WalletState } from '@grape/core';

const DEFAULT_MAINNET_RPC_URL = DEFAULT_SOLANA_MAINNET_RPC_URL;
const DEFAULT_DEVNET_RPC_URL = 'https://api.devnet.solana.com';

const mainnetRpcUrl = import.meta.env.VITE_GRAPE_MAINNET_RPC_URL?.trim() || DEFAULT_MAINNET_RPC_URL;

export const EXTENSION_RPC_ENDPOINTS: Record<GrapeNetwork, string> = {
  'mainnet-beta': mainnetRpcUrl,
  devnet: DEFAULT_DEVNET_RPC_URL
};

export function getRpcEndpoint(
  network: GrapeNetwork,
  customRpcUrls?: Partial<WalletState['customRpcUrls']>
): string {
  const customRpcUrl = customRpcUrls?.[network]?.trim();
  return customRpcUrl || EXTENSION_RPC_ENDPOINTS[network];
}

/** Reuse the wallet RPC when it is a Helius gateway for this network. */
export function getPrivacyRpcEndpoint(
  network: GrapeNetwork,
  customRpcUrls?: Partial<WalletState['customRpcUrls']>
): string | undefined {
  const host = network === 'devnet' ? 'devnet.helius-rpc.com' : 'mainnet.helius-rpc.com';
  for (const candidate of [customRpcUrls?.[network], EXTENSION_RPC_ENDPOINTS[network]]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || !url.searchParams.get('api-key')) continue;
      url.pathname = '/';
      url.hash = '';
      return url.toString();
    } catch { /* Try the configured default if a custom URL cannot serve privacy. */ }
  }
  return undefined;
}

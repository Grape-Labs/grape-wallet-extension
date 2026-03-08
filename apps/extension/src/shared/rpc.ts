import type { GrapeNetwork } from '@grape/core';

const DEFAULT_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_DEVNET_RPC_URL = 'https://api.devnet.solana.com';

const mainnetRpcUrl = import.meta.env.VITE_GRAPE_MAINNET_RPC_URL?.trim() || DEFAULT_MAINNET_RPC_URL;

export const EXTENSION_RPC_ENDPOINTS: Record<GrapeNetwork, string> = {
  'mainnet-beta': mainnetRpcUrl,
  devnet: DEFAULT_DEVNET_RPC_URL
};

export function getRpcEndpoint(network: GrapeNetwork): string {
  return EXTENSION_RPC_ENDPOINTS[network];
}


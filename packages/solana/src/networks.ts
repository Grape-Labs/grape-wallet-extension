import type { GrapeNetwork } from '@grape/core';

import { SOLANA_CHAIN_IDS } from './constants';

export const SOLANA_RPC_ENDPOINTS: Record<GrapeNetwork, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com'
};

export function networkToChain(network: GrapeNetwork): string {
  return SOLANA_CHAIN_IDS[network];
}

export function chainToNetwork(chain: string | undefined): GrapeNetwork {
  if (chain === SOLANA_CHAIN_IDS['mainnet-beta']) {
    return 'mainnet-beta';
  }
  return 'devnet';
}


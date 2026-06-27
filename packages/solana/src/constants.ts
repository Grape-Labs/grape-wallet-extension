import { GRAPE_WALLET_ICON as CORE_GRAPE_WALLET_ICON } from '@grape/core';
import { SOLANA_DEVNET_CHAIN, SOLANA_MAINNET_CHAIN } from '@solana/wallet-standard-chains';

export const SOLANA_DERIVATION_PATH = `m/44'/501'/0'/0'`;

export const SOLANA_CHAIN_IDS = {
  'mainnet-beta': SOLANA_MAINNET_CHAIN,
  devnet: SOLANA_DEVNET_CHAIN
} as const;

export const GRAPE_WALLET_ICON = CORE_GRAPE_WALLET_ICON;

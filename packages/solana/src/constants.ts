export const SOLANA_DERIVATION_PATH = `m/44'/501'/0'/0'`;

export const SOLANA_CHAIN_IDS = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
} as const;

const extensionOrigin = typeof import.meta !== 'undefined' ? new URL(import.meta.url).origin : '';

export const GRAPE_WALLET_ICON = `${extensionOrigin}/icons/grape-avatar.png`;

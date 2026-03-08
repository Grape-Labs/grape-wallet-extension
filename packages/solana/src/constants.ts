export const SOLANA_DERIVATION_PATH = `m/44'/501'/0'/0'`;

export const SOLANA_CHAIN_IDS = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
} as const;

export const GRAPE_WALLET_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <rect width="96" height="96" rx="24" fill="#201435"/>
    <path d="M26 56C26 42.7 36.7 32 50 32H70V56C70 69.3 59.3 80 46 80H26V56Z" fill="#77D1A5"/>
    <circle cx="36" cy="36" r="10" fill="#FF7A59"/>
    <circle cx="54" cy="24" r="8" fill="#F4D35E"/>
  </svg>
`);


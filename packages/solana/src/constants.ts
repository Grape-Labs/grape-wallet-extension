export const SOLANA_DERIVATION_PATH = `m/44'/501'/0'/0'`;

export const SOLANA_CHAIN_IDS = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
} as const;

export const GRAPE_WALLET_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" fill="none">
    <defs>
      <linearGradient id="bg" x1="16" y1="12" x2="112" y2="120" gradientUnits="userSpaceOnUse">
        <stop stop-color="#161224"/>
        <stop offset="1" stop-color="#0D1020"/>
      </linearGradient>
      <linearGradient id="stem" x1="24" y1="18" x2="96" y2="40" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0EE3FF"/>
        <stop offset="1" stop-color="#0B64FF"/>
      </linearGradient>
      <radialGradient id="berryBlue" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(42 45) rotate(51.52) scale(34.9484)">
        <stop stop-color="#70E8FF"/>
        <stop offset="0.58" stop-color="#16B8FF"/>
        <stop offset="1" stop-color="#004FFF"/>
      </radialGradient>
      <radialGradient id="berryPurple" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(52 55) rotate(53.115) scale(37.7558)">
        <stop stop-color="#C27BFF"/>
        <stop offset="0.62" stop-color="#9C3CFF"/>
        <stop offset="1" stop-color="#5D12FF"/>
      </radialGradient>
      <radialGradient id="berryPink" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(56 76) rotate(54.462) scale(43.9016)">
        <stop stop-color="#FF9BF1"/>
        <stop offset="0.56" stop-color="#EE2DFF"/>
        <stop offset="1" stop-color="#FF008A"/>
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="124" height="124" rx="31" fill="url(#bg)"/>
    <g transform="translate(-6 -8) scale(1.12)">
      <path d="M31 36C42 24 55 18 69 20C79 21 89 26 97 24C101 23 105 22 107 24C109 26 109 29 108 32C106 39 100 45 93 48C84 52 74 54 65 51" stroke="#000" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M31 36C42 24 55 18 69 20C79 21 89 26 97 24C101 23 105 22 107 24C109 26 109 29 108 32C106 39 100 45 93 48C84 52 74 54 65 51" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M31 36C42 24 55 18 69 20C79 21 89 26 97 24C101 23 105 22 107 24C109 26 109 29 108 32C106 39 100 45 93 48C84 52 74 54 65 51" stroke="url(#stem)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M63 28C68 34 72 42 75 53" stroke="#000" stroke-width="10" stroke-linecap="round"/>
      <path d="M63 28C68 34 72 42 75 53" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
      <path d="M63 28C68 34 72 42 75 53" stroke="url(#stem)" stroke-width="4" stroke-linecap="round"/>
      <g stroke="#000" stroke-width="8">
        <circle cx="39" cy="48" r="16.5" fill="url(#berryBlue)"/>
        <circle cx="58" cy="48" r="16.5" fill="url(#berryPurple)"/>
        <circle cx="77" cy="48" r="16.5" fill="url(#berryPurple)"/>
        <circle cx="96" cy="48" r="16.5" fill="url(#berryBlue)"/>
        <circle cx="49" cy="69" r="16.5" fill="url(#berryPink)"/>
        <circle cx="68" cy="69" r="16.5" fill="url(#berryPink)"/>
        <circle cx="87" cy="69" r="16.5" fill="url(#berryPink)"/>
        <circle cx="58" cy="90" r="16.5" fill="url(#berryPink)"/>
        <circle cx="77" cy="90" r="16.5" fill="url(#berryPink)"/>
        <circle cx="67.5" cy="109" r="16.5" fill="url(#berryPink)"/>
      </g>
      <g stroke="#fff" stroke-width="4">
        <circle cx="39" cy="48" r="16.5"/>
        <circle cx="58" cy="48" r="16.5"/>
        <circle cx="77" cy="48" r="16.5"/>
        <circle cx="96" cy="48" r="16.5"/>
        <circle cx="49" cy="69" r="16.5"/>
        <circle cx="68" cy="69" r="16.5"/>
        <circle cx="87" cy="69" r="16.5"/>
        <circle cx="58" cy="90" r="16.5"/>
        <circle cx="77" cy="90" r="16.5"/>
        <circle cx="67.5" cy="109" r="16.5"/>
      </g>
    </g>
  </svg>
`);

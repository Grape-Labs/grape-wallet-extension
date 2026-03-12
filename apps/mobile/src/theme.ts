export const palette = {
  bg: '#09030d',
  panel: '#15061f',
  panelBorder: 'rgba(255,255,255,0.08)',
  softPanel: 'rgba(255,255,255,0.05)',
  text: '#f7f2ff',
  muted: '#b7a8c9',
  grape: '#d15fff',
  pink: '#ff6ac1',
  mint: '#8bf7c6',
  warning: '#ffd479',
  danger: '#ff8ea1'
};

export const chains = [
  { id: 'solana', label: 'Solana', short: 'SOL', accent: '#8bf7c6' },
  { id: 'sui', label: 'Sui', short: 'SUI', accent: '#85d5ff' },
  { id: 'monad', label: 'Monad', short: 'MON', accent: '#ff976b' },
  { id: 'ethereum', label: 'Ethereum', short: 'ETH', accent: '#c7b3ff' }
] as const;

export const mobileThemes = [
  {
    id: 'grape',
    label: 'Grape',
    background: '#120316',
    card: 'rgba(35, 10, 46, 0.92)',
    brand: '#d15fff',
    glowTop: '#7c26a8',
    glowBottom: '#2c195f'
  },
  {
    id: 'apple-glass',
    label: 'Apple Glass',
    background: '#111317',
    card: 'rgba(28, 33, 41, 0.82)',
    brand: '#d9ecff',
    glowTop: '#7da7d9',
    glowBottom: '#4e647f'
  },
  {
    id: 'tron',
    label: 'Tron',
    background: '#100304',
    card: 'rgba(31, 9, 10, 0.9)',
    brand: '#ff814f',
    glowTop: '#ab2d0d',
    glowBottom: '#5c160c'
  },
  {
    id: 'comic',
    label: 'Comic',
    background: '#140a20',
    card: 'rgba(43, 17, 69, 0.92)',
    brand: '#ffd23f',
    glowTop: '#ff5bbd',
    glowBottom: '#3db6ff'
  }
] as const;

import { DEFAULT_THEME, type GrapeTheme } from '@grape/core';

export const basePalette = {
  bg: '#09040d',
  panel: 'rgba(30, 14, 38, 0.8)',
  panelBorder: 'rgba(255,255,255,0.12)',
  softPanel: 'rgba(255,255,255,0.07)',
  text: '#fbf7ff',
  muted: '#bbaece',
  grape: '#d15fff',
  pink: '#ff7ccc',
  mint: '#8bf7c6',
  warning: '#ffd479',
  danger: '#ff8ea1',
  frost: 'rgba(255,255,255,0.08)',
  shadow: 'rgba(6, 0, 12, 0.55)'
} as const;

export const chains = [
  { id: 'solana', label: 'Solana', short: 'SOL', accent: '#8bf7c6' },
  { id: 'sui', label: 'Sui', short: 'SUI', accent: '#85d5ff' },
  { id: 'monad', label: 'Monad', short: 'MON', accent: '#ff976b' },
  { id: 'ethereum', label: 'Ethereum', short: 'ETH', accent: '#c7b3ff' }
] as const;

export const mobileThemes: Array<{ id: GrapeTheme; label: string }> = [
  { id: 'grape', label: 'Grape' },
  { id: 'comic', label: 'Comic' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'tron', label: 'Tron' },
  { id: 'apple', label: 'Apple Glass' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'champagne', label: 'Champagne' },
  { id: 'liquid-chrome', label: 'Liquid Chrome' },
  { id: 'obsidian', label: 'Obsidian' }
];

export type MobileThemePalette = typeof basePalette & {
  id: GrapeTheme;
  label: string;
  backgroundAssetKey?: 'bg_comic' | 'bg_glass' | 'bg_grape_dark' | 'bg_matrix' | 'bg_tron' | 'bg_chrome';
  backgroundImageOpacity: number;
  backgroundImageBlur: number;
  backgroundTint?: string;
  bgGlowTop: string;
  bgGlowBottom: string;
  brandGradient: [string, string, string];
  primaryButton: string;
  primaryButtonText: string;
  footerBg: string;
};

const themeMap: Record<GrapeTheme, Omit<MobileThemePalette, keyof typeof basePalette>> = {
  grape: {
    id: 'grape',
    label: 'Grape',
    backgroundAssetKey: 'bg_grape_dark',
    backgroundImageOpacity: 0.68,
    backgroundImageBlur: 10,
    bgGlowTop: 'rgba(103, 45, 136, 0.26)',
    bgGlowBottom: 'rgba(58, 29, 97, 0.22)',
    brandGradient: ['#ff77dc', '#b57bff', '#78d8ff'],
    primaryButton: '#b57bff',
    primaryButtonText: '#190723',
    footerBg: 'rgba(21, 6, 31, 0.92)'
  },
  comic: {
    id: 'comic',
    label: 'Comic',
    backgroundAssetKey: 'bg_comic',
    backgroundImageOpacity: 0.48,
    backgroundImageBlur: 5,
    backgroundTint: 'rgba(22, 8, 34, 0.36)',
    bgGlowTop: 'rgba(255, 91, 189, 0.18)',
    bgGlowBottom: 'rgba(61, 182, 255, 0.15)',
    brandGradient: ['#ffe66d', '#ff7b00', '#3db6ff'],
    primaryButton: '#ffe66d',
    primaryButtonText: '#231942',
    footerBg: 'rgba(26, 10, 48, 0.92)'
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset',
    backgroundImageOpacity: 0,
    backgroundImageBlur: 0,
    bgGlowTop: 'rgba(255, 209, 102, 0.2)',
    bgGlowBottom: 'rgba(255, 140, 66, 0.18)',
    brandGradient: ['#ffd166', '#ff8c42', '#f97316'],
    primaryButton: '#ffd166',
    primaryButtonText: '#382113',
    footerBg: 'rgba(31, 15, 19, 0.92)'
  },
  matrix: {
    id: 'matrix',
    label: 'Matrix',
    backgroundAssetKey: 'bg_matrix',
    backgroundImageOpacity: 0.72,
    backgroundImageBlur: 8,
    backgroundTint: 'rgba(4, 12, 7, 0.22)',
    bgGlowTop: 'rgba(34, 197, 94, 0.16)',
    bgGlowBottom: 'rgba(22, 163, 74, 0.12)',
    brandGradient: ['#bbf7d0', '#4ade80', '#16a34a'],
    primaryButton: '#4ade80',
    primaryButtonText: '#031208',
    footerBg: 'rgba(3, 12, 7, 0.94)'
  },
  tron: {
    id: 'tron',
    label: 'Tron',
    backgroundAssetKey: 'bg_tron',
    backgroundImageOpacity: 0.88,
    backgroundImageBlur: 1,
    backgroundTint: 'rgba(14, 7, 6, 0.12)',
    bgGlowTop: 'rgba(171, 45, 13, 0.18)',
    bgGlowBottom: 'rgba(92, 22, 12, 0.18)',
    brandGradient: ['#ffb37a', '#ff6e3f', '#ff3d2e'],
    primaryButton: '#ff6e3f',
    primaryButtonText: '#180705',
    footerBg: 'rgba(11, 8, 8, 0.94)'
  },
  apple: {
    id: 'apple',
    label: 'Apple Glass',
    backgroundAssetKey: 'bg_glass',
    backgroundImageOpacity: 0.42,
    backgroundImageBlur: 18,
    backgroundTint: 'rgba(9, 13, 18, 0.22)',
    bgGlowTop: 'rgba(125, 167, 217, 0.16)',
    bgGlowBottom: 'rgba(78, 100, 127, 0.14)',
    brandGradient: ['#f6fbff', '#d9ecff', '#9cc8ff'],
    primaryButton: '#d9ecff',
    primaryButtonText: '#16212f',
    footerBg: 'rgba(16, 19, 25, 0.84)'
  },
  aurora: {
    id: 'aurora',
    label: 'Aurora',
    backgroundImageOpacity: 0,
    backgroundImageBlur: 0,
    bgGlowTop: 'rgba(147, 197, 253, 0.18)',
    bgGlowBottom: 'rgba(192, 132, 252, 0.16)',
    brandGradient: ['#93c5fd', '#c084fc', '#5eead4'],
    primaryButton: '#c084fc',
    primaryButtonText: '#1b1034',
    footerBg: 'rgba(15, 18, 32, 0.92)'
  },
  champagne: {
    id: 'champagne',
    label: 'Champagne',
    backgroundImageOpacity: 0,
    backgroundImageBlur: 0,
    bgGlowTop: 'rgba(217, 119, 6, 0.12)',
    bgGlowBottom: 'rgba(245, 158, 11, 0.12)',
    brandGradient: ['#fbbf24', '#f59e0b', '#fcd34d'],
    primaryButton: '#d97706',
    primaryButtonText: '#fff7ed',
    footerBg: 'rgba(255, 255, 255, 0.84)'
  },
  'liquid-chrome': {
    id: 'liquid-chrome',
    label: 'Liquid Chrome',
    backgroundAssetKey: 'bg_chrome',
    backgroundImageOpacity: 0.64,
    backgroundImageBlur: 10,
    backgroundTint: 'rgba(10, 12, 18, 0.18)',
    bgGlowTop: 'rgba(229, 231, 235, 0.16)',
    bgGlowBottom: 'rgba(156, 163, 175, 0.14)',
    brandGradient: ['#f3f4f6', '#d1d5db', '#93c5fd'],
    primaryButton: '#e5e7eb',
    primaryButtonText: '#13161e',
    footerBg: 'rgba(14, 16, 21, 0.92)'
  },
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian',
    backgroundImageOpacity: 0,
    backgroundImageBlur: 0,
    bgGlowTop: 'rgba(255, 255, 255, 0.05)',
    bgGlowBottom: 'rgba(156, 163, 175, 0.06)',
    brandGradient: ['#f5f5f5', '#d4d4d8', '#a1a1aa'],
    primaryButton: '#e5e7eb',
    primaryButtonText: '#101214',
    footerBg: 'rgba(9, 11, 15, 0.94)'
  }
};

const paletteOverrides: Partial<Record<GrapeTheme, Partial<typeof basePalette>>> = {
  comic: {
    bg: '#140a20',
    panel: 'rgba(39, 19, 70, 0.82)',
    panelBorder: 'rgba(255, 233, 124, 0.2)',
    softPanel: 'rgba(255,255,255,0.08)',
    text: '#fff9f5',
    muted: 'rgba(255, 249, 245, 0.76)',
    grape: '#ffe66d',
    mint: '#b0ffe5',
    danger: '#ff8fa3',
    shadow: 'rgba(8, 4, 20, 0.48)'
  },
  sunset: {
    bg: '#180f15',
    panel: 'rgba(39, 22, 26, 0.84)',
    panelBorder: 'rgba(255, 209, 102, 0.16)',
    text: '#fff5ec',
    muted: 'rgba(255, 245, 236, 0.72)',
    grape: '#ffd166',
    mint: '#ffd6a6',
    danger: '#ffb0a6',
    shadow: 'rgba(17, 7, 7, 0.42)'
  },
  matrix: {
    bg: '#020806',
    panel: 'rgba(3, 12, 7, 0.86)',
    panelBorder: 'rgba(34, 197, 94, 0.18)',
    text: '#d4ffe2',
    muted: 'rgba(212, 255, 226, 0.68)',
    grape: '#4ade80',
    pink: '#4ade80',
    mint: '#86efac',
    danger: '#f87171',
    shadow: 'rgba(0, 0, 0, 0.54)'
  },
  tron: {
    bg: '#100304',
    panel: 'rgba(20, 13, 12, 0.84)',
    panelBorder: 'rgba(255, 110, 63, 0.18)',
    text: '#fff4f1',
    muted: 'rgba(255, 244, 241, 0.72)',
    grape: '#ff6e3f',
    pink: '#ff9b54',
    mint: '#ffc18f',
    danger: '#ffb0a6',
    shadow: 'rgba(0, 0, 0, 0.5)'
  },
  apple: {
    bg: '#111317',
    panel: 'rgba(28, 33, 41, 0.7)',
    panelBorder: 'rgba(217, 236, 255, 0.12)',
    text: '#f4f8ff',
    muted: 'rgba(232, 240, 255, 0.72)',
    grape: '#d9ecff',
    pink: '#9cc8ff',
    mint: '#d9ecff',
    danger: '#ffb7c5',
    shadow: 'rgba(3, 6, 12, 0.42)',
    frost: 'rgba(255,255,255,0.12)'
  },
  aurora: {
    bg: '#0d101a',
    panel: 'rgba(19, 23, 40, 0.82)',
    panelBorder: 'rgba(147, 197, 253, 0.14)',
    text: '#f4f8ff',
    muted: 'rgba(233, 240, 255, 0.72)',
    grape: '#c084fc',
    pink: '#93c5fd',
    mint: '#5eead4'
  },
  champagne: {
    bg: '#f5efe8',
    panel: 'rgba(255, 255, 255, 0.82)',
    panelBorder: 'rgba(128, 93, 36, 0.1)',
    softPanel: 'rgba(15, 23, 42, 0.05)',
    text: '#1f2937',
    muted: 'rgba(31, 41, 55, 0.68)',
    grape: '#d97706',
    pink: '#f59e0b',
    mint: '#9a7c2f',
    danger: '#c2410c',
    frost: 'rgba(15, 23, 42, 0.06)',
    shadow: 'rgba(15, 23, 42, 0.16)'
  },
  'liquid-chrome': {
    bg: '#090b10',
    panel: 'rgba(19, 22, 30, 0.88)',
    panelBorder: 'rgba(255, 255, 255, 0.08)',
    text: '#f4f7fb',
    muted: 'rgba(228, 232, 240, 0.72)',
    grape: '#e5e7eb',
    pink: '#9ca3af',
    mint: '#d1d5db'
  },
  obsidian: {
    bg: '#090b10',
    panel: 'rgba(17, 20, 27, 0.9)',
    panelBorder: 'rgba(255, 255, 255, 0.07)',
    text: '#f5f5f5',
    muted: 'rgba(212, 212, 216, 0.7)',
    grape: '#e5e7eb',
    pink: '#a1a1aa',
    mint: '#d4d4d8'
  }
};

export function getMobileTheme(theme: GrapeTheme | undefined): MobileThemePalette {
  const normalizedTheme = theme && themeMap[theme] ? theme : DEFAULT_THEME;
  return {
    ...basePalette,
    ...paletteOverrides[normalizedTheme],
    ...themeMap[normalizedTheme]
  };
}

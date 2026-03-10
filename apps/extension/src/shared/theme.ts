import { DEFAULT_THEME, STORAGE_KEYS, normalizeTheme, type GrapeTheme } from '@grape/core';

export const THEMES: Array<{ id: GrapeTheme; label: string }> = [
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

export function applyDocumentTheme(theme: GrapeTheme | undefined) {
  document.body.dataset.theme = normalizeTheme(theme);
}

export async function loadPersistedTheme(): Promise<GrapeTheme> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.state);
    const state = result[STORAGE_KEYS.state] as { selectedTheme?: unknown } | undefined;
    return normalizeTheme(state?.selectedTheme);
  } catch {
    return DEFAULT_THEME;
  }
}

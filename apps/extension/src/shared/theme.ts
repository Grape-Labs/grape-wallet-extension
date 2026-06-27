import {
  DEFAULT_CUSTOM_THEME,
  DEFAULT_THEME,
  DEFAULT_THEME_BACKGROUND_STYLE,
  DEFAULT_THEME_MOTION_INTENSITY,
  STORAGE_KEYS,
  normalizeCustomTheme,
  normalizeTheme,
  normalizeThemeBackgroundStyle,
  normalizeThemeMotionIntensity,
  type CustomThemeConfig,
  type GrapeTheme,
  type ThemeBackgroundStyle,
  type ThemeMotionIntensity
} from '@grape/core';

export const THEMES: Array<{ id: GrapeTheme; label: string }> = [
  { id: 'grape', label: 'Grape' },
  { id: 'comic', label: 'Comic' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'tron', label: 'Ares' },
  { id: 'apple', label: 'Apple Glass' },
  { id: 'mist', label: 'Mist Glass' },
  { id: 'midnight-glass', label: 'Dark Glass' },
  { id: 'plastic', label: 'Soft Plastic' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'champagne', label: 'Champagne' },
  { id: 'liquid-chrome', label: 'Liquid Chrome' },
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'custom', label: 'Custom' }
];

export const THEME_BACKGROUND_STYLES: Array<{ id: ThemeBackgroundStyle; label: string }> = [
  { id: 'gradient', label: 'Gradient' },
  { id: 'glass', label: 'Glass' },
  { id: 'noise', label: 'Noise' },
  { id: 'orbs', label: 'Orb Glow' }
];

export const THEME_MOTION_INTENSITIES: Array<{ id: ThemeMotionIntensity; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'expressive', label: 'Expressive' }
];

const CUSTOM_THEME_VARIABLES: Record<keyof CustomThemeConfig, `--custom-theme-${string}`> = {
  background: '--custom-theme-background',
  surface: '--custom-theme-surface',
  text: '--custom-theme-text',
  accent: '--custom-theme-accent',
  accent2: '--custom-theme-accent-2'
};

export function applyDocumentTheme(
  theme: GrapeTheme | undefined,
  customTheme?: CustomThemeConfig | undefined,
  backgroundStyle?: ThemeBackgroundStyle | undefined,
  motionIntensity?: ThemeMotionIntensity | undefined
) {
  const normalizedTheme = normalizeTheme(theme);
  document.body.dataset.theme = normalizedTheme;
  document.body.dataset.backgroundStyle = normalizeThemeBackgroundStyle(backgroundStyle);
  document.body.dataset.motionIntensity = normalizeThemeMotionIntensity(motionIntensity);
  if (normalizedTheme === 'custom') {
    const normalizedCustomTheme = normalizeCustomTheme(customTheme);
    for (const [key, variableName] of Object.entries(CUSTOM_THEME_VARIABLES) as Array<[keyof CustomThemeConfig, string]>) {
      document.body.style.setProperty(variableName, normalizedCustomTheme[key]);
    }
    return;
  }

  for (const variableName of Object.values(CUSTOM_THEME_VARIABLES)) {
    document.body.style.removeProperty(variableName);
  }
}

export async function loadPersistedTheme(): Promise<GrapeTheme> {
  const state = await loadPersistedThemeSettings();
  return state.theme;
}

export async function loadPersistedThemeSettings(): Promise<{
  theme: GrapeTheme;
  customTheme: CustomThemeConfig;
  backgroundStyle: ThemeBackgroundStyle;
  motionIntensity: ThemeMotionIntensity;
}> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.state);
    const state = result[STORAGE_KEYS.state] as {
      selectedTheme?: unknown;
      customTheme?: unknown;
      themeBackgroundStyle?: unknown;
      themeMotionIntensity?: unknown;
    } | undefined;
    return {
      theme: normalizeTheme(state?.selectedTheme),
      customTheme: normalizeCustomTheme(state?.customTheme),
      backgroundStyle: normalizeThemeBackgroundStyle(state?.themeBackgroundStyle),
      motionIntensity: normalizeThemeMotionIntensity(state?.themeMotionIntensity)
    };
  } catch {
    return {
      theme: DEFAULT_THEME,
      customTheme: DEFAULT_CUSTOM_THEME,
      backgroundStyle: DEFAULT_THEME_BACKGROUND_STYLE,
      motionIntensity: DEFAULT_THEME_MOTION_INTENSITY
    };
  }
}

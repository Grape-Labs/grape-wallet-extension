import { describe, expect, it } from 'vitest';
import { getSettingsLayout, settingsQrSize, settingsCategoryForSection, MOBILE_SETTINGS_CATEGORIES } from './settingsLayout';
describe('native settings canvas', () => {
  it('uses a compact category picker on phones and split view', () => {
    for (const width of [320, 366, 500]) expect(getSettingsLayout(width)).toMatchObject({ navigation: 'picker', columns: 1, contentWidth: width });
  });
  it('fits iPad portrait after the main wallet navigation is excluded', () => {
    expect(getSettingsLayout(834 - 164 - 48)).toEqual({ navigation: 'tabs', columns: 1, contentWidth: 622 });
  });
  it('uses two cards in iPad landscape and a category rail on a larger canvas', () => {
    expect(getSettingsLayout(1024 - 164 - 48)).toEqual({ navigation: 'tabs', columns: 2, contentWidth: 812 });
    expect(getSettingsLayout(1366 - 204 - 48)).toEqual({ navigation: 'sidebar', columns: 2, contentWidth: 910 });
  });
  it('falls back to readable cards and a picker for accessibility text', () => {
    expect(getSettingsLayout(812, 1.5)).toMatchObject({ navigation: 'picker', columns: 1 });
    expect(getSettingsLayout(1114, 2)).toMatchObject({ navigation: 'picker', columns: 1 });
  });
  it('keeps restore QR frames inside phone and tablet cards', () => {
    for (const width of [240, 280, 353, 500]) expect(settingsQrSize(width) + 36 + 34).toBeLessThanOrEqual(width);
    expect(settingsQrSize(800)).toBe(320);
  });
  it('routes community Manage links and keeps recovery apart from ordinary preferences', () => {
    for (const section of ['verification','governance','reputation']) expect(settingsCategoryForSection(section)).toBe(section);
    expect(settingsCategoryForSection('backup')).toBe('recovery'); expect(settingsCategoryForSection('link-device')).toBe('recovery');
    expect(settingsCategoryForSection('private-balances')).toBe('addons'); expect(settingsCategoryForSection('rebalancer')).toBe('addons');
    expect(settingsCategoryForSection('unlock')).toBe('security'); expect(settingsCategoryForSection('signing')).toBe('connections');
    expect(new Set(MOBILE_SETTINGS_CATEGORIES.map(item => item.id)).size).toBe(MOBILE_SETTINGS_CATEGORIES.length);
  });
});

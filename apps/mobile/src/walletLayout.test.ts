import { describe, expect, it } from 'vitest';
import { getWalletLayout } from './walletLayout';

describe('adaptive wallet workspace', () => {
  it('uses a sidebar and readable asset columns on iPad Pro in portrait', () => {
    expect(getWalletLayout(834, 1210)).toMatchObject({ tablet: true, marketColumns: true, columns: false, horizontalHero: false });
  });
  it('fits both dashboard columns on the 11-inch iPad Pro in landscape', () => {
    const layout = getWalletLayout(1210, 834);
    expect(layout).toMatchObject({ tablet: true, columns: true, horizontalHero: true });
    // The holdings pane retains room for names, price, quantity and card padding.
    expect(layout.contentWidth - 300 - 24).toBeGreaterThanOrEqual(580);
  });
  it('keeps both columns on a 13-inch iPad in landscape', () => {
    expect(getWalletLayout(1376, 1032)).toMatchObject({ tablet: true, columns: true, horizontalHero: true });
  });
  it.each([[600, 834], [507, 1210], [390, 844], [844, 390]])('falls back to phone navigation in a %i × %i window', (width, height) => {
    expect(getWalletLayout(width, height)).toMatchObject({ tablet: false, sidebarWidth: 0, columns: false, marketColumns: false });
  });
  it('stacks columns and hides extra market columns for large text', () => {
    expect(getWalletLayout(1210, 834, 1.6)).toMatchObject({ tablet: true, columns: false, horizontalHero: false });
    expect(getWalletLayout(834, 1210, 1.6).marketColumns).toBe(false);
  });
  it('keeps tablet navigation stable when the Android keyboard shortens the window', () => {
    expect(getWalletLayout(1280, 420, 1, 0, true).tablet).toBe(true);
    expect(getWalletLayout(600, 420, 1, 0, true).tablet).toBe(false);
  });
  it('subtracts window safe areas and caps ultrawide content', () => {
    const layout = getWalletLayout(1210, 834, 1, 40);
    expect(layout.contentWidth + layout.sidebarWidth + 2 * layout.padding + 40).toBe(1210);
    expect(getWalletLayout(2000, 1200).contentWidth).toBe(1180);
  });
});

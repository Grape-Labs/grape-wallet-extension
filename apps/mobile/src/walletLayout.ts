/** Logical points, based on the app window rather than the physical device. */
export function getWalletLayout(width: number, height: number, fontScale = 1, horizontalInsets = 0, tabletDevice = false) {
  const usableWidth = Math.max(0, width - horizontalInsets);
  const tablet = usableWidth >= 760 && (height >= 540 || tabletDevice);
  const sidebarWidth = tablet ? (usableWidth >= 1180 ? 204 : 164) : 0;
  const padding = tablet ? 24 : width < 390 ? 10 : 12;
  const contentWidth = Math.max(0, Math.min(1180, usableWidth - sidebarWidth - padding * 2));
  // Large accessibility text needs the same room as a smaller window.
  const readableWidth = contentWidth / Math.max(1, fontScale);
  return {
    tablet, sidebarWidth, padding, contentWidth,
    columns: tablet && readableWidth >= 920,
    marketColumns: tablet && readableWidth >= 580,
    horizontalHero: tablet && readableWidth >= 820
  };
}

const EMBED_PREFERENCE_KEY = 'grape.discover.openGrapeAppsInside';

/** Only these HTTPS hosts can run in the extension's app viewer. */
export function getEmbeddedDappUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname;
    return host === 'governance.so' || host.endsWith('.governance.so') || host === 'round-trip.ai.studio' ? url : null;
  } catch { return null; }
}
export function preferEmbeddedDapps(): boolean {
  try { return localStorage.getItem(EMBED_PREFERENCE_KEY) !== 'false'; } catch { return true; }
}
export function setPreferEmbeddedDapps(enabled: boolean) {
  try { localStorage.setItem(EMBED_PREFERENCE_KEY, String(enabled)); } catch { /* Available for this view even if storage is full. */ }
}
export function openDapp(url: string, embedded = preferEmbeddedDapps()) {
  const allowed = getEmbeddedDappUrl(url);
  const target = embedded && allowed
    ? `${chrome.runtime.getURL('dapp.html')}?url=${encodeURIComponent(allowed.href)}`
    : url;
  // A full extension tab keeps the dApp alive when the wallet popup closes.
  window.open(target, '_blank', 'noopener,noreferrer');
}

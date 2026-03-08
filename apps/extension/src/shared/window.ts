export function openExtensionPage(path: string): void {
  const url = chrome.runtime.getURL(path);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function closeCurrentWindow(): void {
  window.close();
}

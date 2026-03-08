export function openExtensionPage(path: string): void {
  const url = chrome.runtime.getURL(path);
  void chrome.tabs.create({ url });
}

export function closeCurrentWindow(): void {
  window.close();
}

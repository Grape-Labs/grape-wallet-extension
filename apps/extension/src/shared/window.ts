export function openExtensionPage(path: string): void {
  const url = chrome.runtime.getURL(path);
  void chrome.tabs.create({ url });
}

export async function openExtensionSidePanel(path = 'sidepanel.html'): Promise<void> {
  if (!('sidePanel' in chrome) || !chrome.sidePanel) {
    throw new Error('Side panel is not available in this browser.');
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const fallbackWindow = await chrome.windows.getLastFocused();
  const windowId = activeTab?.windowId ?? fallbackWindow.id;

  if (!windowId) {
    throw new Error('Unable to resolve the current Chrome window for the side panel.');
  }

  await chrome.sidePanel.setOptions({
    enabled: true,
    path
  });
  await chrome.sidePanel.open({ windowId });
}

export function closeCurrentWindow(): void {
  window.close();
}

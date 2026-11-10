/** Only hand actual web pages to the OS; WebView can report about:blank on failures. */
export async function openDiscoverExternally(
  currentUrl: string,
  loadedUrl: string,
  openURL: (url: string) => Promise<unknown>
): Promise<void> {
  let target: string | undefined;
  for (const candidate of [currentUrl, loadedUrl]) {
    try {
      const parsed = new URL(candidate.trim());
      if (['https:', 'http:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password) {
        target = parsed.toString();
        break;
      }
    } catch {
      // Try the page originally requested if WebView has no usable current URL.
    }
  }
  if (!target) throw new Error('There is no web page to open. Enter an address or search first.');
  // Do not gate this on canOpenURL: OS query restrictions can produce false negatives.
  await openURL(target);
}

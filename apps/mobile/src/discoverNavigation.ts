/** Resolve submitted address-bar text without treating single words as hostnames. */
export function normalizeDiscoverUrlInput(input: string): { url: string | null; error: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { url: null, error: null };

  const explicitWebUrl = /^https?:\/\//i.test(trimmed);
  const authority = trimmed.split(/[/?#]/, 1)[0];
  const looksLikeHost = /^(?:localhost|(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+|\[[\da-f:]+\])(?::\d+)?$/iu.test(authority);
  // A scheme must never be disguised as a searchable website or executed by the WebView.
  const otherScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) && !looksLikeHost;
  if (otherScheme && !explicitWebUrl) {
    return { url: null, error: 'Only http and https URLs are supported in Grape Discover.' };
  }

  if (!explicitWebUrl && (/\s/.test(trimmed) || !looksLikeHost)) {
    return { url: `https://search.brave.com/search?q=${encodeURIComponent(trimmed)}`, error: null };
  }

  try {
    const parsed = new URL(explicitWebUrl ? trimmed : `https://${trimmed}`);
    if (!parsed.hostname || /\s/.test(trimmed) || parsed.username || parsed.password) {
      return { url: null, error: 'Enter a valid website address.' };
    }
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local') || parsed.hostname === '[::1]';
    const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
    if (parsed.protocol === 'http:' && !isLocalhost && !isIpAddress) parsed.protocol = 'https:';
    return { url: parsed.toString(), error: null };
  } catch {
    return { url: null, error: 'Enter a valid website address.' };
  }
}

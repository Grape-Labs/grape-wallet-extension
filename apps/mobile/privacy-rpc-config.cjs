/** Shared by Expo build configuration and the native runtime. Never log candidates. */
function resolvePrivacyRpc(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      const key = url.searchParams.get('api-key')?.trim();
      if (url.protocol !== 'https:' || url.hostname !== 'mainnet.helius-rpc.com' || url.port || url.username || url.password || !key) continue;
      const endpoint = new URL('https://mainnet.helius-rpc.com/');
      endpoint.searchParams.set('api-key', key);
      return endpoint.toString();
    } catch { /* Invalid or non-Helius regular RPCs must not mask the privacy fallback. */ }
  }
  return undefined;
}
module.exports = { resolvePrivacyRpc };

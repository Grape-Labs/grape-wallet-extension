export function nftResourceUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${value.slice(7).replace(/^ipfs\//, '')}` : value.startsWith('ar://') ? `https://arweave.net/${value.slice(5)}` : value;
  try { const url = new URL(normalized); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}

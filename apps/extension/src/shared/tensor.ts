/** Tensor item routes use the Solana asset mint, not a collection name/slug. */
export function tensorItemUrl(mint: string, network: 'mainnet-beta' | 'devnet'): string | null {
  if (network !== 'mainnet-beta' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  return 'https://www.tensor.trade/item/' + encodeURIComponent(mint);
}

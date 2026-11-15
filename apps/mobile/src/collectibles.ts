import type { GrapeChain } from '@grape/core';

export type MobileCollectible = { id: string; chain: GrapeChain; name: string; image?: string; description?: string; collection?: string; contract?: string; tokenId?: string };
export type CollectiblePage = { items: MobileCollectible[]; nextCursor?: string };
async function requestCollectibleJson<T>(url: string, init: RequestInit = {}, service = 'NFT service'): Promise<T> {
  // NFT indexers may take longer than swap quotes to assemble a wallet page.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      let response: Response;
      try { response = await fetch(url, { ...init, signal: controller.signal }); }
      catch {
        if (attempt === 0) continue;
        throw new Error(controller.signal.aborted ? 'NFT loading timed out. Refresh to try again.' : 'Could not connect to the NFT service. Check your connection and refresh.');
      }
      if (!response.ok) {
        if (response.status === 400) {
          // Classify validation failures without displaying provider bodies, keys or URLs.
          const detail = await response.text().catch(() => '');
          if (/DAS RPC method not supported|method not found|unsupported method/i.test(detail)) throw new Error('This Solana RPC does not support NFT discovery. Token balances can still load because they use standard RPC methods.');
          if (/(invalid|incorrect|valid).{0,50}(address|public.?key)|(address|public.?key).{0,50}(invalid|incorrect)/i.test(detail)) throw new Error(`The ${service} rejected this wallet address (HTTP 400).`);
          throw new Error(`The ${service} rejected the NFT request (HTTP 400).`);
        }
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
        if (response.status === 401 || response.status === 403) throw new Error('The NFT service rejected access. Check the NFT API credentials for this connection.');
        if (response.status === 429) throw new Error('The NFT service is busy. Wait a moment and refresh.');
        throw new Error(`The NFT service is unavailable (HTTP ${response.status}). Refresh to try again.`);
      }
      return await response.json() as T;
    } finally { clearTimeout(timeout); }
  }
  throw new Error('NFT loading failed. Refresh to try again.');
}

type DasAsset = { id?: string; interface?: string; burnt?: boolean; ownership?: { owner?: string }; content?: { metadata?: { name?: string; description?: string; token_standard?: string }; links?: { image?: string }; files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }> }; grouping?: Array<{ group_key?: string; group_value?: string; collection_metadata?: { name?: string } }> };
export function collectibleImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const uri = value.trim().replace(/^ipfs:\/\/(?:ipfs\/)?/, 'https://ipfs.io/ipfs/').replace(/^ar:\/\//, 'https://arweave.net/');
  try { return new URL(uri).protocol === 'https:' || new URL(uri).protocol === 'http:' ? uri : undefined; } catch { return undefined; }
}
export function normalizeSolanaCollectible(asset: DasAsset, owner: string): MobileCollectible | null {
  if (!asset.id || asset.burnt || asset.ownership?.owner && asset.ownership.owner !== owner) return null;
  if (!['V1_NFT', 'V1_PRINT', 'V2_NFT', 'LEGACY_NFT', 'Legacy_NFT', 'ProgrammableNFT', 'MplCoreAsset'].includes(asset.interface ?? '') && !['NonFungible', 'NonFungibleEdition', 'ProgrammableNonFungible', 'ProgrammableNonFungibleEdition'].includes(asset.content?.metadata?.token_standard ?? '')) return null;
  const collection = asset.grouping?.find(item => item.group_key === 'collection');
  return { id: asset.id, chain: 'solana', name: asset.content?.metadata?.name?.trim().slice(0, 200) || `${asset.id.slice(0, 4)}…${asset.id.slice(-4)}`, description: asset.content?.metadata?.description?.slice(0, 2000), collection: collection?.collection_metadata?.name?.slice(0, 200) || (collection?.group_value ? `Collection ${collection.group_value.slice(0, 4)}…${collection.group_value.slice(-4)}` : undefined), image: collectibleImage(asset.content?.links?.image || asset.content?.files?.find(file => file.mime?.startsWith('image/'))?.cdn_uri || asset.content?.files?.find(file => file.mime?.startsWith('image/'))?.uri) };
}
type ShyftNft = { mint?: string; owner?: string; name?: string; description?: string; image_uri?: string; cached_image_uri?: string; collection?: { name?: string; family?: string }; is_burnt?: boolean };
async function loadShyftCollectibles(apiKey: string, owner: string, page: number): Promise<CollectiblePage> {
  const query = new URLSearchParams({ network: 'mainnet-beta', address: owner, page: String(page), size: '50' });
  const response = await requestCollectibleJson<{ success?: boolean; result?: { nfts?: ShyftNft[]; total_pages?: number; total_count?: number } }>(`https://api.shyft.to/sol/v2/nft/read_all?${query}`, { headers: { 'x-api-key': apiKey, accept: 'application/json' } }, 'Solana NFT indexer');
  if (!response.success || !Array.isArray(response.result?.nfts)) throw new Error('NFT discovery is unavailable from this provider. Refresh to try again.');
  const result = response.result;
  const items = result.nfts!.flatMap(nft => !nft.mint || nft.is_burnt || nft.owner && nft.owner !== owner ? [] : [{ id: nft.mint, chain: 'solana' as const, name: nft.name?.trim().slice(0, 200) || `${nft.mint.slice(0, 4)}…${nft.mint.slice(-4)}`, description: nft.description?.slice(0, 2000), image: collectibleImage(nft.cached_image_uri || nft.image_uri), collection: (nft.collection?.name || nft.collection?.family)?.slice(0, 200) }]);
  return { items, nextCursor: typeof result.total_pages === 'number' ? page < result.total_pages ? String(page + 1) : undefined : result.nfts!.length === 50 || (result.total_count ?? 0) > page * 50 ? String(page + 1) : undefined };
}

/** NFT indexing is separate from the transaction RPC, on the same Solana mainnet. */
export function solanaNftIndexerKey(rpcUrl: string, defaultRpcUrl: string, configuredKey?: string): string | undefined {
  if (configuredKey?.trim()) return configuredKey.trim();
  for (const candidate of [rpcUrl, defaultRpcUrl]) {
    try {
      const provider = new URL(candidate);
      if (provider.protocol === 'https:' && provider.hostname.toLowerCase() === 'rpc.shyft.to') {
        const key = provider.searchParams.get('api_key');
        if (key) return key;
      }
    } catch { /* An invalid transaction RPC must not prevent independent NFT indexing. */ }
  }
  return undefined;
}

export async function loadSolanaCollectibles(rpcUrl: string, owner: string, cursor = '1', indexerApiKey?: string): Promise<CollectiblePage> {
  const page = Number(cursor);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid NFT page. Refresh your collection.');
  if (indexerApiKey) return loadShyftCollectibles(indexerApiKey, owner, page);
  // Shyft's normal RPC explicitly rejects DAS methods; use its documented NFT read API.
  // Only a key belonging to this exact provider is forwarded to its own API host.
  const provider = new URL(rpcUrl);
  if (provider.protocol === 'https:' && provider.hostname === 'rpc.shyft.to') {
    const apiKey = provider.searchParams.get('api_key');
    if (apiKey) return loadShyftCollectibles(apiKey, owner, page);
  }

  const response = await requestCollectibleJson<{ result?: { items?: DasAsset[]; total?: number }; error?: { message?: string } }>(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAssetsByOwner', params: { ownerAddress: owner, page, limit: 60, displayOptions: { showFungible: false, showCollectionMetadata: true } } }) }, 'Solana RPC');
  if (response.error || !Array.isArray(response.result?.items)) throw new Error('NFT discovery is unavailable from this Solana connection. Refresh or try another RPC in Settings.');
  const result = response.result;
  return { items: result.items!.flatMap(asset => { const item = normalizeSolanaCollectible(asset, owner); return item ? [item] : []; }), nextCursor: result.items!.length === 60 || (result.total ?? 0) > page * 60 ? String(page + 1) : undefined };
}
export async function loadEvmCollectibles(chain: 'ethereum' | 'monad', owner: string, cursor?: string): Promise<CollectiblePage> {
  const baseUrl = chain === 'ethereum' ? 'https://eth.blockscout.com/api/v2' : 'https://monadscan.com/api/v2';
  const query = new URLSearchParams(cursor || 'type=ERC-721%2CERC-1155');
  const payload = await requestCollectibleJson<{ items?: Array<Record<string, unknown>>; next_page_params?: Record<string, unknown> | null }>(`${baseUrl}/addresses/${encodeURIComponent(owner)}/nft?${query}`, { headers: { accept: 'application/json' } });
  if (!Array.isArray(payload.items)) throw new Error('NFT discovery is unavailable on this network. Refresh to try again.');
  const items = payload.items.flatMap(entry => {
    const token = (entry.token && typeof entry.token === 'object' ? entry.token : {}) as Record<string, unknown>;
    const metadata = (entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}) as Record<string, unknown>;
    const contract = String(token.address_hash ?? token.address ?? entry.token_contract_address_hash ?? '');
    const tokenId = String(entry.id ?? entry.token_id ?? '');
    if (!contract || !tokenId) return [];
    return [{ id: `${contract}:${tokenId}`, chain, name: String(metadata.name ?? `${token.name ?? 'NFT'} #${tokenId}`).slice(0, 200), collection: String(token.name ?? 'NFT').slice(0, 200), description: typeof metadata.description === 'string' ? metadata.description.slice(0, 2000) : undefined, image: collectibleImage(metadata.image_url ?? metadata.image ?? entry.image_url), contract, tokenId }];
  });
  const next = payload.next_page_params ? new URLSearchParams(Object.entries(payload.next_page_params).filter(([, value]) => typeof value === 'string' || typeof value === 'number').map(([key, value]) => [key, String(value)])) : null;
  return { items, nextCursor: next?.toString() || undefined };
}

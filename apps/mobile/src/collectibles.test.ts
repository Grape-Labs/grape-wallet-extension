import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectibleImage, solanaNftIndexerKey, loadSolanaCollectibles, normalizeSolanaCollectible, loadEvmCollectibles } from './collectibles';
const nft = { id: 'nft-address', interface: 'V1_NFT', ownership: { owner: 'owner' }, content: { metadata: { name: 'Grape #1' }, links: { image: 'ipfs://ipfs/artwork' } } };
afterEach(() => vi.unstubAllGlobals());
describe('mobile NFT discovery', () => {
  it('normalizes NFTs and remote artwork without classifying fungible tokens as NFTs', () => {
    expect(normalizeSolanaCollectible(nft, 'owner')).toMatchObject({ name: 'Grape #1', image: 'https://ipfs.io/ipfs/artwork', chain: 'solana' });
    expect(normalizeSolanaCollectible({ ...nft, interface: 'FungibleToken' }, 'owner')).toBeNull();
    expect(normalizeSolanaCollectible({ ...nft, burnt: true }, 'owner')).toBeNull();
    expect(normalizeSolanaCollectible(nft, 'different-owner')).toBeNull();
    expect(collectibleImage('ar://art')).toBe('https://arweave.net/art');
    expect(collectibleImage('javascript:alert(1)')).toBeUndefined();
    expect(collectibleImage('data:text/html,unsafe')).toBeUndefined();
  });
  it('requests the correct owner/page and retains pagination even when some assets are filtered', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ result: { total: 61, items: [nft, { ...nft, id: 'token', interface: 'FungibleToken' }] } }) }));
    vi.stubGlobal('fetch', fetcher);
    const page = await loadSolanaCollectibles('https://rpc.example', 'owner');
    expect(page.items).toHaveLength(1); expect(page.nextCursor).toBe('2');
    const request = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(request).toMatchObject({ method: 'getAssetsByOwner', params: { ownerAddress: 'owner', page: 1, limit: 60, displayOptions: { showFungible: false } } });
  });
  it('keeps RPC failure distinct from an empty NFT collection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ error: { message: 'method unavailable' } }) })));
    await expect(loadSolanaCollectibles('https://rpc.example', 'owner')).rejects.toThrow('NFT discovery is unavailable');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ result: { total: 0, items: [] } }) })));
    await expect(loadSolanaCollectibles('https://rpc.example', 'owner')).resolves.toEqual({ items: [], nextCursor: undefined });
  });
  it('uses the dedicated Shyft NFT API without exposing its key in a URL', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, result: { nfts: [{ mint: 'nft', owner: 'owner', name: 'Art', cached_image_uri: 'ipfs://art', collection: { name: 'Collection' } }], page: 1, total_pages: 2, total_count: 51 } }) }));
    vi.stubGlobal('fetch', fetcher);
    const result = await loadSolanaCollectibles('https://rpc.shyft.to/?api_key=test-provider-key', 'owner');
    expect(result.items[0]).toMatchObject({ id: 'nft', image: 'https://ipfs.io/ipfs/art', collection: 'Collection' });
    expect(result.nextCursor).toBe('2');
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.shyft.to/sol/v2/nft/read_all?network=mainnet-beta&address=owner&page=1&size=50');
    expect(call[0]).not.toContain('test-provider-key');
    expect(call[1].headers).toMatchObject({ 'x-api-key': 'test-provider-key' });
  });
  it('does not forward another RPC provider’s key to Shyft', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ result: { items: [] } }) }));
    vi.stubGlobal('fetch', fetcher);
    await loadSolanaCollectibles('https://custom.example/?api_key=custom-provider-key', 'owner');
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toContain('https://custom.example/');
    expect(call[1].headers).not.toHaveProperty('x-api-key');
  });
  it('uses EVM pagination on a fixed explorer host', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ id: '7', token: { address_hash: '0xabc', name: 'Collection' }, metadata: { name: 'Art #7', image: 'https://images.example/7.png' } }], next_page_params: { id: '8', token_contract_address_hash: '0xabc' } }) }));
    vi.stubGlobal('fetch', fetcher);
    const page = await loadEvmCollectibles('ethereum', '0xowner');
    expect(page.items[0]).toMatchObject({ id: '0xabc:7', name: 'Art #7', chain: 'ethereum' });
    await loadEvmCollectibles('ethereum', '0xowner', page.nextCursor);
    expect((fetcher.mock.calls[1] as unknown as [string])[0]).toBe('https://eth.blockscout.com/api/v2/addresses/0xowner/nft?id=8&token_contract_address_hash=0xabc');
  });
});

it('retries transient NFT indexer failures without treating them as an empty wallet', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: { nfts: [], total_pages: 0 } }) });
  vi.stubGlobal('fetch', fetcher);
  await expect(loadSolanaCollectibles('https://rpc.shyft.to/?api_key=test', 'owner')).resolves.toEqual({ items: [], nextCursor: undefined });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('reports authentication failures separately and does not retry them', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 });
  vi.stubGlobal('fetch', fetcher);
  await expect(loadSolanaCollectibles('https://rpc.shyft.to/?api_key=test', 'owner')).rejects.toThrow('rejected access');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('identifies a Solana RPC rejecting DAS instead of disguising it as a generic network failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'DAS RPC method not supported secret-provider-key' }));
  await expect(loadSolanaCollectibles('https://custom.example', 'owner')).rejects.toThrow('does not support NFT discovery');
});
it('identifies the NFT indexer rejecting a wallet address without displaying raw provider data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'Invalid address secret-provider-key' }));
  await expect(loadSolanaCollectibles('https://rpc.shyft.to/?api_key=test', 'owner')).rejects.toThrow('Solana NFT indexer rejected this wallet address (HTTP 400)');
});

it('uses the same mainnet NFT indexer when the transaction RPC lacks DAS without forwarding its credentials', async () => {
  const transactionRpc = 'https://custom.example/?api_key=private-rpc-key';
  const key = solanaNftIndexerKey(transactionRpc, 'https://rpc.shyft.to/?api_key=default-indexer-key');
  expect(key).toBe('default-indexer-key');
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { nfts: [], total_pages: 0 } }) });
  vi.stubGlobal('fetch', fetcher);
  await loadSolanaCollectibles(transactionRpc, 'owner', undefined, key);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain('https://api.shyft.to/sol/v2/nft/read_all?network=mainnet-beta&address=owner');
  expect(fetcher.mock.calls[0][1].headers['x-api-key']).toBe('default-indexer-key');
  expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private-rpc-key');
});
it('prefers explicit indexer credentials and never extracts keys from unrelated RPC hosts', () => {
  expect(solanaNftIndexerKey('https://custom.example/?api_key=other', 'https://rpc.shyft.to/?api_key=default', 'dedicated')).toBe('dedicated');
  expect(solanaNftIndexerKey('https://rpc.shyft.to.evil.example/?api_key=other', 'https://rpc.example')).toBeUndefined();
});

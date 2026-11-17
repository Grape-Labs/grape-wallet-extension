import { describe, expect, it } from 'vitest';
import { nftResourceUrl } from '../../shared/nft-resources';
describe('NFT metadata resource links', () => {
  it('resolves IPFS resources and the optional ipfs path prefix', () => {
    expect(nftResourceUrl('ipfs://bafy123/art.png')).toBe('https://ipfs.io/ipfs/bafy123/art.png');
    expect(nftResourceUrl('ipfs://ipfs/bafy123/metadata.json')).toBe('https://ipfs.io/ipfs/bafy123/metadata.json');
  });
  it('resolves Arweave resources', () => expect(nftResourceUrl('ar://transaction/art.png')).toBe('https://arweave.net/transaction/art.png'));
  it('preserves web resource queries', () => expect(nftResourceUrl('https://example.com/art.png?width=100')).toBe('https://example.com/art.png?width=100'));
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'not a URL', undefined])('does not expose unsupported resource %s', value => expect(nftResourceUrl(value)).toBeUndefined());
});

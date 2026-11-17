import { nftResourceUrl } from '../../shared/nft-resources';
export { nftResourceUrl } from '../../shared/nft-resources';
import { FOX_COLLECTIONS } from '../../shared/fox-missions';
import { FoxMissionPanel } from './FoxMissionPanel';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, Copy, Check, ExternalLink, Image as ImageIcon, SendHorizontal } from 'lucide-react';
import type { CollectibleItem, TokenDetailsResponse } from '../../shared/models';
import './nft-detail.css';

export type NftJsonMetadata = { name?: string; symbol?: string; description?: string; imageUri?: string; externalUrl?: string; attributes?: { label: string; value: string }[] };
function AddressRow({ label, value, explorer }: { label: string; value?: string | null; explorer: (address: string) => string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return <div className="nft-address-row"><span>{label}</span>{value ? <div><code title={value}>{value.length > 18 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value}</code><button type="button" aria-label={`Copy ${label.toLowerCase()}`} title={copied ? 'Copied' : 'Copy full address'} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); } catch { setError(true); } }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button><a href={explorer(value)} target="_blank" rel="noopener noreferrer" aria-label={`View ${label.toLowerCase()} on explorer`} title="View on explorer"><ExternalLink size={15} /></a>{error ? <small role="alert">Copy unavailable</small> : null}</div> : <span className="muted">None</span>}</div>;
}
export function NftDetailView({ item, details, metadata, loading, network, onBack, onSend, canSend, explorer, marketplace, missions }: {
  item: CollectibleItem; details: TokenDetailsResponse; metadata: NftJsonMetadata | null; loading: boolean; network: string;
  onBack: () => void; onSend: () => void; canSend: boolean; explorer: (address: string) => string; marketplace: ReactNode; missions?: { owner: string; unlocked: boolean; watchOnly: boolean; onChanged: () => void };
}) {
  const hasFoxMissions = !!missions && network === 'mainnet-beta' && (FOX_COLLECTIONS as readonly string[]).includes(item.collectionId ?? '');
  const [missionLocksAsset, setMissionLocksAsset] = useState(hasFoxMissions);
  const name = metadata?.name || details.name || item.name || 'Collectible';
  const image = nftResourceUrl(metadata?.imageUri || item.imageUri || details.logoUri);
  const [failedImage, setFailedImage] = useState<string | undefined>();
  const site = nftResourceUrl(metadata?.externalUrl);
  const json = nftResourceUrl(details.metadataUri);
  return <div className="nft-detail-workspace nft-inspector">
    <header className="nft-navigation"><button type="button" onClick={onBack}><ArrowLeft size={18} />Back to collectibles</button><span>Solana · {network === 'mainnet-beta' ? 'Mainnet' : network}</span></header>
    <div className="nft-inspector-grid">
      <section className="nft-art-panel" aria-label="Collectible artwork">
        {image && image !== failedImage ? <a className="nft-art-link" href={image} target="_blank" rel="noopener noreferrer" aria-label="Open original artwork"><img src={image} alt={name} referrerPolicy="no-referrer" onError={() => setFailedImage(image)} /><span><ExternalLink size={15} />View original</span></a> : <div className="nft-art-placeholder"><ImageIcon size={42} /><span>Artwork unavailable</span></div>}
      </section>
      <div className="nft-overview">
        <section className="nft-overview-card"><span className="nft-eyebrow">Collectible</span><h1>{name}</h1><p className="nft-collection-name">{item.collectionName || item.collectionSymbol || details.symbol || 'Collection unavailable'}</p>
          <div className="nft-facts"><div><small>Owned</small><strong>{details.amount}</strong></div><div><small>Supply</small><strong>{details.supply ?? 'Unknown'}</strong></div><div><small>Creator royalty</small><strong>{details.sellerFeeBasisPoints == null ? 'Unknown' : `${details.sellerFeeBasisPoints / 100}%`}</strong></div></div>
          <div className="nft-main-actions"><button className="button primary" type="button" onClick={onSend} disabled={!canSend || missionLocksAsset}><SendHorizontal size={17} />Send collectible</button><a href={explorer(details.mint)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Explorer</a></div>
          {!canSend || missionLocksAsset ? <p className="nft-note">{missionLocksAsset ? 'Transfer and marketplace actions wait until this Fox is confirmed free of a mission lock.' : 'Sending is unavailable for this wallet or collectible.'}</p> : null}
        </section>
        <section className="nft-info-panel"><h2>About this collectible</h2>{loading ? <p className="muted" role="status">Loading metadata…</p> : <p>{metadata?.description || 'No description is available for this collectible.'}</p>}<div className="nft-resource-links">{site ? <a href={site} target="_blank" rel="noopener noreferrer">Project website <ExternalLink size={14} /></a> : null}{json ? <a href={json} target="_blank" rel="noopener noreferrer">Metadata JSON <ExternalLink size={14} /></a> : null}</div></section>
        {hasFoxMissions && missions ? <FoxMissionPanel mint={item.mint} {...missions} onLockChange={setMissionLocksAsset} /> : null}
        {!missionLocksAsset ? marketplace : null}
      </div>
      {metadata?.attributes?.length ? <section className="nft-info-panel nft-traits-panel"><h2>Traits <small>{metadata.attributes.length}</small></h2><div className="nft-trait-grid">{metadata.attributes.map((trait, index) => <div key={`${trait.label}:${index}`}><span>{trait.label}</span><strong>{trait.value}</strong></div>)}</div></section> : null}
      <section className="nft-info-panel nft-address-panel"><h2>Collectible details</h2><AddressRow label="Collection" value={item.collectionId} explorer={explorer} /><AddressRow label="Mint" value={details.mint} explorer={explorer} /><AddressRow label="Token account" value={details.accountAddress} explorer={explorer} /><AddressRow label="Metadata account" value={details.metadataPda} explorer={explorer} /></section>
      <details className="nft-info-panel nft-technical-panel"><summary>Technical details<span>Authorities and token data</span></summary><div><AddressRow label="Mint authority" value={details.mintAuthority} explorer={explorer} /><AddressRow label="Freeze authority" value={details.freezeAuthority} explorer={explorer} /><AddressRow label="Update authority" value={details.updateAuthority} explorer={explorer} /><div className="nft-address-row"><span>Decimals</span><strong>{details.decimals}</strong></div><div className="nft-address-row"><span>Mint initialized</span><strong>{details.mintInitialized == null ? 'Unknown' : details.mintInitialized ? 'Yes' : 'No'}</strong></div><div className="nft-address-row"><span>On-chain name</span><strong>{details.metadataName || details.name || 'Unavailable'}</strong></div><div className="nft-address-row"><span>On-chain symbol</span><strong>{details.metadataSymbol || details.symbol || 'Unavailable'}</strong></div></div></details>
    </div>
  </div>;
}

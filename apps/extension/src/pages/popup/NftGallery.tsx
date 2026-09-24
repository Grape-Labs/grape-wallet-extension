import { useMemo, useState, type ReactNode } from 'react';
import { Search, LayoutGrid, Grid2X2, X } from 'lucide-react';
import type { CollectibleItem } from '../../shared/models';

export function NftGallery({ items, renderItem }: { items: CollectibleItem[]; renderItem: (item: CollectibleItem) => ReactNode }) {
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState('');
  const [compact, setCompact] = useState(false);
  const collectionKey = (item: CollectibleItem) => item.collectionId || item.collectionName || 'uncollected';
  const collections = useMemo(() => {
    const groups = new Map<string, { label: string; count: number }>();
    for (const item of items) {
      const key = collectionKey(item);
      const group = groups.get(key) ?? { label: item.collectionName || 'Other collectibles', count: 0 };
      group.count++;
      groups.set(key, group);
    }
    return [...groups].sort((a, b) => b[1].count - a[1].count);
  }, [items]);
  const visible = items.filter(item => (!collection || collectionKey(item) === collection) &&
    [item.name, item.collectionName, item.symbol, item.mint].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <section className={'nft-gallery' + (compact ? ' nft-gallery-compact' : '')} aria-label="NFT gallery">
    <header className="nft-gallery-header">
      <div><span className="dashboard-eyebrow">Your collection</span><h2>Collected works</h2><p>{items.length} collectibles · {collections.length} groups</p></div>
      <div className="nft-gallery-density" aria-label="Gallery layout">
        <button type="button" aria-label="Roomy gallery" title="Roomy gallery" aria-pressed={!compact} onClick={() => setCompact(false)}><Grid2X2 size={18} /></button>
        <button type="button" aria-label="Compact gallery" title="Compact gallery" aria-pressed={compact} onClick={() => setCompact(true)}><LayoutGrid size={18} /></button>
      </div>
    </header>
    <div className="nft-gallery-toolbar">
      <label className="nft-gallery-search"><Search size={17} /><input aria-label="Search NFTs" placeholder="Search art, collections, or mint…" value={query} onChange={e => setQuery(e.target.value)} />{query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button> : null}</label>
      <select aria-label="Filter collection" value={collection} onChange={e => setCollection(e.target.value)}><option value="">All collections</option>{collections.map(([id, group]) => <option key={id} value={id}>{group.label} ({group.count})</option>)}</select>
    </div>
    <div className="nft-gallery-result" role="status">{visible.length === items.length ? 'Explore your gallery' : visible.length + ' matching collectibles'}</div>
    {visible.length ? <div className="collectible-grid">{visible.map(item => <div className="nft-gallery-item" key={item.mint}>{renderItem(item)}</div>)}</div> : <div className="nft-gallery-empty"><h3>No matching collectibles</h3><p>Try another name or collection.</p><button type="button" onClick={() => { setQuery(''); setCollection(''); }}>Reset filters</button></div>}
  </section>;
}

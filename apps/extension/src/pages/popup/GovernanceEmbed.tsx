import { useState } from 'react';
import { ExternalLink, RefreshCcw } from 'lucide-react';

export function GovernanceEmbed({ daoId, name }: { daoId: string; name: string }) {
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const url = `https://www.governance.so/dao/${encodeURIComponent(daoId)}`;
  return <section className="governance-embed" aria-label={`${name} full governance`}>
    <div className="governance-embed-toolbar">
      <div><strong>{name} governance</strong><span>governance.so · Connect with Grape to use your wallet.</span></div>
      <div className="governance-embed-actions">
        <button type="button" onClick={() => { setLoading(true); setReload(value => value + 1); }} aria-label="Reload governance"><RefreshCcw size={15} /></button>
        <a href={url} target="_blank" rel="noopener noreferrer">Open externally <ExternalLink size={14} /></a>
      </div>
    </div>
    {loading ? <p className="muted" role="status">Loading governance.so… If it does not appear, open it externally.</p> : null}
    <iframe
      key={`${daoId}:${reload}`}
      src={url}
      title={`${name} on governance.so`}
      className="governance-embed-frame"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      allow="clipboard-write"
      referrerPolicy="no-referrer"
      onLoad={() => setLoading(false)}
    />
  </section>;
}

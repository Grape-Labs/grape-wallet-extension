import { useEffect, useState } from 'react';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import type { PrivacySnapshot } from '@grape/solana/privacy';
import { sendRuntimeMessage } from '../../shared/chrome';
import { PrivateBalancePanel } from './PrivateBalancePanel';
import { privateSolValuation } from './privateBalanceAmounts';

const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export function PrivateBalanceHome(props: {
  owner: string; network: 'devnet' | 'mainnet-beta'; configuredEndpoint?: string;
  publicUsd: number | null; publicLabel: string; solPrice: number | null;
  hidden: boolean; onPrivateValue: (identity: string, value: number | null) => void;
  onHide: () => Promise<void>;
}) {
  const { owner, network, configuredEndpoint, solPrice, onPrivateValue } = props;
  const [snapshot, setSnapshot] = useState<PrivacySnapshot | null>(null);
  const [loading, setLoading] = useState(!!configuredEndpoint);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState('');
  const identity = `${owner}:${network}`;
  useEffect(() => {
    let cancelled = false;
    if (!configuredEndpoint) { setLoading(false); return; }
    setSnapshot(null); setFailed(false); setLoading(true);
    void sendRuntimeMessage<PrivacySnapshot>({ type: 'wallet_privacy', operation: 'sync', owner, network })
      .then(value => { if (!cancelled) { setSnapshot(value); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [owner, network, configuredEndpoint]);

  const { sol: privateSol, usd: privateUsd, otherAssets } = privateSolValuation(snapshot, solPrice);
  useEffect(() => { onPrivateValue(identity, privateUsd); }, [identity, privateUsd, onPrivateValue]);
  const total = (props.publicUsd ?? 0) + (privateUsd ?? 0);
  const share = props.hidden || privateUsd === null || props.publicUsd === null ? 0 : total > 0 ? Math.min(100, privateUsd! / total * 100) : 0;
  const privateLabel = loading ? 'Loading…' : failed ? 'Refresh' : !snapshot ? 'View balance' : !snapshot.registered ? 'Set up' : privateUsd !== null ? usd(privateUsd) : `${privateSol} SOL${otherAssets ? ' + tokens' : ''}`;

  return <div className="private-home">
    <div className="private-home-allocation" aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
    <div className="private-home-columns">
      <div className="private-home-public"><span className="private-home-label"><i />Public</span><strong>{props.hidden ? '••••' : props.publicLabel}</strong></div>
      <button type="button" className="private-home-private" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Collapse private balance details' : 'Open private balance'}>
        <span className="private-home-label">Private <i /></span><strong>{props.hidden && snapshot?.registered ? '••••' : privateLabel}<ChevronRight size={18} /></strong>
      </button>
    </div>
    {open ? <div className="private-home-details"><div className="private-home-details-title"><LockKeyhole size={16} /><strong>Private balance</strong><button type="button" onClick={() => setOpen(false)}>Collapse details</button></div>
      {hideError ? <p className="danger-box" role="alert">{hideError}</p> : null}
      {loading ? <p className="private-balance-note">Loading private balance…</p> : <PrivateBalancePanel key={identity} owner={owner} network={network} configuredEndpoint={configuredEndpoint} initialSnapshot={snapshot} embedded hideBalances={props.hidden} onSnapshotChange={value => { setSnapshot(value); setFailed(false); }} />}
      <div className="private-home-visibility"><button type="button" disabled={hiding} onClick={async () => {
        setHiding(true); setHideError('');
        try { await props.onHide(); } catch (error) { setHideError(error instanceof Error ? error.message : 'Unable to hide private balance.'); } finally { setHiding(false); }
      }}>{hiding ? 'Removing…' : 'Remove from home'}</button><p>This only hides the section. Your funds and setup remain. Show it again in Settings → Add-ons.</p></div>
    </div> : null}
  </div>;
}

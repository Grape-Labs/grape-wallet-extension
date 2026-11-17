import { ArrowRight, LockKeyhole, Wallet } from 'lucide-react';
import './grape-privacy-flow.css';

/** An illustration of the selected route, never a transaction progress indicator. */
export function GrapePrivacyFlow({ action }: { action: 'deposit' | 'withdraw' | 'transfer' }) {
  const sourcePrivate = action !== 'deposit';
  const targetPrivate = action !== 'withdraw';
  const title = action === 'deposit' ? 'Deposit preview' : action === 'withdraw' ? 'Withdrawal preview' : 'Private send preview';
  const source = sourcePrivate ? 'Your private balance' : 'Public balance';
  const target = action === 'transfer' ? 'Recipient’s private balance' : targetPrivate ? 'Private balance' : 'Public balance';
  const node = (privateBalance: boolean) => <span className={`grape-flow-node${privateBalance ? ' grape-flow-node-private' : ''}`}><Wallet size={21} strokeWidth={1.6} />{privateBalance ? <span className="grape-flow-node-badge"><LockKeyhole size={9} strokeWidth={2} /></span> : null}</span>;
  return <figure className={`grape-flow grape-flow-${action}`} aria-label={`${title}. ${source} to ${target}. Illustration, not transaction progress.`}>
    <div className="grape-flow-eyebrow">{title}</div>
    <div className="grape-flow-route" aria-hidden="true">
      {node(sourcePrivate)}
      <span className="grape-flow-connection" />
      <span className="grape-flow-lock"><LockKeyhole size={27} strokeWidth={1.6} /></span>
      <span className="grape-flow-connection grape-flow-connection-out" />
      {node(targetPrivate)}
    </div>
    <figcaption><span>{source}</span><ArrowRight size={14} aria-hidden="true" /><span>{target}</span></figcaption>
  </figure>;
}

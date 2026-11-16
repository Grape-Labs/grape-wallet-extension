import { PrivateBalanceExplainer } from './PrivateBalanceExplainer';
import { useEffect, useState } from 'react';
import { LockKeyhole, ChevronDown, RefreshCw } from 'lucide-react';
import './private-balance.css';
import { redactRpcDetails } from '@grape/core';
import type { PrivacyAction, PrivacySnapshot } from '@grape/solana/privacy';
import type { PrivacyReview } from '../../background/privacy-rings';
import { sendRuntimeMessage } from '../../shared/chrome';
import { formatLamportsAsSol, formatSolAmount } from './privateBalanceAmounts';
import { GrapePrivacyFlow } from './GrapePrivacyFlow';

const shortAddress = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;
const actionLabels = { register: 'Create private balance', deposit: 'Add SOL', transfer: 'Send SOL', withdraw: 'Withdraw SOL' };

export function PrivateBalancePanel({ owner, network, configuredEndpoint, initialSnapshot, embedded = false, hideBalances = false, onSnapshotChange }: { owner: string; network: 'devnet' | 'mainnet-beta'; configuredEndpoint?: string; initialSnapshot?: PrivacySnapshot | null; embedded?: boolean; hideBalances?: boolean; onSnapshotChange?: (snapshot: PrivacySnapshot | null) => void }) {
  const networkLabel = network === 'mainnet-beta' ? 'Mainnet' : 'Devnet';
  const [snapshot, setSnapshot] = useState<PrivacySnapshot | null>(initialSnapshot ?? null);
  const [action, setAction] = useState<Exclude<PrivacyAction, 'register'>>('deposit');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [review, setReview] = useState<PrivacyReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ signature: string; status: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [open, setOpen] = useState(embedded);
  useEffect(() => { setSnapshot(initialSnapshot ?? null); setReview(null); setResult(null); }, [configuredEndpoint]);

  const run = async (operation: 'sync' | 'prepare' | 'submit') => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const message = {
        type: 'wallet_privacy' as const, owner, network,
        operation,
        action: snapshot?.registered ? action : 'register' as const,
        amount, recipient, previewId: review?.id,
      };
      if (operation === 'sync') {
        setReview(null);
        const synced = await sendRuntimeMessage<PrivacySnapshot & { submission?: { signature: string; status: string } }>(message);
        setSnapshot(synced);
        onSnapshotChange?.(synced);
        if (synced.submission) setResult(synced.submission);
      } else if (operation === 'prepare') {
        setReview(null); setResult(null); setAcknowledged(false);
        setReview(await sendRuntimeMessage<PrivacyReview>(message));
      } else {
        const submitted = await sendRuntimeMessage<{ signature: string; status: string }>(message);
        setResult(submitted); setReview(null); setSnapshot(null);
        onSnapshotChange?.(null);
      }
    } catch (error) {
      setError(error instanceof Error ? redactRpcDetails(error.message) : 'Privacy operation failed.');
    } finally { setBusy(false); }
  };

  const privateSol = snapshot?.balances.find(balance => balance.mint === '11111111111111111111111111111111')?.amount ?? '0';
  const privacyNote = action === 'transfer'
    ? 'Amount and asset stay private. Both wallet addresses remain visible.'
    : 'The amount and asset are public when adding or withdrawing SOL.';

  return <section className={`private-balance${embedded ? ' private-balance-embedded' : ''}`} aria-label="Private balance">
    {!embedded ? <button type="button" className="private-balance-heading" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className="private-balance-icon"><LockKeyhole size={20} /></span>
      <span className="private-balance-heading-copy"><strong>Private balance</strong><small>Encrypted SOL for your current wallet</small></span>
      <ChevronDown size={18} className={open ? 'is-open' : ''} />
    </button> : null}
    {open ? <div className="private-balance-content">
      <div className="private-balance-context"><span>{networkLabel}</span><span className="mono">{shortAddress(owner)}</span></div>
      {!review ? <>
        {snapshot?.registered ? <>
          <div className="private-balance-total"><span>Private SOL</span><strong>{hideBalances ? '••••' : formatLamportsAsSol(privateSol)} <small>SOL</small></strong>
            <button type="button" className="private-balance-refresh" aria-label="Refresh private balance" disabled={busy} onClick={() => void run('sync')}><RefreshCw size={15} /></button>
          </div>
          <div className="private-balance-actions" role="group" aria-label="Private balance action">
            {(['deposit', 'transfer', 'withdraw'] as const).map(value => <button type="button" key={value} aria-pressed={action === value} disabled={busy} onClick={() => { setAction(value); setReview(null); }}>{value === 'deposit' ? 'Add' : value === 'transfer' ? 'Send' : 'Withdraw'}</button>)}
          </div>
          <div className="private-balance-workspace">
          <GrapePrivacyFlow key={action} action={action} />
          <div className="private-balance-form">
          <label className="private-balance-field"><span>Amount</span><div className="private-balance-amount"><input aria-label="Amount in SOL" inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /><strong>SOL</strong></div></label>
          {action !== 'deposit' ? <label className="private-balance-field"><span>Recipient</span><input placeholder="Solana address" value={recipient} disabled={busy} onChange={event => setRecipient(event.target.value.trim())} /></label> : null}
          <p className="private-balance-note">{privacyNote}</p>
          <button type="button" className="button primary" disabled={busy || !amount || (action !== 'deposit' && !recipient)} onClick={() => void run('prepare')}>{busy ? 'Preparing…' : `Review ${action === 'deposit' ? 'deposit' : action === 'transfer' ? 'send' : 'withdrawal'}`}</button>
          {snapshot.balances.filter(balance => balance.mint !== '11111111111111111111111111111111').map(balance => <div key={balance.mint} className="private-balance-row"><span className="mono">{shortAddress(balance.mint)}</span><span>{balance.amount} base units</span></div>)}
          </div></div>
        </> : snapshot ? <div className="private-balance-empty"><LockKeyhole size={28} /><strong>Create your private balance</strong><p>Keep SOL in an encrypted balance. Setup does not move any funds.</p><button type="button" className="button primary" disabled={busy} onClick={() => void run('prepare')}>{busy ? 'Preparing…' : 'Set up private balance'}</button></div>
          : <div className="private-balance-empty"><p>View your encrypted SOL balance.</p><button type="button" className="button primary" disabled={busy || !configuredEndpoint} onClick={() => void run('sync')}>{busy ? 'Loading…' : 'View balance'}</button></div>}
      </> : <div className="private-balance-review" role="region" aria-label="Review privacy transaction">
        <strong>{actionLabels[review.action]}</strong>
        {review.action !== 'register' ? <GrapePrivacyFlow action={review.action} /> : null}
        <div className="private-balance-review-amount">{formatSolAmount(review.amount)} <small>SOL</small></div>
        <div className="private-balance-row"><span>Wallet</span><span className="mono">{shortAddress(review.owner)}</span></div>
        <div className="private-balance-row"><span>To</span>{review.recipient === owner ? <span>Your wallet · <span className="mono">{shortAddress(owner)}</span></span> : <details className="private-balance-address"><summary className="mono">{shortAddress(review.recipient)}</summary><span className="mono">{review.recipient}</span></details>}</div>
        <div className="private-balance-row"><span>Network</span><span>{review.network === 'mainnet-beta' ? 'Mainnet · Real SOL' : 'Devnet'}</span></div>
        <div className="private-balance-row"><span>Network fee</span><span>{formatLamportsAsSol(review.feeLamports)} SOL</span></div>
        <div className="private-balance-row"><span>Estimated public debit</span><span>{formatLamportsAsSol(review.debitLamports)} SOL</span></div>
        <p className="private-balance-note">Includes network and setup costs. {review.action === 'transfer' ? 'Amount and asset stay private; addresses remain visible.' : review.action === 'register' ? 'Creates your balance without a deposit.' : 'Amount and asset are public for this transaction.'}</p>
        <label className="private-balance-ack"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} /><span>I’ve reviewed the recipient, costs and privacy details.</span></label>
        <button type="button" className="button primary" disabled={busy || !acknowledged || formatSolAmount(review.amount) === '—' || formatLamportsAsSol(review.feeLamports) === '—' || formatLamportsAsSol(review.debitLamports) === '—' || Date.now() >= review.expiresAt} onClick={() => void run('submit')}>{busy ? 'Submitting…' : 'Confirm'}</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setReview(null)}>Back</button>
      </div>}
      <PrivateBalanceExplainer />
      <details className="private-balance-info"><summary>What stays private?</summary><p>Balances, assets and transfer amounts are encrypted. Sender and recipient addresses remain public. Deposits and withdrawals reveal the asset and amount.</p></details>
      {!configuredEndpoint ? <p className="private-balance-note">Private balance is unavailable on this network.</p> : null}
      {result ? <p className="private-balance-note" role="status">{result.status === 'unknown' ? 'Status uncertain. Check this transaction before retrying.' : result.status === 'confirmed' ? 'Transaction confirmed.' : result.status === 'failed' ? 'Transaction failed.' : 'Submitted. Refresh after confirmation.'} <a href={`https://orbmarkets.io/tx/${result.signature}${network === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer">View transaction</a></p> : null}
      {error ? <p className="danger-box" role="alert">{error}</p> : null}
    </div> : null}
  </section>;
}

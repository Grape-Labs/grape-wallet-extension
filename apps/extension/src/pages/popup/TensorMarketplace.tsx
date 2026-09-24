import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCcw, LoaderCircle } from 'lucide-react';
import { tensorItemUrl } from '../../shared/tensor';
import { sendRuntimeMessage } from '../../shared/chrome';
import type { TensorStatus, TensorPreview, TensorResult } from '../../shared/tensor-types';

const sol = (lamports: string | number) => (Number(lamports) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 });
type Props = { mint: string; owner: string; network: 'mainnet-beta' | 'devnet'; watchOnly: boolean; unlocked: boolean; onChanged?: () => void };

export function TensorMarketplace({ mint, owner, network, watchOnly, unlocked, onChanged }: Props) {
  const [status, setStatus] = useState<TensorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState('');
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<TensorPreview | null>(null);
  const [result, setResult] = useState<TensorResult | null>(null);
  const [error, setError] = useState('');
  const url = tensorItemUrl(mint, network);
  async function refresh() {
    setLoading(true); setError(''); setPreview(null);
    try { setStatus(await sendRuntimeMessage<TensorStatus>({ type: 'wallet_tensor_status', mint, owner })); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to load listing.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!url || !owner) return;
    let cancelled = false;
    setLoading(true);
    void sendRuntimeMessage<TensorStatus>({ type: 'wallet_tensor_status', mint, owner }).then(value => { if (!cancelled) setStatus(value); })
      .catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mint, owner, url]);
  async function review(action: 'list' | 'cancel') {
    setBusy(true); setError(''); setPreview(null); setResult(null);
    try { setPreview(await sendRuntimeMessage<TensorPreview>({ type: 'wallet_tensor_preview', mint, owner, action, price: action === 'list' ? price : undefined })); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to prepare transaction.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true); setError('');
    const id = preview.id;
    setPreview(null);
    try {
      const response = await sendRuntimeMessage<TensorResult>({ type: 'wallet_tensor_execute', previewId: id, owner, password: unlocked ? undefined : password || undefined });
      setResult(response); setPassword('');
      await refresh();
      onChanged?.();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to submit transaction.'); }
    finally { setBusy(false); }
  }
  if (!url) return null;
  return <section className="tensor-marketplace" aria-label="Tensor marketplace">
    <div className="tensor-marketplace-heading"><div><span className="dashboard-eyebrow">Tensor marketplace</span><h2>{status?.listing ? 'Manage listing' : 'List your NFT'}</h2></div>
      <button type="button" className="mini-icon-button subtle" title="Refresh listing" aria-label="Refresh listing" disabled={busy || loading} onClick={() => void refresh()}>{loading ? <LoaderCircle size={18} className="tensor-loading" /> : <RefreshCcw size={18} />}</button>
    </div>
    {loading ? <p role="status">Checking on-chain listing…</p> : null}
    {status?.listing ? <p>Listed for <strong>{status.listing.currency ? status.listing.priceLamports + ' base units' : sol(status.listing.priceLamports) + ' SOL'}</strong>{status.listing.expiry > 0 ? ' · Expires ' + new Date(status.listing.expiry * 1000).toLocaleString() : ''}</p> : null}
    {!loading && status && !status.supported ? <p>{status.reason}</p> : null}
    {status?.supported && !watchOnly && !loading && !preview ? <div className="tensor-list-form">
      {!status.listing ? <><label>Listing price (SOL)<input type="text" inputMode="decimal" placeholder="0.00" value={price} disabled={busy} onChange={e => setPrice(e.target.value)} /></label><small>Fixed price · 7-day listing. The NFT moves to Tensor escrow until sold or cancelled. The price is before marketplace fees and any royalties.</small></> : null}
      <button type="button" className="button primary" disabled={busy || (!status.listing && !price.trim())} onClick={() => void review(status.listing ? 'cancel' : 'list')}>{busy ? 'Preparing…' : status.listing ? 'Review cancellation' : 'Review listing'}</button>
    </div> : null}
    {preview ? <div className="tensor-review">
      <h3>{preview.action === 'list' ? 'Review listing' : 'Review cancellation'}</h3>
      {preview.priceLamports ? <p>Listing price: <strong>{sol(preview.priceLamports)} SOL</strong></p> : <p>Return the NFT from Tensor escrow to this wallet.</p>}
      <p>Network fee: {sol(preview.networkFeeLamports)} SOL</p>
      <p>Estimated wallet debit, including account rent: {sol(preview.estimatedDebitLamports)} SOL</p>
      <small>Simulation passed. Review expires shortly; actual network costs may vary.</small>
      {!unlocked ? <label>Wallet password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label> : null}
      <div className="inline"><button type="button" className="button secondary" disabled={busy} onClick={() => setPreview(null)}>Back</button><button type="button" className="button primary" disabled={busy || (!unlocked && !password)} onClick={() => void confirm()}>{busy ? 'Signing…' : preview.action === 'list' ? 'Confirm listing' : 'Confirm cancellation'}</button></div>
    </div> : null}
    {error ? <p className="danger-box" role="alert">{error}</p> : null}
    {result ? <div role="status"><p>{result.confirmed ? 'Transaction confirmed.' : result.error}</p><a href={'https://explorer.solana.com/tx/' + result.signature} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={12} /></a></div> : null}
    {watchOnly ? <small>Connect the wallet that owns this NFT to list or cancel.</small> : null}
    <a className="tensor-marketplace-link" href={url} target="_blank" rel="noopener noreferrer">View on Tensor <ExternalLink size={16} /></a>
  </section>;
}

export function TensorListings({ owner, unlocked, watchOnly }: Omit<Props, 'mint' | 'network'>) {
  const [items, setItems] = useState<TensorStatus[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void sendRuntimeMessage<TensorStatus[]>({ type: 'wallet_tensor_listings', owner }).then(result => { if (!cancelled) { setItems(result); setError(''); } })
      .catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [owner, refreshIndex]);
  const listedItems = items.filter(item => item.owner === owner && item.listing?.owner === owner);
  const selectedListing = listedItems.find(item => item.mint === selected);
  if (!listedItems.length) return null;
  return <section className="tensor-saved-listings"><div className="tensor-marketplace-heading"><h3>Listings created in Grape</h3><button type="button" className="mini-icon-button subtle" aria-label="Refresh saved listings" onClick={() => setRefreshIndex(i => i + 1)}><RefreshCcw size={16} /></button></div>
    {error ? <p role="alert">{error}</p> : null}
    <div className="tensor-saved-list"><button type="button" hidden={!selectedListing} onClick={() => setSelected('')}>Close listing details</button>{listedItems.map(item => <button type="button" key={item.mint} onClick={() => setSelected(item.mint)}>{item.name || item.mint.slice(0, 6) + '…' + item.mint.slice(-4)}<span>Listed</span></button>)}</div>
    {selectedListing ? <TensorMarketplace key={owner + selected} owner={owner} mint={selected} network="mainnet-beta" unlocked={unlocked} watchOnly={watchOnly} onChanged={() => setRefreshIndex(i => i + 1)} /> : null}
  </section>;
}

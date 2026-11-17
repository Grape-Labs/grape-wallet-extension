import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { redactRpcDetails } from '@grape/core';
import { sendRuntimeMessage } from '../../shared/chrome';
import type { CollectibleItem } from '../../shared/models';
import { compareNftReport, defaultNftReportAssumptions, nftReportCsvCell, type NftReportAssumptions, type NftReportInspection } from '../../shared/nft-report';
import './nft-report.css';
const sol = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString(undefined, { maximumFractionDigits: 9 }) + ' SOL';
type Entry = { item: CollectibleItem; data?: NftReportInspection; error?: string };
export function NftValueReport({ items, owner, onInspect, open, onClose, panelId }: { items: CollectibleItem[]; owner: string; onInspect: (item: CollectibleItem) => void; open: boolean; onClose: () => void; panelId: string }) {
  const [running, setRunning] = useState(false), [entries, setEntries] = useState<Entry[]>([]);
  const [assumptions, setAssumptions] = useState<NftReportAssumptions>(defaultNftReportAssumptions);
  const [filter, setFilter] = useState('all');
  const generation = useRef(0);
  useEffect(() => { generation.current++; setEntries([]); setRunning(false); return () => { generation.current++; }; }, [owner, items]);
  const valid = Number.isFinite(assumptions.marketFeePercent) && assumptions.marketFeePercent >= 0 && assumptions.marketFeePercent <= 100 && Number.isFinite(assumptions.fallbackRoyaltyPercent) && assumptions.fallbackRoyaltyPercent >= 0 && assumptions.fallbackRoyaltyPercent <= 100 && Number.isFinite(assumptions.networkCostSol) && assumptions.networkCostSol >= 0;
  const comparisons = entries.map(entry => ({ ...entry, comparison: entry.data && valid ? compareNftReport(entry.data, assumptions) : null }));
  const inspected = entries.filter(e => e.data).length;
  const knownFloors = entries.filter(e => e.data?.market.floorPriceSol != null);
  const rentKnown = entries.filter(e => e.data?.tokenAccountRentLamports != null);
  const visible = comparisons.filter(e => filter === 'all' || (filter === 'unpriced' ? !e.data || e.data.market.floorPriceSol === null : filter === 'rent' ? e.comparison?.assessment === 'Compare rent recovery' : !!e.data?.restriction));
  async function generate() {
    const id = ++generation.current;
    setRunning(true); setEntries([]); setFilter('all');
    const unique = [...new Map(items.map(item => [item.mint, item])).values()];
    let next = 0;
    async function worker() {
      while (id === generation.current && next < unique.length) {
        const item = unique[next++];
        let entry: Entry;
        try { entry = { item, data: await sendRuntimeMessage<NftReportInspection>({ type: 'wallet_nft_report', mint: item.mint, owner }) }; }
        catch (error) { entry = { item, error: redactRpcDetails(error instanceof Error ? error.message : 'Inspection unavailable.') }; }
        if (id === generation.current) setEntries(previous => [...previous, entry]);
      }
    }
    await Promise.all([worker(), worker()]);
    if (id === generation.current) setRunning(false);
  }
  function cancel() { generation.current++; setRunning(false); }
  function download() {
    const rows: unknown[][] = [['NFT', 'Mint', 'Inspected UTC', 'Floor SOL (not an offer)', 'Last indexed sale SOL', 'Sale date UTC', 'Scenario sale net SOL', 'Token-account rent SOL (subset)', 'Scenario rent net SOL', 'Royalty percent', 'Market fee percent assumption', 'Network SOL assumption per action', 'Assessment', 'Notes']];
    for (const e of comparisons) rows.push([e.item.name || 'Collectible', e.item.mint, e.data ? new Date(e.data.fetchedAt).toISOString() : '', e.data?.market.floorPriceSol, e.data?.market.lastSale?.priceSol, e.data?.market.lastSale ? new Date(e.data.market.lastSale.timestamp * 1000).toISOString() : '', e.comparison?.saleNetSol, e.data?.tokenAccountRentLamports == null ? null : e.data.tokenAccountRentLamports / 1e9, e.comparison?.rentNetSol, e.comparison?.royaltyPercent, assumptions.marketFeePercent, assumptions.networkCostSol, e.comparison?.assessment || 'Inspection unavailable', [e.error, e.data?.restriction, ...(e.data?.notes ?? []), ...(e.data?.market.warnings ?? [])].filter(Boolean).join(' ') ]);
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(nftReportCsvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `grape-nft-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!open) return null;
  return <section className="nft-value-report" id={panelId} aria-label="NFT value and rent report">
    <header className="nft-report-heading"><h3>Value & rent report</h3><button type="button" aria-label="Close NFT report" onClick={onClose}><X size={17} /></button></header>
    <div className="nft-report-body">
      <p>This read-only report checks {items.length} collectibles currently shown in your wallet. Floors are asking prices, not executable offers. No price means unknown value. Consider rarity, membership and mission utility before selling or permanently burning.</p>
      <div className="nft-report-controls"><button type="button" className="button primary" disabled={running} onClick={() => void generate()}><RefreshCw size={15} />{entries.length ? 'Refresh report' : 'Generate report'}</button>{running ? <button type="button" className="button secondary" onClick={cancel}><X size={15} />Stop scan</button> : null}{entries.length ? <button type="button" className="button secondary" disabled={!valid} onClick={download}><Download size={15} />Export CSV</button> : null}<span role="status">{entries.length ? `${entries.length} checked${running ? ' · scanning…' : ''}` : running ? 'Reading market and on-chain data…' : 'Starts only when requested.'}</span></div>
      {entries.length ? <>
        <div className="nft-report-summary"><div><small>Indexed floor total · {knownFloors.length}/{inspected} priced</small><strong>{knownFloors.length ? sol(knownFloors.reduce((sum, e) => sum + e.data!.market.floorPriceSol!, 0)) : 'Unknown'}</strong></div><div><small>Token-account rent subset · {rentKnown.length} accounts</small><strong>{rentKnown.length ? sol(rentKnown.reduce((sum, e) => sum + e.data!.tokenAccountRentLamports! / 1e9, 0)) : 'Unknown'}</strong></div></div>
        <details className="nft-report-assumptions"><summary>Comparison assumptions & limitations</summary><div className="nft-report-inputs"><label>Marketplace fee %<input type="number" min="0" max="100" step="0.1" value={Number.isNaN(assumptions.marketFeePercent) ? '' : assumptions.marketFeePercent} onChange={e => setAssumptions({ ...assumptions, marketFeePercent: e.target.valueAsNumber })} /></label><label>Royalty % when unknown<input type="number" min="0" max="100" step="0.1" value={Number.isNaN(assumptions.fallbackRoyaltyPercent) ? '' : assumptions.fallbackRoyaltyPercent} onChange={e => setAssumptions({ ...assumptions, fallbackRoyaltyPercent: e.target.valueAsNumber })} /></label><label>Cost per action · SOL<input type="number" min="0" step="0.00001" value={Number.isNaN(assumptions.networkCostSol) ? '' : assumptions.networkCostSol} onChange={e => setAssumptions({ ...assumptions, networkCostSol: e.target.valueAsNumber })} /></label></div><p>Defaults are assumptions, not fee quotes. Sale net = floor less marketplace fee, creator royalty and action cost. On-chain creator royalty is used when available. Rent net = token-account SOL less action cost. Full Metaplex burns can refund additional metadata/edition rent; this report excludes it and mint rent. Compressed, Core and Token-2022 rent is not estimated. Setup, extra transactions and price slippage can change the result.</p><p>Market data: Magic Eden; cached for up to one minute. Last sale is for this mint, from up to 300 indexed activities, and may be old. The report covers the loaded gallery, not NFTs escrowed outside your wallet. <a href="https://www.metaplex.com/docs/smart-contracts/token-metadata/burn" target="_blank" rel="noopener noreferrer">How Metaplex burns work</a></p></details>
        {!valid ? <p role="alert">Use percentages from 0 to 100 and a nonnegative action cost to compare or export.</p> : null}
        <label className="nft-report-filter">Show<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All inspected NFTs</option><option value="unpriced">Unpriced / unavailable</option><option value="rent">Compare rent recovery</option><option value="restricted">Restricted / locked</option></select></label>
        <div className="nft-report-rows">{visible.map(e => <article className="nft-report-row" key={e.item.mint}><header><div><h3>{e.item.name || 'Collectible'}</h3><small>{e.item.mint.slice(0, 5)}…{e.item.mint.slice(-5)}</small></div><button type="button" className="button secondary" onClick={() => onInspect(e.item)}>Review NFT</button></header>{e.data ? <><span className="nft-report-assessment">{e.comparison?.assessment || 'Check assumptions'}</span><dl><div><dt>Collection floor</dt><dd>{sol(e.data.market.floorPriceSol)}</dd></div><div><dt>Last indexed sale</dt><dd>{sol(e.data.market.lastSale?.priceSol ?? null)}{e.data.market.lastSale ? <small>{new Date(e.data.market.lastSale.timestamp * 1000).toLocaleDateString()}</small> : null}</dd></div><div><dt>Sale net · scenario</dt><dd>{sol(e.comparison?.saleNetSol ?? null)}</dd></div><div><dt>Rent net · subset scenario</dt><dd>{sol(e.comparison?.rentNetSol ?? null)}</dd></div></dl><p>{e.data.restriction || (e.comparison?.assessment === 'Compare rent recovery' ? 'The floor scenario is below token-account rent. Check live offers, utility and additional burn refunds before deciding.' : 'Review current offers and the full transaction costs before deciding.')}</p><details><summary>Sources & inspection notes</summary><p>Inspected {new Date(e.data.fetchedAt).toLocaleString()}. Market fetched {new Date(e.data.market.fetchedAt).toLocaleString()}. Royalty {e.comparison?.royaltyPercent ?? '—'}% {e.data.royaltyBps === null ? '(assumed)' : '(on-chain)'}.</p>{[...e.data.notes, ...e.data.market.warnings].map((note, i) => <p key={i}>{note}</p>)}</details></> : <p role="alert">{e.error}</p>}</article>)}</div>
        {!visible.length ? <p>No inspected NFTs match this filter.</p> : null}
        <p className="nft-report-footnote">This report does not sell or burn anything. Burning is permanent; inspect the NFT and a fresh transaction preview before taking action.</p>
      </> : null}
    </div>
  </section>;
}

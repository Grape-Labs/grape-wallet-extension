import { useEffect, useMemo, useState } from 'react';
import { HoudiniClient, privateSendCost, depositProblem, depositAmount, findOpenPrivateSend, matchingAsset, orderIsOpen, orderStatus, type HoudiniAsset, type HoudiniOrder, type HoudiniStorage } from '../../../../../packages/houdini/src/client';
const storage: HoudiniStorage = {
  async getItem(key) { return (await chrome.storage.local.get(key))[key] ?? null; },
  async setItem(key, value) { await chrome.storage.local.set({ [key]: value }); }
};
export function HoudiniSwapPanel({ endpoint, owner, assets, onFund, onBack, onUsePublic, privateSend }: { endpoint: string; owner: string; assets: HoudiniAsset[]; onFund(asset: HoudiniAsset, entry: HoudiniOrder): void; onBack(): void; onUsePublic?: () => void; privateSend?: { asset: HoudiniAsset; amount: string; recipient: string } }) {
  const client = useMemo(() => new HoudiniClient(endpoint, owner, storage, privateSend ? 'private' : 'standard'), [endpoint, owner, !!privateSend]);
  const [state, setState] = useState(client.state);
  const [term, setTerm] = useState('');
  const [side, setSide] = useState<'from' | 'to'>('from');
  const loadPrivateQuote = async () => { if (!privateSend) return; await client.preparePrivateSend(privateSend.asset, privateSend.amount, privateSend.recipient); await client.quote(); };
  useEffect(() => { setState(client.state); const unsubscribe = client.subscribe(() => setState(client.state)); void client.start().then(async () => { if (privateSend && !findOpenPrivateSend(client.state.orders, privateSend.asset, privateSend.amount, privateSend.recipient)) await loadPrivateQuote(); }); return () => { unsubscribe(); client.stop(); }; }, [client]);
  const visibleOrders = state.orders.filter(entry => privateSend ? entry.mode === 'private' && orderIsOpen(entry) : true);
  const existingPrivateSend = privateSend ? findOpenPrivateSend(state.orders, privateSend.asset, privateSend.amount, privateSend.recipient) : undefined;
  return <section className="houdini-panel">
    <div className="houdini-header"><button className="houdini-back" type="button" onClick={onBack} aria-label="Back to Send">←</button><h2>{privateSend ? 'Private send' : 'Houdini swap'}</h2></div>
    <p className="muted houdini-intro">{privateSend ? 'Send through Houdini exchange partners to reduce the direct on-chain link.' : 'Swap through an exchange partner using a one-time deposit. No contract approvals.'}</p>
    {privateSend ? <article className="houdini-private-summary"><div><span className="muted">You send</span><strong>{privateSend.amount} {privateSend.asset.symbol}</strong></div><div><span className="muted">Recipient</span><strong className="mono" title={privateSend.recipient}>{privateSend.recipient}</strong></div></article> : null}
    {existingPrivateSend ? <p className="warning-box">An active order already exists for this send. Continue with that order below.</p> : null}
    {!privateSend ? <>
    <div className="houdini-token-pair">
      <button disabled={state.busy} onClick={() => setSide('from')}>From: {state.from ? `${state.from.symbol} · ${state.from.chainData.name}` : 'Choose token'}</button>
      <button disabled={state.busy} onClick={() => setSide('to')}>To: {state.to ? `${state.to.symbol} · ${state.to.chainData.name}` : 'Choose token'}</button>
    </div>
    <form onSubmit={e => { e.preventDefault(); void client.search(term); }}><label>Find {side === 'from' ? 'input' : 'output'} token<input value={term} onChange={e => setTerm(e.target.value)} placeholder="Symbol or token address" /></label><button disabled={!term.trim() || state.busy}>Search</button></form>
    <div className="houdini-results">{state.results.filter(token => side === 'to' || matchingAsset(token, assets)).map(token => <button disabled={state.busy} key={token.id} onClick={() => { client.change({ [side]: token }); setTerm(''); }}><strong>{token.symbol}</strong> · {token.chainData.name}<small>{token.address || 'Native token'}</small></button>)}</div>
    <p className="muted">Input tokens must be held by this wallet. Networks requiring memos are not available yet.</p>
    <label>Amount<input disabled={state.busy} inputMode="decimal" value={state.amount} onChange={e => client.change({ amount: e.target.value })} /></label>
    <label>Receiving address on {state.to?.chainData.name ?? 'destination network'}<input disabled={state.busy} value={state.recipient} onChange={e => client.change({ recipient: e.target.value })} autoComplete="off" /></label>
    {state.to && assets.some(a => a.chain === state.to?.chainData.shortName) ? <button disabled={state.busy} onClick={() => client.change({ recipient: owner })}>Use this wallet</button> : null}
    </> : null}
    {!privateSend || state.error ? <button className="houdini-primary" disabled={!state.ready || state.busy || (!privateSend && (!state.from || !state.to || !state.amount || !state.recipient))} onClick={() => void (privateSend ? loadPrivateQuote() : client.quote())}>{state.busy ? 'Finding route…' : state.error && privateSend ? 'Try again' : 'Get quotes'}</button> : state.busy ? <p className="muted houdini-loading">Finding the best private route…</p> : null}
    {state.error ? <div role="alert" className="danger-box houdini-error"><strong>{state.error}</strong>{privateSend && onUsePublic ? <button type="button" onClick={onUsePublic}>Use Public send</button> : null}</div> : null}
    {state.quotes.map(quote => <article key={quote.quoteId} className="houdini-order"><strong>Recipient gets approximately {quote.amountOut} {state.to?.symbol}</strong>{privateSend && privateSendCost(state.amount, quote.amountOut) !== null ? <p>Estimated route cost: {privateSendCost(state.amount, quote.amountOut)} {state.from?.symbol}</p> : null}<p>{quote.provider}{quote.duration ? ` · about ${quote.duration} min` : ''}</p><p className="muted">Provider fees are reflected in the quote. Deposit network fees are additional. Floating output may change.</p><p className="mono">To: {state.recipient}</p><button disabled={state.busy} onClick={() => void client.create(quote)}>{privateSend ? 'Create private send order' : 'Create swap order'}</button></article>)}
    {visibleOrders.length ? <h3>{privateSend ? 'Active Houdini order' : 'Your Houdini orders'}</h3> : null}
    {!privateSend && !visibleOrders.length ? <p className="muted">Orders appear here and remain available when you reopen Swap.</p> : null}
    {visibleOrders.map(entry => <article className="houdini-order" key={entry.order.houdiniId}>
      <strong>{entry.mode === 'private' ? 'Private send · ' : 'Standard swap · '}{entry.from.symbol} → {entry.to.symbol} · {orderStatus(entry.order.status)}</strong>
      <p>Send exactly {depositAmount(entry)} {entry.from.symbol} on {entry.from.chainData.name}</p>
      <p className="mono">Deposit: {entry.order.depositAddress || 'Preparing…'}</p>
      {entry.order.depositTag ? <p>Required memo: {entry.order.depositTag}</p> : null}
      <p className="mono">Recipient: {entry.recipient}</p><p>Output: {entry.order.outAmount} {entry.to.symbol}</p>
      <p className="muted">Deposit expiry: {new Date(entry.order.expires).toLocaleString()}</p>
      <p className="mono">Order: {entry.order.houdiniId}</p>
      {entry.order.outTransactionOutHash ? <p className="mono">Delivery transaction: {entry.order.outTransactionOutHash}</p> : null}
      {entry.order.status === 0 ? <><p className="warning-box"><strong>No funds have moved yet.</strong> Deposit exactly {depositAmount(entry)} {entry.from.symbol} before expiry to start this private transfer.</p><button className="houdini-primary" disabled={state.busy || !!depositProblem(entry) || !matchingAsset(entry.from, assets)} onClick={() => void client.run(async () => { const fresh = await client.refresh(entry); const problem = depositProblem(fresh); if (problem) throw new Error(problem); const asset = matchingAsset(fresh.from, assets); if (!asset) throw new Error('Switch to the wallet holding the input token.'); onFund(asset, fresh); })}>Deposit {depositAmount(entry)} {entry.from.symbol}</button>{depositProblem(entry) ? <p className="muted">{depositProblem(entry)}</p> : null}</> : null}
      <button disabled={state.busy} onClick={() => void client.run(async () => { await client.refresh(entry); })}>Refresh status</button>
      <a href="https://houdiniswap.com" target="_blank" rel="noreferrer">Houdini support</a>
    </article>)}
  </section>;
}

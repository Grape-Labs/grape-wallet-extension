import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, Check, RefreshCw } from 'lucide-react';

import {
  HoudiniClient,
  depositAmount,
  depositProblem,
  matchingAsset,
  orderIsOpen,
  orderStatus,
  type HoudiniAsset,
  type HoudiniOrder,
  type HoudiniStorage
} from '../../../../../packages/houdini/src/client';

const storage: HoudiniStorage = {
  async getItem(key) { return (await chrome.storage.local.get(key))[key] ?? null; },
  async setItem(key, value) { await chrome.storage.local.set({ [key]: value }); }
};

export function HoudiniZcashBridgePanel(props: {
  endpoint: string;
  owner: string;
  asset: HoudiniAsset;
  recipient: string;
  onBack(): void;
  onFund(asset: HoudiniAsset, entry: HoudiniOrder): void;
}) {
  const client = useMemo(
    () => new HoudiniClient(props.endpoint, props.owner, storage, 'standard'),
    [props.endpoint, props.owner]
  );
  const [state, setState] = useState(client.state);

  useEffect(() => {
    setState(client.state);
    const unsubscribe = client.subscribe(() => setState(client.state));
    void client.start().then(() => client.prepareCrossChain(
      props.asset,
      { symbol: 'ZEC', chain: 'zcash' },
      props.recipient
    ));
    return () => {
      unsubscribe();
      client.stop();
    };
  }, [client, props.asset.address, props.asset.chain, props.asset.id, props.asset.native, props.asset.symbol, props.recipient]);

  const orders = state.orders.filter((entry) =>
    entry.mode !== 'private' &&
    entry.to.symbol.toLowerCase() === 'zec' &&
    entry.to.chainData.shortName.toLowerCase() === 'zcash' &&
    entry.recipient === props.recipient &&
    (orderIsOpen(entry) || entry.order.status === 4)
  );

  return (
    <section className="zcash-bridge-panel">
      <header className="send-flow-header zcash-bridge-header">
        <button type="button" className="send-back-button" onClick={props.onBack} aria-label="Back to bridge">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2>Bridge to Zcash</h2>
          <span>Powered by Houdini exchange routing</span>
        </div>
      </header>

      <div className="zcash-bridge-route">
        <div className="zcash-bridge-asset">
          <span className="zcash-bridge-symbol">{props.asset.symbol.slice(0, 1)}</span>
          <div><small>You send</small><strong>{props.asset.symbol}</strong></div>
        </div>
        <span className="zcash-bridge-arrow"><ArrowDown size={18} /></span>
        <div className="zcash-bridge-asset">
          <span className="zcash-bridge-symbol zcash">Z</span>
          <div><small>You receive</small><strong>ZEC</strong></div>
        </div>
      </div>

      <label className="zcash-bridge-amount">
        <span>Amount</span>
        <div>
          <input
            value={state.amount}
            onChange={(event) => client.change({ amount: event.target.value })}
            placeholder="0"
            inputMode="decimal"
            disabled={state.busy}
            aria-label={`Amount in ${props.asset.symbol}`}
          />
          <strong>{props.asset.symbol}</strong>
        </div>
      </label>

      <div className="zcash-bridge-recipient">
        <span>Destination</span>
        <strong>Zcash wallet</strong>
        <code title={props.recipient}>{props.recipient}</code>
      </div>

      <p className="zcash-bridge-note">
        This creates an exchange order. You review and fund its one-time deposit address before any funds move.
      </p>

      {state.error ? <p role="alert" className="danger-box">{state.error}</p> : null}

      {state.quotes.length === 0 ? (
        <button
          type="button"
          className="houdini-primary zcash-bridge-primary"
          disabled={!state.ready || state.busy || !state.from || !state.to || !state.amount.trim()}
          onClick={() => void client.quote()}
        >
          {state.busy ? 'Checking route…' : 'Review ZEC route'}
        </button>
      ) : (
        <div className="zcash-bridge-quotes">
          {state.quotes.map((quote) => (
            <article key={quote.quoteId} className="zcash-bridge-quote">
              <div><span>Estimated arrival</span><strong>{quote.amountOut} ZEC</strong></div>
              <p>{quote.provider}{quote.duration ? ` · about ${quote.duration} min` : ''}</p>
              <button type="button" disabled={state.busy} onClick={() => void client.create(quote)}>
                Create deposit order
              </button>
            </article>
          ))}
        </div>
      )}

      {orders.map((entry) => {
        const problem = depositProblem(entry);
        const delivered = entry.order.status === 4;
        return (
          <article className="zcash-bridge-order" key={entry.order.houdiniId}>
            <div className="zcash-bridge-order-title">
              <span className={delivered ? 'delivered' : ''}>{delivered ? <Check size={16} /> : <RefreshCw size={16} />}</span>
              <div><small>Order {entry.order.houdiniId}</small><strong>{orderStatus(entry.order.status)}</strong></div>
            </div>
            <div className="zcash-bridge-order-grid">
              <span>Deposit</span><strong>{depositAmount(entry)} {entry.from.symbol}</strong>
              <span>Receive</span><strong>{entry.order.outAmount} ZEC</strong>
            </div>
            {entry.order.status === 0 ? (
              <button
                type="button"
                className="houdini-primary zcash-bridge-primary"
                disabled={state.busy || !!problem || !matchingAsset(entry.from, [props.asset])}
                onClick={() => void client.run(async () => {
                  const fresh = await client.refresh(entry);
                  const nextProblem = depositProblem(fresh);
                  if (nextProblem) throw new Error(nextProblem);
                  const asset = matchingAsset(fresh.from, [props.asset]);
                  if (!asset) throw new Error('Switch to the wallet holding the funding asset.');
                  props.onFund(asset, fresh);
                })}
              >
                Review deposit in Send
              </button>
            ) : null}
            {problem && entry.order.status === 0 ? <p className="muted">{problem}</p> : null}
            {!delivered ? (
              <button type="button" className="zcash-bridge-refresh" disabled={state.busy} onClick={() => void client.run(async () => { await client.refresh(entry); })}>
                <RefreshCw size={15} /> Refresh status
              </button>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

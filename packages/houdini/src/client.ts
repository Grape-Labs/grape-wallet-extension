export type HoudiniToken = { id: string; symbol: string; name: string; address?: string; mainnet?: boolean; decimals: number; chainData: { shortName: string; name: string; memoNeeded?: boolean } };
export type HoudiniQuote = { quoteId: string; amountOut: string; provider: string; duration: number | null; ticket: string };
export type HoudiniOrder = {
  mode?: 'standard' | 'private'; depositSignature?: string; capability: string; from: HoudiniToken; to: HoudiniToken; recipient: string; refundAddress: string; amount: string;
  order: { houdiniId: string; anonymous?: boolean; status: number; depositAddress: string; depositTag?: string; receiverAddress: string; inAmount: number | string; outAmount: number | string; expires: string; outTransactionOutHash?: string };
};
export type HoudiniAsset = { id: string; chain: string; symbol: string; address?: string; native: boolean };
export type HoudiniStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
class HoudiniRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
export const orderStatus = (status: number) => ({ '-2': 'Preparing deposit', '-1': 'Preparing deposit', 0: 'Awaiting deposit', 1: 'Confirming deposit', 2: 'Exchanging', 3: 'Routing', 4: 'Delivered', 5: 'Expired', 6: 'Failed — contact support', 7: 'Refunded', 8: 'Order unavailable' }[status] ?? 'Checking status');
export function orderIsOpen(entry: HoudiniOrder, now = Date.now()): boolean {
  if (entry.order.status < -2 || entry.order.status > 3) return false;
  const expires = Date.parse(entry.order.expires);
  return entry.order.status > 0 || !Number.isFinite(expires) || expires > now;
}

function normalizedAmount(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole.replace(/^0+(?=\d)/, '') || '0'}${fraction.replace(/0+$/, '') ? `.${fraction.replace(/0+$/, '')}` : ''}`;
}

export function findOpenPrivateSend(orders: HoudiniOrder[], asset: HoudiniAsset, amount: string, recipient: string): HoudiniOrder | undefined {
  return orders.find(entry => entry.mode === 'private' && orderIsOpen(entry) && matchingAsset(entry.from, [asset]) && normalizedAmount(entry.amount) === normalizedAmount(amount) && entry.recipient === recipient);
}
export function matchingAsset(token: HoudiniToken, assets: HoudiniAsset[]): HoudiniAsset | undefined {
  const chain = token.chainData.shortName.toLowerCase();
  return assets.find(asset => asset.chain === chain && (asset.native ? token.mainnet === true && token.symbol.toLowerCase() === asset.symbol.toLowerCase() : !!asset.address && (chain === 'ethereum' || chain === 'monad' ? asset.address.toLowerCase() === token.address?.toLowerCase() : asset.address === token.address)));
}
export function depositProblem(entry: HoudiniOrder, now = Date.now()): string | null {
  const order = entry.order;
  if (entry.depositSignature) return 'Deposit already submitted. Wait for confirmation.';
  if (entry.mode === 'private' && order.anonymous !== true) return 'Private routing could not be verified. Do not fund this order.';
  if (order.status !== 0) return 'This order is not awaiting a deposit.';
  if (!Number.isFinite(Date.parse(order.expires)) || Date.parse(order.expires) <= now + 30000) return 'Deposit window has expired or is about to expire. Get a new quote.';
  if (!order.depositAddress || !(Number(order.inAmount) > 0)) return 'Deposit details are incomplete.';
  if (order.depositTag || entry.from.chainData.memoNeeded) return 'This route requires a deposit memo. Funding it from Grape is not supported yet.';
  if (order.receiverAddress !== entry.recipient) return 'The order recipient does not match the reviewed address.';
  return null;
}
export type HoudiniState = {
  from: HoudiniToken | null; to: HoudiniToken | null; amount: string; recipient: string; results: HoudiniToken[];
  quotes: HoudiniQuote[]; orders: HoudiniOrder[]; busy: boolean; error: string | null; ready: boolean;
};
export class HoudiniClient {
  state: HoudiniState = { from: null, to: null, amount: '', recipient: '', results: [], quotes: [], orders: [], busy: false, error: null, ready: false };
  private listeners = new Set<() => void>();
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private searchRevision = 0;
  private writes = Promise.resolve();
  constructor(readonly endpoint: string, readonly owner: string, readonly storage: HoudiniStorage, readonly mode: 'standard' | 'private' = 'standard') {}
  private get key() { return 'grape:houdini:' + this.endpoint + ':' + this.owner; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private update(patch: Partial<HoudiniState>) { if (this.stopped) return; this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  change(patch: Partial<Pick<HoudiniState, 'from' | 'to' | 'amount' | 'recipient'>>) { this.revision++; this.update({ ...patch, quotes: [], error: null }); }
  private async request<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(this.endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname))) throw new Error('Houdini requires a secure service URL.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    let response: Response;
    try { response = await fetch(this.endpoint.replace(/\/$/, '') + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-User-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal }); } finally { clearTimeout(timeout); }
    const data = await response.json();
    if (!response.ok) throw new HoudiniRequestError(data.error ?? 'Houdini request failed.', response.status, data.code);
    return data;
  }
  private async saveOrders(orders: HoudiniOrder[]) {
    this.update({ orders });
    const value = JSON.stringify(orders);
    this.writes = this.writes.catch(() => {}).then(() => this.storage.setItem(this.key, value));
    await this.writes;
  }
  async start() {
    this.stopped = false;
    try { const value = await this.storage.getItem(this.key); if (value) { const orders = JSON.parse(value); if (Array.isArray(orders)) this.update({ orders }); } }
    catch { this.update({ error: 'Saved orders could not be loaded. Do not repeat a deposit without checking its status.' }); }
    const pending = await this.storage.getItem(this.key + ':pending').catch(() => null);
    if (pending) {
      try { await this.createFromTicket(pending, true); }
      catch (e) {
        if (e instanceof HoudiniRequestError && ['ORDER_NOT_FOUND', 'ORDER_NOT_CREATED', 'QUOTE_EXPIRED'].includes(e.code ?? '')) await this.storage.setItem(this.key + ':pending', '').catch(() => {});
        if (!(e instanceof HoudiniRequestError) || e.code !== 'ORDER_NOT_FOUND') this.update({ error: (e as Error).message });
      }
    }
    this.update({ ready: true }); this.poll();
  }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private async poll() {
    if (this.stopped) return;
    for (const entry of this.state.orders.filter(e => e.order.status < 4).slice(0, 5)) {
      if (this.stopped) return;
      try { await this.refresh(entry); } catch { /* Preserve the last known order; manual refresh reports the error. */ }
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.poll(), 20000);
  }
  async search(term: string) {
    const revision = ++this.searchRevision;
    this.update({ error: null });
    try { const data = await this.request<{ tokens: HoudiniToken[] }>('/tokens?term=' + encodeURIComponent(term)); if (revision === this.searchRevision) this.update({ results: data.tokens.filter(t => t.chainData && !t.chainData.memoNeeded) }); }
    catch (e) { this.update({ error: (e as Error).message }); }
  }
  async preparePrivateSend(asset: HoudiniAsset, amount: string, recipient: string) {
    this.update({ busy: true, error: null });
    try {
      const query = new URLSearchParams({ term: asset.native ? asset.symbol : asset.address ?? asset.symbol, chain: asset.chain, ...(asset.native ? { native: 'true' } : {}) });
      const data = await this.request<{ tokens: HoudiniToken[] }>('/tokens?' + query);
      const token = data.tokens.find(token => matchingAsset(token, [asset]));
      if (!token) throw new Error('Private send is not available for this asset. You can go back and choose Public send.');
      this.change({ from: token, to: token, amount, recipient });
    } catch (e) { this.update({ error: (e as Error).message }); } finally { this.update({ busy: false }); }
  }
  async quote() {
    if (this.state.busy || !this.state.from || !this.state.to) return;
    const revision = this.revision;
    this.update({ busy: true, error: null, quotes: [] });
    try {
      const data = await this.request<{ quotes: HoudiniQuote[] }>('/quotes', { from: this.state.from.id, to: this.state.to.id, amount: this.state.amount, recipient: this.state.recipient, refundAddress: this.owner, mode: this.mode });
      if (revision === this.revision) this.update({ quotes: [...data.quotes].sort((a, b) => Number(b.amountOut) - Number(a.amountOut)).slice(0, 3), error: data.quotes.length ? null : 'No route is available for this pair and amount.' });
    } catch (e) { this.update({ error: (e as Error).message }); } finally { this.update({ busy: false }); }
  }
  async create(quote: HoudiniQuote) {
    if (this.state.busy || !this.state.quotes.includes(quote)) return;
    const duplicate = this.state.orders.find(entry => entry.mode === this.mode && orderIsOpen(entry) && entry.from.id === this.state.from?.id && entry.to.id === this.state.to?.id && normalizedAmount(entry.amount) === normalizedAmount(this.state.amount) && entry.recipient === this.state.recipient);
    if (duplicate) { this.update({ error: `An active order already exists for this send (${duplicate.order.houdiniId}). Open it below instead of creating another.` }); return; }
    this.update({ busy: true, error: null });
    try {
      await this.storage.setItem(this.key + ':pending', quote.ticket);
      await this.createFromTicket(quote.ticket);
      this.update({ quotes: [] });
    } catch (e) {
      if (e instanceof HoudiniRequestError && ['ORDER_NOT_FOUND', 'ORDER_NOT_CREATED', 'QUOTE_EXPIRED'].includes(e.code ?? '')) await this.storage.setItem(this.key + ':pending', '').catch(() => {});
      this.update({ error: (e as Error).message });
    } finally { this.update({ busy: false }); }
  }
  private async createFromTicket(ticket: string, recoverOnly = false) {
    const entry = await this.request<HoudiniOrder>('/orders', { ticket, ...(recoverOnly ? { recoverOnly: true } : {}) });
    await this.saveOrders([entry, ...this.state.orders.filter(e => e.order.houdiniId !== entry.order.houdiniId)]);
    await this.storage.setItem(this.key + ':pending', '');
  }
  async refresh(entry: HoudiniOrder): Promise<HoudiniOrder> {
    const result = await this.request<HoudiniOrder>('/status', { capability: entry.capability });
    const updated = { ...result, depositSignature: entry.depositSignature };
    await this.saveOrders(this.state.orders.map(e => e.order.houdiniId === entry.order.houdiniId ? updated : e));
    return updated;
  }
  async run(action: () => Promise<void>) {
    if (this.state.busy) return;
    this.update({ busy: true, error: null });
    try { await action(); } catch (e) { this.update({ error: (e as Error).message }); } finally { this.update({ busy: false }); }
  }
}

export function depositAmount(entry: HoudiniOrder): string {
  const value = String(entry.order.inAmount);
  if (!/[eE]/.test(value)) return value;
  const [coefficient, exponent] = value.toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = whole + fraction, point = whole.length + Number(exponent);
  return point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point);
}

export async function recordHoudiniDeposit(storage: HoudiniStorage, endpoint: string, owner: string, id: string, signature: string) {
  const key = 'grape:houdini:' + endpoint + ':' + owner;
  const orders = JSON.parse(await storage.getItem(key) ?? '[]') as HoudiniOrder[];
  await storage.setItem(key, JSON.stringify(orders.map(entry => entry.order.houdiniId === id ? { ...entry, depositSignature: signature } : entry)));
}

/** Exact same-token difference: route costs include provider fees and spread. */
export function privateSendCost(input: string, output: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(input) || !/^\d+(\.\d+)?$/.test(output)) return null;
  const scale = Math.max(input.split('.')[1]?.length ?? 0, output.split('.')[1]?.length ?? 0);
  const units = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole + fraction.padEnd(scale, '0')); };
  const difference = units(input) - units(output);
  if (difference < 0n) return null;
  const raw = difference.toString().padStart(scale + 1, '0');
  return scale ? (raw.slice(0, -scale) + '.' + raw.slice(-scale)).replace(/\.?0+$/, '') : raw;
}

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'https://api-partner.houdiniswap.com/v2';
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\r\n]/.test(value);
const fail = (status, message) => Object.assign(new Error(message), { status });
const amountKey = (value) => {
  const [whole, fraction = ''] = String(value).split('.');
  const decimal = fraction.replace(/0+$/, '');
  return (whole.replace(/^0+(?=\d)/, '') || '0') + (decimal ? '.' + decimal : '');
};
const sameRequest = (entry, quote) => entry?.mode === quote.mode && entry?.from?.id === quote.from?.id && entry?.to?.id === quote.to?.id && amountKey(entry?.amount) === amountKey(quote.amount) && entry?.recipient === quote.recipient && entry?.refundAddress === quote.refundAddress;
const activeOrder = (entry) => entry?.order && entry.order.status >= -2 && entry.order.status <= 3 && (entry.order.status > 0 || !Number.isFinite(Date.parse(entry.order.expires)) || Date.parse(entry.order.expires) > Date.now());
export async function createHoudiniService(config, fetcher = fetch) {
  if (!config.key || !config.secret || !config.signingSecret || config.signingSecret.length < 32) throw new Error('Configure HOUDINI_API_KEY, HOUDINI_API_SECRET and a 32+ character HOUDINI_SIGNING_SECRET.');
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const file = resolve(config.dataDir, 'orders.json');
  let orders = {};
  try { orders = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let writes = Promise.resolve();
  const save = () => {
    const snapshot = JSON.stringify(orders);
    writes = writes.catch(() => {}).then(async () => { await writeFile(file + '.tmp', snapshot, { mode: 0o600 }); await rename(file + '.tmp', file); });
    return writes;
  };
  const sign = (payload) => {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return data + '.' + createHmac('sha256', config.signingSecret).update(data).digest('base64url');
  };
  const verify = (token, kind) => {
    if (!text(token, 12000)) throw fail(400, 'Invalid request token.');
    const [data, signature] = token.split('.');
    const expected = createHmac('sha256', config.signingSecret).update(data).digest();
    const supplied = Buffer.from(signature ?? '', 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw fail(403, 'Invalid request token.');
    let payload; try { payload = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { throw fail(400, 'Invalid request token.'); }
    if (payload.kind !== kind) throw fail(403, 'Invalid request token.');
    return payload;
  };
  const upstream = async (path, context, body) => {
    let response;
    try {
      response = await fetcher(BASE + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: `${config.key}:${config.secret}`, 'Content-Type': 'application/json', 'x-user-ip': context.ip, 'x-user-agent': context.agent, 'x-user-timezone': context.timezone },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch { throw fail(502, 'Houdini did not respond. Please try again.'); }
    if (!response.ok) {
      let details = {};
      try { details = await response.json(); } catch { /* Houdini occasionally returns an empty error body. */ }
      const upstreamMessage = text(details?.message, 300) ? details.message : '';
      const code = text(details?.code, 80) ? details.code : '';
      const message = response.status === 429
        ? 'Houdini is busy. Try again shortly.'
        : code === 'AMOUNT_TOO_LOW' || code === 'AMOUNT_TOO_HIGH'
          ? upstreamMessage
          : response.status === 422 && upstreamMessage
            ? upstreamMessage
            : 'Houdini could not process this request. Try a different amount or use Public send.';
      throw fail(response.status === 429 ? 429 : response.status === 422 ? 422 : 502, message);
    }
    return response.json();
  };
  const cache = new Map();
  const cached = async (path, context) => {
    const hit = cache.get(path); if (hit && hit.until > Date.now()) return hit.data;
    const data = await upstream(path, context);
    if (cache.size > 500) cache.clear();
    cache.set(path, { data, until: Date.now() + 300000 }); return data;
  };
  const token = async (id, context) => {
    const result = await cached('/tokens/' + encodeURIComponent(id), context);
    const t = result.token ?? result;
    if (!t.id || t.enabled === false || !t.hasCex || t.unverified) throw fail(400, 'This token is not available for Houdini swaps.');
    if (!t.chainData || t.chainData.memoNeeded) throw fail(400, 'Memo-bearing networks are not supported in this integration yet.');
    return { id: t.id, symbol: t.symbol, name: t.name, address: t.address, mainnet: t.mainnet, decimals: t.decimals, chainData: { shortName: t.chainData.shortName, name: t.chainData.name, memoNeeded: !!t.chainData.memoNeeded } };
  };
  const inflight = new Map();
  async function route(method, url, body, context) {
    if (method === 'GET' && url.pathname === '/health') return { ready: true };
    if (method === 'GET' && url.pathname === '/tokens') {
      const term = url.searchParams.get('term') ?? '';
      if (!text(term, 100)) throw fail(400, 'Enter a token name, symbol or address.');
      const query = new URLSearchParams({ term, hasCex: 'true', pageSize: '30', unverified: 'false' });
      const chain = url.searchParams.get('chain');
      if (chain && /^[a-z0-9-]{1,40}$/.test(chain)) query.set('chain', chain);
      if (url.searchParams.get('native') === 'true') query.set('mainnet', 'true');
      return cached('/tokens?' + query, context);
    }
    if (method === 'POST' && url.pathname === '/quotes') {
      const { from, to, amount, recipient, refundAddress } = body;
      const mode = body.mode ?? 'standard';
      if (!['standard', 'private'].includes(mode) || (mode === 'private' && from !== to)) throw fail(400, 'Private send requires the same input and output token.');
      if (![from, to, recipient, refundAddress].every(v => text(v)) || typeof amount !== 'string' || !/^\d{1,20}(\.\d{1,18})?$/.test(amount) || Number(amount) <= 0) throw fail(400, 'Check tokens, amount and addresses.');
      const [input, output] = await Promise.all([token(from, context), token(to, context)]);
      const data = await upstream('/quotes?' + new URLSearchParams({ from, to, amount, types: mode }), context);
      return { quotes: (data.quotes ?? []).filter(q => q.type === mode && q.quoteId && Number(q.amountOut) > 0).map(q => ({
        quoteId: q.quoteId, amountOut: String(q.amountOut), provider: q.swapName ?? 'Houdini', duration: q.duration ?? null,
        ticket: sign({ kind: 'quote', mode, id: q.quoteId, expires: Date.now() + 60000, from: input, to: output, amount, recipient, refundAddress })
      })) };
    }
    if (method === 'POST' && url.pathname === '/orders') {
      const q = verify(body.ticket, 'quote');
      const existing = orders[q.id];
      if (existing?.order) return { ...existing, capability: sign({ kind: 'order', id: q.id }) };
      if (inflight.has(q.id)) return inflight.get(q.id);
      if (existing) throw fail(409, 'Order creation is pending or uncertain. Do not create another deposit. Contact support with reference ' + q.id);
      const duplicate = Object.entries(orders).find(([, entry]) => activeOrder(entry) && sameRequest(entry, q));
      if (duplicate) return { ...duplicate[1], capability: sign({ kind: 'order', id: duplicate[0] }) };
      if (Object.values(orders).some(entry => entry?.pending && sameRequest(entry.quote, q))) throw fail(409, 'A matching order is already being created. Wait a moment and refresh its status instead of creating another.');
      if (q.expires < Date.now()) throw fail(409, 'Quote expired. Get a fresh quote.');
      const capability = sign({ kind: 'order', id: q.id });
      const job = (async () => {
        orders[q.id] = { pending: true, quote: { mode: q.mode, from: q.from, to: q.to, amount: q.amount, recipient: q.recipient, refundAddress: q.refundAddress }, createdAt: Date.now() };
        await save();
        const order = await upstream('/exchanges', context, { quoteId: q.id, addressTo: q.recipient, refundAddress: q.refundAddress, markup: 0, walletInfo: 'Grape Wallet' });
        if (!order.houdiniId) throw fail(502, 'Order response is incomplete. Contact support before retrying.');
        const entry = { mode: q.mode ?? 'standard', order, from: q.from, to: q.to, amount: q.amount, recipient: q.recipient, refundAddress: q.refundAddress, createdAt: Date.now() };
        orders[q.id] = entry; await save();
        return { ...entry, capability };
      })();
      inflight.set(q.id, job);
      try { return await job; } finally { inflight.delete(q.id); }
    }
    if (method === 'POST' && url.pathname === '/status') {
      const access = verify(body.capability, 'order');
      const entry = orders[access.id];
      if (!entry?.order?.houdiniId) throw fail(404, 'Order not found.');
      const order = await upstream('/orders/' + encodeURIComponent(entry.order.houdiniId), context);
      entry.order = { ...entry.order, ...order }; await save();
      return { ...entry, capability: body.capability };
    }
    throw fail(404, 'Not found.');
  }
  const limits = new Map();
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const origin = req.headers.origin;
      if (origin && !config.origins.includes(origin)) throw fail(403, 'Origin not allowed.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Timezone');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const ip = config.trustProxy ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim() : req.socket.remoteAddress;
      const now = Date.now();
      if (limits.size > 10000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
      const limit = limits.get(ip); if (limit && limit.until > now && limit.count >= 60) throw fail(429, 'Too many requests. Wait a minute.');
      limits.set(ip, limit && limit.until > now ? { ...limit, count: limit.count + 1 } : { count: 1, until: now + 60000 });
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 24000) throw fail(413, 'Request too large.'); }
      let body = {}; if (raw) { try { body = JSON.parse(raw); } catch { throw fail(400, 'Invalid JSON.'); } }
      const timezone = String(req.headers['x-user-timezone'] ?? 'UTC');
      if (!text(timezone, 100)) throw fail(400, 'Invalid timezone.');
      const data = await route(req.method, new URL(req.url, 'http://localhost'), body, { ip, timezone, agent: String(req.headers['user-agent'] ?? 'Grape Wallet') });
      res.end(JSON.stringify(data));
    } catch (e) { res.writeHead(e.status ?? 500); res.end(JSON.stringify({ error: e.status ? e.message : 'Unable to process request.' })); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createHoudiniService({ key: process.env.HOUDINI_API_KEY, secret: process.env.HOUDINI_API_SECRET, signingSecret: process.env.HOUDINI_SIGNING_SECRET, dataDir: process.env.HOUDINI_DATA_DIR ?? './data', origins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean), trustProxy: process.env.TRUST_PROXY === 'true' });
  server.listen(Number(process.env.PORT ?? 8788), process.env.HOST ?? '127.0.0.1', () => console.log('Houdini service listening.'));
}

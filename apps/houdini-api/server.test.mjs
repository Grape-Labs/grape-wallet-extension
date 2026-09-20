import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHoudiniService } from './server.mjs';

test('quotes, idempotent orders, private status capability and backend-only credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'houdini-'));
  let exchanges = 0;
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/tokens/')) return Response.json({ id: url.split('/').at(-1), name: 'Solana', symbol: 'SOL', mainnet: true, enabled: true, hasCex: true, decimals: 9, chainData: { shortName: 'solana', name: 'Solana' } });
    if (url.includes('/quotes?')) return Response.json({ quotes: [{ quoteId: 'quote-1', type: 'standard', amountOut: 10, swapName: 'Example', duration: 5 }, { quoteId: 'dex-1', type: 'dex', amountOut: 12 }] });
    if (url.endsWith('/exchanges')) { exchanges++; return Response.json({ houdiniId: 'order-1', status: 0, depositAddress: 'deposit', receiverAddress: 'recipient', inAmount: 1, outAmount: 10, expires: new Date(Date.now() + 600000).toISOString() }); }
    if (url.includes('/orders/')) return Response.json({ houdiniId: 'order-1', status: 4, outAmount: 10 });
    throw new Error('Unexpected endpoint');
  };
  const config = { key: 'test-key', secret: 'test-secret', signingSecret: 's'.repeat(64), dataDir: dir, origins: ['chrome-extension://test'], trustProxy: false };
  let server = await createHoudiniService(config, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, extra = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Timezone': 'Europe/Athens', ...extra }, body: JSON.stringify(body) });
  try {
    const quotes = await (await post('/quotes', { from: 'sol', to: 'usdc', amount: '1', recipient: 'recipient', refundAddress: 'sender' })).json();
    assert.equal(quotes.quotes.length, 1);
    assert.ok(calls.every(c => c.options.headers.Authorization === 'test-key:test-secret'));
    assert.ok(calls.every(c => c.options.headers['x-user-timezone'] === 'Europe/Athens'));
    const ticket = quotes.quotes[0].ticket;
    const both = await Promise.all([post('/orders', { ticket, addressTo: 'unreviewed-address' }), post('/orders', { ticket })]);
    const order = await both[0].json();
    assert.equal(exchanges, 1);
    const submitted = JSON.parse(calls.find(c => c.url.endsWith('/exchanges')).options.body);
    assert.equal(submitted.addressTo, 'recipient');
    assert.equal(submitted.refundAddress, 'sender');
    assert.equal('markup' in submitted, false, 'orders must preserve the quote markup by omitting an unquoted value');
    assert.equal(order.order.houdiniId, 'order-1');
    assert.equal(JSON.stringify(order).includes('test-secret'), false);
    assert.equal((await post('/status', { capability: 'order-1' })).status, 403);
    assert.equal((await post('/orders', { ticket: ticket + 'tampered' })).status, 403);
    assert.equal((await post('/quotes', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/anything', {})).status, 404);
    const refreshed = await (await post('/status', { capability: order.capability })).json();
    assert.equal(refreshed.order.status, 4);
    await new Promise(resolve => server.close(resolve));
    server = await createHoudiniService(config, fetcher);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await (await post('/orders', { ticket })).json()).order.houdiniId, 'order-1');
    assert.equal(exchanges, 1, 'restarting must not create a second order');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('fails closed when credentials are missing', async () => {
  await assert.rejects(() => createHoudiniService({}), /Configure HOUDINI/);
});

test('private send requests same-token private quotes and binds private mode into the order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'houdini-private-'));
  const fetcher = async (url, options) => {
    if (url.includes('/tokens/')) return Response.json({ id: 'sol', symbol: 'SOL', enabled: true, hasCex: true, decimals: 9, mainnet: true, chainData: { shortName: 'solana', name: 'Solana' } });
    if (url.includes('/quotes?')) {
      const q = new URL(url).searchParams;
      assert.equal(q.get('types'), 'private'); assert.equal(q.get('from'), q.get('to'));
      return Response.json({ quotes: [{ quoteId: 'private-1', type: 'private', amountOut: 0.97 }, { quoteId: 'public-1', type: 'standard', amountOut: 0.99 }] });
    }
    if (url.endsWith('/exchanges')) { assert.equal(JSON.parse(options.body).quoteId, 'private-1'); return Response.json({ houdiniId: 'private-order', anonymous: true, status: 0 }); }
    throw new Error('Unexpected request');
  };
  const server = await createHoudiniService({ key: 'key', secret: 'secret', signingSecret: 'x'.repeat(64), dataDir: dir, origins: [], trustProxy: false }, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = (path, body) => fetch('http://127.0.0.1:' + server.address().port + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const request = { mode: 'private', from: 'sol', to: 'sol', amount: '1', recipient: 'recipient', refundAddress: 'sender' };
    assert.equal((await post('/quotes', { ...request, to: 'usdc' })).status, 400);
    const quotes = await (await post('/quotes', request)).json();
    assert.equal(quotes.quotes.length, 1); assert.equal(quotes.quotes[0].quoteId, 'private-1');
    const order = await (await post('/orders', { ticket: quotes.quotes[0].ticket, mode: 'standard' })).json();
    assert.equal(order.mode, 'private'); assert.equal(order.order.anonymous, true);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('returns Houdini amount limits without hiding the useful message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'houdini-limit-'));
  const fetcher = async (url) => {
    if (url.includes('/tokens/')) return Response.json({ id: 'usdc', symbol: 'USDC', enabled: true, hasCex: true, decimals: 6, chainData: { shortName: 'solana', name: 'Solana' } });
    if (url.includes('/quotes?')) return Response.json({ code: 'AMOUNT_TOO_LOW', message: 'Amount is too low, minimum is 25 USD' }, { status: 422 });
    throw new Error('Unexpected request');
  };
  const server = await createHoudiniService({ key: 'key', secret: 'secret', signingSecret: 'x'.repeat(64), dataDir: dir, origins: [], trustProxy: false }, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'private', from: 'usdc', to: 'usdc', amount: '10', recipient: 'recipient', refundAddress: 'sender' }) });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, 'Amount is too low, minimum is 25 USD');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('reuses an active matching order even when a fresh quote has a new id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'houdini-dedup-'));
  let quoteNumber = 0, exchanges = 0;
  const fetcher = async (url) => {
    if (url.includes('/tokens/')) return Response.json({ id: url.split('/').at(-1), symbol: 'SOL', enabled: true, hasCex: true, decimals: 9, mainnet: true, chainData: { shortName: 'solana', name: 'Solana' } });
    if (url.includes('/quotes?')) return Response.json({ quotes: [{ quoteId: `quote-${++quoteNumber}`, type: 'private', amountOut: .97 }] });
    if (url.endsWith('/exchanges')) { exchanges++; return Response.json({ houdiniId: 'one-order', anonymous: true, status: 0, depositAddress: 'deposit', receiverAddress: 'recipient', inAmount: 1, outAmount: .97, expires: new Date(Date.now() + 600000).toISOString() }); }
    if (url.includes('/orders/')) return Response.json({ houdiniId: 'one-order', status: 0 });
    throw new Error('Unexpected request');
  };
  const server = await createHoudiniService({ key: 'key', secret: 'secret', signingSecret: 'x'.repeat(64), dataDir: dir, origins: [], trustProxy: false }, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = (path, body) => fetch('http://127.0.0.1:' + server.address().port + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const request = { mode: 'private', from: 'sol', to: 'sol', amount: '1', recipient: 'recipient', refundAddress: 'sender' };
    const firstQuote = (await (await post('/quotes', request)).json()).quotes[0];
    const first = await (await post('/orders', { ticket: firstQuote.ticket })).json();
    const secondQuote = (await (await post('/quotes', { ...request, amount: '1.0' })).json()).quotes[0];
    const second = await (await post('/orders', { ticket: secondQuote.ticket })).json();
    assert.equal(first.order.houdiniId, second.order.houdiniId);
    assert.equal(exchanges, 1);
    assert.equal((await (await post('/status', { capability: second.capability })).json()).order.houdiniId, 'one-order');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('clears a pending marker after Houdini definitively rejects order creation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'houdini-rejected-'));
  let exchanges = 0;
  const fetcher = async (url) => {
    if (url.includes('/tokens/')) return Response.json({ id: 'sol', symbol: 'SOL', enabled: true, hasCex: true, decimals: 9, mainnet: true, chainData: { shortName: 'solana', name: 'Solana' } });
    if (url.includes('/quotes?')) return Response.json({ quotes: [{ quoteId: 'rejected-quote', type: 'private', amountOut: .97 }] });
    if (url.endsWith('/exchanges')) { exchanges++; return Response.json({ code: 'INVALID_ADDRESS', message: 'Destination address is invalid' }, { status: 422 }); }
    throw new Error('Unexpected request');
  };
  const server = await createHoudiniService({ key: 'key', secret: 'secret', signingSecret: 'x'.repeat(64), dataDir: dir, origins: [], trustProxy: false }, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = (path, body) => fetch('http://127.0.0.1:' + server.address().port + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const request = { mode: 'private', from: 'sol', to: 'sol', amount: '1', recipient: 'recipient', refundAddress: 'sender' };
    const quote = (await (await post('/quotes', request)).json()).quotes[0];
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await post('/orders', { ticket: quote.ticket });
      assert.equal(response.status, 422);
      assert.equal((await response.json()).code, 'ORDER_NOT_CREATED');
    }
    assert.equal(exchanges, 2, 'a definitive rejection must not leave a permanent pending marker');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('reconciles an uncertain attempt without creating an order on wallet startup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'houdini-recovery-'));
  let exchanges = 0;
  const fetcher = async (url) => {
    if (url.includes('/tokens/')) return Response.json({ id: 'sol', symbol: 'SOL', enabled: true, hasCex: true, decimals: 9, mainnet: true, chainData: { shortName: 'solana', name: 'Solana' } });
    if (url.includes('/quotes?')) return Response.json({ quotes: [{ quoteId: 'uncertain-quote', type: 'private', amountOut: .97 }] });
    if (url.includes('/orders?')) return Response.json({ total: 0, orders: [] });
    if (url.endsWith('/exchanges')) {
      exchanges++;
      if (exchanges === 1) throw new Error('connection reset');
      return Response.json({ houdiniId: 'recovered-retry', anonymous: true, status: 0, receiverAddress: 'recipient', inAmount: 1, outAmount: .97, expires: new Date(Date.now() + 600000).toISOString() });
    }
    throw new Error('Unexpected request');
  };
  const server = await createHoudiniService({ key: 'key', secret: 'secret', signingSecret: 'x'.repeat(64), dataDir: dir, origins: [], trustProxy: false, pendingTimeoutMs: 0 }, fetcher);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = (path, body) => fetch('http://127.0.0.1:' + server.address().port + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const request = { mode: 'private', from: 'sol', to: 'sol', amount: '1', recipient: 'recipient', refundAddress: 'sender' };
    const quote = (await (await post('/quotes', request)).json()).quotes[0];
    assert.equal((await post('/orders', { ticket: quote.ticket })).status, 502);
    const recovery = await post('/orders', { ticket: quote.ticket, recoverOnly: true });
    assert.equal(recovery.status, 404);
    assert.equal((await recovery.json()).code, 'ORDER_NOT_FOUND');
    assert.equal(exchanges, 1, 'startup recovery must never create a new exchange');
    assert.equal((await (await post('/orders', { ticket: quote.ticket })).json()).order.houdiniId, 'recovered-retry');
    assert.equal(exchanges, 2, 'an explicit retry may create the order after reconciliation');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

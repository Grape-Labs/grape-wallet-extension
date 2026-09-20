import { expect, it } from 'vitest';
import { depositAmount, depositProblem, findOpenPrivateSend, matchingAsset, orderIsOpen, type HoudiniOrder } from './client';
const token = { id: 'sol', symbol: 'SOL', name: 'Solana', mainnet: true, decimals: 9, chainData: { shortName: 'solana', name: 'Solana' } };
const entry: HoudiniOrder = { capability: 'opaque', from: token, to: token, recipient: 'recipient', refundAddress: 'sender', amount: '1', order: { houdiniId: 'id', status: 0, depositAddress: 'deposit', receiverAddress: 'recipient', inAmount: 1, outAmount: 1, expires: new Date(Date.now() + 600000).toISOString() } };
it('blocks expired, memo-bearing, already sent, mismatched and non-waiting deposits', () => {
  expect(depositProblem(entry)).toBeNull();
  for (const e of [ { ...entry, depositSignature: 'signature' }, { ...entry, recipient: 'different' }, { ...entry, order: { ...entry.order, status: 1 } }, { ...entry, order: { ...entry.order, expires: 'invalid' } }, { ...entry, order: { ...entry.order, expires: new Date(0).toISOString() } }, { ...entry, order: { ...entry.order, depositTag: '123' } } ]) expect(depositProblem(e)).not.toBeNull();
});
it('matches exact chain and mint, never token symbol alone', () => {
  const assets = [{ id: 'native', chain: 'solana', symbol: 'SOL', native: true }];
  expect(matchingAsset(token, assets)?.id).toBe('native');
  expect(matchingAsset({ ...token, mainnet: false, address: 'fake' }, assets)).toBeUndefined();
  expect(matchingAsset({ ...token, chainData: { ...token.chainData, shortName: 'ethereum' } }, assets)).toBeUndefined();
});
it('expands small scientific-notation amounts for the send form', () => {
  expect(depositAmount({ ...entry, order: { ...entry.order, inAmount: 1e-9 } })).toBe('0.000000001');
});

it('requires verified private routing before funding a private order', () => {
  expect(depositProblem({ ...entry, mode: 'private' })).toMatch(/Private routing/);
  expect(depositProblem({ ...entry, mode: 'private', order: { ...entry.order, anonymous: true } })).toBeNull();
});
it('shows exact same-token route costs', async () => {
  const { privateSendCost } = await import('./client');
  expect(privateSendCost('1', '0.970000001')).toBe('0.029999999');
  expect(privateSendCost('1', '1')).toBe('0');
  expect(privateSendCost('1', '2')).toBeNull();
});
it('finds the same open private send and ignores completed or expired orders', () => {
  const asset = { id: 'native', chain: 'solana', symbol: 'SOL', native: true };
  const open = { ...entry, mode: 'private' as const, amount: '01.000', order: { ...entry.order, anonymous: true } };
  expect(orderIsOpen(open)).toBe(true);
  expect(findOpenPrivateSend([open], asset, '1', 'recipient')).toBe(open);
  expect(findOpenPrivateSend([{ ...open, order: { ...open.order, status: 4 } }], asset, '1', 'recipient')).toBeUndefined();
  expect(orderIsOpen({ ...open, order: { ...open.order, expires: new Date(0).toISOString() } })).toBe(false);
});

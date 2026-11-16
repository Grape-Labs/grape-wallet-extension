import { describe, expect, it, vi } from 'vitest';
import type { Connection } from '@solana/web3.js';
import { createMobilePrivacyService, mobilePrivacyEndpoint, privateSol } from './solanaPrivacy';
import type { MobileWallet } from './wallet';
const wallet = { id: 'wallet-1', address: '11111111111111111111111111111111', chain: 'solana', source: 'created' } as MobileWallet;
const endpoint = 'https://mainnet.helius-rpc.com/?api-key=test';
function fixture() {
  let epoch = 1;
  let clock = 1000;
  const records = new Map<string,string>();
  const storage = { getItem: vi.fn(async (key: string) => records.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { records.set(key, value); }) };
  const connection = { isBlockhashValid: vi.fn(async () => ({ value: true })), getSignatureStatuses: vi.fn(async () => ({ value: [null] })), sendRawTransaction: vi.fn(async () => { expect(records.size).toBe(1); return 'signature'; }) };
  const runtime = vi.fn(async (request: Record<string,unknown>) => request.operation === 'prepare' ? { transaction: 'd2lyZQ==', blockhash: 'blockhash', feeLamports: 5000, debitLamports: 10005000 } : { transaction: 'c2lnbmVk', signature: 'signature' });
  const service = createMobilePrivacyService({ wallet, endpoint, storage, connection: connection as unknown as Connection, runtime: runtime as any, authorize: () => epoch, now: () => clock });
  return { service, runtime, storage, connection, epoch: () => { epoch++; }, expire: () => { clock += 41000; } };
}
describe('mobile privacy transaction reviews', () => {
  it('normalizes Helius RPC and rejects unrelated or credential-less hosts', () => {
    expect(mobilePrivacyEndpoint(endpoint.replace('/?', '/v1/spr/getUserRecords?'))).toBe(endpoint);
    for (const url of ['https://other.example/?api-key=test','http://mainnet.helius-rpc.com/?api-key=test','https://devnet.helius-rpc.com/?api-key=test','https://mainnet.helius-rpc.com']) expect(() => mobilePrivacyEndpoint(url)).toThrow();
  });
  it('preserves exact lamport balances including zero and whole tens', () => {
    for (const [amount, sol] of [['0','0'], ['1','0.000000001'], ['10000000','0.01'], ['10000000000','10']]) expect(privateSol({ registered: true, balances: [{ mint: '11111111111111111111111111111111', amount }] })).toBe(sol);
  });
  it('journals the signature before broadcast and consumes approval once', async () => {
    const f = fixture(); const review = await f.service.prepare({ action: 'deposit', amount: '0.01' });
    expect(await f.service.submit(review)).toEqual({ signature: 'signature', status: 'submitted' });
    await expect(f.service.submit(review)).rejects.toThrow('Review expired');
    expect(f.connection.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it('rejects expired reviews and changed sessions before signing', async () => {
    for (const mutate of ['epoch','expire'] as const) { const f = fixture(); const review = await f.service.prepare({ action: 'register' }); f[mutate](); await expect(f.service.submit(review)).rejects.toThrow(); expect(f.runtime).toHaveBeenCalledTimes(1); }
  });
  it('cannot submit mutated or recreated review details', async () => {
    const f = fixture(); const review = await f.service.prepare({ action: 'deposit', amount: '0.01' });
    await expect(f.service.submit({ ...review, amount: '10' })).rejects.toThrow(); expect(f.connection.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('blocks a duplicate while the previous signature remains live', async () => {
    const f = fixture(); await f.service.submit(await f.service.prepare({ action: 'register' }));
    await expect(f.service.submit(await f.service.prepare({ action: 'deposit', amount: '0.01' }))).rejects.toThrow('previous transaction');
    expect(f.connection.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it('returns an uncertain signature without rebroadcasting after a network error', async () => {
    const f = fixture(); f.connection.sendRawTransaction.mockRejectedValueOnce(new Error('connection lost'));
    expect(await f.service.submit(await f.service.prepare({ action: 'register' }))).toEqual({ signature: 'signature', status: 'unknown' });
    expect(f.storage.setItem).toHaveBeenCalled(); expect(f.connection.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it('does not broadcast when durable storage fails or session changes during signing', async () => {
    const f = fixture(); f.storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(f.service.submit(await f.service.prepare({ action: 'register' }))).rejects.toThrow('disk full');
    expect(f.connection.sendRawTransaction).not.toHaveBeenCalled();
    const g = fixture(); const review = await g.service.prepare({ action: 'register' });
    g.runtime.mockImplementationOnce(async () => { g.epoch(); return { transaction: 'c2lnbmVk', signature: 'signature' }; });
    await expect(g.service.submit(review)).rejects.toThrow('session changed'); expect(g.connection.sendRawTransaction).not.toHaveBeenCalled();
  });
});

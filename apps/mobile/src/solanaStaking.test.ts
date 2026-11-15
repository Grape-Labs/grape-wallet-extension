import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { createMobileStakingService } from './solanaStaking';
import type { solanaSwapRpc } from './solanaSwapRpc';
const owner = Keypair.generate().publicKey.toBase58();
const vote = Keypair.generate().publicKey.toBase58();
const stake = Keypair.generate().publicKey.toBase58();
const wallet = { id: 'wallet', address: owner };
function harness() {
  const state = { fee: 5000, balance: 10e9, simulationError: null as unknown, time: 1000, withdrawIndexFails: false, expireDuringBalance: false };
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const rpc: typeof solanaSwapRpc = async <T>(_url: string, method: string, params: unknown[]): Promise<T> => {
    calls.push({ method, params });
    let result: unknown;
    if (method === 'getMinimumBalanceForRentExemption') result = 2282880;
    else if (method === 'getLatestBlockhash') result = { value: { blockhash: Keypair.generate().publicKey.toBase58() } };
    else if (method === 'getFeeForMessage') result = { value: state.fee };
    else if (method === 'getBalance') { if (state.expireDuringBalance) state.time += 60000; result = { value: state.balance }; }
    else if (method === 'simulateTransaction') result = { value: { err: state.simulationError } };
    else if (method === 'getVoteAccounts') result = { current: [{ votePubkey: vote, nodePubkey: owner, activatedStake: 2e12, commission: 5, lastVote: 123, rootSlot: 122 }] };
    else if (method === 'getProgramAccounts' && params[0] === 'Config1111111111111111111111111111111111111') result = [];
    else if (method === 'getProgramAccounts') {
      const config = params[1] as { filters: Array<{ memcmp?: { offset: number } }> };
      if (state.withdrawIndexFails && config.filters[1].memcmp?.offset === 44) throw new Error('Unsupported withdrawal index');
      result = [{ pubkey: stake, account: { lamports: 236e7, data: { parsed: { type: 'delegated', info: { meta: { authorized: { staker: owner, withdrawer: owner } }, stake: { delegation: { stake: '2358000000', voter: vote, deactivationEpoch: '800' } } } } } } }];
    } else throw new Error(`Unexpected RPC: ${method}`);
    return result as T;
  };
  return { state, calls, service: createMobileStakingService('https://rpc.example', rpc, () => state.time) };
}

describe('native mobile staking preparation', () => {
  it('discovers and deduplicates accounts and retains partial lookup warnings', async () => {
    const { service, state } = harness(); state.withdrawIndexFails = true;
    const result = await service.accounts(owner);
    expect(result.accounts).toHaveLength(1); expect(result.warnings).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({ staker: owner, withdrawer: owner, deactivationEpoch: '800', delegatedLamports: 2358000000 });
  });
  it('loads validator commission and identifiers when names are unavailable', async () => {
    const { service } = harness();
    expect((await service.validators())[0]).toMatchObject({ voteAccount: vote, commission: 5, activatedStakeLamports: 2e12, name: null });
  });
  it('prepares stake amount, deposit and fee without calling a signer and preserves the extra account signature', async () => {
    const { service, calls } = harness();
    const prepared = await service.prepare(wallet, { action: 'stake', amount: '1.5', voteAccount: vote });
    expect(prepared).toMatchObject({ feeLamports: 5000, depositLamports: 2282880, debitLamports: 1502282880, consumed: false });
    expect(prepared.transaction.signatures.some(entry => entry.publicKey.toBase58() === prepared.stakeAccount && entry.signature != null)).toBe(true);
    const before = prepared.message;
    const signer = vi.fn(async (transaction) => { expect(transaction.serializeMessage().toString('base64')).toBe(before); return 'signature'; });
    await expect(service.submit(wallet, prepared, () => {}, signer)).resolves.toBe('signature');
    expect(signer).toHaveBeenCalledOnce();
    await expect(service.submit(wallet, prepared, () => {}, signer)).rejects.toThrow('already been used');
    expect(signer).toHaveBeenCalledOnce();
    const simulated = calls.filter(call => call.method === 'simulateTransaction');
    expect(simulated[0].params[0]).toBe(simulated[1].params[0]);
  });
  it.each(['deactivate', 'withdraw'] as const)('prepares %s with only the network fee charged to the wallet', async action => {
    const { service } = harness();
    const request = action === 'withdraw' ? { action, stakeAccount: stake, amount: '1' } : { action, stakeAccount: stake };
    const prepared = await service.prepare(wallet, request);
    expect(prepared).toMatchObject({ feeLamports: 5000, depositLamports: 0, debitLamports: 0, stakeAccount: stake });
  });
  it('blocks unknown fees, failed simulation and insufficient funds before signing', async () => {
    for (const failure of ['simulation', 'balance', 'fee']) {
      const { service, state } = harness();
      if (failure === 'simulation') state.simulationError = { InstructionError: [0, 'InsufficientFunds'] };
      if (failure === 'balance') state.balance = 1;
      if (failure === 'fee') state.fee = null as unknown as number;
      await expect(service.prepare(wallet, { action: 'stake', amount: '1', voteAccount: vote })).rejects.toThrow();
    }
  });
  it('rejects approvals that expire during asynchronous fee validation', async () => {
    const { service, state } = harness(); const signer = vi.fn(async () => 'signature');
    const prepared = await service.prepare(wallet, { action: 'deactivate', stakeAccount: stake });
    state.expireDuringBalance = true;
    await expect(service.submit(wallet, prepared, () => {}, signer)).rejects.toThrow('expired');
    expect(signer).not.toHaveBeenCalled();
  });
  it('rejects changed fees, expired approvals, changed account, mutated transaction and revoked authorization without signing', async () => {
    for (const failure of ['fee', 'expiry', 'account', 'mutation', 'authorization']) {
      const { service, state } = harness(); const signer = vi.fn(async () => 'signature');
      const prepared = await service.prepare(wallet, { action: 'deactivate', stakeAccount: stake });
      if (failure === 'fee') state.fee = 10000;
      if (failure === 'expiry') state.time += 60000;
      if (failure === 'mutation') prepared.transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
      const authorize = () => { if (failure === 'authorization') throw new Error('Session locked'); };
      await expect(service.submit(failure === 'account' ? { ...wallet, id: 'other' } : wallet, prepared, authorize, signer)).rejects.toThrow();
      expect(signer).not.toHaveBeenCalled();
    }
  });
});

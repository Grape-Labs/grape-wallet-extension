import { describe, expect, it, vi } from 'vitest';
import { discoverStakeAccountsByAuthority } from './stake-discovery';

describe('stake authority discovery', () => {
  it('retains staker accounts when the Shyft withdrawer index and fallback fail', async () => {
    const lookup = vi.fn(async (offset: number) => {
      if (offset === 44) throw new Error('Invalid params: Index not supported');
      return [{ address: 'stake-account', lamports: 1000000000 }];
    });
    const result = await discoverStakeAccountsByAuthority(lookup);
    expect(result.accounts).toEqual([{ address: 'stake-account', lamports: 1000000000 }]);
    expect(result.warnings[0]).toContain('withdraw-only accounts may be missing');
    expect(lookup.mock.calls.map(args => args[0])).toEqual([12, 44]);
  });
  it('retains withdraw-only accounts if the staker lookup fails', async () => {
    const result = await discoverStakeAccountsByAuthority(async offset => {
      if (offset === 12) throw new Error('RPC unavailable');
      return ['withdraw-only'];
    });
    expect(result.accounts).toEqual(['withdraw-only']);
    expect(result.warnings[0]).toContain('Staker lookup');
  });
  it('keeps an empty partial result distinct from complete zero holdings', async () => {
    const partial = await discoverStakeAccountsByAuthority(async offset => {
      if (offset === 44) throw new Error('Unsupported');
      return [];
    });
    expect(partial.accounts).toEqual([]);
    expect(partial.warnings).toHaveLength(1);
    const complete = await discoverStakeAccountsByAuthority(async () => []);
    expect(complete).toEqual({ accounts: [], warnings: [] });
  });
  it('combines both successful lookups without warning', async () => {
    const result = await discoverStakeAccountsByAuthority(async offset => [offset]);
    expect(result).toEqual({ accounts: [12, 44], warnings: [] });
  });
  it('reports a total discovery failure only when neither lookup succeeds', async () => {
    await expect(discoverStakeAccountsByAuthority(async () => { throw new Error('RPC down'); })).rejects.toThrow('discovery is temporarily unavailable');
  });
});

import { Keypair, PublicKey, StakeProgram } from '@solana/web3.js';
import { loadStakeAccounts } from './stake-discovery';
describe('selected RPC stake account loading', () => {
  const owner = Keypair.generate().publicKey;
  const address = Keypair.generate().publicKey;
  const other = Keypair.generate().publicKey;
  const entry = (staker = owner.toBase58(), withdrawer = owner.toBase58()) => ({
    pubkey: address,
    account: { executable: false, owner: StakeProgram.programId, lamports: 2_000_000_000, data: { program: 'stake', parsed: { type: 'delegated', info: { meta: { authorized: { staker, withdrawer } }, stake: { delegation: { stake: '1997717120', voter: other.toBase58(), deactivationEpoch: '18446744073709551615' } } } }, space: 200 } }
  });
  it('loads parsed balances and both authorities in two RPC calls without per-account hydration', async () => {
    const getParsedProgramAccounts = vi.fn(async () => [entry()]);
    const result = await loadStakeAccounts({ getParsedProgramAccounts }, owner);
    expect(getParsedProgramAccounts).toHaveBeenCalledTimes(2);
    expect(getParsedProgramAccounts.mock.calls.map(call => (call as any)[1].filters[1].memcmp.offset)).toEqual([12, 44]);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({ address: address.toBase58(), lamports: 2_000_000_000, delegatedLamports: 1997717120, state: 'delegated', staker: owner.toBase58(), withdrawer: owner.toBase58() });
  });
  it('keeps withdraw-only accounts and rejects unrelated authorities', async () => {
    const getParsedProgramAccounts = vi.fn(async () => [entry(other.toBase58()), { ...entry(other.toBase58(), other.toBase58()), pubkey: other }]);
    const result = await loadStakeAccounts({ getParsedProgramAccounts }, owner);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].staker).toBe(other.toBase58());
  });
  it('reports malformed RPC results as partial instead of silently showing zero stake', async () => {
    const getParsedProgramAccounts = vi.fn(async () => [{ ...entry(), account: { ...entry().account, owner: PublicKey.default } }]);
    const result = await loadStakeAccounts({ getParsedProgramAccounts }, owner);
    expect(result.accounts).toEqual([]);
    expect(result.warnings[0]).toContain('incomplete');
  });
});

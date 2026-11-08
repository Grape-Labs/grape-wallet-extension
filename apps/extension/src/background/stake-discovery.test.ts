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

export type NativeStakeAccount = {
  address: string; lamports: number; delegatedLamports: number; state: string;
  voter: string | null; staker: string | null; withdrawer: string | null; deactivationEpoch?: string | null;
};
export type NativeStakeValidator = {
  voteAccount: string; nodePubkey: string; name?: string | null; commission: number;
  activatedStakeLamports: number; lastVote: number; rootSlot: number;
};

export function stakeAccountStatus(account: NativeStakeAccount): { label: string; tone: string; coolingDown: boolean } {
  const state = account.state.toLowerCase();
  if (state === 'inactive' || state === 'initialized') return { label: 'Not delegated', tone: 'neutral', coolingDown: false };
  if (state.includes('deactivat') || (account.deactivationEpoch != null && account.deactivationEpoch !== '18446744073709551615')) {
    return { label: 'Unstaking', tone: 'cooling', coolingDown: true };
  }
  if (state === 'activating') return { label: 'Activating', tone: 'cooling', coolingDown: false };
  if (state === 'active' || state === 'delegated') return { label: 'Staked', tone: 'active', coolingDown: false };
  return { label: 'Status unavailable', tone: 'neutral', coolingDown: false };
}

export function parseStakeAmount(value: string): bigint | null {
  if (!/^(?:\d+(?:\.\d{1,9})?|\.\d{1,9})$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const lamports = BigInt(whole || '0') * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  return lamports > 0n && lamports <= BigInt(Number.MAX_SAFE_INTEGER) ? lamports : null;
}

export function stakeSol(lamports: number): string {
  return (lamports / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 });
}

/** Query both authorities independently: an unsupported index must not discard the other result. */
export async function discoverStakeAccountsByAuthority<T>(lookup: (offset: number) => Promise<readonly T[]>) {
  const results = await Promise.allSettled([lookup(12), lookup(44)]);
  if (results.every(result => result.status === 'rejected')) {
    throw new Error('Stake account discovery is temporarily unavailable on the RPC providers. Refresh to try again, or choose another Solana RPC in Settings.');
  }
  const accounts = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const warnings: string[] = [];
  if (results[0].status === 'rejected') {
    warnings.push('Staker lookup is unavailable. Showing accounts found by withdrawal authority; other stake accounts may be missing.');
  }
  if (results[1].status === 'rejected') {
    warnings.push('Withdrawal-authority lookup is unavailable. Showing accounts found by staking authority; withdraw-only accounts may be missing.');
  }
  return { accounts, warnings };
}

/** Full stake-account balance, in input-ready SOL without locale separators or rounding. */
export function stakeWithdrawalMax(lamports: number): string | null {
  if (!Number.isSafeInteger(lamports) || lamports <= 0) return null;
  const value = BigInt(lamports);
  const fraction = (value % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${value / 1_000_000_000n}${fraction ? `.${fraction}` : ''}`;
}

/** Inflation-only annual rate; excludes compounding, MEV and validator performance. */
export function estimateStakeApr(inflation: number, supply: number, activeStake: number, commission: number): number | null {
  if (![inflation, supply, activeStake, commission].every(Number.isFinite) || inflation < 0 || inflation > 1 || supply <= 0 || activeStake <= 0 || activeStake > supply || commission < 0 || commission > 100) return null;
  const apr = inflation * (supply / activeStake) * (1 - commission / 100) * 100;
  return Number.isFinite(apr) && apr <= 100 ? apr : null;
}

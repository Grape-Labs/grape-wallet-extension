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

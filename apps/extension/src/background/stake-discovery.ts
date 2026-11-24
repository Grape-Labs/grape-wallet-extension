import { PublicKey, StakeProgram, type Connection } from '@solana/web3.js';
import { discoverStakeAccountsByAuthority } from '@grape/core';
import type { StakeAccountRow } from '../shared/models';
export { discoverStakeAccountsByAuthority } from '@grape/core';

/** Discover and parse in the same two queries, using only the selected RPC. */
export async function loadStakeAccounts(connection: Pick<Connection, 'getParsedProgramAccounts'>, owner: PublicKey) {
  const discovery = await discoverStakeAccountsByAuthority(offset => connection.getParsedProgramAccounts(StakeProgram.programId, {
    commitment: 'confirmed',
    filters: [{ dataSize: StakeProgram.space }, { memcmp: { offset, bytes: owner.toBase58() } }]
  }));
  const rows = new Map<string, StakeAccountRow>();
  let unreadable = 0;
  for (const entry of discovery.accounts) {
    const data = entry.account.data;
    if (!entry.account.owner.equals(StakeProgram.programId) || !('parsed' in data) || data.program !== 'stake') { unreadable++; continue; }
    const info = data.parsed?.info;
    const authorized = info?.meta?.authorized;
    // Verify returned authorities too; RPC filters alone are not an ownership check.
    if (authorized?.staker !== owner.toBase58() && authorized?.withdrawer !== owner.toBase58()) continue;
    const delegation = info?.stake?.delegation;
    const delegatedLamports = Number(delegation?.stake ?? 0);
    if (!Number.isSafeInteger(entry.account.lamports) || entry.account.lamports < 0 || !Number.isSafeInteger(delegatedLamports) || delegatedLamports < 0) { unreadable++; continue; }
    const address = entry.pubkey.toBase58();
    rows.set(address, {
      address, lamports: entry.account.lamports, delegatedLamports,
      state: data.parsed.type ?? 'unknown', voter: delegation?.voter ?? null,
      deactivationEpoch: delegation?.deactivationEpoch ?? null,
      staker: authorized.staker ?? null, withdrawer: authorized.withdrawer ?? null
    });
  }
  if (unreadable) discovery.warnings.push('Some stake accounts could not be parsed by your RPC. The displayed balance may be incomplete.');
  return { accounts: [...rows.values()].sort((a, b) => b.lamports - a.lamports), warnings: discovery.warnings };
}

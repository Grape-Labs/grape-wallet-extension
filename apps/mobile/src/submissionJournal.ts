import type { MobileActivity, MobileWallet } from './wallet';

export function recoverSubmissionJournal(
  activities: MobileActivity[], entries: ReadonlyArray<readonly [string, string | null]>,
  wallets: Pick<MobileWallet, 'id' | 'chain'>[]
): MobileActivity[] {
  const merged = new Map(activities.map((item) => [`${item.walletId}:${item.signature || item.id}`, item]));
  for (const [, raw] of entries) {
    try {
      const entry = JSON.parse(raw ?? 'null') as MobileActivity | null;
      if (!entry || entry.source !== 'local' || !wallets.some((wallet) => wallet.id === entry.walletId && wallet.chain === entry.chain)) continue;
      if (typeof entry.signature !== 'string' || !entry.signature || typeof entry.id !== 'string' ||
        typeof entry.type !== 'string' || typeof entry.title !== 'string' || typeof entry.subtitle !== 'string' ||
        typeof entry.amountLabel !== 'string' || !Number.isFinite(entry.timestamp) ||
        !['unknown', 'success', 'failed'].includes(entry.status)) continue;
      const key = `${entry.walletId}:${entry.signature}`;
      if (!merged.has(key)) merged.set(key, entry);
    } catch { /* An incomplete record must not prevent wallet loading. */ }
  }
  return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
}

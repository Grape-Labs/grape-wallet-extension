/** Human-entered SOL: keep the decimal value; never pass it to BigInt. */
export function formatSolAmount(amount: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(amount)) return '—';
  const [whole, fraction = ''] = amount.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** Chain balances and fees are integer lamports, converted exactly to SOL. */
export function formatLamportsAsSol(amount: string | number): string {
  if (typeof amount === 'number' && (!Number.isSafeInteger(amount) || amount < 0)) return '—';
  const text = String(amount);
  if (!/^\d+$/.test(text)) return '—';
  const lamports = BigInt(text);
  return formatSolAmount(`${lamports / 1_000_000_000n}.${(lamports % 1_000_000_000n).toString().padStart(9, '0')}`);
}
import type { PrivacySnapshot } from '@grape/solana/privacy';

export function privateSolValuation(snapshot: PrivacySnapshot | null, price: number | null) {
  const nativeMint = '11111111111111111111111111111111';
  const sol = formatLamportsAsSol(snapshot?.balances.find(balance => balance.mint === nativeMint)?.amount ?? '0');
  const otherAssets = !!snapshot?.balances.some(balance => balance.mint !== nativeMint && balance.amount !== '0');
  const usd = snapshot?.registered && !otherAssets && sol !== '—'
    ? sol === '0' ? 0 : price !== null && Number.isFinite(price) && price > 0 ? Number(sol) * price : null
    : null;
  return { sol, usd, otherAssets };
}


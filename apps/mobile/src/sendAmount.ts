/** Round down to the asset's precision so shortcuts never round above the balance. */
export function getSendShortcutAmount(balance: number, decimals: number, ratio: number, reserve = 0): string {
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(ratio) || ratio <= 0 || ratio > 1) return '';
  const precision = Math.max(0, Math.min(18, Math.floor(decimals)));
  const amount = Math.min(balance * ratio, Math.max(0, balance - reserve));
  const scale = 10 ** precision;
  const rounded = Math.floor(amount * scale) / scale;
  if (!(rounded > 0)) return '';
  const formatted = rounded.toFixed(precision);
  return formatted.includes('.') ? formatted.replace(/0+$/, '').replace(/\.$/, '') : formatted;
}

/** Apply a percentage to an RPC-derived decimal amount without Number rounding. */
export function getExactSendRatio(amount: string, decimals: number, percent: 25 | 50 | 75 | 100): string {
  if (!/^(?:\d+)(?:\.\d+)?$/.test(amount) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Invalid balance.');
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > decimals) throw new Error('Invalid balance precision.');
  const scale = 10n ** BigInt(decimals);
  const units = (BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0') || '0')) * BigInt(percent) / 100n;
  if (units <= 0n) throw new Error('Insufficient balance after network fees.');
  return decimals ? `${units / scale}.${(units % scale).toString().padStart(decimals, '0')}` : units.toString();
}

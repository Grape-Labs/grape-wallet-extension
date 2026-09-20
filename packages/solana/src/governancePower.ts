/** Compare exact unsigned balances without rounding small deposits to zero. */
export function hasPositiveGovernancePower(amount: string | undefined): boolean {
  return !!amount && /^\d+(?:\.\d+)?(?: raw units)?$/.test(amount) && /[1-9]/.test(amount);
}

/** Ascending sum of displayed token units, preserving integer precision. */
export function compareGovernancePower(
  left: Array<{ amount: string; decimals?: number }>,
  right: Array<{ amount: string; decimals?: number }>
): number {
  const parse = ({ amount, decimals }: { amount: string; decimals?: number }) => {
    const match = /^(\d+)(?:\.(\d+))?(?: raw units)?$/.exec(amount);
    if (!match) return { units: 0n, scale: 0 };
    return { units: BigInt(match[1] + (match[2] ?? '')), scale: decimals ?? match[2]?.length ?? 0 };
  };
  const a = left.map(parse), b = right.map(parse);
  const scale = Math.max(0, ...a.map((v) => v.scale), ...b.map((v) => v.scale));
  const total = (values: typeof a) => values.reduce((sum, v) => sum + v.units * 10n ** BigInt(scale - v.scale), 0n);
  const difference = total(a) - total(b);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

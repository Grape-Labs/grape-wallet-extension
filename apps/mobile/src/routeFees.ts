/** Bounded quote/fee convergence: never fall back to a fixed gas allowance. */
export async function findRouteMaximum<T>(input: {
  balance: bigint;
  quote: (amount: bigint) => Promise<T>;
  reserve: (quote: T, amount: bigint) => Promise<bigint>;
}): Promise<{ amount: bigint; quote: T }> {
  if (input.balance <= 1n) throw new Error('Insufficient balance after fees.');
  let amount = input.balance / 2n;
  let largestReserve = 0n;
  for (let attempt = 0; attempt < 5; attempt++) {
    const quote = await input.quote(amount);
    const reserve = await input.reserve(quote, amount);
    if (reserve <= 0n) throw new Error('Route fee unavailable.');
    if (reserve > largestReserve) largestReserve = reserve;
    const next = input.balance - largestReserve;
    if (next <= 0n) throw new Error('Insufficient balance after fees.');
    if (amount <= next && attempt > 0) return { amount, quote };
    amount = next;
  }
  throw new Error('Route fees are changing. Request a fresh quote.');
}

export function assertPreparedRoute(input: { walletId: string; quoteKey: string; expiresAt: number }, walletId: string, quoteKey: string, now = Date.now()) {
  if (input.walletId !== walletId || input.quoteKey !== quoteKey || now >= input.expiresAt) throw new Error('Prepared route changed or expired. Review a fresh quote.');
}

export function assertRouteBudget(approved: { reserveRaw: bigint; request?: { gas: string; gasPrice: string } }, current: { reserveRaw: bigint; request?: { gas: string; gasPrice: string } }) {
  if (current.request && approved.request && (BigInt(current.request.gas) > BigInt(approved.request.gas) || BigInt(current.request.gasPrice) > BigInt(approved.request.gasPrice))) throw new Error('Route gas changed. Review a fresh quote.');
  if (current.reserveRaw > approved.reserveRaw) throw new Error('Route fees increased. Review a fresh quote.');
}

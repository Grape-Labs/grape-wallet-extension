export type ReviewItem = { label: string; value: string };
export type TransactionReview = { title: string; items: ReviewItem[]; confirm: () => Promise<void> };

/** Approval is single-use and bound to the details captured when review opened. */
export function createReviewConfirmation(execute: () => Promise<void>, now = Date.now, lifetimeMs = 60_000) {
  const createdAt = now();
  let used = false;
  return async () => {
    if (used) return;
    if (now() - createdAt >= lifetimeMs) throw new Error('This review expired. Review the transaction again before confirming.');
    used = true;
    await execute();
  };
}

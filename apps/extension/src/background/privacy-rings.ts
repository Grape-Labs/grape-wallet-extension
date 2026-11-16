import { base64ToBytes } from '@grape/core';
import { Connection } from '@solana/web3.js';
import type { PrivacyAction, PrivacyNetwork } from '@grape/solana/privacy';
import { preparePrivacyTransaction, inspectPrivacyTransaction } from '@grape/solana/privacy';

export type PrivacyReview = {
  id: string; network: PrivacyNetwork; action: PrivacyAction; owner: string; recipient: string; amount: string;
  feeLamports: number; debitLamports: number; expiresAt: number;
};
type Prepared = PrivacyReview & { transaction: string; blockhash: string; walletId: string; endpoint: string };
export class PrivacyRingsReviews {
  private readonly reviews = new Map<string, Prepared>();
  private readonly busy = new Set<string>();

  async prepare(input: {
    owner: string; walletId: string; endpoint: string; network: PrivacyNetwork; seed: Uint8Array;
    action: PrivacyAction; amount?: string; recipient?: string;
  }): Promise<PrivacyReview> {
    const connection = new Connection(input.endpoint, 'confirmed');
    const transaction = await preparePrivacyTransaction(input);
    const estimate = await inspectPrivacyTransaction(input.endpoint, transaction, input.owner);
    // SDK already built with a lifetime. Query validity instead of replacing signed proof messages.
    if (!(await connection.isBlockhashValid(estimate.blockhash, { commitment: 'confirmed' })).value) {
      throw new Error('Review expired. Prepare again.');
    }
    const review: PrivacyReview = {
      id: crypto.randomUUID(), network: input.network, action: input.action, owner: input.owner,
      recipient: input.action === 'deposit' || input.action === 'register' ? input.owner : input.recipient!,
      amount: input.action === 'register' ? '0' : input.amount!, feeLamports: estimate.feeLamports,
      debitLamports: estimate.debitLamports, expiresAt: Date.now() + 40_000,
    };
    for (const [id, saved] of this.reviews) if (saved.expiresAt < Date.now() || saved.owner === input.owner) this.reviews.delete(id);
    this.reviews.set(review.id, { ...review, transaction, blockhash: estimate.blockhash, walletId: input.walletId, endpoint: input.endpoint });
    return review;
  }

  async submit(input: { id: string; owner: string; walletId: string; endpoint: string; network: PrivacyNetwork; sign: (transaction: string) => Promise<{ transaction: string; signature: string }> | { transaction: string; signature: string } }) {
    const review = this.reviews.get(input.id);
    if (!review || review.expiresAt < Date.now() || review.owner !== input.owner || review.walletId !== input.walletId || review.endpoint !== input.endpoint || review.network !== input.network) {
      throw new Error('Wallet or network changed, or review expired. Review again.');
    }
    if (this.busy.has(input.owner)) throw new Error('A privacy transaction is already being submitted.');
    this.busy.add(input.owner);
    try {
      const connection = new Connection(input.endpoint, 'confirmed');
      const pendingKey = `grape:privacy:${input.network}:pending:${input.owner}`;
      const pending = (await chrome.storage.local.get(pendingKey))[pendingKey] as { signature: string; blockhash: string } | undefined;
      if (pending) {
        const status = (await connection.getSignatureStatuses([pending.signature], { searchTransactionHistory: true })).value[0];
        if ((!status || (!status.err && status.confirmationStatus === 'processed')) && (await connection.isBlockhashValid(pending.blockhash, { commitment: 'confirmed' })).value) {
          throw new Error(`Previous transaction is still pending: ${pending.signature}. Check it before sending again.`);
        }
      }
      if (!(await connection.isBlockhashValid(review.blockhash, { commitment: 'confirmed' })).value) throw new Error('Review expired. Review again.');
      const signed = await input.sign(review.transaction);
      const bytes = base64ToBytes(signed.transaction);
      const signature = signed.signature;
      // Persist before broadcast so popup closure or an uncertain RPC response cannot hide a send.
      await chrome.storage.local.set({ [pendingKey]: { signature, blockhash: review.blockhash } });
      this.reviews.delete(input.id);
      try {
        await connection.sendRawTransaction(bytes, { skipPreflight: false, maxRetries: 3 });
      } catch {
        return { signature, status: 'unknown' as const };
      }
      // Return the durable signature promptly; confirmation is visible in the explorer.
      return { signature, status: 'submitted' as const };
    } finally {
      this.busy.delete(input.owner);
    }
  }
}

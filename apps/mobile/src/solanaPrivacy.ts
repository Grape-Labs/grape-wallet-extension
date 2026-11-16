import { resolvePrivacyRpc } from '../privacy-rpc-config.cjs';
import type { PrivacyAction, PrivacySnapshot } from '@grape/solana/privacy';
import { base64ToBytes, redactRpcDetails } from '@grape/core';
import { Connection } from '@solana/web3.js';
import type { MobileWallet } from './wallet';
export type MobilePrivacyAction = { action: PrivacyAction; amount?: string; recipient?: string };
export type MobilePrivacyReview = MobilePrivacyAction & { owner: string; feeLamports: number; debitLamports: number; expiresAt: number };
type Runtime = <T>(request: Record<string, unknown>) => Promise<T>;
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export const privateWalletKey = (wallet: Pick<MobileWallet, 'address'>) => `${wallet.address}:mainnet-beta`;
export function mobilePrivacyEndpoint(raw: string) {
  const endpoint = resolvePrivacyRpc([raw]);
  if (!endpoint) throw new Error('Private balances need a configured Helius mainnet RPC.');
  return endpoint;
}
export function privateSol(snapshot: PrivacySnapshot): string {
  const amount = BigInt(snapshot.balances.find(item => item.mint === '11111111111111111111111111111111')?.amount ?? '0');
  if (amount < 0n) throw new Error('Invalid private balance.');
  return `${amount / 1_000_000_000n}.${(amount % 1_000_000_000n).toString().padStart(9, '0')}`.replace(/\.?0+$/, '');
}
export function createMobilePrivacyService(input: { wallet: MobileWallet; endpoint: string; runtime: Runtime; storage: Storage; authorize: () => number; now?: () => number; connection?: Connection }) {
  const { wallet, authorize } = input;
  const endpoint = mobilePrivacyEndpoint(input.endpoint);
  if (wallet.chain !== 'solana' || wallet.source === 'ledger') throw new Error('Private balances require a Solana software wallet.');
  const connection = input.connection ?? new Connection(endpoint, 'confirmed');
  const now = input.now ?? Date.now;
  const pendingKey = `grape:privacy:mainnet-beta:pending:${wallet.address}`;
  let prepared: { review: MobilePrivacyReview; transaction: string; blockhash: string; epoch: number } | null = null;
  let submitting = false;
  const call: Runtime = async <T,>(request: Record<string, unknown>) => { const epoch = authorize(); const result = await input.runtime<T>({ ...request, endpoint, owner: wallet.address }); if (authorize() !== epoch) throw new Error('Wallet session changed. Review again.'); return result; };
  async function pending() {
    const raw = await input.storage.getItem(pendingKey);
    if (!raw) return null;
    const item = JSON.parse(raw) as { signature: string; blockhash: string };
    const status = (await connection.getSignatureStatuses([item.signature], { searchTransactionHistory: true })).value[0];
    return { ...item, status: status?.err ? 'failed' : status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized' ? 'confirmed' : 'unknown' };
  }
  return {
    async sync() { const snapshot = await call<PrivacySnapshot>({ operation: 'sync' }); return { snapshot, submission: await pending() }; },
    async prepare(action: MobilePrivacyAction) {
      prepared = null;
      const epoch = authorize();
      const result = await call<{ transaction: string; blockhash: string; feeLamports: number; debitLamports: number }>({ operation: 'prepare', action });
      if (!(await connection.isBlockhashValid(result.blockhash, { commitment: 'confirmed' })).value) throw new Error('Review expired. Review again.');
      if (authorize() !== epoch) throw new Error('Wallet session changed. Review again.');
      const review = Object.freeze({ ...action, owner: wallet.address, feeLamports: result.feeLamports, debitLamports: result.debitLamports, expiresAt: now() + 40_000 });
      prepared = { review, transaction: result.transaction, blockhash: result.blockhash, epoch }; return review;
    },
    async submit(review: MobilePrivacyReview) {
      authorize();
      if (submitting) throw new Error('A privacy transaction is already being submitted.');
      if (!prepared || prepared.review !== review || authorize() !== prepared.epoch || now() >= review.expiresAt) throw new Error('Review expired. Review again.');
      submitting = true;
      const saved = prepared; prepared = null;
      try {
        const previous = await pending();
        if (previous?.status === 'unknown' && (await connection.isBlockhashValid(previous.blockhash, { commitment: 'confirmed' })).value) throw new Error(`A previous transaction is pending: ${previous.signature}. Check it before trying again.`);
        if (!(await connection.isBlockhashValid(saved.blockhash, { commitment: 'confirmed' })).value) throw new Error('Review expired. Review again.');
        const signed = await call<{ transaction: string; signature: string }>({ operation: 'sign', transaction: saved.transaction });
        if (authorize() !== saved.epoch) throw new Error('Wallet session changed. Review again.');
        // Durable before broadcast, including uncertain network responses and process death.
        await input.storage.setItem(pendingKey, JSON.stringify({ signature: signed.signature, blockhash: saved.blockhash }));
        if (authorize() !== saved.epoch) throw new Error('Wallet session changed. Review again.');
        try { await connection.sendRawTransaction(base64ToBytes(signed.transaction), { skipPreflight: false, maxRetries: 3 }); }
        catch { return { signature: signed.signature, status: 'unknown' as const }; }
        return { signature: signed.signature, status: 'submitted' as const };
      } finally { submitting = false; }
    }
  };
}
export const privacyError = (error: unknown) => redactRpcDetails(error instanceof Error ? error.message : 'Private balance request failed.');

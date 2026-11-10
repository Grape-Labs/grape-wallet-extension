export type SubmissionStatus = 'success' | 'failed' | 'unknown';

export function parseSubmissionStatus(chain: string, result: unknown): SubmissionStatus {
  if (!result || typeof result !== 'object') return 'unknown';
  if (chain === 'solana') {
    const status = (result as { value?: Array<{ err?: unknown; confirmationStatus?: string } | null> }).value?.[0];
    if (!status) return 'unknown';
    if (status.err != null) return 'failed';
    return status.err === null && ['confirmed', 'finalized'].includes(status.confirmationStatus ?? '') ? 'success' : 'unknown';
  }
  const receipt = result as { status?: string; blockNumber?: string };
  if (!receipt.blockNumber) return 'unknown';
  return receipt.status === '0x1' ? 'success' : receipt.status === '0x0' ? 'failed' : 'unknown';
}

export async function fetchSubmissionStatus(chain: string, signature: string, rpcUrl: string): Promise<SubmissionStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1,
        method: chain === 'solana' ? 'getSignatureStatuses' : 'eth_getTransactionReceipt',
        params: chain === 'solana' ? [[signature], { searchTransactionHistory: true }] : [signature]
      })
    });
    if (!response.ok) return 'unknown';
    const data = await response.json();
    return data.error ? 'unknown' : parseSubmissionStatus(chain, data.result);
  } catch {
    return 'unknown';
  } finally { clearTimeout(timeout); }
}

/** Once broadcast succeeds, persistence errors must never be reported as send errors. */
export async function recordSubmission(writeJournal: () => Promise<unknown>, writeState: () => Promise<unknown>): Promise<boolean> {
  const journalSaved = await Promise.resolve().then(writeJournal).then(() => true, () => false);
  const stateSaved = await Promise.resolve().then(writeState).then(() => true, () => false);
  return journalSaved || stateSaved;
}

export const SEND_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export type SendDraft = { version: 1; walletId: string; chain: string; assetId: string; symbol: string; recipient: string; amount: string; privateSend: boolean; updatedAt: number };
export const sendDraftKey = (walletId: string, chain: string) => `grape:send-draft:${encodeURIComponent(chain)}:${encodeURIComponent(walletId)}`;

/** Whitelist fields; never persist credentials, approvals, quotes or deposit orders. */
export function serializeSendDraft(draft: SendDraft): string {
  return JSON.stringify({ version: 1, walletId: draft.walletId, chain: draft.chain, assetId: draft.assetId, symbol: draft.symbol, recipient: draft.recipient, amount: draft.amount, privateSend: draft.privateSend, updatedAt: draft.updatedAt });
}

export function parseSendDraft(raw: string | null, walletId: string, chain: string, now = Date.now()): SendDraft | null {
  try {
    const draft = JSON.parse(raw ?? 'null') as SendDraft | null;
    if (!draft || draft.version !== 1 || draft.walletId !== walletId || draft.chain !== chain ||
      typeof draft.assetId !== 'string' || !draft.assetId || typeof draft.symbol !== 'string' ||
      typeof draft.recipient !== 'string' || draft.recipient.length > 1024 || typeof draft.amount !== 'string' || draft.amount.length > 100 ||
      typeof draft.privateSend !== 'boolean' || !Number.isFinite(draft.updatedAt) || draft.updatedAt > now || now - draft.updatedAt >= SEND_DRAFT_TTL_MS ||
      (!draft.recipient.trim() && !draft.amount.trim())) return null;
    return draft;
  } catch { return null; }
}

/** Serialize writes so a discard/submission deletion cannot be overtaken by an older save. */
export function createDraftWriteQueue() {
  let pending = Promise.resolve();
  return <T>(write: () => Promise<T>) => {
    const result = pending.then(write);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
}

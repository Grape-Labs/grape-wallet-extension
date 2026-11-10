import { describe, expect, it } from 'vitest';
import { createDraftWriteQueue, parseSendDraft, sendDraftKey, serializeSendDraft, SEND_DRAFT_TTL_MS, type SendDraft } from './sendDraft';
const draft: SendDraft = { version: 1, walletId: 'wallet', chain: 'solana', assetId: 'sol', symbol: 'SOL', recipient: 'recipient.sol', amount: '1.25', privateSend: false, updatedAt: 1000 };
describe('send draft recovery', () => {
  it('restores valid form fields for the same wallet and chain', () => {
    expect(parseSendDraft(serializeSendDraft(draft), 'wallet', 'solana', 2000)).toEqual(draft);
  });
  it('separates keys by account and network', () => {
    expect(sendDraftKey('wallet', 'solana')).not.toBe(sendDraftKey('other', 'solana'));
    expect(sendDraftKey('wallet', 'solana')).not.toBe(sendDraftKey('wallet', 'ethereum'));
  });
  it('rejects another account, another chain, future timestamps and expired drafts', () => {
    const raw = serializeSendDraft(draft);
    expect(parseSendDraft(raw, 'other', 'solana', 2000)).toBeNull();
    expect(parseSendDraft(raw, 'wallet', 'ethereum', 2000)).toBeNull();
    expect(parseSendDraft(raw, 'wallet', 'solana', 999)).toBeNull();
    expect(parseSendDraft(raw, 'wallet', 'solana', 1000 + SEND_DRAFT_TTL_MS)).toBeNull();
  });
  it.each(['{', 'null', '{}', JSON.stringify({ ...draft, recipient: '', amount: '' }), JSON.stringify({ ...draft, version: 2 })])('ignores malformed or empty data', (raw) => {
    expect(parseSendDraft(raw, 'wallet', 'solana', 2000)).toBeNull();
  });
  it('whitelists serialized data instead of persisting credentials or orders', () => {
    const raw = serializeSendDraft({ ...draft, password: 'secret', quote: {}, order: {}, approval: {} } as SendDraft);
    expect(JSON.parse(raw)).toEqual(draft);
  });
  it('orders a discard after an in-flight save and continues after a failed write', async () => {
    const queue = createDraftWriteQueue();
    const events: string[] = [];
    const first = queue(async () => { events.push('saved'); });
    const failed = queue(async () => { throw new Error('disk'); }).catch(() => undefined);
    const discard = queue(async () => { events.push('removed'); });
    const read = queue(async () => events.join(','));
    await Promise.all([first, failed, discard]);
    expect(await read).toBe('saved,removed');
  });
});

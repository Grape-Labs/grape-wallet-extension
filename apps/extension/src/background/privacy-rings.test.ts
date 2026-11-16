import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, MessageV0, VersionedTransaction } from '@solana/web3.js';
import { bytesToBase64 } from '@grape/core';
import { signSerializedTransaction } from '@grape/solana';
import { preparePrivacyTransaction, inspectPrivacyTransaction } from '@grape/solana/privacy';
import { PrivacyRingsReviews } from './privacy-rings';

const rpc = vi.hoisted(() => ({
  getBalance: vi.fn(), simulateTransaction: vi.fn(), getFeeForMessage: vi.fn(),
  isBlockhashValid: vi.fn(), getSignatureStatuses: vi.fn(), sendRawTransaction: vi.fn(),
}));
vi.mock('@grape/solana/privacy', () => ({ preparePrivacyTransaction: vi.fn(), inspectPrivacyTransaction: vi.fn() }));
vi.mock('@solana/web3.js', async importOriginal => {
  const actual = await importOriginal<typeof import('@solana/web3.js')>();
  return { ...actual, Connection: function () { return rpc; } };
});

describe('Privacy transaction review and submission', () => {
  const signer = Keypair.fromSeed(new Uint8Array(32).fill(9));
  const input = { owner: signer.publicKey.toBase58(), walletId: 'wallet-1', network: 'devnet' as const, endpoint: 'https://devnet.helius-rpc.com/?api-key=test', seed: new Uint8Array(32).fill(9), action: 'deposit' as const, amount: '0.01' };
  let storage: Record<string, unknown>;
  const transaction = bytesToBase64(new VersionedTransaction(new MessageV0({
    header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 0 },
    staticAccountKeys: [signer.publicKey], recentBlockhash: '11111111111111111111111111111111', compiledInstructions: [], addressTableLookups: [],
  })).serialize());
  beforeEach(() => {
    vi.resetAllMocks(); storage = {};
    vi.stubGlobal('chrome', { storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(storage, values); }),
    } } });
    vi.mocked(preparePrivacyTransaction).mockResolvedValue(transaction);
    vi.mocked(inspectPrivacyTransaction).mockResolvedValue({ feeLamports: 5000, debitLamports: 10_005_000, blockhash: '11111111111111111111111111111111' });
    rpc.getBalance.mockResolvedValue(1_000_000_000);
    rpc.simulateTransaction.mockResolvedValue({ value: { err: null, accounts: [{ lamports: 989_995_000 }] } });
    rpc.getFeeForMessage.mockResolvedValue({ value: 5000 });
    rpc.isBlockhashValid.mockResolvedValue({ value: true });
    rpc.sendRawTransaction.mockResolvedValue('signature');
    rpc.getSignatureStatuses.mockResolvedValue({ value: [null] });
  });
  const signForTest = (serialized: string) => ({ transaction: signSerializedTransaction(serialized, signer), signature: 'mock-signed-signature' });
  const submit = (reviews: PrivacyRingsReviews, id: string, overrides = {}) => reviews.submit({
    ...input, id, sign: signForTest, ...overrides,
  });

  it('quotes the simulated debit and binds confirmation to owner, wallet and endpoint', async () => {
    const reviews = new PrivacyRingsReviews();
    const preview = await reviews.prepare(input);
    expect(preview).toMatchObject({ feeLamports: 5000, debitLamports: 10_005_000, recipient: input.owner });
    await expect(submit(reviews, preview.id, { walletId: 'other-wallet' })).rejects.toThrow('Wallet or network changed');
    await expect(submit(reviews, preview.id, { endpoint: 'https://other.example' })).rejects.toThrow('Wallet or network changed');
    await expect(submit(reviews, preview.id, { network: 'mainnet-beta' })).rejects.toThrow('Wallet or network changed');
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
  });
  it('builds mainnet reviews on mainnet and stores submission recovery separately from devnet', async () => {
    const reviews = new PrivacyRingsReviews();
    const mainnet = { ...input, network: 'mainnet-beta' as const, endpoint: 'https://mainnet.helius-rpc.com/?api-key=test' };
    storage[`grape:privacy:devnet:pending:${input.owner}`] = { signature: 'pending-devnet', blockhash: '11111111111111111111111111111111' };
    const preview = await reviews.prepare(mainnet);
    expect(preview.network).toBe('mainnet-beta');
    expect(preparePrivacyTransaction).toHaveBeenLastCalledWith(expect.objectContaining({ network: 'mainnet-beta', endpoint: mainnet.endpoint }));
    const result = await reviews.submit({ ...mainnet, id: preview.id, sign: signForTest });
    expect(storage[`grape:privacy:mainnet-beta:pending:${input.owner}`]).toMatchObject({ signature: result.signature });
    expect(storage[`grape:privacy:devnet:pending:${input.owner}`]).toMatchObject({ signature: 'pending-devnet' });
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it('persists a signature before broadcast and consumes the review once', async () => {
    const reviews = new PrivacyRingsReviews();
    const preview = await reviews.prepare(input);
    rpc.sendRawTransaction.mockImplementation(async () => {
      expect(Object.values(storage)[0]).toHaveProperty('signature');
      return 'signature';
    });
    expect(await submit(reviews, preview.id)).toMatchObject({ status: 'submitted' });
    await expect(submit(reviews, preview.id)).rejects.toThrow('review expired');
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it('retains an uncertain submission and blocks another while its blockhash is live', async () => {
    const reviews = new PrivacyRingsReviews();
    const first = await reviews.prepare(input);
    rpc.sendRawTransaction.mockRejectedValue(new Error('connection lost'));
    expect(await submit(reviews, first.id)).toMatchObject({ status: 'unknown' });
    const second = await reviews.prepare(input);
    await expect(submit(reviews, second.id)).rejects.toThrow('still pending');
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it('rejects failed simulation and expired blockhashes before broadcast', async () => {
    const reviews = new PrivacyRingsReviews();
    vi.mocked(inspectPrivacyTransaction).mockRejectedValueOnce(new Error('Privacy transaction simulation failed.'));
    await expect(reviews.prepare(input)).rejects.toThrow('simulation failed');
    const preview = await reviews.prepare(input);
    rpc.isBlockhashValid.mockResolvedValue({ value: false });
    await expect(submit(reviews, preview.id)).rejects.toThrow('expired');
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
  });
});

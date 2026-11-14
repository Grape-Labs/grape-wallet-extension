import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { getSolanaWireMessage, readSolanaSwapBalance } from './solanaSwapRpc';
const owner = '11111111111111111111111111111111';
const mint = 'So11111111111111111111111111111111111111112';
afterEach(() => vi.restoreAllMocks());
function rpcResult(result: unknown) { return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result })); }
describe('Swap amount balance queries', () => {
  it('reads native SOL without preparing a transfer or a quote', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(rpcResult({ value: 1_234_567_891 }));
    expect(await readSolanaSwapBalance('https://rpc.example', owner)).toBe(1_234_567_891n);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ method: 'getBalance', params: [owner, { commitment: 'confirmed' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('resolves SPL holdings by owner and mint without an accountAddress', async () => {
    const account = (amount: string, state = 'initialized') => ({ account: { data: { parsed: { info: { state, tokenAmount: { amount } } } } } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(rpcResult({ value: [account('1234567890123456789'), account('11'), account('999', 'frozen')] }));
    expect(await readSolanaSwapBalance('https://rpc.example', owner, mint)).toBe(1234567890123456800n);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ method: 'getTokenAccountsByOwner', params: [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }] });
  });
  it('reports bad metadata and unavailable balances without constructing an empty public key', async () => {
    await expect(readSolanaSwapBalance('https://rpc.example', '', mint)).rejects.toThrow('Wallet is not a valid');
    await expect(readSolanaSwapBalance('https://rpc.example', owner, '')).rejects.toThrow('Token mint is not a valid');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(rpcResult({ value: [] })).mockResolvedValueOnce(rpcResult({ value: 1.5 }));
    expect(await readSolanaSwapBalance('https://rpc.example', owner, mint)).toBe(0n);
    await expect(readSolanaSwapBalance('https://rpc.example', owner)).rejects.toThrow('unavailable');
  });
});
describe('serialized route message extraction on mobile', () => {
  const payerKey = new PublicKey(owner);
  const instruction = SystemProgram.transfer({ fromPubkey: payerKey, toPubkey: new PublicKey(mint), lamports: 1 });
  it('extracts a legacy message byte for byte and verifies its payer', () => {
    const transaction = new Transaction({ feePayer: payerKey, recentBlockhash: owner }).add(instruction);
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
    expect(getSolanaWireMessage(serialized, owner)).toBe(transaction.compileMessage().serialize().toString('base64'));
    expect(() => getSolanaWireMessage(serialized, mint)).toThrow('fee payer');
  });
  it('extracts a versioned message without deserializing PublicKey/BN objects', () => {
    const message = new TransactionMessage({ payerKey, recentBlockhash: owner, instructions: [instruction] }).compileToV0Message();
    const serialized = Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
    expect(getSolanaWireMessage(serialized, owner)).toBe(Buffer.from(message.serialize()).toString('base64'));
    expect(() => getSolanaWireMessage(serialized.slice(0, 20), owner)).toThrow('truncated');
  });
});

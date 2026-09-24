import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, type Connection } from '@solana/web3.js';
import { address } from '@solana/web3-v2';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { getListStateEncoder, getListLegacyInstructionDataDecoder, getDelistLegacyInstructionDataDecoder } from '@tensor-foundation/marketplace';
import { buildTensorTransaction, inspectTensorNft, listingAddress, solPriceToLamports, TENSOR_PROGRAM } from './tensor-marketplace';
const owner = Keypair.generate().publicKey.toBase58(), mint = Keypair.generate().publicKey.toBase58();
const token = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const metadataProgram = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
function fixture({ listed = false, standard = 0, wrongOwner = false, rules = false, simulateError = false } = {}) {
  const mintBytes = Buffer.alloc(82); mintBytes.writeBigUInt64LE(1n,36); mintBytes[45] = 1;
  const metadata = getMetadataAccountDataSerializer().serialize({
    updateAuthority: publicKey(owner), mint: publicKey(mint), name: 'Test NFT', symbol: 'NFT', uri: '',
    sellerFeeBasisPoints: 500, creators: null, primarySaleHappened: false, isMutable: true, editionNonce: null,
    tokenStandard: standard, collection: null, uses: null, collectionDetails: null,
    programmableConfig: rules ? { __kind: 'V1', ruleSet: publicKey(owner) } : null
  });
  const list = getListStateEncoder().encode({
    version: 1, bump: [1], owner: address(wrongOwner ? mint : owner), assetId: address(mint), amount: 1000000000n,
    currency: null, expiry: 1900000000n, privateTaker: null, makerBroker: null, rentPayer: null, cosigner: null,
    reserved1: new Uint8Array(64)
  });
  const connection = {
    getMultipleAccountsInfo: vi.fn(async () => [
      { owner: token, data: mintBytes }, { owner: metadataProgram, data: Buffer.from(metadata) },
      listed ? { owner: TENSOR_PROGRAM, data: Buffer.from(list) } : null
    ]),
    getParsedTokenAccountsByOwner: vi.fn(async () => ({ value: [{
      pubkey: Keypair.generate().publicKey, account: { data: { parsed: { info: { owner, mint, tokenAmount: { amount: '1' }, state: standard === 4 ? 'frozen' : 'initialized' } } } }
    }] })),
    getLatestBlockhash: vi.fn(async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 100 })),
    getFeeForMessage: vi.fn(async () => ({ value: 5000 })),
    getBalance: vi.fn(async () => 10000000),
    simulateTransaction: vi.fn(async () => ({ value: { err: simulateError ? { InstructionError: [1, 'failed'] } : null, accounts: [{ lamports: 9000000 }] } }))
  };
  return { connection: connection as unknown as Connection, mocks: connection, mintBytes };
}
describe('Tensor local transaction construction', () => {
  it('converts prices exactly, including one lamport', () => {
    expect(solPriceToLamports('0.000000001')).toBe(1n);
    expect(solPriceToLamports('123.123456789')).toBe(123123456789n);
    for (const value of ['0', '-1', 'NaN', '1e3', '0.0000000001', '1.2.3']) expect(() => solPriceToLamports(value)).toThrow();
  });
  it('derives a mint-specific listing address', () => {
    expect(listingAddress(new PublicKey(mint)).equals(listingAddress(new PublicKey(owner)))).toBe(false);
  });
  it('builds a fixed-price, seven-day listing with only the owner signing', async () => {
    const { connection } = fixture();
    const result = await buildTensorTransaction(connection, owner, mint, 'list', '1.25');
    const ix = result.transaction.instructions[1];
    expect(ix.programId.equals(TENSOR_PROGRAM)).toBe(true);
    const decoded = getListLegacyInstructionDataDecoder().decode(ix.data);
    expect(decoded.amount).toBe(1250000000n);
    expect(decoded.expireInSec).toEqual({ __option: 'Some', value: 604800n });
    expect(decoded.currency.__option).toBe('None');
    expect(decoded.makerBroker.__option).toBe('None');
    expect(ix.keys.filter(key => key.isSigner).every(key => key.pubkey.toBase58() === owner)).toBe(true);
    expect(ix.keys[12].pubkey.equals(TENSOR_PROGRAM)).toBe(true);
    expect(result.networkFeeLamports).toBe(5000);
  });
  it('supplies token records for unrestricted programmable NFTs', async () => {
    const { connection } = fixture({ standard: 4 });
    const result = await buildTensorTransaction(connection, owner, mint, 'list', '1');
    expect(result.transaction.instructions[1].keys[12].pubkey.equals(TENSOR_PROGRAM)).toBe(false);
  });
  it('builds cancellation returning rent to the recorded rent payer', async () => {
    const { connection } = fixture({ listed: true });
    const result = await buildTensorTransaction(connection, owner, mint, 'cancel');
    const ix = result.transaction.instructions[1];
    expect(() => getDelistLegacyInstructionDataDecoder().decode(ix.data)).not.toThrow();
    expect(ix.keys[5].pubkey.toBase58()).toBe(owner);
  });
  it('rejects listing twice and cancelling an absent listing', async () => {
    await expect(buildTensorTransaction(fixture({ listed: true }).connection, owner, mint, 'list', '1')).rejects.toThrow('existing listing');
    await expect(buildTensorTransaction(fixture().connection, owner, mint, 'cancel')).rejects.toThrow('no longer listed');
  });
  it('rejects a listing owned by someone else', async () => {
    expect((await inspectTensorNft(fixture({ listed: true, wrongOwner: true }).connection, owner, mint)).status.supported).toBe(false);
  });
  it('does not offer native trading for custom programmable rules', async () => {
    expect((await inspectTensorNft(fixture({ standard: 4, rules: true }).connection, owner, mint)).status.supported).toBe(false);
  });
  it('rejects fungible supply and failed simulations', async () => {
    const fixtureData = fixture(); fixtureData.mintBytes.writeBigUInt64LE(2n,36);
    expect((await inspectTensorNft(fixtureData.connection, owner, mint)).status.supported).toBe(false);
    await expect(buildTensorTransaction(fixture({ simulateError: true }).connection, owner, mint, 'list', '1')).rejects.toThrow('simulate');
  });
  it('requires an owned undelegated token account', async () => {
    const data = fixture(); data.mocks.getParsedTokenAccountsByOwner.mockResolvedValue({ value: [] });
    expect((await inspectTensorNft(data.connection, owner, mint)).status.supported).toBe(false);
  });
});

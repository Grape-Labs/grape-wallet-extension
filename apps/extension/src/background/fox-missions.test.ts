import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, type Connection, type AccountInfo } from '@solana/web3.js';
import { publicKey } from '@metaplex-foundation/umi';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { assertFoxReviewContext, buildFoxMission, decodeFoxAccount, foxDiscriminator, FOX_PROGRAM, inspectFoxMission, missionWindow } from './fox-missions';
import { FOX_COLLECTIONS, FOX_POWERUPS } from '../shared/fox-missions';
import schema from './fox-missions-interface.json';
const owner = Keypair.generate().publicKey, mint = Keypair.generate().publicKey, mission = Keypair.generate().publicKey, tokenAddress = Keypair.generate().publicKey, activeAccount = Keypair.generate().publicKey;
const TOKEN = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), META = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const pda = (...seeds: (PublicKey | string)[]) => PublicKey.findProgramAddressSync(seeds.map(x => typeof x === 'string' ? Buffer.from(x) : x.toBuffer()), FOX_PROGRAM)[0];
async function account(name: string, fields: Record<string, any>): Promise<AccountInfo<Buffer>> {
  function encode(type: any, value: any): Buffer {
    if (type === 'publicKey') return (value ?? PublicKey.default).toBuffer();
    if (type === 'bool' || type === 'u8') return Buffer.from([Number(value ?? 0)]);
    if (type === 'u16') { const b = Buffer.alloc(2); b.writeUInt16LE(value ?? 0); return b; }
    if (type === 'u64') { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value ?? 0)); return b; }
    if (type.option) return value == null ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), encode(type.option, value)]);
    return Buffer.alloc(type.array[1]);
  }
  return { owner: FOX_PROGRAM, lamports: 1, executable: false, rentEpoch: 0, data: Buffer.concat([await foxDiscriminator('account', name[0].toUpperCase() + name.slice(1)), ...schema.accounts.find(a => a.name === name)!.type.fields.map(f => encode(f.type, fields[f.name]))]) };
}
async function fixture({ active = false, complete = false, verified = true, wrongProfile = false, delegated = false, standard = 0, boosted = false, consumable = false, simulationError = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [{ id: 1, name: 'Weekly mission', version: 3, address: mission.toBase58() }] })));
  const missionInfo = await account('mission', { id: 1, version: 3, lockstart: 1000, lockend: 2000, timelock: 600, xpreward: 150, reward: new PublicKey('ChEsTBFtT4PNEDTEfpvREFUoALMjaUhM5HyCh1jJnQn2') });
  const foxInfo = active ? await account('fox', { fox: wrongProfile ? owner : mint, owner, xp: 1000, missions: 4, mission, missionAccount: activeAccount }) : null;
  const missionAccount = await account('missionAccount', { owner, started: true, count: boosted ? 2 : 1, mission, consumable: consumable ? new PublicKey(FOX_POWERUPS[0].mint) : PublicKey.default });
  const mintBytes = Buffer.alloc(82); mintBytes.writeBigUInt64LE(1n, 36); mintBytes[45] = 1;
  const meta = getMetadataAccountDataSerializer().serialize({ updateAuthority: publicKey(owner.toBase58()), mint: publicKey(mint.toBase58()), name: 'Fox', symbol: 'FFF', uri: '', sellerFeeBasisPoints: 0, creators: null, primarySaleHappened: false, isMutable: true, editionNonce: null, tokenStandard: standard, collection: { verified, key: publicKey(FOX_COLLECTIONS[0]) }, uses: null, collectionDetails: null, programmableConfig: null });
  const clock = Buffer.alloc(40); clock.writeBigInt64LE(BigInt(complete ? 2600 : active ? 2300 : 1500), 32);
  const mocks = {
    getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.length === 5 ? [{ executable: true }, { owner: TOKEN, data: mintBytes }, { owner: META, data: Buffer.from(meta) }, foxInfo, { data: clock }] : keys.map(() => missionInfo)),
    getParsedTokenAccountsByOwner: vi.fn(async () => ({ value: [{ pubkey: tokenAddress, account: { owner: TOKEN, data: { parsed: { info: { mint: mint.toBase58(), owner: owner.toBase58(), tokenAmount: { amount: '1' }, state: active || standard === 4 ? 'frozen' : 'initialized', delegate: active ? pda(mission, 'auth', owner).toBase58() : delegated ? owner.toBase58() : undefined } } } } }] })),
    getAccountInfo: vi.fn(async (key: PublicKey) => key.equals(activeAccount) ? missionAccount : null),
    getProgramAccounts: vi.fn(async () => []),
    getLatestBlockhash: vi.fn(async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 123 })),
    getFeeForMessage: vi.fn(async () => ({ value: 5000 })), getBalance: vi.fn(async () => 10000000),
    simulateTransaction: vi.fn(async () => ({ value: { err: simulationError ? { InstructionError: [1, 'failed'] } : null, accounts: [{ lamports: 9000000 }] } }))
  };
  return { connection: mocks as unknown as Connection, mocks, missionInfo };
}
afterEach(() => vi.unstubAllGlobals());
describe('Famous Fox program adapter', () => {
  it('uses chain entry and end boundaries, not the browser clock', () => {
    const m = { lockstart: 1000n, lockend: 2000n, timelock: 600n, end: false };
    expect(missionWindow(m, 1000).accepting).toBe(true); expect(missionWindow(m, 2000).accepting).toBe(false); expect(missionWindow(m, 2599).complete).toBe(false); expect(missionWindow(m, 2600).complete).toBe(true);
  });
  it('rejects forged account owners, wrong discriminators, and truncated layouts', async () => {
    const x = await fixture();
    await expect(decodeFoxAccount('mission', { ...x.missionInfo, owner })).rejects.toThrow('Invalid');
    await expect(decodeFoxAccount('fox', x.missionInfo)).rejects.toThrow('Invalid');
    await expect(decodeFoxAccount('mission', { ...x.missionInfo, data: x.missionInfo.data.subarray(0, 20) })).rejects.toThrow('layout');
  });
  it('rejects a spoofed collection verification flag', async () => expect((await inspectFoxMission((await fixture({ verified: false })).connection, owner.toBase58(), mint.toBase58())).status.eligible).toBe(false));
  it('does not deploy a staked or delegated Fox', async () => expect((await inspectFoxMission((await fixture({ delegated: true })).connection, owner.toBase58(), mint.toBase58())).status.canStart).toBe(false));
  it('rejects a Fox profile for another mint', async () => await expect(inspectFoxMission((await fixture({ active: true, wrongProfile: true })).connection, owner.toBase58(), mint.toBase58())).rejects.toThrow('mint mismatch'));
  it('holds active missions until the on-chain end time', async () => {
    const f = await fixture({ active: true }); const s = (await inspectFoxMission(f.connection, owner.toBase58(), mint.toBase58())).status;
    expect(s.state).toBe('locked'); expect(s.canStart).toBe(false); expect(s.canClaim).toBe(false);
    await expect(buildFoxMission(f.connection, owner.toBase58(), mint.toBase58(), 'claim')).rejects.toThrow();
  });
  it('builds a solo start with only the wallet as signer and no remote transaction', async () => {
    const built = await buildFoxMission((await fixture()).connection, owner.toBase58(), mint.toBase58(), 'start');
    const native = built.transaction.instructions.filter(x => x.programId.equals(FOX_PROGRAM));
    expect(native.length).toBe(3); expect(native.at(-1)!.data.subarray(0, 8)).toEqual(await foxDiscriminator('global', 'start_mission'));
    expect(new Set(native.flatMap(x => x.keys.filter(k => k.isSigner).map(k => k.pubkey.toBase58())))).toEqual(new Set([owner.toBase58()]));
    expect(built.networkFeeLamports).toBe(5000); expect(built.estimatedDebitLamports).toBe(1000000);
  });
  it('skips consumable RPC lookups during gallery scans', async () => {
    const f = await fixture();
    const result = await inspectFoxMission(f.connection, owner.toBase58(), mint.toBase58(), { includePowerups: false });
    expect(result.status.canStart).toBe(true);
    expect(result.status.powerups).toBeUndefined();
    expect(f.mocks.getParsedTokenAccountsByOwner).toHaveBeenCalledTimes(1);
  });
  it('adds only an owned consumable to the reviewed transaction', async () => {
    const f = await fixture();
    const boost = new PublicKey(FOX_POWERUPS[0].mint);
    const address = PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN.toBuffer(), boost.toBuffer()], new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'))[0];
    const original = f.mocks.getParsedTokenAccountsByOwner.getMockImplementation()!;
    f.mocks.getParsedTokenAccountsByOwner.mockImplementation(async (...args: any[]) => {
      if (args[1]?.mint.equals(boost)) return { value: [{ pubkey: address, account: { owner: TOKEN, data: { parsed: { info: { owner: owner.toBase58(), mint: boost.toBase58(), state: 'initialized', tokenAmount: { amount: '2' } } } } } }] } as any;
      return original();
    });
    const built = await buildFoxMission(f.connection, owner.toBase58(), mint.toBase58(), 'start', boost.toBase58());
    expect(built.powerup?.name).toBe('Basic Fishing Rod');
    const burn = built.transaction.instructions.at(-1)!;
    expect(burn.data.subarray(0, 8)).toEqual(await foxDiscriminator('global', 'start_mission_room'));
    expect(burn.keys[4].pubkey).toEqual(address);
    expect(burn.keys[5].pubkey).toEqual(boost);
  });
  it('rejects unowned and unknown powerups', async () => {
    const f = await fixture();
    for (const boost of [FOX_POWERUPS[0].mint, owner.toBase58()]) await expect(buildFoxMission(f.connection, owner.toBase58(), mint.toBase58(), 'start', boost)).rejects.toThrow('powerup is unavailable');
  });
  it('supplies programmable NFT token records', async () => {
    const built = await buildFoxMission((await fixture({ standard: 4 })).connection, owner.toBase58(), mint.toBase58(), 'start');
    const start = built.transaction.instructions.at(-1)!;
    expect(start.keys[13].pubkey.equals(FOX_PROGRAM)).toBe(false);
  });
  it('builds Fox return and reward claim atomically after the mission ends', async () => {
    const built = await buildFoxMission((await fixture({ active: true, complete: true })).connection, owner.toBase58(), mint.toBase58(), 'claim');
    const native = built.transaction.instructions.filter(x => x.programId.equals(FOX_PROGRAM));
    expect(native.map(x => x.data.subarray(0, 8))).toEqual([await foxDiscriminator('global', 'end_mission_v3'), await foxDiscriminator('global', 'claim_reward')]);
  });
  it('claims a single Fox whose consumable was burned at deployment', async () => {
    const f = await fixture({ active: true, complete: true, consumable: true });
    expect((await inspectFoxMission(f.connection, owner.toBase58(), mint.toBase58())).status.canClaim).toBe(true);
    await expect(buildFoxMission(f.connection, owner.toBase58(), mint.toBase58(), 'claim')).resolves.toBeDefined();
  });
  it('does not partially claim boosted multi-asset squads', async () => {
    const f = await fixture({ active: true, complete: true, boosted: true }); expect((await inspectFoxMission(f.connection, owner.toBase58(), mint.toBase58())).status.canClaim).toBe(false);
  });
  it('does not prepare a transaction that fails simulation', async () => await expect(buildFoxMission((await fixture({ simulationError: true })).connection, owner.toBase58(), mint.toBase58(), 'start')).rejects.toThrow('simulation failed'));
});

describe('Fox mission review binding', () => {
  const review = { owner: 'owner', walletId: 'wallet', rpc: 'https://rpc.example', epoch: 1, expiresAt: 2000 };
  it('allows only the reviewed session before expiry', () => expect(() => assertFoxReviewContext(review, review, 1999)).not.toThrow());
  it.each([{ owner: 'other' }, { walletId: 'other' }, { rpc: 'https://other.example' }, { epoch: 2 }])('rejects changed context %s', change => expect(() => assertFoxReviewContext(review, { ...review, ...change }, 1000)).toThrow());
  it('rejects review reuse at the exact expiry', () => expect(() => assertFoxReviewContext(review, review, 2000)).toThrow());
});

import { createHash } from 'node:crypto';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { PublicKey, type Connection } from '@solana/web3.js';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchVerificationRpc } from './verificationRpc';

const hash = (bytes: Uint8Array) => new Uint8Array(createHash('sha256').update(bytes).digest());
const discriminator = (name: string) => hash(Buffer.from(`account:${name}`)).slice(0, 8);
const key = (n: number) => new PublicKey(new Uint8Array(32).fill(n));
const program = new PublicKey('VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q');

function fixture(options: { wrongOwner?: boolean; wrongSpace?: boolean; wrongHash?: boolean; badDiscriminator?: boolean; fail?: boolean } = {}) {
  const dao = key(1), wallet = key(2), identity = key(3), link = key(4), attestor = key(5);
  const space = PublicKey.findProgramAddressSync([Buffer.from('space'), dao.toBytes()], program)[0];
  const salt = new Uint8Array(32).fill(9);
  const walletHash = hash(Buffer.concat([salt, Buffer.from('wallet'), wallet.toBytes()]));
  const spaceData = Buffer.alloc(139);
  spaceData.set(discriminator('GrapeVerificationSpace'));
  spaceData.set(dao.toBytes(), 9);
  spaceData.set(attestor.toBytes(), 73);
  spaceData.set(salt, 107);
  const identityData = Buffer.alloc(124);
  identityData.set(discriminator('GrapeVerificationIdentity'));
  identityData.set((options.wrongSpace ? key(8) : space).toBytes(), 9);
  identityData[41] = 0;
  identityData[74] = 1;
  identityData.writeBigInt64LE(1000n, 75);
  identityData.writeBigInt64LE(2000n, 83);
  identityData.set(attestor.toBytes(), 91);
  const linkData = Buffer.alloc(82);
  linkData.set(discriminator('GrapeVerificationLink'));
  linkData.set(identity.toBytes(), 9);
  linkData.set(options.wrongHash ? new Uint8Array(32) : walletHash, 41);
  linkData.writeBigInt64LE(900n, 73);
  if (options.badDiscriminator) linkData[0] ^= 255;
  const account = (data: Buffer) => ({ owner: options.wrongOwner ? key(8) : program, data });
  const rpc = {
    rpcEndpoint: 'https://rpc.test/verification',
    getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.map((k) => k.equals(space) ? account(spaceData) : k.equals(identity) ? account(identityData) : null)),
    getProgramAccounts: vi.fn(async (_program: PublicKey, config: { dataSlice?: unknown; filters: Array<{ memcmp: { offset: number; bytes: string } }> }) => {
      if (options.fail) throw new Error('RPC unavailable');
      expect(_program.equals(program)).toBe(true);
      expect(config.filters[0].memcmp.bytes).toBe(bs58.encode(discriminator('GrapeVerificationLink')));
      if (config.dataSlice) {
        expect(config.filters[1].memcmp).toEqual({ offset: 9, bytes: identity.toBase58() });
        return [{ pubkey: link }, { pubkey: key(6) }];
      }
      expect(config.filters[1].memcmp).toEqual({ offset: 41, bytes: bs58.encode(walletHash) });
      return [{ pubkey: link, account: account(linkData) }];
    })
  };
  return { rpc, dao, wallet, identity, link, space, walletHash };
}

afterEach(() => vi.useRealTimers());

it('reads salted wallet verification, timestamps and linked-wallet count through RPC', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const result = fetchVerificationRpc(f.rpc as unknown as Connection, f.wallet, [f.dao.toBase58()], hash);
  await vi.runAllTimersAsync();
  expect(await result).toEqual([expect.objectContaining({ daoId: f.dao.toBase58(), identityId: f.identity.toBase58(), linkId: f.link.toBase58(), platform: 'discord', verified: true, verifiedAt: 1000, expiresAt: 2000, linkedAt: 900, linkedWalletCount: 2, currentWalletLinked: true, walletHashHex: Buffer.from(f.walletHash).toString('hex') })]);
});

for (const option of ['wrongOwner', 'wrongSpace', 'wrongHash', 'badDiscriminator'] as const) {
  it(`rejects unrelated or malformed account data: ${option}`, async () => {
    vi.useFakeTimers();
    const f = fixture({ [option]: true });
    const result = fetchVerificationRpc(f.rpc as unknown as Connection, f.wallet, [f.dao.toBase58()], hash);
    await vi.runAllTimersAsync();
    expect(await result).toEqual([]);
  });
}

it('surfaces RPC failures instead of reporting an unverified wallet', async () => {
  vi.useFakeTimers();
  const f = fixture({ fail: true });
  const result = fetchVerificationRpc(f.rpc as unknown as Connection, f.wallet, [f.dao.toBase58()], hash).catch((error) => error.message);
  await vi.runAllTimersAsync();
  expect(await result).toBe('RPC unavailable');
});

it('batches space account reads within the RPC limit of 100', async () => {
  vi.useFakeTimers();
  const rpc = { rpcEndpoint: 'https://rpc.test/batch', getMultipleAccountsInfo: vi.fn(async (keys: PublicKey[]) => keys.map(() => null)) };
  const result = fetchVerificationRpc(rpc as unknown as Connection, key(250), Array.from({ length: 101 }, (_, i) => key(i + 1).toBase58()), hash);
  await vi.runAllTimersAsync();
  expect(await result).toEqual([]);
  expect(rpc.getMultipleAccountsInfo.mock.calls.map(([keys]) => keys.length)).toEqual([100, 1]);
});

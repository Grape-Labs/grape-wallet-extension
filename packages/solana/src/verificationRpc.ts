import { Buffer } from 'buffer';
import { PublicKey, type Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { createGovernanceRpcConnection } from './governanceRpc';

export type VerificationPlatform = 'discord' | 'telegram' | 'twitter' | 'email' | 'unknown';
export type VerificationIdentity = {
  daoId: string;
  spaceId: string;
  identityId: string;
  linkId: string;
  platform: VerificationPlatform;
  platformCode: number;
  verified: boolean;
  verifiedAt: number | null;
  expiresAt: number | null;
  attestedBy: string | null;
  linkedAt: number | null;
  linkedWalletCount: number;
  currentWalletLinked: boolean;
  walletHashHex: string;
};
type VerificationSpaceAccount = {
  daoId: string;
  salt: Uint8Array;
  attestor: string;
  isFrozen: boolean;
};
type VerificationIdentityAccount = {
  space: string;
  platform: number;
  verified: boolean;
  verifiedAt: number | null;
  expiresAt: number | null;
  attestedBy: string | null;
};
type VerificationLinkAccount = {
  identity: string;
  walletHash: Uint8Array;
  linkedAt: number | null;
};

export async function fetchVerificationRpc(
  connection: Connection,
  owner: PublicKey,
  trackedDaoIds: string[],
  hash: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
): Promise<VerificationIdentity[]> {
  connection = createGovernanceRpcConnection(connection);
  const VERIFICATION_REGISTRY_PROGRAM_ID = new PublicKey('VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q');
  async function readAccounts(keys: PublicKey[]) {
    const accounts: Awaited<ReturnType<Connection['getMultipleAccountsInfo']>> = [];
    for (let offset = 0; offset < keys.length; offset += 100) accounts.push(...await connection.getMultipleAccountsInfo(keys.slice(offset, offset + 100), 'confirmed'));
    return accounts;
  }
  const sha256Bytes = async (bytes: Uint8Array) => new Uint8Array(await hash(bytes));
  function tryParseSolanaPublicKey(value: string): PublicKey | null {
    try {
      return new PublicKey(value);
    } catch {
      return null;
    }
  }

  function utf8Bytes(value: string) {
    return Uint8Array.from(Buffer.from(value, 'utf8'));
  }

  function concatBytes(...arrays: Uint8Array[]) {
    const totalLength = arrays.reduce((sum, entry) => sum + entry.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const entry of arrays) {
      merged.set(entry, offset);
      offset += entry.length;
    }
    return merged;
  }

  async function anchorAccountDiscriminator(name: string) {
    const preimage = utf8Bytes(`account:${name}`);
    const hash = await sha256Bytes(preimage);
    return hash.slice(0, 8);
  }

  function bytesEqual(left: Uint8Array, right: Uint8Array) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }
    return true;
  }

  function readInt64LE(bytes: Uint8Array, offset: number) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    return view.getBigInt64(0, true);
  }

  function bigintToSafeSignedNumber(value: bigint): number | null {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const min = BigInt(Number.MIN_SAFE_INTEGER);
    if (value < min || value > max) {
      return null;
    }
    return Number(value);
  }

  function bytesToHex(bytes: Uint8Array) {
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function getVerificationPlatform(platform: number): VerificationPlatform {
    switch (platform) {
      case 0:
        return 'discord';
      case 1:
        return 'telegram';
      case 2:
        return 'twitter';
      case 3:
        return 'email';
      default:
        return 'unknown';
    }
  }

  async function decodeVerificationSpaceAccount(data: Uint8Array): Promise<VerificationSpaceAccount | null> {
    const discriminator = await anchorAccountDiscriminator('GrapeVerificationSpace');
    if (data.length < 139 || !bytesEqual(data.subarray(0, 8), discriminator)) {
      return null;
    }

    let offset = 8;
    offset += 1;
    const daoId = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    offset += 32;
    const attestor = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    const isFrozen = data[offset] === 1;
    offset += 2;
    const salt = data.slice(offset, offset + 32);

    return {
      daoId,
      salt,
      attestor,
      isFrozen
    };
  }

  async function decodeVerificationIdentityAccount(data: Uint8Array): Promise<VerificationIdentityAccount | null> {
    const discriminator = await anchorAccountDiscriminator('GrapeVerificationIdentity');
    if (data.length < 124 || !bytesEqual(data.subarray(0, 8), discriminator)) {
      return null;
    }

    let offset = 8;
    offset += 1;
    const space = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    const platform = data[offset];
    offset += 1;
    offset += 32;
    const verified = data[offset] === 1;
    offset += 1;
    const verifiedAt = bigintToSafeSignedNumber(readInt64LE(data, offset));
    offset += 8;
    const expiresAt = bigintToSafeSignedNumber(readInt64LE(data, offset));
    offset += 8;
    const attestedBy = new PublicKey(data.subarray(offset, offset + 32)).toBase58();

    return {
      space,
      platform,
      verified,
      verifiedAt,
      expiresAt,
      attestedBy
    };
  }

  async function decodeVerificationLinkAccount(data: Uint8Array): Promise<VerificationLinkAccount | null> {
    const discriminator = await anchorAccountDiscriminator('GrapeVerificationLink');
    if (data.length < 82 || !bytesEqual(data.subarray(0, 8), discriminator)) {
      return null;
    }

    let offset = 8;
    offset += 1;
    const identity = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
    const walletHash = data.slice(offset, offset + 32);
    offset += 32;
    const linkedAt = bigintToSafeSignedNumber(readInt64LE(data, offset));

    return {
      identity,
      walletHash,
      linkedAt
    };
  }

  async function fetchVerificationForWallet(
    connection: Connection,
    owner: PublicKey,
    trackedDaoIds: string[] = []
  ): Promise<VerificationIdentity[]> {
    const daoIds = Array.from(new Set(trackedDaoIds.map((entry) => entry.trim()).filter((entry) => !!entry)));
    if (daoIds.length === 0) {
      return [];
    }

    const spaceEntries = daoIds
      .map((daoId) => {
        const daoPk = tryParseSolanaPublicKey(daoId);
        if (!daoPk) {
          return null;
        }
        const [spacePda] = PublicKey.findProgramAddressSync(
          [utf8Bytes('space'), daoPk.toBytes()],
          VERIFICATION_REGISTRY_PROGRAM_ID
        );
        return { daoId, spacePda };
      })
      .filter((entry): entry is { daoId: string; spacePda: PublicKey } => !!entry);

    const identities: VerificationIdentity[] = [];
    if (spaceEntries.length === 0) {
      return identities;
    }

    const linkDiscriminator = bs58.encode(await anchorAccountDiscriminator('GrapeVerificationLink'));
    const spaceAccounts = await readAccounts(spaceEntries.map((entry) => entry.spacePda));

    for (let index = 0; index < spaceEntries.length; index += 1) {
      const spaceEntry = spaceEntries[index];
      const accountInfo = spaceAccounts[index];
      if (!accountInfo?.data || !accountInfo.owner.equals(VERIFICATION_REGISTRY_PROGRAM_ID)) {
        continue;
      }

      const decodedSpace = await decodeVerificationSpaceAccount(new Uint8Array(accountInfo.data));
      if (!decodedSpace || decodedSpace.daoId !== spaceEntry.daoId) {
        continue;
      }

      const walletHash = await sha256Bytes(concatBytes(decodedSpace.salt, utf8Bytes('wallet'), owner.toBytes()));
      const walletHashFilter = bs58.encode(walletHash);
      const linkAccounts = await connection.getProgramAccounts(VERIFICATION_REGISTRY_PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [
          { memcmp: { offset: 0, bytes: linkDiscriminator } },
          { memcmp: { offset: 41, bytes: walletHashFilter } }
        ]
      });

      if (linkAccounts.length === 0) {
        continue;
      }

      const parsedLinks = await Promise.all(
        linkAccounts.filter((account) => account.account.owner.equals(VERIFICATION_REGISTRY_PROGRAM_ID)).map(async (account) => ({
          pubkey: account.pubkey.toBase58(),
          parsed: await decodeVerificationLinkAccount(new Uint8Array(account.account.data))
        }))
      );
      const validLinks = parsedLinks.filter(
        (entry): entry is { pubkey: string; parsed: VerificationLinkAccount } => !!entry.parsed && bytesEqual(entry.parsed.walletHash, walletHash)
      );
      if (validLinks.length === 0) {
        continue;
      }

      const identityKeys = validLinks.map((entry) => new PublicKey(entry.parsed.identity));
      const identityAccounts = await readAccounts(identityKeys);
      const linkedWalletCounts = new Map<string, number>();

      await Promise.all(
        identityKeys.map(async (identityKey) => {
          const linkedWallets = await connection.getProgramAccounts(VERIFICATION_REGISTRY_PROGRAM_ID, {
            commitment: 'confirmed',
            dataSlice: { offset: 0, length: 0 },
            filters: [
              { memcmp: { offset: 0, bytes: linkDiscriminator } },
              { memcmp: { offset: 9, bytes: identityKey.toBase58() } }
            ]
          });
          linkedWalletCounts.set(identityKey.toBase58(), linkedWallets.length);
        })
      );

      for (let identityIndex = 0; identityIndex < identityAccounts.length; identityIndex += 1) {
        const identityAccount = identityAccounts[identityIndex];
        if (!identityAccount?.data || !identityAccount.owner.equals(VERIFICATION_REGISTRY_PROGRAM_ID)) {
          continue;
        }

        const decodedIdentity = await decodeVerificationIdentityAccount(new Uint8Array(identityAccount.data));
        if (!decodedIdentity || decodedIdentity.space !== spaceEntry.spacePda.toBase58()) {
          continue;
        }

        const linkEntry = validLinks[identityIndex];
        identities.push({
          daoId: spaceEntry.daoId,
          spaceId: spaceEntry.spacePda.toBase58(),
          identityId: linkEntry.parsed.identity,
          linkId: linkEntry.pubkey,
          platform: getVerificationPlatform(decodedIdentity.platform),
          platformCode: decodedIdentity.platform,
          verified: decodedIdentity.verified,
          verifiedAt: decodedIdentity.verifiedAt && decodedIdentity.verifiedAt > 0 ? decodedIdentity.verifiedAt : null,
          expiresAt: decodedIdentity.expiresAt && decodedIdentity.expiresAt > 0 ? decodedIdentity.expiresAt : null,
          attestedBy: decodedIdentity.attestedBy,
          linkedAt: linkEntry.parsed.linkedAt && linkEntry.parsed.linkedAt > 0 ? linkEntry.parsed.linkedAt : null,
          linkedWalletCount: linkedWalletCounts.get(linkEntry.parsed.identity) ?? 1,
          currentWalletLinked: true,
          walletHashHex: bytesToHex(linkEntry.parsed.walletHash)
        });
      }
    }

    return sortVerificationIdentities(identities);
  }

  function sortVerificationIdentities(
    identities: VerificationIdentity[]
  ): VerificationIdentity[] {
    return identities.sort((left, right) => {
      if (left.verified !== right.verified) {
        return left.verified ? -1 : 1;
      }
      if ((right.linkedAt ?? 0) !== (left.linkedAt ?? 0)) {
        return (right.linkedAt ?? 0) - (left.linkedAt ?? 0);
      }
      if (left.daoId !== right.daoId) {
        return left.daoId.localeCompare(right.daoId);
      }
      return left.platform.localeCompare(right.platform);
    });
  }
  return fetchVerificationForWallet(createGovernanceRpcConnection(connection), owner, trackedDaoIds);
}

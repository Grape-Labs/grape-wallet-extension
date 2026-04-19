import { base64ToBytes, bytesToBase64, utf8ToBytes } from '@grape/core';

const VERIFICATION_GRAPHQL_URL = 'https://grape.shyft.to/v1/graphql/';
const VERIFICATION_GRAPHQL_NAMESPACE = 'grape_verification_registry';
const VERIFICATION_REGISTRY_PROGRAM_ID = 'VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q';
const GRAPHQL_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

type GraphqlVerificationSpaceRow = {
  pubkey?: string;
  daoId?: string;
  salt?: string | number[] | Uint8Array;
};

type GraphqlVerificationIdentityRow = {
  pubkey?: string;
  space?: string;
  platform?: number | string;
  verified?: boolean;
  verifiedAt?: number | string | null;
  expiresAt?: number | string | null;
  attestedBy?: string | null;
};

type GraphqlVerificationLinkRow = {
  pubkey?: string;
  identity?: string;
  walletHash?: string | number[] | Uint8Array;
  linkedAt?: number | string | null;
};

export type MobileVerificationPlatform = 'discord' | 'telegram' | 'twitter' | 'email' | 'unknown';

export type MobileVerificationIdentity = {
  daoId: string;
  spaceId: string;
  identityId: string;
  linkId: string;
  platform: MobileVerificationPlatform;
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

export type MobileVerificationResponse = {
  trackedSpaces: string[];
  identities: MobileVerificationIdentity[];
  totalVerified: number;
  source: 'shyft' | 'none';
  refreshedAt: number;
};

function loadSolanaWeb3Module() {
  return require('@solana/web3.js') as typeof import('@solana/web3.js');
}

function loadSha2Module() {
  return require('../../../packages/core/node_modules/@noble/hashes/sha2.js') as {
    sha256(input: Uint8Array): Uint8Array;
  };
}

function escapeGraphqlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTrackedDaoIds(value: string[]) {
  return Array.from(
    new Set(
      value
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function tryParseSolanaPublicKey(value: string) {
  const { PublicKey } = loadSolanaWeb3Module();
  try {
    return new PublicKey(value.trim());
  } catch {
    return null;
  }
}

function concatBytes(...arrays: Uint8Array[]) {
  const length = arrays.reduce((sum, entry) => sum + entry.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const entry of arrays) {
    result.set(entry, offset);
    offset += entry.length;
  }
  return result;
}

function sha256Bytes(value: Uint8Array) {
  return Uint8Array.from(loadSha2Module().sha256(value));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function getVerificationPlatform(platform: number): MobileVerificationPlatform {
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

function parseVerificationNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function decodeGraphqlByteString(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
    return new Uint8Array(value);
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedHex = trimmed.startsWith('\\x')
    ? trimmed.slice(2)
    : trimmed.startsWith('0x')
      ? trimmed.slice(2)
      : trimmed;

  if (/^[0-9a-fA-F]+$/.test(normalizedHex) && normalizedHex.length % 2 === 0) {
    const bytes = new Uint8Array(normalizedHex.length / 2);
    for (let index = 0; index < normalizedHex.length; index += 2) {
      bytes[index / 2] = Number.parseInt(normalizedHex.slice(index, index + 2), 16);
    }
    return bytes;
  }

  try {
    return base64ToBytes(trimmed);
  } catch {
    return null;
  }
}

function matchesGraphqlByteString(value: unknown, expectedBytes: Uint8Array): boolean {
  const expectedBase64 = bytesToBase64(expectedBytes);
  const expectedHex = bytesToHex(expectedBytes).toLowerCase();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed === expectedBase64) {
      return true;
    }

    const normalizedHex = trimmed.startsWith('\\x')
      ? trimmed.slice(2)
      : trimmed.startsWith('0x')
        ? trimmed.slice(2)
        : trimmed;
    if (normalizedHex.toLowerCase() === expectedHex) {
      return true;
    }
  }

  const decoded = decodeGraphqlByteString(value);
  return decoded ? bytesToHex(decoded).toLowerCase() === expectedHex : false;
}

function sortVerificationIdentities(identities: MobileVerificationIdentity[]) {
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

async function fetchVerificationGraphql<T>(query: string): Promise<T> {
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(VERIFICATION_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept-encoding': 'gzip'
      },
      body: JSON.stringify({ query }),
      cache: 'no-store'
    });

    if (!response.ok) {
      lastStatus = response.status;
      if (!GRAPHQL_RETRYABLE_STATUS_CODES.has(response.status) || attempt === 3) {
        throw new Error(`Verification GraphQL request failed with ${response.status}.`);
      }
      await delay(250 * attempt);
      continue;
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors.map((entry) => entry.message || 'Unknown GraphQL error').join('; '));
    }

    if (!payload.data) {
      throw new Error('Verification GraphQL response did not include data.');
    }

    return payload.data;
  }

  throw new Error(`Verification GraphQL request failed with ${lastStatus ?? 'unknown status'}.`);
}

function buildVerificationSpacesQuery(spacePubkeys: string[]): string {
  const ids = spacePubkeys.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query VerificationSpaces {
      ${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationSpace(where: {pubkey: {_in: [${ids}]}}) {
        pubkey
        daoId
        salt
      }
    }
  `;
}

function buildVerificationIdentitiesBySpaceQuery(spacePubkeys: string[]): string {
  const ids = spacePubkeys.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query VerificationIdentitiesBySpace {
      ${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationIdentity(limit: 5000, where: {space: {_in: [${ids}]}}) {
        pubkey
        space
        platform
        verified
        verifiedAt
        expiresAt
        attestedBy
      }
    }
  `;
}

function buildVerificationLinksByIdentityQuery(identityPubkeys: string[]): string {
  const ids = identityPubkeys.map((entry) => `"${escapeGraphqlString(entry)}"`).join(', ');
  return `
    query VerificationLinksByIdentity {
      ${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationLink(limit: 5000, where: {identity: {_in: [${ids}]}}) {
        pubkey
        identity
        linkedAt
        walletHash
      }
    }
  `;
}

export async function fetchMobileVerificationForWallet(
  ownerAddress: string,
  trackedDaoIds: string[]
): Promise<MobileVerificationResponse> {
  const { PublicKey } = loadSolanaWeb3Module();
  const owner = tryParseSolanaPublicKey(ownerAddress);
  const normalizedDaoIds = normalizeTrackedDaoIds(trackedDaoIds);

  if (!owner || normalizedDaoIds.length === 0) {
    return {
      trackedSpaces: normalizedDaoIds,
      identities: [],
      totalVerified: 0,
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  const requestedSpaces = normalizedDaoIds
    .map((daoId) => {
      const daoPk = tryParseSolanaPublicKey(daoId);
      if (!daoPk) {
        return null;
      }
      const [spacePda] = PublicKey.findProgramAddressSync(
        [utf8ToBytes('space'), daoPk.toBytes()],
        new PublicKey(VERIFICATION_REGISTRY_PROGRAM_ID)
      );
      return { daoId, spacePda: spacePda.toBase58() };
    })
    .filter((entry): entry is { daoId: string; spacePda: string } => !!entry);

  if (requestedSpaces.length === 0) {
    return {
      trackedSpaces: normalizedDaoIds,
      identities: [],
      totalVerified: 0,
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  const requestedSpaceByPubkey = new Map(requestedSpaces.map((entry) => [entry.spacePda, entry] as const));
  const spacesData = await fetchVerificationGraphql<Record<string, GraphqlVerificationSpaceRow[]>>(
    buildVerificationSpacesQuery(requestedSpaces.map((entry) => entry.spacePda))
  );
  const spaceRows = Array.isArray(spacesData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationSpace`])
    ? spacesData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationSpace`]
    : [];

  const walletHashBySpace = new Map<string, Uint8Array>();
  for (const row of spaceRows) {
    const pubkey = typeof row.pubkey === 'string' ? row.pubkey.trim() : '';
    if (!pubkey || !requestedSpaceByPubkey.has(pubkey)) {
      continue;
    }

    const salt = decodeGraphqlByteString(row.salt);
    if (!salt || salt.length === 0) {
      continue;
    }

    walletHashBySpace.set(pubkey, sha256Bytes(concatBytes(salt, utf8ToBytes('wallet'), owner.toBytes())));
  }

  const spacePubkeys = Array.from(walletHashBySpace.keys());
  if (spacePubkeys.length === 0) {
    return {
      trackedSpaces: normalizedDaoIds,
      identities: [],
      totalVerified: 0,
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  const identityData = await fetchVerificationGraphql<Record<string, GraphqlVerificationIdentityRow[]>>(
    buildVerificationIdentitiesBySpaceQuery(spacePubkeys)
  );
  const identityRows = Array.isArray(identityData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationIdentity`])
    ? identityData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationIdentity`]
    : [];
  const identityPubkeys = Array.from(
    new Set(
      identityRows
        .map((entry) => (typeof entry.pubkey === 'string' ? entry.pubkey.trim() : ''))
        .filter(Boolean)
    )
  );

  if (identityPubkeys.length === 0) {
    return {
      trackedSpaces: normalizedDaoIds,
      identities: [],
      totalVerified: 0,
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  const linksData = await fetchVerificationGraphql<Record<string, GraphqlVerificationLinkRow[]>>(
    buildVerificationLinksByIdentityQuery(identityPubkeys)
  );
  const identityLinks = Array.isArray(linksData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationLink`])
    ? linksData[`${VERIFICATION_GRAPHQL_NAMESPACE}_GrapeVerificationLink`]
    : [];

  const walletLinksByIdentity = new Map<string, GraphqlVerificationLinkRow[]>();
  for (const link of identityLinks) {
    const identity = typeof link.identity === 'string' ? link.identity.trim() : '';
    if (!identity) {
      continue;
    }
    const existing = walletLinksByIdentity.get(identity);
    if (existing) {
      existing.push(link);
    } else {
      walletLinksByIdentity.set(identity, [link]);
    }
  }

  const linkedWalletCounts = new Map<string, number>();
  for (const link of identityLinks) {
    const identity = typeof link.identity === 'string' ? link.identity.trim() : '';
    if (!identity) {
      continue;
    }
    linkedWalletCounts.set(identity, (linkedWalletCounts.get(identity) ?? 0) + 1);
  }

  const identities: MobileVerificationIdentity[] = [];
  for (const row of identityRows) {
    const identityId = typeof row.pubkey === 'string' ? row.pubkey.trim() : '';
    const spaceId = typeof row.space === 'string' ? row.space.trim() : '';
    if (!identityId || !spaceId) {
      continue;
    }

    const requestedSpace = requestedSpaceByPubkey.get(spaceId);
    const expectedWalletHash = walletHashBySpace.get(spaceId);
    if (!requestedSpace || !expectedWalletHash) {
      continue;
    }

    const matchingLinks = (walletLinksByIdentity.get(identityId) ?? []).filter((entry) =>
      matchesGraphqlByteString(entry.walletHash, expectedWalletHash)
    );
    if (matchingLinks.length === 0) {
      continue;
    }

    for (const link of matchingLinks) {
      const linkId = typeof link.pubkey === 'string' ? link.pubkey.trim() : '';
      if (!linkId) {
        continue;
      }

      identities.push({
        daoId: requestedSpace.daoId,
        spaceId,
        identityId,
        linkId,
        platform: getVerificationPlatform(Number(row.platform ?? -1)),
        platformCode: Number(row.platform ?? -1),
        verified: row.verified === true,
        verifiedAt: parseVerificationNumber(row.verifiedAt),
        expiresAt: parseVerificationNumber(row.expiresAt),
        attestedBy: typeof row.attestedBy === 'string' && row.attestedBy.trim() ? row.attestedBy.trim() : null,
        linkedAt: parseVerificationNumber(link.linkedAt),
        linkedWalletCount: linkedWalletCounts.get(identityId) ?? matchingLinks.length,
        currentWalletLinked: true,
        walletHashHex: bytesToHex(expectedWalletHash)
      });
    }
  }

  const sortedIdentities = sortVerificationIdentities(identities);
  return {
    trackedSpaces: normalizedDaoIds,
    identities: sortedIdentities,
    totalVerified: sortedIdentities.filter((entry) => entry.verified).length,
    source: sortedIdentities.length > 0 ? 'shyft' : 'none',
    refreshedAt: Date.now()
  };
}

import * as Crypto from 'expo-crypto';

import { getMobileSolanaRpcUrl } from './config';

const VINE_REP_PROGRAM_ID = 'V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX';
const DEFAULT_SOLANA_NETWORK = 'mainnet-beta';

type VineSpaceConfig = {
  daoId: string;
  repMint: string;
  currentSeason: number;
  decayBps: number;
  configPda: string;
};

type VineReputationAccount = {
  season: number;
  points: bigint;
};

export type MobileReputationSpace = {
  daoId: string;
  repMint: string;
  currentSeason: number;
  latestSeasonWithPoints: number;
  seasonCount: number;
  points: string;
  latestSeasonPoints: string;
  effectivePoints: string;
  metadataUri?: string | null;
  name?: string;
  symbol?: string;
  description?: string;
  imageUri?: string;
};

export type MobileReputationResponse = {
  spaces: MobileReputationSpace[];
  totalPoints: string;
  totalEffectivePoints: string;
  source: 'vine' | 'none';
  refreshedAt: number;
};

function loadSolanaWeb3Module() {
  return require('@solana/web3.js') as typeof import('@solana/web3.js');
}

function normalizeRemoteUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  if (value.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${value.slice('ipfs://'.length)}`;
  }
  if (value.startsWith('ar://')) {
    return `https://arweave.net/${value.slice('ar://'.length)}`;
  }
  return value;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value);
}

function u16leBytes(value: number) {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, value & 0xffff, true);
  return buffer;
}

function hexToBytes(hex: string) {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16);
  }
  return bytes;
}

async function anchorAccountDiscriminator(name: string) {
  const hashHex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `account:${name}`, {
    encoding: Crypto.CryptoEncoding.HEX
  });
  return hexToBytes(hashHex).slice(0, 8);
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

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint64LE(bytes: Uint8Array, offset: number) {
  let value = BigInt(0);
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << BigInt(8)) + BigInt(bytes[offset + index]);
  }
  return value;
}

function bigintToSafeNumber(value: bigint): number | null {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value < BigInt(0) || value > max) {
    return null;
  }
  return Number(value);
}

async function decodeVineSpaceConfig(data: Uint8Array): Promise<VineSpaceConfig | null> {
  const { PublicKey } = loadSolanaWeb3Module();
  const discriminator = await anchorAccountDiscriminator('ReputationConfig');
  if (data.length < 113 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  const daoId = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  offset += 32;
  const repMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;
  const currentSeason = readUint16LE(data, offset);
  offset += 2;
  const decayBps = readUint16LE(data, offset);

  return {
    daoId,
    repMint,
    currentSeason,
    decayBps,
    configPda: ''
  };
}

async function decodeVineReputationAccount(data: Uint8Array): Promise<VineReputationAccount | null> {
  const discriminator = await anchorAccountDiscriminator('Reputation');
  if (data.length < 64 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  if (data.length >= 92) {
    offset += 32;
  }
  offset += 32;
  const season = readUint16LE(data, offset);
  offset += 2;
  const points = readUint64LE(data, offset);

  return {
    season,
    points
  };
}

function getVineConfigPda(daoId: import('@solana/web3.js').PublicKey) {
  const { PublicKey } = loadSolanaWeb3Module();
  return PublicKey.findProgramAddressSync([utf8Bytes('config'), daoId.toBytes()], new PublicKey(VINE_REP_PROGRAM_ID))[0];
}

function getVineProjectMetaPda(daoId: import('@solana/web3.js').PublicKey) {
  const { PublicKey } = loadSolanaWeb3Module();
  return PublicKey.findProgramAddressSync([utf8Bytes('project_meta'), daoId.toBytes()], new PublicKey(VINE_REP_PROGRAM_ID))[0];
}

function getVineReputationPda(
  configPda: import('@solana/web3.js').PublicKey,
  user: import('@solana/web3.js').PublicKey,
  season: number
) {
  const { PublicKey } = loadSolanaWeb3Module();
  return PublicKey.findProgramAddressSync(
    [utf8Bytes('reputation'), configPda.toBytes(), user.toBytes(), u16leBytes(season)],
    new PublicKey(VINE_REP_PROGRAM_ID)
  )[0];
}

async function decodeVineProjectMetadata(data: Uint8Array) {
  const discriminator = await anchorAccountDiscriminator('ProjectMetadata');
  if (data.length < 46 || !bytesEqual(data.subarray(0, 8), discriminator)) {
    return null;
  }

  let offset = 8;
  offset += 1;
  offset += 32;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const uriLength = view.getUint32(offset, true);
  offset += 4;
  if (offset + uriLength + 1 > data.length) {
    return null;
  }

  const metadataUri = new TextDecoder().decode(data.slice(offset, offset + uriLength));
  return { metadataUri };
}

async function fetchVineSpaceMetadata(
  connection: import('@solana/web3.js').Connection,
  spaces: VineSpaceConfig[]
): Promise<Record<string, { name?: string; symbol?: string; description?: string; imageUri?: string; metadataUri?: string | null }>> {
  const { PublicKey } = loadSolanaWeb3Module();
  if (spaces.length === 0) {
    return {};
  }

  const metadataPdas = spaces.map((space) => getVineProjectMetaPda(new PublicKey(space.daoId)));
  const metadataAccounts = await connection.getMultipleAccountsInfo(metadataPdas, 'confirmed');
  const entries = await Promise.all(
    spaces.map(async (space, index) => {
      const parsedMetadata = metadataAccounts[index]?.data
        ? await decodeVineProjectMetadata(new Uint8Array(metadataAccounts[index]!.data))
        : null;
      const normalizedMetadataUri = normalizeRemoteUrl(parsedMetadata?.metadataUri ?? null);
      let description: string | undefined;
      let imageUri: string | undefined;
      let jsonName: string | undefined;
      let jsonSymbol: string | undefined;

      if (normalizedMetadataUri) {
        try {
          const response = await fetch(normalizedMetadataUri, { cache: 'no-store' });
          if (response.ok) {
            const payload = (await response.json()) as {
              name?: unknown;
              symbol?: unknown;
              description?: unknown;
              image?: unknown;
            };
            jsonName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined;
            jsonSymbol = typeof payload.symbol === 'string' && payload.symbol.trim() ? payload.symbol.trim() : undefined;
            description =
              typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined;
            imageUri =
              typeof payload.image === 'string' && payload.image.trim()
                ? normalizeRemoteUrl(payload.image.trim()) ?? undefined
                : undefined;
          }
        } catch {
          imageUri = undefined;
        }
      }

      return [
        space.daoId,
        {
          name: jsonName,
          symbol: jsonSymbol,
          description,
          imageUri,
          metadataUri: normalizedMetadataUri
        }
      ] as const;
    })
  );

  return Object.fromEntries(entries);
}

async function fetchTrackedVineSpaceConfigs(
  connection: import('@solana/web3.js').Connection,
  trackedDaoIds: string[]
): Promise<VineSpaceConfig[]> {
  const { PublicKey } = loadSolanaWeb3Module();
  const uniqueDaoIds = Array.from(new Set(trackedDaoIds));
  const daoEntries = uniqueDaoIds.flatMap((daoId) => {
    try {
      const daoPublicKey = new PublicKey(daoId);
      return [{ daoId, configPda: getVineConfigPda(daoPublicKey) }];
    } catch {
      return [];
    }
  });

  if (daoEntries.length === 0) {
    return [];
  }

  const accounts = await connection.getMultipleAccountsInfo(
    daoEntries.map((entry) => entry.configPda),
    'confirmed'
  );

  const decodedEntries = await Promise.all(
    daoEntries.map(async (entry, index) => {
      const accountInfo = accounts[index];
      if (!accountInfo?.data) {
        return null;
      }
      const decoded = await decodeVineSpaceConfig(new Uint8Array(accountInfo.data));
      if (!decoded) {
        return null;
      }
      return {
        ...decoded,
        configPda: entry.configPda.toBase58()
      };
    })
  );

  return decodedEntries.filter((entry): entry is VineSpaceConfig => !!entry);
}

export async function fetchMobileOgReputationForWallet(
  ownerAddress: string,
  trackedDaoIds: string[]
): Promise<MobileReputationResponse> {
  const { Connection, PublicKey } = loadSolanaWeb3Module();
  if (trackedDaoIds.length === 0) {
    return {
      spaces: [],
      totalPoints: '0',
      totalEffectivePoints: '0',
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  let owner: import('@solana/web3.js').PublicKey;
  try {
    owner = new PublicKey(ownerAddress);
  } catch {
    return {
      spaces: [],
      totalPoints: '0',
      totalEffectivePoints: '0',
      source: 'none',
      refreshedAt: Date.now()
    };
  }

  const connection = new Connection(getMobileSolanaRpcUrl(DEFAULT_SOLANA_NETWORK), 'confirmed');
  const configs = await fetchTrackedVineSpaceConfigs(connection, trackedDaoIds);
  const reputationRequests = configs.flatMap((space) => {
    const configPda = new PublicKey(space.configPda);
    return Array.from({ length: Math.max(0, space.currentSeason) }, (_value, index) => {
      const season = index + 1;
      return {
        daoId: space.daoId,
        currentSeason: space.currentSeason,
        season,
        pda: getVineReputationPda(configPda, owner, season)
      };
    });
  });
  const decayByDao = new Map(configs.map((space) => [space.daoId, Math.max(0, Math.min(1, space.decayBps / 10000))] as const));

  const reputationByDao = new Map<
    string,
    {
      totalPoints: bigint;
      latestSeasonWithPoints: number;
      latestSeasonPoints: bigint;
      effectivePoints: bigint;
      seasonCount: number;
    }
  >();
  const chunkSize = 100;
  for (let startIndex = 0; startIndex < reputationRequests.length; startIndex += chunkSize) {
    const chunk = reputationRequests.slice(startIndex, startIndex + chunkSize);
    const accounts = await connection.getMultipleAccountsInfo(chunk.map((entry) => entry.pda), 'confirmed');
    for (let index = 0; index < chunk.length; index += 1) {
      const accountInfo = accounts[index];
      if (!accountInfo?.data) {
        continue;
      }
      const decoded = await decodeVineReputationAccount(new Uint8Array(accountInfo.data));
      if (!decoded || decoded.points <= BigInt(0)) {
        continue;
      }

      const daoId = chunk[index].daoId;
      const currentSeason = chunk[index].currentSeason;
      const seasonsAgo = Math.max(0, currentSeason - decoded.season);
      const multiplier = Math.pow(decayByDao.get(daoId) ?? 1, seasonsAgo);
      const effectivePointsNumber = bigintToSafeNumber(decoded.points);
      const effectivePoints =
        effectivePointsNumber === null ? decoded.points : BigInt(Math.round(effectivePointsNumber * multiplier));
      const current = reputationByDao.get(daoId);
      if (!current) {
        reputationByDao.set(daoId, {
          totalPoints: decoded.points,
          latestSeasonWithPoints: decoded.season,
          latestSeasonPoints: decoded.points,
          effectivePoints,
          seasonCount: 1
        });
        continue;
      }

      reputationByDao.set(daoId, {
        totalPoints: current.totalPoints + decoded.points,
        latestSeasonWithPoints: Math.max(current.latestSeasonWithPoints, decoded.season),
        latestSeasonPoints:
          decoded.season >= current.latestSeasonWithPoints ? decoded.points : current.latestSeasonPoints,
        effectivePoints: current.effectivePoints + effectivePoints,
        seasonCount: current.seasonCount + 1
      });
    }
  }

  const matchedSpaces = configs.filter((space) => reputationByDao.has(space.daoId));
  const metadataByDao = await fetchVineSpaceMetadata(connection, matchedSpaces);
  const spaces = matchedSpaces
    .map((space) => {
      const reputation = reputationByDao.get(space.daoId);
      if (!reputation) {
        return null;
      }

      const metadata = metadataByDao[space.daoId];
      return {
        daoId: space.daoId,
        repMint: space.repMint,
        currentSeason: space.currentSeason,
        latestSeasonWithPoints: reputation.latestSeasonWithPoints,
        seasonCount: reputation.seasonCount,
        points: reputation.totalPoints.toString(),
        latestSeasonPoints: reputation.latestSeasonPoints.toString(),
        effectivePoints: reputation.effectivePoints.toString(),
        metadataUri: metadata?.metadataUri ?? null,
        name: metadata?.name,
        symbol: metadata?.symbol,
        description: metadata?.description,
        imageUri: metadata?.imageUri
      };
    })
    .filter((entry): entry is MobileReputationSpace => !!entry)
    .sort((left, right) => {
      const leftPoints = BigInt(left.effectivePoints);
      const rightPoints = BigInt(right.effectivePoints);
      if (rightPoints > leftPoints) {
        return 1;
      }
      if (rightPoints < leftPoints) {
        return -1;
      }
      return left.name?.localeCompare(right.name ?? '') ?? 0;
    });

  return {
    spaces,
    totalPoints: spaces.reduce((sum, entry) => sum + BigInt(entry.points), BigInt(0)).toString(),
    totalEffectivePoints: spaces.reduce((sum, entry) => sum + BigInt(entry.effectivePoints), BigInt(0)).toString(),
    source: spaces.length > 0 ? 'vine' : 'none',
    refreshedAt: Date.now()
  };
}

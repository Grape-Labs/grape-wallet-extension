import { fetchVerificationRpc } from '../../../packages/solana/src/verificationRpc';
import { getMobileSolanaRpcUrl } from './config';

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
  source: 'onchain' | 'none';
  refreshedAt: number;
};

export async function fetchMobileVerificationForWallet(ownerAddress: string, trackedDaoIds: string[]): Promise<MobileVerificationResponse> {
  const { Connection, PublicKey } = require('@solana/web3.js') as typeof import('@solana/web3.js');
  const { sha256 } = require('../../../packages/core/node_modules/@noble/hashes/sha2.js') as { sha256(bytes: Uint8Array): Uint8Array };
  const trackedSpaces = Array.from(new Set(trackedDaoIds.map((value) => value.trim()).filter(Boolean)));
  const identities = await fetchVerificationRpc(new Connection(getMobileSolanaRpcUrl(), 'confirmed'), new PublicKey(ownerAddress), trackedSpaces, sha256);
  return { trackedSpaces, identities, totalVerified: identities.filter((identity) => identity.verified).length, source: trackedSpaces.length ? 'onchain' : 'none', refreshedAt: Date.now() };
}

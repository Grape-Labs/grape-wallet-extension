import type { EncryptedPayload } from './crypto';
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './encoding';
import type { GrapeChain, GrapeNetwork, GrapeTheme } from './state';
import type { VaultSecret } from './vault';

export type DeviceLinkPreferencesSnapshot = {
  trackedReputationSpaceIds: string[];
  trackedVerificationSpaceIds: string[];
  trackedGovernanceDaoIds: string[];
  selectedChain: GrapeChain;
  selectedNetwork: GrapeNetwork;
  selectedTheme: GrapeTheme;
  privacyMode: boolean;
};

export type DeviceLinkWalletSnapshot = {
  walletName: string;
  chain: GrapeChain;
  publicKey: string;
  derivationPath: string;
  source: 'created' | 'imported-mnemonic' | 'imported-private-key';
  secret: VaultSecret & ({ kind: 'mnemonic' } | { kind: 'private-key' });
};

export type DeviceLinkHandoffPayload = {
  version: 1;
  type: 'grape-device-link';
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  wallet: DeviceLinkWalletSnapshot;
  preferences: DeviceLinkPreferencesSnapshot;
};

export type DeviceLinkQrEnvelope = {
  version: 1;
  type: 'grape-device-link-qr';
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  walletName: string;
  chain: GrapeChain;
  publicKey: string;
  handoff: EncryptedPayload;
};

export type DeviceLinkSessionStatus = 'ready' | 'revoked' | 'expired';

export type DeviceLinkSessionRecord = {
  id: string;
  walletId: string;
  walletName: string;
  chain: GrapeChain;
  publicKey: string;
  pairingCode: string;
  createdAt: number;
  expiresAt: number;
  qrPayload: string;
  envelope: DeviceLinkQrEnvelope;
  status: DeviceLinkSessionStatus;
};

const DEVICE_LINK_PREFIX = 'grape-link:';

export function createDeviceLinkPayloadText(envelope: DeviceLinkQrEnvelope): string {
  return `${DEVICE_LINK_PREFIX}${bytesToBase64(utf8ToBytes(JSON.stringify(envelope)))}`;
}

export function parseDeviceLinkPayloadText(input: string): DeviceLinkQrEnvelope {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Restore payload is required.');
  }

  const raw =
    trimmed.startsWith(DEVICE_LINK_PREFIX)
      ? bytesToUtf8(base64ToBytes(trimmed.slice(DEVICE_LINK_PREFIX.length)))
      : trimmed;
  const parsed = JSON.parse(raw) as Partial<DeviceLinkQrEnvelope>;

  if (
    parsed.version !== 1 ||
    parsed.type !== 'grape-device-link-qr' ||
    typeof parsed.sessionId !== 'string' ||
    typeof parsed.createdAt !== 'number' ||
    typeof parsed.expiresAt !== 'number' ||
    typeof parsed.walletName !== 'string' ||
    typeof parsed.chain !== 'string' ||
    typeof parsed.publicKey !== 'string' ||
    typeof parsed.handoff !== 'object' ||
    !parsed.handoff
  ) {
    throw new Error('Restore payload is invalid.');
  }

  const handoff = parsed.handoff as Partial<EncryptedPayload>;
  if (
    handoff.algorithm !== 'AES-GCM' ||
    handoff.kdf !== 'PBKDF2' ||
    typeof handoff.iterations !== 'number' ||
    typeof handoff.salt !== 'string' ||
    typeof handoff.iv !== 'string' ||
    typeof handoff.ciphertext !== 'string'
  ) {
    throw new Error('Restore payload is invalid.');
  }

  return parsed as DeviceLinkQrEnvelope;
}

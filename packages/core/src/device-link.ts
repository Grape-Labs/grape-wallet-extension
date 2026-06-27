import type { EncryptedPayload } from './crypto';
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './encoding';
import type {
  CustomThemeConfig,
  DappApprovalMode,
  GrapeChain,
  GrapeNetwork,
  GrapeTheme,
  ThemeBackgroundStyle,
  ThemeMotionIntensity
} from './state';
import type { VaultSecret } from './vault';

export type DeviceLinkPreferencesSnapshot = {
  trackedReputationSpaceIds: string[];
  trackedVerificationSpaceIds: string[];
  trackedGovernanceDaoIds: string[];
  selectedChain: GrapeChain;
  selectedNetwork: GrapeNetwork;
  selectedTheme: GrapeTheme;
  customTheme: CustomThemeConfig;
  themeBackgroundStyle: ThemeBackgroundStyle;
  themeMotionIntensity: ThemeMotionIntensity;
  autoConnectEnabled: boolean;
  dappApprovalMode: DappApprovalMode;
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

type DeviceLinkQrEnvelopeCompact = {
  v: 1;
  t: 'grape-device-link-qr';
  s: string;
  c: number;
  e: number;
  n: string;
  h: GrapeChain;
  p: string;
  d: EncryptedPayload;
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
  const compactEnvelope: DeviceLinkQrEnvelopeCompact = {
    v: envelope.version,
    t: envelope.type,
    s: envelope.sessionId,
    c: envelope.createdAt,
    e: envelope.expiresAt,
    n: envelope.walletName,
    h: envelope.chain,
    p: envelope.publicKey,
    d: envelope.handoff
  };

  return `${DEVICE_LINK_PREFIX}${JSON.stringify(compactEnvelope)}`;
}

function normalizeDeviceLinkEnvelope(input: Partial<DeviceLinkQrEnvelope> | Partial<DeviceLinkQrEnvelopeCompact>): Partial<DeviceLinkQrEnvelope> {
  if ('version' in input || 'type' in input || 'sessionId' in input) {
    return input as Partial<DeviceLinkQrEnvelope>;
  }

  const compact = input as Partial<DeviceLinkQrEnvelopeCompact>;
  return {
    version: compact.v,
    type: compact.t,
    sessionId: compact.s,
    createdAt: compact.c,
    expiresAt: compact.e,
    walletName: compact.n,
    chain: compact.h,
    publicKey: compact.p,
    handoff: compact.d
  };
}

function normalizeDeviceLinkEncryptedField(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const plusNormalized = value.trim().replace(/ /g, '+').replace(/[\r\n\t]/g, '');
  const base64Normalized = plusNormalized.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = base64Normalized.length % 4;
  if (remainder === 0) {
    return base64Normalized;
  }
  return `${base64Normalized}${'='.repeat(4 - remainder)}`;
}

export function parseDeviceLinkPayloadText(input: string): DeviceLinkQrEnvelope {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Restore payload is required.');
  }

  const raw =
    trimmed.startsWith(DEVICE_LINK_PREFIX)
      ? (() => {
          const encoded = trimmed.slice(DEVICE_LINK_PREFIX.length).trim();
          if (encoded.startsWith('{')) {
            return encoded;
          }
          return bytesToUtf8(base64ToBytes(encoded));
        })()
      : trimmed;
  const parsed = normalizeDeviceLinkEnvelope(JSON.parse(raw) as Partial<DeviceLinkQrEnvelope> | Partial<DeviceLinkQrEnvelopeCompact>);

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
  const normalizedHandoff = {
    ...handoff,
    salt: normalizeDeviceLinkEncryptedField(handoff.salt),
    iv: normalizeDeviceLinkEncryptedField(handoff.iv),
    ciphertext: normalizeDeviceLinkEncryptedField(handoff.ciphertext)
  };
  if (
    normalizedHandoff.algorithm !== 'AES-GCM' ||
    normalizedHandoff.kdf !== 'PBKDF2' ||
    typeof normalizedHandoff.iterations !== 'number' ||
    typeof normalizedHandoff.salt !== 'string' ||
    typeof normalizedHandoff.iv !== 'string' ||
    typeof normalizedHandoff.ciphertext !== 'string'
  ) {
    throw new Error('Restore payload is invalid.');
  }

  return {
    ...(parsed as DeviceLinkQrEnvelope),
    handoff: normalizedHandoff as EncryptedPayload
  };
}

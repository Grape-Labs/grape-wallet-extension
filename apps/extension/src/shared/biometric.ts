import {
  GRAPE_PASSKEY_CANONICAL_RP_ID,
  GRAPE_PASSKEY_RP_NAME,
  base64ToBytes,
  bytesToBase64,
  decryptText,
  derivePasskeyWalletMaterialFromPrf,
  encryptText,
  getPasskeyWalletPrfInput,
  utf8ToBytes,
  type BiometricUnlockConfig
} from '@grape/core';

import {
  createHostedDeterministicPasskeyWalletSetup,
  isHostedDeterministicPasskeyWalletSupported,
  unlockWithHostedDeterministicPasskey
} from './passkey-handoff';

type StoredBiometricConfig = BiometricUnlockConfig;

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return base64ToBytes(`${normalized}${padding}`);
}

function randomBytes(length: number): Uint8Array {
  return new Uint8Array(crypto.getRandomValues(new Uint8Array(length)));
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return new Uint8Array(bytes) as unknown as BufferSource;
}

function resolveRpId(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  if (protocol === 'https:' && hostname === GRAPE_PASSKEY_CANONICAL_RP_ID) {
    return GRAPE_PASSKEY_CANONICAL_RP_ID;
  }
  if (protocol === 'https:' && hostname) {
    return hostname;
  }

  return undefined;
}

function resolveDeterministicPasskeyWalletRpId(): string | undefined {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
    return undefined;
  }

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === GRAPE_PASSKEY_CANONICAL_RP_ID || hostname.endsWith(`.${GRAPE_PASSKEY_CANONICAL_RP_ID}`)) {
    return GRAPE_PASSKEY_CANONICAL_RP_ID;
  }

  return undefined;
}

function buildCreationOptions(walletId: string) {
  const challenge = randomBytes(32);
  const userId = utf8ToBytes(`grape:${walletId}`);
  const rpId = resolveRpId();

  return {
    challenge: new Uint8Array(challenge),
    rp: {
      name: GRAPE_PASSKEY_RP_NAME,
      ...(rpId ? { id: rpId } : {})
    },
    user: {
      id: new Uint8Array(userId),
      name: `grape-${walletId}`,
      displayName: 'Grape unlock'
    },
    pubKeyCredParams: [
      { type: 'public-key' as const, alg: -7 },
      { type: 'public-key' as const, alg: -257 }
    ],
    timeout: 60_000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform' as const,
      residentKey: 'discouraged' as const,
      userVerification: 'required' as const
    },
    attestation: 'none' as const
  };
}

function buildDeterministicPasskeyCreationOptions(rpId: string) {
  const challenge = randomBytes(32);
  const userId = utf8ToBytes('grape:passkey-wallet');

  return {
    challenge: new Uint8Array(challenge),
    rp: {
      name: GRAPE_PASSKEY_RP_NAME,
      ...(rpId ? { id: rpId } : {})
    },
    user: {
      id: new Uint8Array(userId),
      name: 'wallet@grape',
      displayName: 'Grape passkey wallet'
    },
    pubKeyCredParams: [
      { type: 'public-key' as const, alg: -7 },
      { type: 'public-key' as const, alg: -257 }
    ],
    timeout: 60_000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform' as const,
      residentKey: 'required' as const,
      userVerification: 'required' as const
    },
    attestation: 'none' as const
  };
}

function extractPrfFirst(results: AuthenticationExtensionsClientOutputs | undefined): Uint8Array | null {
  const prf = (results as { prf?: { results?: { first?: ArrayBuffer } } } | undefined)?.prf?.results?.first;
  return prf ? new Uint8Array(prf) : null;
}

export async function isBiometricUnlockSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof PublicKeyCredential === 'undefined' || !navigator.credentials?.create || !navigator.credentials?.get) {
    return false;
  }

  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function isDeterministicPasskeyWalletSupported(): Promise<boolean> {
  if (!await isBiometricUnlockSupported()) {
    return false;
  }

  return !!resolveDeterministicPasskeyWalletRpId() || isHostedDeterministicPasskeyWalletSupported();
}

async function evaluatePrf(credentialId: Uint8Array, prfInput: Uint8Array, rpId?: string): Promise<Uint8Array> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: asBufferSource(randomBytes(32) as Uint8Array),
      timeout: 60_000,
      userVerification: 'required',
      ...(rpId ? { rpId } : {}),
      allowCredentials: [
        {
          id: asBufferSource(credentialId),
          type: 'public-key'
        }
      ],
      extensions: {
        prf: {
          eval: {
            first: asBufferSource(prfInput)
          }
        }
      }
    }
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Biometric verification failed.');
  }

  const prfBytes = extractPrfFirst(assertion.getClientExtensionResults());
  if (!prfBytes) {
    throw new Error('This authenticator does not support deterministic passkey wallets.');
  }

  return prfBytes;
}

export async function createBiometricUnlock(walletId: string, password: string): Promise<StoredBiometricConfig> {
  const supported = await isBiometricUnlockSupported();
  if (!supported) {
    throw new Error('Biometric unlock is not available on this device.');
  }

  const credential = (await navigator.credentials.create({
    publicKey: buildCreationOptions(walletId)
  })) as PublicKeyCredential | null;

  if (!credential || !(credential.rawId instanceof ArrayBuffer)) {
    throw new Error('Biometric credential could not be created.');
  }

  const keySalt = randomBytes(32);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: asBufferSource(randomBytes(32) as Uint8Array),
      timeout: 60_000,
      userVerification: 'required',
      allowCredentials: [
        {
          id: credential.rawId,
          type: 'public-key'
        }
      ],
      extensions: {
        prf: {
          eval: {
            first: asBufferSource(keySalt)
          }
        }
      }
    }
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Biometric verification failed.');
  }

  const prfBytes = extractPrfFirst(assertion.getClientExtensionResults());
  if (!prfBytes) {
    throw new Error('This authenticator does not support secure biometric unlock.');
  }

  const prfSecret = bytesToBase64(prfBytes);
  const credentialIdBytes = new Uint8Array(credential.rawId);

  return {
    mode: 'wrapped-password',
    credentialId: bytesToBase64(credentialIdBytes),
    credentialIdB64Url: bytesToBase64Url(credentialIdBytes),
    keySalt: bytesToBase64(keySalt),
    wrappedPassword: await encryptText(password, prfSecret),
    createdAt: Date.now()
  };
}

export async function createDeterministicPasskeyWalletSetup(): Promise<{
  config: StoredBiometricConfig;
  mnemonicEntropy: Uint8Array;
  vaultPassword: string;
}> {
  const supported = await isDeterministicPasskeyWalletSupported();
  if (!supported) {
    throw new Error('Passkey wallet setup is not available on this device.');
  }
  const rpId = resolveDeterministicPasskeyWalletRpId();
  if (!rpId) {
    if (isHostedDeterministicPasskeyWalletSupported()) {
      const hosted = await createHostedDeterministicPasskeyWalletSetup();
      return {
        config: hosted.config,
        mnemonicEntropy: base64ToBytes(hosted.mnemonicEntropy),
        vaultPassword: hosted.vaultPassword
      };
    }
    throw new Error(`Deterministic passkey wallets require HTTPS on ${GRAPE_PASSKEY_CANONICAL_RP_ID}.`);
  }

  const credential = (await navigator.credentials.create({
    publicKey: buildDeterministicPasskeyCreationOptions(rpId)
  })) as PublicKeyCredential | null;

  if (!credential || !(credential.rawId instanceof ArrayBuffer)) {
    throw new Error('Passkey credential could not be created.');
  }

  const credentialIdBytes = new Uint8Array(credential.rawId);
  const prfBytes = await evaluatePrf(credentialIdBytes, getPasskeyWalletPrfInput(), rpId);
  const material = await derivePasskeyWalletMaterialFromPrf(prfBytes);

  return {
    config: {
      mode: 'deterministic-passkey',
      credentialId: bytesToBase64(credentialIdBytes),
      credentialIdB64Url: bytesToBase64Url(credentialIdBytes),
      rpId,
      createdAt: Date.now()
    },
    mnemonicEntropy: material.mnemonicEntropy,
    vaultPassword: material.vaultPassword
  };
}

export async function unlockWithBiometric(config: StoredBiometricConfig): Promise<string> {
  const supported = await isBiometricUnlockSupported();
  if (!supported) {
    throw new Error('Biometric unlock is not available on this device.');
  }

  const credentialId = config.credentialIdB64Url ? base64UrlToBytes(config.credentialIdB64Url) : base64ToBytes(config.credentialId);
  if (config.mode === 'deterministic-passkey') {
    const directRpId = resolveDeterministicPasskeyWalletRpId();
    if (!directRpId || (config.rpId && config.rpId !== directRpId)) {
      return unlockWithHostedDeterministicPasskey(config);
    }
    const prfBytes = await evaluatePrf(credentialId, getPasskeyWalletPrfInput(), config.rpId);
    const material = await derivePasskeyWalletMaterialFromPrf(prfBytes);
    return material.vaultPassword;
  }

  const prfBytes = await evaluatePrf(credentialId, base64ToBytes(config.keySalt));
  return decryptText(config.wrappedPassword, bytesToBase64(prfBytes));
}

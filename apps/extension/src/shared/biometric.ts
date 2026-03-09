import { base64ToBytes, bytesToBase64, decryptText, encryptText, utf8ToBytes, type EncryptedPayload } from '@grape/core';

type StoredBiometricConfig = {
  credentialId: string;
  credentialIdB64Url: string;
  keySalt: string;
  wrappedPassword: EncryptedPayload;
  createdAt: number;
};

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

function buildCreationOptions(walletId: string) {
  const challenge = randomBytes(32);
  const userId = utf8ToBytes(`grape:${walletId}`);

  return {
    challenge: new Uint8Array(challenge),
    rp: {
      name: 'Grape'
    },
    user: {
      id: new Uint8Array(userId),
      name: `grape-${walletId}`,
      displayName: 'Grape unlock'
    },
    pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
    timeout: 60_000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform' as const,
      residentKey: 'discouraged' as const,
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
    credentialId: bytesToBase64(credentialIdBytes),
    credentialIdB64Url: bytesToBase64Url(credentialIdBytes),
    keySalt: bytesToBase64(keySalt),
    wrappedPassword: await encryptText(password, prfSecret),
    createdAt: Date.now()
  };
}

export async function unlockWithBiometric(config: StoredBiometricConfig): Promise<string> {
  const supported = await isBiometricUnlockSupported();
  if (!supported) {
    throw new Error('Biometric unlock is not available on this device.');
  }

  const credentialId = config.credentialIdB64Url ? base64UrlToBytes(config.credentialIdB64Url) : base64ToBytes(config.credentialId);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(randomBytes(32)),
      timeout: 60_000,
      userVerification: 'required',
      allowCredentials: [
        {
          id: asBufferSource(credentialId),
          type: 'public-key'
        }
      ],
      extensions: {
        prf: {
          eval: {
            first: asBufferSource(base64ToBytes(config.keySalt))
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

  return decryptText(config.wrappedPassword, bytesToBase64(prfBytes));
}

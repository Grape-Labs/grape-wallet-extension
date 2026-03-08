import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from './encoding';

export type EncryptedPayload = {
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type CryptoProvider = {
  subtle: SubtleCrypto;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

const DEFAULT_ITERATIONS = 600_000;

export function getCryptoProvider(): CryptoProvider {
  const current = globalThis.crypto;
  if (!current?.subtle) {
    throw new Error('Web Crypto is not available in this environment.');
  }
  return current;
}

function normalizeBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

function asBufferSource(value: Uint8Array): BufferSource {
  return normalizeBytes(value) as unknown as BufferSource;
}

export async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_ITERATIONS,
  cryptoProvider = getCryptoProvider()
): Promise<CryptoKey> {
  const passwordKey = await cryptoProvider.subtle.importKey(
    'raw',
    asBufferSource(utf8ToBytes(password)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return cryptoProvider.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      iterations
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(
  plaintext: string,
  password: string,
  cryptoProvider = getCryptoProvider()
): Promise<EncryptedPayload> {
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, DEFAULT_ITERATIONS, cryptoProvider);
  const ciphertext = await cryptoProvider.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asBufferSource(iv)
    },
    key,
    asBufferSource(utf8ToBytes(plaintext))
  );

  return {
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    iterations: DEFAULT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptText(
  payload: EncryptedPayload,
  password: string,
  cryptoProvider = getCryptoProvider()
): Promise<string> {
  try {
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const key = await deriveAesKey(password, salt, payload.iterations, cryptoProvider);
    const plaintext = await cryptoProvider.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asBufferSource(iv)
      },
      key,
      asBufferSource(base64ToBytes(payload.ciphertext))
    );

    return bytesToUtf8(new Uint8Array(plaintext));
  } catch (error) {
    throw new Error('Invalid password or corrupt vault.', { cause: error });
  }
}

import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

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
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

export type WebCryptoProvider = CryptoProvider & {
  subtle: SubtleCrypto;
};

const DEFAULT_ITERATIONS = 600_000;
const AES_KEY_LENGTH = 32;

export function getCryptoProvider(): CryptoProvider {
  const current = globalThis.crypto;
  if (!current?.getRandomValues) {
    throw new Error('Secure random values are not available in this environment.');
  }
  return current;
}

export function getWebCryptoProvider(): WebCryptoProvider {
  const current = globalThis.crypto;
  if (!current?.getRandomValues || !current?.subtle) {
    throw new Error('Web Crypto is not available in this environment.');
  }
  return current;
}

export async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations = DEFAULT_ITERATIONS
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8ToBytes(password), salt, {
    c: iterations,
    dkLen: AES_KEY_LENGTH,
    asyncTick: 10
  });
}

export async function encryptText(
  plaintext: string,
  password: string,
  cryptoProvider = getCryptoProvider(),
  iterations = DEFAULT_ITERATIONS
): Promise<EncryptedPayload> {
  const salt = cryptoProvider.getRandomValues(new Uint8Array(16));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, iterations);
  const ciphertext = gcm(key, iv).encrypt(utf8ToBytes(plaintext));

  return {
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
}

export async function decryptText(
  payload: EncryptedPayload,
  password: string
): Promise<string> {
  try {
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const key = await deriveAesKey(password, salt, payload.iterations);
    const plaintext = gcm(key, iv).decrypt(base64ToBytes(payload.ciphertext));
    return bytesToUtf8(plaintext);
  } catch (error) {
    throw new Error('Invalid password or corrupt vault.', { cause: error });
  }
}

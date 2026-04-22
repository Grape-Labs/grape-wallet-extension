import './runtime-polyfills';

import { base64ToBytes, type VaultSecret } from '@grape/core';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { HDKey } from 'micro-ed25519-hdkey';

import { SOLANA_DERIVATION_PATH } from './constants';
import { mnemonicToSeedBytes, normalizeMnemonic, validateWalletMnemonic } from './mnemonic';

export type DerivedSolanaAccount = {
  mnemonic: string;
  derivationPath: string;
  keypair: Keypair;
  publicKey: string;
};

export type ImportedSolanaPrivateKeyAccount = {
  secretKey: string;
  derivationPath: 'imported-private-key';
  keypair: Keypair;
  publicKey: string;
};

export type ExportedSoftwareWalletSecret = {
  kind: 'mnemonic' | 'private-key';
  publicKey: string;
  derivationPath: string;
  privateKeyBase58: string;
  privateKeyBytes: number[];
  mnemonic?: string;
};

export function deriveSolanaAccount(
  mnemonic: string,
  derivationPath = SOLANA_DERIVATION_PATH
): DerivedSolanaAccount {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateWalletMnemonic(normalizedMnemonic)) {
    throw new Error('Mnemonic is invalid.');
  }

  const seed = mnemonicToSeedBytes(normalizedMnemonic);
  const hdKey = HDKey.fromMasterSeed(new Uint8Array(seed));
  const derived = hdKey.derive(derivationPath);
  if (!derived.privateKey) {
    throw new Error('Unable to derive Solana account.');
  }

  const keypair = Keypair.fromSeed(derived.privateKey);
  return {
    mnemonic: normalizedMnemonic,
    derivationPath,
    keypair,
    publicKey: keypair.publicKey.toBase58()
  };
}

export function deriveSolanaAccount0(mnemonic: string): DerivedSolanaAccount {
  return deriveSolanaAccount(mnemonic, SOLANA_DERIVATION_PATH);
}

export function validateSolanaPrivateKey(privateKey: string): boolean {
  try {
    importSolanaPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

export function importSolanaPrivateKey(privateKey: string): ImportedSolanaPrivateKeyAccount {
  const normalizedPrivateKey = privateKey.trim();
  const keyBytes = decodePrivateKey(normalizedPrivateKey);
  const keypair = toKeypair(keyBytes);

  return {
    secretKey: normalizedPrivateKey,
    derivationPath: 'imported-private-key',
    keypair,
    publicKey: keypair.publicKey.toBase58()
  };
}

export function resolveSolanaVaultSecret(secret: VaultSecret, derivationPath = SOLANA_DERIVATION_PATH): Keypair {
  if (secret.kind === 'mnemonic') {
    return deriveSolanaAccount(secret.mnemonic, derivationPath).keypair;
  }

  if (secret.kind === 'auth-token') {
    throw new Error('Auth tokens cannot be used as software signers.');
  }

  return importSolanaPrivateKey(secret.secretKey).keypair;
}

export function exportSolanaSoftwareWalletSecret(
  secret: VaultSecret,
  derivationPath = SOLANA_DERIVATION_PATH
): ExportedSoftwareWalletSecret {
  if (secret.kind === 'mnemonic') {
    const derived = deriveSolanaAccount(secret.mnemonic, derivationPath);
    return {
      kind: 'mnemonic',
      publicKey: derived.publicKey,
      derivationPath: derived.derivationPath,
      privateKeyBase58: bs58.encode(derived.keypair.secretKey),
      privateKeyBytes: Array.from(derived.keypair.secretKey),
      mnemonic: derived.mnemonic
    };
  }

  if (secret.kind === 'private-key') {
    const imported = importSolanaPrivateKey(secret.secretKey);
    return {
      kind: 'private-key',
      publicKey: imported.publicKey,
      derivationPath: imported.derivationPath,
      privateKeyBase58: bs58.encode(imported.keypair.secretKey),
      privateKeyBytes: Array.from(imported.keypair.secretKey)
    };
  }

  throw new Error('Hardware-backed wallets cannot be exported.');
}

function decodePrivateKey(privateKey: string): Uint8Array {
  if (!privateKey.trim()) {
    throw new Error('Private key is required.');
  }

  if (privateKey.trim().startsWith('[')) {
    const parsed = JSON.parse(privateKey) as unknown;
    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error('Private key array is invalid.');
    }
    return Uint8Array.from(parsed);
  }

  try {
    return bs58.decode(privateKey.trim());
  } catch {
    try {
      return base64ToBytes(privateKey.trim());
    } catch {
      throw new Error('Private key must be a base58 string, base64 string, or JSON byte array.');
    }
  }
}

function toKeypair(bytes: Uint8Array): Keypair {
  if (bytes.length === 64) {
    return Keypair.fromSecretKey(bytes);
  }

  if (bytes.length === 32) {
    return Keypair.fromSeed(bytes);
  }

  throw new Error('Private key must decode to 32 or 64 bytes.');
}

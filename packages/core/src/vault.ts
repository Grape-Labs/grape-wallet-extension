import { decryptText, encryptText } from './crypto';
import type { VaultRecord } from './state';

export type VaultSecret =
  | {
      kind: 'mnemonic';
      mnemonic: string;
    }
  | {
      kind: 'private-key';
      secretKey: string;
    }
  | {
      kind: 'auth-token';
      token: string;
    };

export async function createVaultRecord(secret: VaultSecret, password: string): Promise<VaultRecord> {
  const encryptedSecret = await encryptText(JSON.stringify(secret), password);
  const timestamp = Date.now();
  return {
    version: 1,
    encryptedSecret,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function unlockVaultRecord(vault: VaultRecord, password: string): Promise<VaultSecret> {
  const raw = await decryptText(vault.encryptedSecret, password);
  const parsed = JSON.parse(raw) as Partial<VaultSecret> & { mnemonic?: string };

  // Backward compatibility for early mnemonic-only vault payloads.
  if (typeof parsed.mnemonic === 'string' && parsed.kind === undefined) {
    return {
      kind: 'mnemonic',
      mnemonic: parsed.mnemonic
    };
  }

  if (parsed.kind === 'mnemonic' && typeof parsed.mnemonic === 'string') {
    return {
      kind: 'mnemonic',
      mnemonic: parsed.mnemonic
    };
  }

  if (parsed.kind === 'private-key' && typeof parsed.secretKey === 'string') {
    return {
      kind: 'private-key',
      secretKey: parsed.secretKey
    };
  }

  if (parsed.kind === 'auth-token' && typeof parsed.token === 'string') {
    return {
      kind: 'auth-token',
      token: parsed.token
    };
  }

  throw new Error('Vault payload is invalid.');
}

export async function verifyVaultPassword(vault: VaultRecord, password: string): Promise<boolean> {
  try {
    await unlockVaultRecord(vault, password);
    return true;
  } catch {
    return false;
  }
}

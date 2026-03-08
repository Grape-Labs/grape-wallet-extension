import { decryptText, encryptText } from './crypto';
import type { VaultRecord } from './state';

export type VaultSecret = {
  mnemonic: string;
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
  const parsed = JSON.parse(raw) as VaultSecret;
  if (!parsed.mnemonic) {
    throw new Error('Vault payload is invalid.');
  }
  return parsed;
}

export async function verifyVaultPassword(vault: VaultRecord, password: string): Promise<boolean> {
  try {
    await unlockVaultRecord(vault, password);
    return true;
  } catch {
    return false;
  }
}


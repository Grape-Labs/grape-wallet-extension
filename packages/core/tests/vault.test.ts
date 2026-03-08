import { describe, expect, it } from 'vitest';

import { createVaultRecord, unlockVaultRecord, verifyVaultPassword } from '../src/vault';

describe('vault', () => {
  it('encrypts and decrypts mnemonic payloads', async () => {
    const vault = await createVaultRecord({ mnemonic: 'test test test test test test test test test test test junk' }, 'password123');
    const secret = await unlockVaultRecord(vault, 'password123');

    expect(secret.mnemonic).toContain('junk');
    expect(vault.encryptedSecret.ciphertext).not.toContain('test test');
  });

  it('rejects invalid passwords', async () => {
    const vault = await createVaultRecord({ mnemonic: 'test test test test test test test test test test test junk' }, 'password123');
    await expect(unlockVaultRecord(vault, 'wrong')).rejects.toThrow('Invalid password or corrupt vault.');
    await expect(verifyVaultPassword(vault, 'wrong')).resolves.toBe(false);
  });
});


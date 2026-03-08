import { describe, expect, it } from 'vitest';

import { createVaultRecord, unlockVaultRecord, verifyVaultPassword } from '../src/vault';

describe('vault', () => {
  it('encrypts and decrypts mnemonic payloads', async () => {
    const vault = await createVaultRecord({ kind: 'mnemonic', mnemonic: 'test test test test test test test test test test test junk' }, 'password123');
    const secret = await unlockVaultRecord(vault, 'password123');

    expect(secret.kind).toBe('mnemonic');
    expect(secret.kind === 'mnemonic' ? secret.mnemonic : '').toContain('junk');
    expect(vault.encryptedSecret.ciphertext).not.toContain('test test');
  });

  it('encrypts and decrypts private-key payloads', async () => {
    const vault = await createVaultRecord({ kind: 'private-key', secretKey: '[1,2,3,4]' }, 'password123');
    const secret = await unlockVaultRecord(vault, 'password123');

    expect(secret).toEqual({ kind: 'private-key', secretKey: '[1,2,3,4]' });
  });

  it('encrypts and decrypts auth-token payloads', async () => {
    const vault = await createVaultRecord({ kind: 'auth-token', token: 'token-123' }, 'password123');
    const secret = await unlockVaultRecord(vault, 'password123');

    expect(secret).toEqual({ kind: 'auth-token', token: 'token-123' });
  });

  it('rejects invalid passwords', async () => {
    const vault = await createVaultRecord({ kind: 'mnemonic', mnemonic: 'test test test test test test test test test test test junk' }, 'password123');
    await expect(unlockVaultRecord(vault, 'wrong')).rejects.toThrow('Invalid password or corrupt vault.');
    await expect(verifyVaultPassword(vault, 'wrong')).resolves.toBe(false);
  });
});

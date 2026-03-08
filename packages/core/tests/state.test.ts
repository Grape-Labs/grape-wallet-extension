import { describe, expect, it } from 'vitest';

import { migrateWalletState, rememberWalletRecipient, type WalletProfile } from '../src/state';

const vaultRecord = {
  version: 1 as const,
  encryptedSecret: {
    algorithm: 'AES-GCM' as const,
    kdf: 'PBKDF2' as const,
    iterations: 100_000,
    salt: 'salt',
    iv: 'iv',
    ciphertext: 'ciphertext'
  },
  createdAt: 1,
  updatedAt: 1
};

describe('wallet state', () => {
  it('migrates wallet profiles without recipients', () => {
    const migrated = migrateWalletState({
      setup: 'ready',
      wallets: [
        {
          id: 'wallet-1',
          name: 'Wallet 1',
          vault: vaultRecord,
          accounts: [
            {
              id: 'account-0',
              index: 0,
              publicKey: '11111111111111111111111111111111',
              derivationPath: `m/44'/501'/0'/0'`
            }
          ],
          selectedAccountId: 'account-0'
        } as unknown as WalletProfile
      ],
      selectedWalletId: 'wallet-1',
      selectedNetwork: 'devnet',
      idleTimeoutMs: 1_000
    });

    expect(migrated.wallets[0]?.recentRecipients).toEqual([]);
  });

  it('stores recent recipients uniquely and most-recent-first', () => {
    const wallet: WalletProfile = {
      id: 'wallet-1',
      name: 'Wallet 1',
      vault: vaultRecord,
      signer: { kind: 'software' },
      accounts: [
        {
          id: 'account-0',
          index: 0,
          publicKey: '11111111111111111111111111111111',
          derivationPath: `m/44'/501'/0'/0'`
        }
      ],
      selectedAccountId: 'account-0',
      recentRecipients: [{ address: 'old-address', lastUsedAt: 1 }]
    };

    const remembered = rememberWalletRecipient(wallet, 'new-address', 2);
    const deduped = rememberWalletRecipient(remembered, 'old-address', 3);

    expect(deduped.recentRecipients.map((recipient) => recipient.address)).toEqual(['old-address', 'new-address']);
    expect(deduped.recentRecipients[0]?.lastUsedAt).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';

import { migrateWalletState, normalizeTheme, rememberWalletRecipient, removeWalletProfile, type WalletProfile } from '../src/state';

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
    expect(migrated.selectedTheme).toBe('aurora');
  });

  it('stores recent recipients uniquely and most-recent-first', () => {
    const wallet: WalletProfile = {
      id: 'wallet-1',
      name: 'Wallet 1',
      vault: vaultRecord,
      signer: { kind: 'software' },
      source: 'created',
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

  it('maps removed themes to the closest supported theme', () => {
    expect(normalizeTheme('modern')).toBe('aurora');
    expect(normalizeTheme('space')).toBe('liquid-chrome');
    expect(normalizeTheme('dark')).toBe('obsidian');
    expect(normalizeTheme('light')).toBe('champagne');
  });

  it('removes a selected wallet and falls forward to the next wallet', () => {
    const nextState = removeWalletProfile(
      {
        setup: 'ready',
        wallets: [
          {
            id: 'wallet-1',
            name: 'Wallet 1',
            vault: vaultRecord,
            signer: { kind: 'software' },
            source: 'created',
            accounts: [
              {
                id: 'account-0',
                index: 0,
                publicKey: '11111111111111111111111111111111',
                derivationPath: `m/44'/501'/0'/0'`
              }
            ],
            selectedAccountId: 'account-0',
            recentRecipients: []
          },
          {
            id: 'wallet-2',
            name: 'Wallet 2',
            vault: vaultRecord,
            signer: { kind: 'software' },
            source: 'imported-private-key',
            accounts: [
              {
                id: 'account-0',
                index: 0,
                publicKey: '22222222222222222222222222222222',
                derivationPath: `m/44'/501'/0'/0'`
              }
            ],
            selectedAccountId: 'account-0',
            recentRecipients: []
          }
        ],
        selectedWalletId: 'wallet-1',
        selectedNetwork: 'devnet',
        selectedTheme: 'aurora',
        idleTimeoutMs: 1_000
      },
      'wallet-1'
    );

    expect(nextState.wallets.map((wallet) => wallet.id)).toEqual(['wallet-2']);
    expect(nextState.selectedWalletId).toBe('wallet-2');
    expect(nextState.setup).toBe('ready');
  });

  it('removes the final wallet and returns to empty setup', () => {
    const nextState = removeWalletProfile(
      {
        setup: 'ready',
        wallets: [
          {
            id: 'wallet-1',
            name: 'Wallet 1',
            vault: vaultRecord,
            signer: { kind: 'software' },
            source: 'created',
            accounts: [
              {
                id: 'account-0',
                index: 0,
                publicKey: '11111111111111111111111111111111',
                derivationPath: `m/44'/501'/0'/0'`
              }
            ],
            selectedAccountId: 'account-0',
            recentRecipients: []
          }
        ],
        selectedWalletId: 'wallet-1',
        selectedNetwork: 'devnet',
        selectedTheme: 'aurora',
        idleTimeoutMs: 1_000
      },
      'wallet-1'
    );

    expect(nextState.wallets).toEqual([]);
    expect(nextState.selectedWalletId).toBeUndefined();
    expect(nextState.setup).toBe('empty');
  });
});

import { describe, expect, it } from 'vitest';

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

import { deriveSolanaAccount0, importSolanaPrivateKey, validateSolanaPrivateKey } from '../src/derive';
import { generateWalletMnemonic, validateWalletMnemonic } from '../src/mnemonic';

describe('mnemonic and derivation', () => {
  it('generates valid 12-word mnemonics', () => {
    const mnemonic = generateWalletMnemonic();
    expect(mnemonic.split(' ')).toHaveLength(12);
    expect(validateWalletMnemonic(mnemonic)).toBe(true);
  });

  it('derives deterministic account 0', () => {
    const mnemonic = 'pill tomorrow foster begin walnut borrow virtual kick shift mutual shoe scatter';
    const account = deriveSolanaAccount0(mnemonic);
    expect(account.derivationPath).toContain(`44'/501'`);
    expect(account.publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('imports a Solana private key from base58', () => {
    const keypair = Keypair.generate();
    const privateKey = bs58.encode(keypair.secretKey);
    const account = importSolanaPrivateKey(privateKey);

    expect(validateSolanaPrivateKey(privateKey)).toBe(true);
    expect(account.publicKey).toBe(keypair.publicKey.toBase58());
    expect(account.derivationPath).toBe('imported-private-key');
  });
});

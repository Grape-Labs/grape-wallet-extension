import { Keypair } from '@solana/web3.js';
import { HDKey } from 'micro-ed25519-hdkey';

import { SOLANA_DERIVATION_PATH } from './constants';
import { mnemonicToSeedBytes, normalizeMnemonic, validateWalletMnemonic } from './mnemonic';

export type DerivedSolanaAccount = {
  mnemonic: string;
  derivationPath: string;
  keypair: Keypair;
  publicKey: string;
};

export function deriveSolanaAccount0(mnemonic: string): DerivedSolanaAccount {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!validateWalletMnemonic(normalizedMnemonic)) {
    throw new Error('Mnemonic is invalid.');
  }

  const seed = mnemonicToSeedBytes(normalizedMnemonic);
  const hdKey = HDKey.fromMasterSeed(new Uint8Array(seed));
  const derived = hdKey.derive(SOLANA_DERIVATION_PATH);
  if (!derived.privateKey) {
    throw new Error('Unable to derive Solana account.');
  }

  const keypair = Keypair.fromSeed(derived.privateKey);
  return {
    mnemonic: normalizedMnemonic,
    derivationPath: SOLANA_DERIVATION_PATH,
    keypair,
    publicKey: keypair.publicKey.toBase58()
  };
}

import { entropyToMnemonic, generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

export type WalletMnemonicLength = 12 | 24;

export function generateWalletMnemonic(length: WalletMnemonicLength = 12): string {
  return generateMnemonic(wordlist, length === 24 ? 256 : 128);
}

export function entropyToWalletMnemonic(entropy: Uint8Array): string {
  return entropyToMnemonic(new Uint8Array(entropy), wordlist);
}

export function validateWalletMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(' ');
}

export function mnemonicToSeedBytes(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(normalizeMnemonic(mnemonic));
}

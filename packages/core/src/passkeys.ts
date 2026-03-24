import { bytesToBase64, utf8ToBytes } from './encoding';
import { getWebCryptoProvider, type WebCryptoProvider } from './crypto';

export const GRAPE_PASSKEY_WALLET_SPEC_VERSION = 'grape-passkey-wallet-v1';
export const GRAPE_PASSKEY_RP_NAME = 'Grape';
export const GRAPE_PASSKEY_CANONICAL_RP_ID = 'wallet.grape.app';

const PASSKEY_WALLET_PRF_INPUT = utf8ToBytes(`${GRAPE_PASSKEY_WALLET_SPEC_VERSION}:prf-input`);
const PASSKEY_WALLET_HKDF_SALT = utf8ToBytes(`${GRAPE_PASSKEY_WALLET_SPEC_VERSION}:hkdf-salt`);
const PASSKEY_WALLET_ENTROPY_INFO = utf8ToBytes(`${GRAPE_PASSKEY_WALLET_SPEC_VERSION}:mnemonic-entropy`);
const PASSKEY_WALLET_PASSWORD_INFO = utf8ToBytes(`${GRAPE_PASSKEY_WALLET_SPEC_VERSION}:vault-password`);

function asBufferSource(value: Uint8Array): BufferSource {
  return new Uint8Array(value) as unknown as BufferSource;
}

async function deriveHkdfBytes(inputKeyMaterial: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number, cryptoProvider: WebCryptoProvider) {
  const imported = await cryptoProvider.subtle.importKey(
    'raw',
    asBufferSource(inputKeyMaterial),
    'HKDF',
    false,
    ['deriveBits']
  );
  const derived = await cryptoProvider.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: asBufferSource(salt),
      info: asBufferSource(info)
    },
    imported,
    length * 8
  );

  return new Uint8Array(derived);
}

export function getPasskeyWalletPrfInput(): Uint8Array {
  return new Uint8Array(PASSKEY_WALLET_PRF_INPUT);
}

export async function derivePasskeyWalletMaterialFromPrf(
  prfOutput: Uint8Array,
  cryptoProvider = getWebCryptoProvider()
): Promise<{
  mnemonicEntropy: Uint8Array;
  vaultPassword: string;
}> {
  const mnemonicEntropy = await deriveHkdfBytes(prfOutput, PASSKEY_WALLET_HKDF_SALT, PASSKEY_WALLET_ENTROPY_INFO, 32, cryptoProvider);
  const passwordBytes = await deriveHkdfBytes(prfOutput, PASSKEY_WALLET_HKDF_SALT, PASSKEY_WALLET_PASSWORD_INFO, 32, cryptoProvider);

  return {
    mnemonicEntropy,
    vaultPassword: `grape-passkey.${bytesToBase64(passwordBytes)}`
  };
}

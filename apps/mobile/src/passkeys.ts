import { getRandomBytesAsync } from 'expo-crypto';
import { Platform } from 'react-native';

import {
  base64ToBytes,
  bytesToBase64,
  utf8ToBytes
} from '@grape/core';
import {
  GRAPE_PASSKEY_CANONICAL_RP_ID,
  GRAPE_PASSKEY_RP_NAME,
  GRAPE_PASSKEY_WALLET_SPEC_VERSION,
  derivePasskeyWalletMaterialFromPrf,
  getPasskeyWalletPrfInput
} from '../../../packages/core/src/passkeys';

export type MobilePasskeyWalletConfig = {
  mode: 'deterministic-passkey';
  version: typeof GRAPE_PASSKEY_WALLET_SPEC_VERSION;
  credentialId: string;
  credentialIdB64Url?: string;
  rpId: string;
  createdAt: number;
};

export type MobileDeterministicPasskeyWalletSupportStatus =
  | {
      supported: true;
    }
  | {
      supported: false;
      reason: 'native-module-missing' | 'unsupported-os' | 'native-check-failed';
    };

type NativePasskeyModule = {
  isSupportedAsync(): Promise<boolean>;
  createDeterministicPasskeyWalletAsync(input: {
    challenge: string;
    rpId: string;
    rpName: string;
    userId: string;
    userName: string;
    userDisplayName: string;
    prfInput: string;
  }): Promise<{
    credentialId?: string;
    credentialIdB64Url?: string;
    prfOutput: string;
  }>;
  getDeterministicPasskeyWalletPrfAsync(input: {
    challenge: string;
    rpId: string;
    credentialId?: string;
    credentialIdB64Url?: string;
    prfInput: string;
  }): Promise<{
    prfOutput: string;
  }>;
};

function loadNativePasskeyModule(): NativePasskeyModule | null {
  try {
    const expoModulesCore = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
      requireNativeModule?: (name: string) => unknown;
    };
    if (typeof expoModulesCore.requireOptionalNativeModule === 'function') {
      return expoModulesCore.requireOptionalNativeModule('GrapeMobilePasskeys') as NativePasskeyModule | null;
    }
    if (typeof expoModulesCore.requireNativeModule === 'function') {
      return expoModulesCore.requireNativeModule('GrapeMobilePasskeys') as NativePasskeyModule;
    }
  } catch {
    return null;
  }

  return null;
}

function getNativePasskeyModule(): NativePasskeyModule {
  const module = loadNativePasskeyModule();
  if (!module) {
    throw new Error('Native passkey support is not installed in this mobile build.');
  }
  return module;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return base64ToBytes(`${normalized}${padding}`);
}

function normalizeCredentialIds(input: { credentialId?: string; credentialIdB64Url?: string }): {
  credentialId: string;
  credentialIdB64Url: string;
} {
  if (input.credentialId && input.credentialIdB64Url) {
    return {
      credentialId: input.credentialId,
      credentialIdB64Url: input.credentialIdB64Url
    };
  }
  if (input.credentialId) {
    return {
      credentialId: input.credentialId,
      credentialIdB64Url: bytesToBase64Url(base64ToBytes(input.credentialId))
    };
  }
  if (input.credentialIdB64Url) {
    return {
      credentialId: bytesToBase64(base64UrlToBytes(input.credentialIdB64Url)),
      credentialIdB64Url: input.credentialIdB64Url
    };
  }

  throw new Error('Native passkey module did not return a credential identifier.');
}

async function createChallenge() {
  return bytesToBase64(await getRandomBytesAsync(32));
}

export async function isMobileDeterministicPasskeyWalletSupported(): Promise<boolean> {
  const status = await getMobileDeterministicPasskeyWalletSupportStatus();
  return status.supported;
}

export async function getMobileDeterministicPasskeyWalletSupportStatus(): Promise<MobileDeterministicPasskeyWalletSupportStatus> {
  const module = loadNativePasskeyModule();
  if (!module) {
    return {
      supported: false,
      reason: 'native-module-missing'
    };
  }

  try {
    if (await module.isSupportedAsync()) {
      return {
        supported: true
      };
    }

    return {
      supported: false,
      reason: 'unsupported-os'
    };
  } catch {
    return {
      supported: false,
      reason: 'native-check-failed'
    };
  }
}

export function getMobileDeterministicPasskeyWalletUnavailableMessage(status: MobileDeterministicPasskeyWalletSupportStatus): string | null {
  if (status.supported) {
    return null;
  }

  switch (status.reason) {
    case 'native-module-missing':
      return 'This binary does not include the native passkey module yet. Rebuild the app with Expo run/EAS; Expo Go and older dev clients will not load it.';
    case 'unsupported-os':
      if (Platform.OS === 'ios') {
        return 'Deterministic passkey wallets require iOS 18 or newer on mobile.';
      }
      return 'Deterministic passkey wallets are not supported by this Android device or OS build.';
    case 'native-check-failed':
      return 'The native passkey module loaded, but support detection failed on this device.';
    default:
      return 'Deterministic passkey wallets are not available on this device.';
  }
}

export async function createMobileDeterministicPasskeyWalletSetup(): Promise<{
  config: MobilePasskeyWalletConfig;
  mnemonicEntropy: Uint8Array;
  vaultPassword: string;
}> {
  const module = getNativePasskeyModule();
  const result = await module.createDeterministicPasskeyWalletAsync({
    challenge: await createChallenge(),
    rpId: GRAPE_PASSKEY_CANONICAL_RP_ID,
    rpName: GRAPE_PASSKEY_RP_NAME,
    userId: bytesToBase64(utf8ToBytes('grape:passkey-wallet')),
    userName: 'wallet@grape',
    userDisplayName: 'Grape passkey wallet',
    prfInput: bytesToBase64(getPasskeyWalletPrfInput())
  });

  const credentialIds = normalizeCredentialIds(result);
  const material = await derivePasskeyWalletMaterialFromPrf(base64ToBytes(result.prfOutput));

  return {
    config: {
      mode: 'deterministic-passkey',
      version: GRAPE_PASSKEY_WALLET_SPEC_VERSION,
      credentialId: credentialIds.credentialId,
      credentialIdB64Url: credentialIds.credentialIdB64Url,
      rpId: GRAPE_PASSKEY_CANONICAL_RP_ID,
      createdAt: Date.now()
    },
    mnemonicEntropy: material.mnemonicEntropy,
    vaultPassword: material.vaultPassword
  };
}

export async function getMobileDeterministicPasskeyWalletPassword(config: MobilePasskeyWalletConfig): Promise<string> {
  const module = getNativePasskeyModule();
  const result = await module.getDeterministicPasskeyWalletPrfAsync({
    challenge: await createChallenge(),
    rpId: config.rpId,
    credentialId: config.credentialId,
    credentialIdB64Url: config.credentialIdB64Url,
    prfInput: bytesToBase64(getPasskeyWalletPrfInput())
  });
  const material = await derivePasskeyWalletMaterialFromPrf(base64ToBytes(result.prfOutput));
  return material.vaultPassword;
}

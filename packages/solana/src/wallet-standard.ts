import { base64ToBytes, bytesToBase64 } from '@grape/core';
import {
  SOLANA_DEVNET_CHAIN,
  SOLANA_MAINNET_CHAIN,
  type SolanaChain
} from '@solana/wallet-standard-chains';
import {
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature
} from '@solana/wallet-standard-features';
import type { WalletAccount, WalletWithFeatures } from '@wallet-standard/base';
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsChangeProperties,
  type StandardEventsFeature
} from '@wallet-standard/features';
import { ReadonlyWalletAccount, registerWallet } from '@wallet-standard/wallet';

import type { GrapeInpageProvider } from './provider';

import { GRAPE_WALLET_ICON } from './constants';

declare global {
  interface Window {
    grape?: GrapeInpageProvider;
    grapeSolana?: GrapeInpageProvider;
    solana?: GrapeInpageProvider;
  }
}

type WalletStandardFeatures = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature &
  SolanaSignMessageFeature &
  SolanaSignTransactionFeature;

export type WalletStandardWallet = WalletWithFeatures<WalletStandardFeatures> & {
  readonly name: 'Grape';
};

const DEFAULT_SOLANA_CHAINS = [SOLANA_MAINNET_CHAIN, SOLANA_DEVNET_CHAIN] as const satisfies readonly SolanaChain[];
const ACCOUNT_FEATURES = [
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  SolanaSignMessage,
  SolanaSignTransaction
] as const;
const WALLET_STANDARD_ICON = GRAPE_WALLET_ICON as NonNullable<WalletAccount['icon']>;

function createWalletAccount(provider: GrapeInpageProvider, chains: readonly SolanaChain[]): WalletAccount {
  if (!provider.publicKey) {
    throw new Error('Cannot create a Wallet Standard account without an active public key.');
  }

  return new ReadonlyWalletAccount({
    address: provider.publicKey.toBase58(),
    publicKey: provider.publicKey.toBytes(),
    chains,
    features: ACCOUNT_FEATURES,
    label: 'Account 1',
    icon: WALLET_STANDARD_ICON
  });
}

export function createWalletStandardWallet(
  provider: GrapeInpageProvider,
  chains: readonly SolanaChain[] = DEFAULT_SOLANA_CHAINS
): WalletStandardWallet {
  const getAccounts = (): readonly WalletAccount[] => {
    return provider.publicKey ? [createWalletAccount(provider, chains)] : [];
  };

  const emitAccountsChanged = (listener: (properties: StandardEventsChangeProperties) => void) => {
    listener({ accounts: getAccounts() });
  };

  const walletBase: WalletStandardWallet = {
    version: '1.0.0',
    name: 'Grape',
    icon: WALLET_STANDARD_ICON,
    chains,
    features: {
      [StandardConnect]: {
        version: '1.0.0',
        connect: async ({ silent } = {}) => {
          await provider.connect({ onlyIfTrusted: silent });
          return {
            accounts: getAccounts()
          };
        }
      },
      [StandardDisconnect]: {
        version: '1.0.0',
        disconnect: async () => provider.disconnect()
      },
      [StandardEvents]: {
        version: '1.0.0',
        on: (event, listener) => {
          if (event !== 'change') {
            return () => {};
          }

          const handleChange = () => emitAccountsChanged(listener);
          provider.on('accountChanged', handleChange);
          provider.on('disconnect', handleChange);
          return () => {
            provider.off('accountChanged', handleChange);
            provider.off('disconnect', handleChange);
          };
        }
      },
      [SolanaSignMessage]: {
        version: '1.1.0',
        signMessage: async (...inputs) => {
          const outputs = [];
          for (const input of inputs) {
            if (input.account.address !== provider.publicKey?.toBase58()) {
              throw new Error('Requested account does not match the active Grape account.');
            }

            const signed = await provider.signMessage(input.message);
            outputs.push({
              signedMessage: input.message,
              signature: signed.signature,
              signatureType: 'ed25519' as const
            });
          }
          return outputs;
        }
      },
      [SolanaSignTransaction]: {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0] as const,
        signTransaction: async (...inputs) => {
          const outputs = [];
          for (const input of inputs) {
            if (input.account.address !== provider.publicKey?.toBase58()) {
              throw new Error('Requested account does not match the active Grape account.');
            }

            const signed = await provider.transport.request<{ transaction: string }>({
              id: crypto.randomUUID(),
              method: 'signTransaction',
              origin: provider.origin,
              params: {
                transaction: bytesToBase64(input.transaction)
              }
            });

            outputs.push({
              signedTransaction: base64ToBytes(signed.transaction)
            });
          }
          return outputs;
        }
      }
    },
    get accounts() {
      return getAccounts();
    }
  };

  return walletBase;
}

export function registerWalletStandard(wallet: WalletStandardWallet): void {
  registerWallet(wallet);
}

function defineLegacyProvider(name: 'grape' | 'grapeSolana' | 'solana', provider: GrapeInpageProvider, overwrite = true) {
  if (!overwrite && name in window && window[name]) {
    return;
  }

  try {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: provider
    });
  } catch {
    if (overwrite || !window[name]) {
      window[name] = provider;
    }
  }
}

function attachToExistingLegacyProviderList(provider: GrapeInpageProvider) {
  const existing = window.solana;
  if (!existing || existing === provider || typeof existing !== 'object') {
    return;
  }

  const existingWithProviders = existing as GrapeInpageProvider & { providers?: GrapeInpageProvider[] };
  if (!Array.isArray(existingWithProviders.providers)) {
    return;
  }

  const currentProviders = existingWithProviders.providers;
  if (currentProviders.includes(provider)) {
    return;
  }

  try {
    Object.defineProperty(existingWithProviders, 'providers', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: [...currentProviders, provider]
    });
  } catch {
    try {
      existingWithProviders.providers = [...currentProviders, provider];
    } catch {
      // Avoid mutating another wallet object if it rejects extension.
    }
  }
}

export function initializeWalletStandard(
  provider: GrapeInpageProvider,
  chains: readonly SolanaChain[] = DEFAULT_SOLANA_CHAINS
): WalletStandardWallet {
  const wallet = createWalletStandardWallet(provider, chains);
  registerWalletStandard(wallet);
  defineLegacyProvider('grape', provider);
  defineLegacyProvider('grapeSolana', provider);
  defineLegacyProvider('solana', provider, false);
  attachToExistingLegacyProviderList(provider);
  return wallet;
}

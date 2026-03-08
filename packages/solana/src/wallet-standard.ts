import { base64ToBytes, bytesToBase64 } from '@grape/core';

import type { GrapeInpageProvider } from './provider';

import { GRAPE_WALLET_ICON } from './constants';
import { SOLANA_CHAIN_IDS } from './constants';

declare global {
  interface Window {
    grape?: GrapeInpageProvider;
    grapeSolana?: GrapeInpageProvider;
    solana?: GrapeInpageProvider;
  }
}

type WalletStandardRegisterDetail = {
  register(wallet: WalletStandardWallet): void;
};

export type WalletStandardAccount = {
  address: string;
  publicKey: Uint8Array;
  chains: string[];
  features: string[];
  label?: string;
  icon?: string;
};

export type WalletStandardWallet = {
  version: '1.0.0';
  name: 'Grape Wallet';
  icon: string;
  chains: string[];
  features: Record<string, unknown>;
  readonly accounts: WalletStandardAccount[];
};

class RegisterWalletEvent extends Event {
  readonly detail: (detail: WalletStandardRegisterDetail) => void;

  constructor(detail: (detail: WalletStandardRegisterDetail) => void) {
    super('wallet-standard:register-wallet');
    this.detail = detail;
  }
}

export function createWalletStandardWallet(
  provider: GrapeInpageProvider,
  chains: string[] = Object.values(SOLANA_CHAIN_IDS)
): WalletStandardWallet {
  function getAccounts(): WalletStandardAccount[] {
    return provider.publicKey
      ? [
          {
            address: provider.publicKey.toBase58(),
            publicKey: provider.publicKey.toBytes(),
            chains,
            features: [
              'standard:connect',
              'standard:disconnect',
              'standard:events',
              'solana:signMessage',
              'solana:signTransaction',
              'solana:signAndSendTransaction'
            ],
            label: 'Account 1',
            icon: GRAPE_WALLET_ICON
          }
        ]
      : [];
  }

  const walletBase: Omit<WalletStandardWallet, 'accounts'> = {
    version: '1.0.0',
    name: 'Grape Wallet',
    icon: GRAPE_WALLET_ICON,
    chains,
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async ({ silent }: { silent?: boolean } = {}) => {
          const response = await provider.connect({ onlyIfTrusted: silent });
          return {
            accounts: getAccounts()
          };
        }
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => provider.disconnect()
      },
      'standard:events': {
        version: '1.0.0',
        on: (event: 'change', listener: () => void) => {
          if (event !== 'change') {
            return () => {};
          }

          const handleChange = () => listener();
          provider.on('accountChanged', handleChange);
          provider.on('disconnect', handleChange);
          return () => {
            provider.off('accountChanged', handleChange);
            provider.off('disconnect', handleChange);
          };
        }
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async (...inputs: Array<{ message: Uint8Array }>) => {
          const outputs = [];
          for (const input of inputs) {
            const signed = await provider.signMessage(input.message);
            outputs.push({
              signedMessage: input.message,
              signature: signed.signature
            });
          }
          return outputs;
        }
      },
      'solana:signTransaction': {
        version: '1.0.0',
        signTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) => {
          const outputs = [];
          for (const input of inputs) {
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
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        signAndSendTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) => {
          const outputs = [];
          for (const input of inputs) {
            const sent = await provider.transport.request<{ signature: string }>({
              id: crypto.randomUUID(),
              method: 'signAndSendTransaction',
              origin: provider.origin,
              params: {
                transaction: bytesToBase64(input.transaction)
              }
            });
            outputs.push({
              signature: sent.signature
            });
          }
          return outputs;
        }
      }
    }
  };

  const wallet = walletBase as unknown as WalletStandardWallet;

  Object.defineProperty(wallet, 'accounts', {
    enumerable: true,
    get: getAccounts
  });

  return wallet;
}

export function registerWalletStandard(wallet: WalletStandardWallet): void {
  const register = ({ register: performRegister }: WalletStandardRegisterDetail) => performRegister(wallet);

  window.dispatchEvent(new RegisterWalletEvent(register));
  window.addEventListener('wallet-standard:app-ready', (event: Event) => {
    const detail = (event as CustomEvent<WalletStandardRegisterDetail>).detail;
    register(detail);
  });
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

export function initializeWalletStandard(
  provider: GrapeInpageProvider,
  chains: string[] = Object.values(SOLANA_CHAIN_IDS)
): WalletStandardWallet {
  const wallet = createWalletStandardWallet(provider, chains);
  registerWalletStandard(wallet);
  defineLegacyProvider('grape', provider);
  defineLegacyProvider('grapeSolana', provider);
  defineLegacyProvider('solana', provider, false);
  return wallet;
}

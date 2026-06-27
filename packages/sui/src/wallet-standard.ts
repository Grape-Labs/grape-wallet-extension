import { GRAPE_WALLET_ICON, base64ToBytes, bytesToBase64, type PageOrigin } from '@grape/core';
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

const SUI_SIGN_PERSONAL_MESSAGE = 'sui:signPersonalMessage';
const SUI_SIGN_TRANSACTION = 'sui:signTransaction';
const SUI_SIGN_AND_EXECUTE_TRANSACTION = 'sui:signAndExecuteTransaction';
const SUI_SIGN_TRANSACTION_BLOCK = 'sui:signTransactionBlock';
const SUI_SIGN_AND_EXECUTE_TRANSACTION_BLOCK = 'sui:signAndExecuteTransactionBlock';
const DEFAULT_SUI_CHAINS = ['sui:mainnet', 'sui:devnet'] as const satisfies readonly `${string}:${string}`[];
const GRAPE_PROVIDER_ICON = GRAPE_WALLET_ICON as NonNullable<WalletAccount['icon']>;

type SuiProviderTransport = {
  request<T>(request: {
    id: string;
    method:
      | 'sui_connect'
      | 'sui_disconnect'
      | 'sui_getAccounts'
      | 'sui_signPersonalMessage'
      | 'sui_signTransaction'
      | 'sui_signAndExecuteTransaction';
    origin: PageOrigin;
    params: Record<string, unknown>;
  }): Promise<T>;
};

type SuiAccountInfo = {
  address: string;
  publicKey: string;
};

type SuiExecuteTransactionOptions = {
  showBalanceChanges?: boolean;
  showEffects?: boolean;
  showEvents?: boolean;
  showInput?: boolean;
  showObjectChanges?: boolean;
  showRawEffects?: boolean;
  showRawInput?: boolean;
};

type SuiExecuteTransactionResult = {
  address?: string;
  balanceChanges?: unknown[] | null;
  bytes: string;
  checkpoint?: string | null;
  confirmedLocalExecution?: boolean | null;
  digest: string;
  effects?: string;
  errors?: string[];
  events?: unknown[] | null;
  objectChanges?: unknown[] | null;
  rawEffects?: number[];
  rawTransaction?: string;
  signature: string;
  timestampMs?: string | null;
  transactionBlockBytes?: string;
  transaction?: unknown | null;
};

type WalletStandardFeatures = StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature & {
    [SUI_SIGN_PERSONAL_MESSAGE]: {
      version: '1.0.0';
      signPersonalMessage: (input: { account: WalletAccount; message: Uint8Array }) => Promise<{ bytes: string; signature: string }>;
    };
    [SUI_SIGN_TRANSACTION]: {
      version: '1.0.0';
      signTransaction: (input: {
        account: WalletAccount;
        transaction: unknown;
      }) => Promise<{ bytes: string; signature: string; transactionBlockBytes: string }>;
    };
    [SUI_SIGN_AND_EXECUTE_TRANSACTION]: {
      version: '1.0.0';
      signAndExecuteTransaction: (input: {
        account: WalletAccount;
        transaction: unknown;
        options?: SuiExecuteTransactionOptions;
      }) => Promise<SuiExecuteTransactionResult>;
    };
    [SUI_SIGN_TRANSACTION_BLOCK]: {
      version: '1.0.0';
      signTransactionBlock: (input: {
        account: WalletAccount;
        transactionBlock: unknown;
      }) => Promise<{ bytes: string; signature: string; transactionBlockBytes: string }>;
    };
    [SUI_SIGN_AND_EXECUTE_TRANSACTION_BLOCK]: {
      version: '1.0.0';
      signAndExecuteTransactionBlock: (input: {
        account: WalletAccount;
        transactionBlock: unknown;
        options?: SuiExecuteTransactionOptions;
      }) => Promise<SuiExecuteTransactionResult>;
    };
  };

export type SuiWalletStandardWallet = WalletWithFeatures<WalletStandardFeatures> & {
  readonly name: 'Grape';
};

function randomId() {
  return crypto.randomUUID();
}

function toBytes(value: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function serializeTransactionInput(transaction: unknown) {
  if (typeof transaction === 'string' && transaction.trim()) {
    return transaction;
  }

  if (transaction instanceof Uint8Array || transaction instanceof ArrayBuffer || ArrayBuffer.isView(transaction)) {
    return bytesToBase64(toBytes(transaction as Uint8Array | ArrayBuffer | ArrayBufferView));
  }

  if (typeof transaction === 'object' && transaction !== null && 'serialize' in transaction) {
    const serialize = (transaction as { serialize: () => string | Uint8Array | Promise<string | Uint8Array> }).serialize;
    if (typeof serialize === 'function') {
      const serialized = await serialize.call(transaction);
      if (serialized instanceof Uint8Array) {
        return bytesToBase64(serialized);
      }
      if (typeof serialized === 'string' && serialized.trim()) {
        return serialized;
      }
    }
  }

  if (typeof transaction === 'object' && transaction !== null && 'toJSON' in transaction) {
    const toJSON = (transaction as { toJSON: () => unknown | Promise<unknown> }).toJSON;
    if (typeof toJSON === 'function') {
      const serialized = await toJSON.call(transaction);
      if (typeof serialized === 'string' && serialized.trim()) {
        return serialized;
      }
      if (serialized && typeof serialized === 'object') {
        return JSON.stringify(serialized);
      }
    }
  }

  if (typeof transaction === 'object' && transaction !== null && 'getData' in transaction) {
    const getData = (transaction as { getData: () => unknown }).getData;
    if (typeof getData === 'function') {
      const serialized = getData.call(transaction);
      if (serialized && typeof serialized === 'object') {
        return JSON.stringify(serialized);
      }
    }
  }

  throw new Error('Unsupported Sui transaction input.');
}

function createWalletAccount(account: SuiAccountInfo, chains: readonly `${string}:${string}`[]): WalletAccount {
  return new ReadonlyWalletAccount({
    address: account.address,
    publicKey: base64ToBytes(account.publicKey),
    chains,
    features: [
      StandardConnect,
      StandardDisconnect,
      StandardEvents,
      SUI_SIGN_PERSONAL_MESSAGE,
      SUI_SIGN_TRANSACTION,
      SUI_SIGN_AND_EXECUTE_TRANSACTION,
      SUI_SIGN_TRANSACTION_BLOCK,
      SUI_SIGN_AND_EXECUTE_TRANSACTION_BLOCK
    ],
    label: 'Account 1',
    icon: GRAPE_PROVIDER_ICON
  });
}

declare global {
  interface Window {
    grapeSui?: SuiWalletStandardWallet;
  }
}

export function createSuiWalletStandardWallet(
  transport: SuiProviderTransport,
  origin: PageOrigin,
  chains: readonly `${string}:${string}`[] = DEFAULT_SUI_CHAINS
): SuiWalletStandardWallet {
  let connectedAccount: SuiAccountInfo | null = null;
  const listeners = new Set<(properties: StandardEventsChangeProperties) => void>();

  const getAccounts = () => (connectedAccount ? [createWalletAccount(connectedAccount, chains)] : []);
  const emitAccountsChanged = () => {
    const nextAccounts = getAccounts();
    for (const listener of listeners) {
      listener({ accounts: nextAccounts });
    }
  };

  const ensureActiveAccount = (account: WalletAccount) => {
    if (!connectedAccount || account.address !== connectedAccount.address) {
      throw new Error('Requested account does not match the active Grape Sui account.');
    }
  };

  const wallet: SuiWalletStandardWallet = {
    version: '1.0.0',
    name: 'Grape',
    icon: GRAPE_PROVIDER_ICON,
    chains,
    features: {
      [StandardConnect]: {
        version: '1.0.0',
        connect: async ({ silent } = {}) => {
          const result = await transport.request<{ accounts: SuiAccountInfo[] }>({
            id: randomId(),
            method: 'sui_connect',
            origin,
            params: {
              silent
            }
          });

          connectedAccount = result.accounts[0] ?? null;
          emitAccountsChanged();
          return {
            accounts: getAccounts()
          };
        }
      },
      [StandardDisconnect]: {
        version: '1.0.0',
        disconnect: async () => {
          await transport.request({
            id: randomId(),
            method: 'sui_disconnect',
            origin,
            params: {}
          });
          connectedAccount = null;
          emitAccountsChanged();
        }
      },
      [StandardEvents]: {
        version: '1.0.0',
        on: (event, listener) => {
          if (event !== 'change') {
            return () => {};
          }

          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }
      },
      [SUI_SIGN_PERSONAL_MESSAGE]: {
        version: '1.0.0',
        signPersonalMessage: async (input) => {
          ensureActiveAccount(input.account);
          const result = await transport.request<{ bytes: string; signature: string }>({
            id: randomId(),
            method: 'sui_signPersonalMessage',
            origin,
            params: {
              message: bytesToBase64(toBytes(input.message))
            }
          });

          return {
            bytes: result.bytes,
            signature: result.signature
          };
        }
      },
      [SUI_SIGN_TRANSACTION]: {
        version: '1.0.0',
        signTransaction: async (input) => {
          ensureActiveAccount(input.account);
          const result = await transport.request<{ bytes: string; signature: string }>({
            id: randomId(),
            method: 'sui_signTransaction',
            origin,
            params: {
              transaction: await serializeTransactionInput(input.transaction)
            }
          });

          return {
            bytes: result.bytes,
            signature: result.signature,
            transactionBlockBytes: result.bytes
          };
        }
      },
      [SUI_SIGN_AND_EXECUTE_TRANSACTION]: {
        version: '1.0.0',
        signAndExecuteTransaction: async (input) => {
          ensureActiveAccount(input.account);
          const result = await transport.request<SuiExecuteTransactionResult>({
            id: randomId(),
            method: 'sui_signAndExecuteTransaction',
            origin,
            params: {
              transaction: await serializeTransactionInput(input.transaction),
              options: input.options
            }
          });

          return {
            ...result,
            transactionBlockBytes: result.transactionBlockBytes ?? result.bytes
          };
        }
      },
      [SUI_SIGN_TRANSACTION_BLOCK]: {
        version: '1.0.0',
        signTransactionBlock: async (input) => {
          return wallet.features[SUI_SIGN_TRANSACTION].signTransaction({
            account: input.account,
            transaction: input.transactionBlock
          });
        }
      },
      [SUI_SIGN_AND_EXECUTE_TRANSACTION_BLOCK]: {
        version: '1.0.0',
        signAndExecuteTransactionBlock: async (input) => {
          return wallet.features[SUI_SIGN_AND_EXECUTE_TRANSACTION].signAndExecuteTransaction({
            account: input.account,
            transaction: input.transactionBlock,
            options: input.options
          });
        }
      },
    },
    get accounts() {
      return getAccounts();
    }
  };

  return wallet;
}

export function initializeSuiWalletStandard(transport: SuiProviderTransport, origin: PageOrigin) {
  const wallet = createSuiWalletStandardWallet(transport, origin);
  registerWallet(wallet);

  try {
    Object.defineProperty(window, 'grapeSui', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: wallet
    });
  } catch {
    window.grapeSui = wallet;
  }

  return wallet;
}

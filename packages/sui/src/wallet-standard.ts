import { base64ToBytes, bytesToBase64, type PageOrigin } from '@grape/core';
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
const GRAPE_PROVIDER_ICON =
  'data:image/png;base64,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' as NonNullable<WalletAccount['icon']>;

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

import { base64ToBytes, RpcError } from '@grape/core';
import { PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';

import { parseSerializedTransaction, serializeSignedTransaction } from './signing';

export const LEDGER_DEFAULT_DERIVATION_PATH = `44'/501'/0'/0'`;

type LedgerTransportModule = {
  default: {
    request(): Promise<unknown>;
    openConnected(): Promise<unknown | null>;
  };
};

type LedgerSolanaModule = {
  default: new (transport: unknown) => {
    getAddress(path: string, display?: boolean): Promise<{ address: string | Buffer }>;
    signTransaction(path: string, txBuffer: Uint8Array, userInputType?: 'ata'): Promise<{ signature: Uint8Array | Buffer }>;
  };
};

export async function requestLedgerAccount(path = LEDGER_DEFAULT_DERIVATION_PATH): Promise<{
  publicKey: string;
  derivationPath: string;
}> {
  const TransportWebHID = await loadLedgerTransport();
  const Solana = await loadLedgerSolana();
  const transport = await TransportWebHID.request();

  try {
    const solana = new Solana(transport);
    const result = await solana.getAddress(path, false);
    const publicKey = normalizeLedgerAddress(result.address);
    return { publicKey, derivationPath: path };
  } catch (error) {
    throw normalizeLedgerError(error);
  } finally {
    await closeLedgerTransport(transport);
  }
}

export async function signAndSendLedgerTransaction(
  transaction: Transaction,
  publicKey: string,
  derivationPath: string,
  connection: Connection
): Promise<string> {
  const signature = await signLedgerTransactionBytes(transaction.serializeMessage(), derivationPath);
  transaction.addSignature(new PublicKey(publicKey), Buffer.from(signature));
  return connection.sendRawTransaction(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })
  );
}

export async function signLedgerSerializedTransaction(
  serialized: string,
  publicKey: string,
  derivationPath: string
): Promise<string> {
  const parsed = parseSerializedTransaction(serialized);
  const signature =
    parsed.kind === 'versioned'
      ? await signLedgerTransactionBytes(parsed.transaction.message.serialize(), derivationPath)
      : await signLedgerTransactionBytes(parsed.transaction.serializeMessage(), derivationPath);

  if (parsed.kind === 'versioned') {
    parsed.transaction.addSignature(new PublicKey(publicKey), Buffer.from(signature));
  } else {
    parsed.transaction.addSignature(new PublicKey(publicKey), Buffer.from(signature));
  }

  return serializeSignedTransaction(parsed);
}

export async function signLedgerSerializedTransactions(
  serializedTransactions: string[],
  publicKey: string,
  derivationPath: string
): Promise<string[]> {
  const signed: string[] = [];
  for (const serialized of serializedTransactions) {
    signed.push(await signLedgerSerializedTransaction(serialized, publicKey, derivationPath));
  }
  return signed;
}

export async function signAndSendLedgerSerializedTransaction(
  serialized: string,
  publicKey: string,
  derivationPath: string,
  rpcEndpoint: string
): Promise<string> {
  const signed = await signLedgerSerializedTransaction(serialized, publicKey, derivationPath);
  const connection = new Connection(rpcEndpoint, 'confirmed');
  return connection.sendRawTransaction(base64ToBytes(signed));
}

function normalizeLedgerAddress(input: string | Buffer): string {
  if (typeof input === 'string') {
    return input;
  }

  return new PublicKey(input).toBase58();
}

async function signLedgerTransactionBytes(messageBytes: Uint8Array, derivationPath: string): Promise<Uint8Array> {
  const TransportWebHID = await loadLedgerTransport();
  const Solana = await loadLedgerSolana();
  const transport = await TransportWebHID.openConnected();

  if (!transport) {
    throw new RpcError('LEDGER_NOT_CONNECTED', 'Ledger device not found. Connect it and authorize Grape Wallet first.');
  }

  try {
    const solana = new Solana(transport);
    const result = await solana.signTransaction(derivationPath, Buffer.from(messageBytes));
    return Uint8Array.from(result.signature);
  } catch (error) {
    throw normalizeLedgerError(error);
  } finally {
    await closeLedgerTransport(transport);
  }
}

async function loadLedgerTransport() {
  ensureLedgerRuntimeGlobals();
  const module = (await import('@ledgerhq/hw-transport-webhid')) as LedgerTransportModule;
  return module.default;
}

async function loadLedgerSolana() {
  const module = (await import('@ledgerhq/hw-app-solana')) as LedgerSolanaModule;
  return module.default;
}

function ensureLedgerRuntimeGlobals() {
  if (typeof globalThis.window === 'undefined') {
    (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = globalThis as Window & typeof globalThis;
  }
}

async function closeLedgerTransport(transport: unknown) {
  const closable = transport as { close?: () => Promise<void> } | null;
  if (closable?.close) {
    await closable.close();
  }
}

function normalizeLedgerError(error: unknown): RpcError {
  const message = error instanceof Error ? error.message : 'Ledger request failed.';
  const lower = message.toLowerCase();

  if (lower.includes('hid') || lower.includes('device')) {
    return new RpcError('LEDGER_NOT_CONNECTED', 'Ledger device is not available. Connect it and unlock it.');
  }

  if (lower.includes('denied') || lower.includes('cancel')) {
    return new RpcError('LEDGER_CANCELLED', 'Ledger request was cancelled.');
  }

  if (lower.includes('blind signature')) {
    return new RpcError('LEDGER_APP_CONFIGURATION', 'Enable blind signing in the Ledger Solana app and try again.');
  }

  if (lower.includes('solana')) {
    return new RpcError('LEDGER_APP_REQUIRED', 'Open the Solana app on your Ledger and try again.');
  }

  return new RpcError('LEDGER_ERROR', message);
}

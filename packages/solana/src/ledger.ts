import './ledger-polyfills';
import Solana from '@ledgerhq/hw-app-solana';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';
import { base64ToBytes, RpcError } from '@grape/core';
import { PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';

import { parseSerializedTransaction, serializeSignedTransaction } from './signing';

export const LEDGER_DEFAULT_DERIVATION_PATH = `44'/501'/0'/0'`;
export const LEDGER_ACCOUNT_SCAN_BATCH_SIZE = 16;

export type LedgerDiscoveredAccount = {
  index: number;
  publicKey: string;
  derivationPath: string;
  lamports: number;
  label?: string;
};

type LedgerDerivationVariant = 'root' | 'bip44-change' | 'bip44-legacy';

export async function requestLedgerAccount(path = LEDGER_DEFAULT_DERIVATION_PATH): Promise<{
  publicKey: string;
  derivationPath: string;
}> {
  const transport = await openLedgerTransport(true);

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

export async function requestLedgerAccounts(input: {
  rpcEndpoint: string;
  startIndex?: number;
  count?: number;
  promptForPermission?: boolean;
}): Promise<LedgerDiscoveredAccount[]> {
  const startIndex = input.startIndex ?? 0;
  const count = input.count ?? LEDGER_ACCOUNT_SCAN_BATCH_SIZE;
  const transport = await openLedgerTransport(input.promptForPermission ?? true);

  try {
    const solana = new Solana(transport);
    const derivations = Array.from({ length: count }, (_value, offset) => startIndex + offset).flatMap((index) =>
      getLedgerDerivationPaths(index).map(({ derivationPath, variant }) => ({
        index,
        derivationPath,
        label: getLedgerDerivationLabel(index, variant)
      }))
    );

    const discovered = [];
    for (const derivation of derivations) {
      const result = await solana.getAddress(derivation.derivationPath, false);
      discovered.push({
        index: derivation.index,
        derivationPath: derivation.derivationPath,
        publicKey: normalizeLedgerAddress(result.address),
        label: derivation.label
      });
    }

    const connection = new Connection(input.rpcEndpoint, 'confirmed');
    const publicKeys = discovered.map((entry) => new PublicKey(entry.publicKey));
    const lamports = await connection.getMultipleAccountsInfo(
      publicKeys,
      'confirmed'
    );
    let resolvedLamports = lamports.map((entry) => entry?.lamports ?? 0);

    // Some RPCs return null account infos for externally-owned addresses during
    // batch lookup even when the address has SOL. Fall back to direct balance
    // checks when the batch path appears to have failed wholesale.
    if (resolvedLamports.every((value) => value === 0) && publicKeys.length > 0) {
      resolvedLamports = await Promise.all(
        publicKeys.map(async (publicKey) => {
          try {
            return await connection.getBalance(publicKey, 'confirmed');
          } catch {
            return 0;
          }
        })
      );
    }

    const deduped = new Map<string, LedgerDiscoveredAccount>();
    for (const entry of discovered
      .map((entry, idx) => ({
        ...entry,
        lamports: resolvedLamports[idx] ?? 0
      }))
      .sort((left, right) => right.lamports - left.lamports || left.index - right.index)) {
      const existing = deduped.get(entry.publicKey);
      if (!existing) {
        deduped.set(entry.publicKey, entry);
      }
    }

    return [...deduped.values()].sort((left, right) => right.lamports - left.lamports || left.index - right.index);
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

export async function authorizeLedgerTransport(): Promise<void> {
  const transport = await openLedgerTransport(true);
  await closeLedgerTransport(transport);
}

function normalizeLedgerAddress(input: string | Buffer): string {
  if (typeof input === 'string') {
    return input;
  }

  return new PublicKey(input).toBase58();
}

function getLedgerDerivationPaths(index: number): Array<{ derivationPath: string; variant: LedgerDerivationVariant }> {
  return LEDGER_DERIVATION_VARIANTS
    .filter((variant) => variant !== 'root' || index === 0)
    .map((variant) => ({
      derivationPath: toLedgerDerivationPath(index, variant),
      variant
    }));
}

const LEDGER_DERIVATION_VARIANTS: readonly LedgerDerivationVariant[] = ['root', 'bip44-change', 'bip44-legacy'];

function toLedgerDerivationPath(index: number, variant: LedgerDerivationVariant): string {
  switch (variant) {
    case 'root':
      return `44'/501'`;
    case 'bip44-legacy':
      return `44'/501'/${index}'`;
    case 'bip44-change':
    default:
      return `44'/501'/${index}'/0'`;
  }
}

function getLedgerDerivationLabel(index: number, variant: LedgerDerivationVariant): string {
  switch (variant) {
    case 'root':
      return 'Ledger root';
    case 'bip44-legacy':
      return `Ledger Live ${index}`;
    case 'bip44-change':
    default:
      return `Ledger account ${index}`;
  }
}

async function signLedgerTransactionBytes(messageBytes: Uint8Array, derivationPath: string): Promise<Uint8Array> {
  const transport = await openLedgerTransport(false);

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

function ensureLedgerRuntimeGlobals() {
  if (typeof globalThis.Buffer === 'undefined') {
    (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }

  if (typeof globalThis.window === 'undefined') {
    (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = globalThis as Window & typeof globalThis;
  }

  if (typeof window !== 'undefined' && typeof (window as Window & { Buffer?: typeof Buffer }).Buffer === 'undefined') {
    (window as Window & { Buffer?: typeof Buffer }).Buffer = Buffer;
  }
}

async function openLedgerTransport(promptForPermission: boolean): Promise<TransportWebHID> {
  ensureLedgerRuntimeGlobals();

  if (promptForPermission) {
    return TransportWebHID.request();
  }

  const transport = await TransportWebHID.openConnected();
  if (!transport) {
    throw new RpcError('LEDGER_NOT_CONNECTED', 'Ledger device not found. Connect it and authorize Grape Wallet first.');
  }

  return transport;
}

async function closeLedgerTransport(transport: TransportWebHID) {
  await transport.close();
}

function normalizeLedgerError(error: unknown): RpcError {
  const message = error instanceof Error ? error.message : 'Ledger request failed.';
  const lower = message.toLowerCase();

  if (lower.includes('user gesture')) {
    return new RpcError('LEDGER_PERMISSION_REQUIRED', 'Click "Scan Ledger accounts" to authorize your Ledger connection.');
  }

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

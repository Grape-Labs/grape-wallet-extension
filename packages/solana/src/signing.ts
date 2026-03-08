import { base64ToBytes, bytesToBase64 } from '@grape/core';
import { Connection, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

import type { GrapeNetwork } from '@grape/core';

import { SOLANA_RPC_ENDPOINTS } from './networks';

export type ParsedSerializableTransaction =
  | { kind: 'legacy'; transaction: Transaction }
  | { kind: 'versioned'; transaction: VersionedTransaction };

export function parseSerializedTransaction(serialized: string): ParsedSerializableTransaction {
  const bytes = base64ToBytes(serialized);

  try {
    return {
      kind: 'versioned',
      transaction: VersionedTransaction.deserialize(bytes)
    };
  } catch {
    return {
      kind: 'legacy',
      transaction: Transaction.from(bytes)
    };
  }
}

export function serializeSignedTransaction(parsed: ParsedSerializableTransaction): string {
  if (parsed.kind === 'versioned') {
    return bytesToBase64(parsed.transaction.serialize());
  }

  return bytesToBase64(
    parsed.transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })
  );
}

export function signSerializedTransaction(serialized: string, keypair: Keypair): string {
  const parsed = parseSerializedTransaction(serialized);
  if (parsed.kind === 'versioned') {
    parsed.transaction.sign([keypair]);
  } else {
    parsed.transaction.partialSign(keypair);
  }

  return serializeSignedTransaction(parsed);
}

export function signSerializedTransactions(serializedTransactions: string[], keypair: Keypair): string[] {
  return serializedTransactions.map((serialized) => signSerializedTransaction(serialized, keypair));
}

export function signMessageBytes(message: Uint8Array, keypair: Keypair): Uint8Array {
  return nacl.sign.detached(message, keypair.secretKey);
}

export async function signAndSendSerializedTransaction(
  serialized: string,
  keypair: Keypair,
  network: GrapeNetwork
): Promise<string> {
  const signed = signSerializedTransaction(serialized, keypair);
  const connection = new Connection(SOLANA_RPC_ENDPOINTS[network], 'confirmed');
  return connection.sendRawTransaction(base64ToBytes(signed));
}


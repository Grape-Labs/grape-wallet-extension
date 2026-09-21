import { sha256 } from '@noble/hashes/sha2.js';
import type { GrapeChain } from './state';

export type BridgeTransactionRequest = {
  to?: string;
  data?: string;
  value?: string;
};

function normalizeBridgeTransactionRequest(value: unknown): BridgeTransactionRequest | null {
  if (typeof value !== 'object' || !value) {
    return null;
  }

  return value as BridgeTransactionRequest;
}

function isExecutableBridgeTransactionRequest(request: BridgeTransactionRequest, sourceChain: GrapeChain): boolean {
  const hasData = typeof request.data === 'string' && request.data.trim().length > 0;
  const hasTo = typeof request.to === 'string' && request.to.trim().length > 0;
  const hasValue = typeof request.value === 'string' && request.value.trim().length > 0;

  if (sourceChain === 'solana') {
    return hasData;
  }

  return hasTo && (hasData || hasValue);
}

export function extractExecutableBridgeTransactionRequest(
  quoteResponse: Record<string, unknown>,
  sourceChain: GrapeChain
): BridgeTransactionRequest | null {
  const directTransactionRequest = normalizeBridgeTransactionRequest(quoteResponse.transactionRequest);
  if (directTransactionRequest && isExecutableBridgeTransactionRequest(directTransactionRequest, sourceChain)) {
    return directTransactionRequest;
  }

  const candidateCollections = [quoteResponse.includedSteps, quoteResponse.steps];
  for (const collection of candidateCollections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    for (const step of collection) {
      if (typeof step !== 'object' || !step) {
        continue;
      }

      const transactionRequest = normalizeBridgeTransactionRequest((step as { transactionRequest?: unknown }).transactionRequest);
      if (transactionRequest && isExecutableBridgeTransactionRequest(transactionRequest, sourceChain)) {
        return transactionRequest;
      }
    }
  }

  return null;
}

export function hasExecutableBridgeTransaction(
  quoteResponse: Record<string, unknown> | undefined,
  sourceChain: GrapeChain
): boolean {
  if (!quoteResponse || typeof quoteResponse !== 'object') {
    return false;
  }

  return extractExecutableBridgeTransactionRequest(quoteResponse, sourceChain) !== null;
}


/** Validate literal addresses without requiring a wallet stored in Grape. */
export function isValidBridgeRecipient(chain: GrapeChain, address: string): boolean {
  if (chain === 'ethereum' || chain === 'monad') return /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/.test(address);
  if (chain === 'sui') return /^0x[0-9a-fA-F]{64}$/.test(address) && !/^0x0{64}$/.test(address);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(address)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const char of address) value = value * 58n + BigInt(alphabet.indexOf(char));
  const bytes: number[] = [];
  while (value > 0n) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  for (const char of address) { if (char !== '1') break; bytes.unshift(0); }
  if (chain === 'solana') return bytes.length === 32 && bytes.some((byte) => byte !== 0);
  if (chain !== 'zcash' || bytes.length !== 26 || bytes[0] !== 0x1c || ![0xb8, 0xbd].includes(bytes[1])) return false;
  const checksum = sha256(sha256(Uint8Array.from(bytes.slice(0, -4))));
  return bytes.slice(-4).every((byte, index) => byte === checksum[index]);
}

export function assertBridgeRecipient(quote: Record<string, unknown>, chain: GrapeChain, recipient: string): void {
  const action = quote.action as { toAddress?: string } | undefined;
  const quoted = action?.toAddress;
  const normalize = (value: string) => chain === 'ethereum' || chain === 'monad' || chain === 'sui' ? value.toLowerCase() : value;
  if (!quoted || normalize(quoted) !== normalize(recipient)) {
    throw new Error('The bridge recipient changed. Request a new quote before continuing.');
  }
}

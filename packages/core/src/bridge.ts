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

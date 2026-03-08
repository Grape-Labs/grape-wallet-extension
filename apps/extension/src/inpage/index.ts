import { providerResponseSchema } from '@grape/core';
import { GrapeInpageProvider, initializeWalletStandard, SOLANA_CHAIN_IDS } from '@grape/solana';

const FROM_INPAGE = 'grape:inpage';
const FROM_CONTENT = 'grape:content';

declare global {
  interface Window {
    grape?: GrapeInpageProvider;
    grapeSolana?: GrapeInpageProvider;
    solana?: GrapeInpageProvider;
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

const pendingRequests = new Map<string, PendingRequest>();

const transport = {
  request<T>(request: Parameters<GrapeInpageProvider['transport']['request']>[0]): Promise<T> {
    return new Promise((resolve, reject) => {
      pendingRequests.set(request.id, { resolve: resolve as (value: unknown) => void, reject });
      window.postMessage(
        {
          source: FROM_INPAGE,
          payload: request
        },
        '*'
      );
    });
  }
};

const provider = new GrapeInpageProvider(transport, {
  origin: window.location.origin,
  href: window.location.href,
  title: document.title
});

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== FROM_CONTENT) {
    return;
  }

  const response = providerResponseSchema.parse(event.data.payload);
  const pending = pendingRequests.get(response.id);
  if (!pending) {
    return;
  }

  pendingRequests.delete(response.id);
  if (response.success) {
    pending.resolve(response.result);
  } else {
    pending.reject(new Error(response.error?.message ?? 'Provider request failed.'));
  }
});

initializeWalletStandard(provider, Object.values(SOLANA_CHAIN_IDS));

import { providerResponseSchema } from '@grape/core';
import { GrapeInpageProvider, initializeWalletStandard, SOLANA_CHAIN_IDS } from '@grape/solana';

const FROM_INPAGE = 'grape:inpage';
const FROM_CONTENT = 'grape:content';
const GRAPE_INPAGE_INIT_FLAG = '__grapeWalletInpageInitialized__';

declare global {
  interface Window {
    grape?: GrapeInpageProvider;
    grapeSolana?: GrapeInpageProvider;
    solana?: GrapeInpageProvider;
    [GRAPE_INPAGE_INIT_FLAG]?: boolean;
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

if (!window[GRAPE_INPAGE_INIT_FLAG]) {
  window[GRAPE_INPAGE_INIT_FLAG] = true;

  try {
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

      const response = providerResponseSchema.safeParse(event.data.payload);
      if (!response.success) {
        return;
      }

      const pending = pendingRequests.get(response.data.id);
      if (!pending) {
        return;
      }

      pendingRequests.delete(response.data.id);
      if (response.data.success) {
        pending.resolve(response.data.result);
      } else {
        pending.reject(new Error(response.data.error?.message ?? 'Provider request failed.'));
      }
    });

    initializeWalletStandard(provider, Object.values(SOLANA_CHAIN_IDS));
  } catch (error) {
    console.error('Grape Wallet inpage initialization failed', error);
  }
}

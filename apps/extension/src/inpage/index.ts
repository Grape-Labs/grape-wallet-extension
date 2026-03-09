import { providerResponseSchema } from '@grape/core';
import { GrapeInpageProvider, initializeWalletStandard } from '@grape/solana';

const FROM_INPAGE = 'grape:inpage';
const FROM_CONTENT = 'grape:content';
const FROM_CONTENT_DEBUG = 'grape:content:debug';
const GRAPE_INPAGE_INIT_FLAG = '__grapeWalletInpageInitialized__';

declare global {
  type GrapeDebugEvent = {
    timestamp: number;
    source: 'inpage-transport' | 'background' | 'provider';
    phase: string;
    requestId?: string;
    method?: string;
    origin?: string;
    durationMs?: number;
    success?: boolean;
    message?: string;
    code?: string;
    approvalId?: string;
    kind?: string;
    network?: 'mainnet-beta' | 'devnet';
  };

  interface Window {
    grape?: GrapeInpageProvider;
    grapeSolana?: GrapeInpageProvider;
    solana?: GrapeInpageProvider;
    __grapeDebugEvents?: GrapeDebugEvent[];
    __grapeLastProviderDebug?: GrapeDebugEvent;
    [GRAPE_INPAGE_INIT_FLAG]?: boolean;
  }
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  method: string;
  startedAt: number;
};

function pushDebugEvent(event: GrapeDebugEvent): void {
  const currentEvents = Array.isArray(window.__grapeDebugEvents) ? window.__grapeDebugEvents : [];
  window.__grapeDebugEvents = [...currentEvents, event].slice(-100);
  window.__grapeLastProviderDebug = event;
  console.debug(`[Grape][${event.source}]`, event);
}

if (!window[GRAPE_INPAGE_INIT_FLAG]) {
  window[GRAPE_INPAGE_INIT_FLAG] = true;

  try {
    const pendingRequests = new Map<string, PendingRequest>();

    const transport = {
      request<T>(request: Parameters<GrapeInpageProvider['transport']['request']>[0]): Promise<T> {
        return new Promise((resolve, reject) => {
          pendingRequests.set(request.id, {
            resolve: resolve as (value: unknown) => void,
            reject,
            method: request.method,
            startedAt: Date.now()
          });
          pushDebugEvent({
            timestamp: Date.now(),
            source: 'inpage-transport',
            phase: 'request_sent',
            requestId: request.id,
            method: request.method,
            origin: request.origin.origin
          });
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
      pushDebugEvent({
        timestamp: Date.now(),
        source: 'inpage-transport',
        phase: 'response_received',
        requestId: response.data.id,
        method: pending.method,
        durationMs: Date.now() - pending.startedAt,
        success: response.data.success,
        message: response.data.success ? undefined : response.data.error?.message,
        code: response.data.error?.code
      });
      if (response.data.success) {
        pending.resolve(response.data.result);
      } else {
        pending.reject(new Error(response.data.error?.message ?? 'Provider request failed.'));
      }
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== FROM_CONTENT_DEBUG) {
        return;
      }

      if (!event.data.payload || typeof event.data.payload !== 'object') {
        return;
      }

      pushDebugEvent({
        timestamp: Date.now(),
        source: 'background',
        ...(event.data.payload as Omit<GrapeDebugEvent, 'timestamp' | 'source'>)
      });
    });

    initializeWalletStandard(provider);
  } catch (error) {
    console.error('Grape Wallet inpage initialization failed', error);
  }
}

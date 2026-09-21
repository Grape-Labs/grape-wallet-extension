import { providerResponseSchema, type ProviderRequest } from '@grape/core';
import { initializeMonadProvider, GrapeMonadProvider } from '@grape/monad';
import { GrapeInpageProvider, initializeWalletStandard } from '@grape/solana';
import { initializeSuiWalletStandard, type SuiWalletStandardWallet } from '@grape/sui';

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
    grapeMonad?: GrapeMonadProvider;
    grapeEthereum?: GrapeMonadProvider;
    ethereum?: GrapeMonadProvider;
    grapeSui?: SuiWalletStandardWallet;
    grapeZcash?: GrapeZcashProvider;
    grapewallet?: { isGrapeWallet: true; version: string; zcash: GrapeZcashProvider };
    zcash?: GrapeZcashProvider;
    __grapeDebugEvents?: GrapeDebugEvent[];
    __grapeLastProviderDebug?: GrapeDebugEvent;
    [GRAPE_INPAGE_INIT_FLAG]?: boolean;
  }
}

type GrapeZcashProvider = {
  isGrape: true;
  request<T = unknown>(args: { method: string; params?: readonly unknown[] | Record<string, unknown> }): Promise<T>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
  disconnect(): Promise<void>;
};

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
      request<T>(rawRequest: unknown): Promise<T> {
        const request = rawRequest as ProviderRequest;
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
    const monadProvider = new GrapeMonadProvider(transport, {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title
    });
    const zcashListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const emitZcash = (event: string, value?: unknown) => {
      zcashListeners.get(event)?.forEach((listener) => listener(value));
    };
    const zcashProvider: GrapeZcashProvider = {
      isGrape: true,
      async request<T>(args: { method: string; params?: readonly unknown[] | Record<string, unknown> }): Promise<T> {
        const method = args.method;
        if (![
          'zcash_requestAccounts',
          'zcash_getAccounts',
          'zcash_getAddresses',
          'zcash_getBalance',
          'zcash_sendTransaction',
          'zcash_disconnect'
        ].includes(method)) {
          throw new Error(`Unsupported Zcash provider method: ${method}`);
        }
        const firstParam = Array.isArray(args.params) ? args.params[0] : args.params;
        const params = firstParam && typeof firstParam === 'object' ? firstParam as Record<string, unknown> : {};
        const result = await transport.request({
          id: crypto.randomUUID(),
          method,
          origin: {
            origin: window.location.origin,
            href: window.location.href,
            title: document.title
          },
          params
        } as ProviderRequest) as T;
        if (method === 'zcash_requestAccounts') emitZcash('accountsChanged', result);
        if (method === 'zcash_disconnect') emitZcash('disconnect');
        return result;
      },
      on(event, handler) {
        const listeners = zcashListeners.get(event) ?? new Set();
        listeners.add(handler);
        zcashListeners.set(event, listeners);
      },
      removeListener(event, handler) {
        zcashListeners.get(event)?.delete(handler);
      },
      async disconnect() {
        await this.request({ method: 'zcash_disconnect' });
      }
    };

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
    initializeMonadProvider(monadProvider);
    initializeSuiWalletStandard(transport, {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title
    });
    window.grapeZcash = zcashProvider;
    window.grapewallet = { isGrapeWallet: true, version: '1.0.0', zcash: zcashProvider };
    if (!window.zcash) window.zcash = zcashProvider;
    window.dispatchEvent(new Event('grapewallet#initialized'));
  } catch (error) {
    console.error('Grape Wallet inpage initialization failed', error);
  }
}

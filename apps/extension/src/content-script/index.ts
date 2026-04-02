const INJECTED_SCRIPT_ID = 'grape-wallet-inpage';
const FROM_INPAGE = 'grape:inpage';
const FROM_CONTENT = 'grape:content';
const FROM_CONTENT_DEBUG = 'grape:content:debug';
const PROVIDER_PORT_NAME = 'grape-provider';
const PROVIDER_RECONNECT_DELAY_MS = 250;
const PROVIDER_MAX_RECONNECT_DELAY_MS = 5_000;

type ProviderErrorResponse = {
  id: string;
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type ProviderRequestEnvelope = {
  id?: string;
  [key: string]: unknown;
};

function injectInpageScript() {
  if (document.getElementById(INJECTED_SCRIPT_ID)) {
    return;
  }

  const target = document.head || document.documentElement;
  if (!target) {
    return;
  }

  const script = document.createElement('script');
  script.id = INJECTED_SCRIPT_ID;
  script.src = chrome.runtime.getURL('assets/inpage.js');
  script.type = 'module';
  target.appendChild(script);
}

function getFaviconUrl(): string | undefined {
  const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]');
  if (!icon?.href) {
    return undefined;
  }
  return icon.href;
}

function postToInpage(payload: unknown) {
  window.postMessage(
    {
      source: FROM_CONTENT,
      payload
    },
    '*'
  );
}

function getRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const requestId = (payload as ProviderRequestEnvelope).id;
  return typeof requestId === 'string' ? requestId : null;
}

function buildDisconnectedResponse(id: string, message = 'Grape lost its background connection. Retry the request.'): ProviderErrorResponse {
  return {
    id,
    success: false,
    error: {
      code: 'PROVIDER_DISCONNECTED',
      message
    }
  };
}

injectInpageScript();

const pendingRequestIds = new Set<string>();
let port: chrome.runtime.Port | null = null;
let reconnectTimer: number | null = null;
let reconnectDelayMs = PROVIDER_RECONNECT_DELAY_MS;

function flushPendingRequestsWithError(message?: string) {
  for (const requestId of pendingRequestIds) {
    postToInpage(buildDisconnectedResponse(requestId, message));
  }
  pendingRequestIds.clear();
}

function scheduleReconnect() {
  if (reconnectTimer !== null) {
    return;
  }

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connectProviderPort();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, PROVIDER_MAX_RECONNECT_DELAY_MS);
}

function handleProviderDisconnect(disconnectPort: chrome.runtime.Port) {
  if (port !== disconnectPort) {
    return;
  }

  const disconnectMessage = chrome.runtime.lastError?.message;
  port = null;
  flushPendingRequestsWithError(
    disconnectMessage
      ? `Grape lost its background connection (${disconnectMessage}). Retry the request.`
      : undefined
  );
  scheduleReconnect();
}

function connectProviderPort(): chrome.runtime.Port | null {
  if (port) {
    return port;
  }

  try {
    const nextPort = chrome.runtime.connect({ name: PROVIDER_PORT_NAME });
    port = nextPort;
    reconnectDelayMs = PROVIDER_RECONNECT_DELAY_MS;

    nextPort.onMessage.addListener((message) => {
      if (message?.__grapeDebug === true) {
        window.postMessage(
          {
            source: FROM_CONTENT_DEBUG,
            payload: message.payload
          },
          '*'
        );
        return;
      }

      const requestId = getRequestId(message);
      if (requestId) {
        pendingRequestIds.delete(requestId);
      }
      postToInpage(message);
    });

    nextPort.onDisconnect.addListener(() => {
      handleProviderDisconnect(nextPort);
    });

    return nextPort;
  } catch {
    scheduleReconnect();
    return null;
  }
}

function buildProviderMessage(payload: unknown) {
  const normalizedPayload = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};

  return {
    ...normalizedPayload,
    origin: {
      origin: window.location.origin,
      href: window.location.href,
      title: document.title,
      faviconUrl: getFaviconUrl()
    }
  };
}

function sendProviderMessage(payload: unknown) {
  const message = buildProviderMessage(payload);
  const requestId = getRequestId(message);
  let nextPort = connectProviderPort();

  if (!nextPort) {
    if (requestId) {
      postToInpage(buildDisconnectedResponse(requestId));
    }
    return;
  }

  try {
    if (requestId) {
      pendingRequestIds.add(requestId);
    }
    nextPort.postMessage(message);
  } catch {
    if (requestId) {
      pendingRequestIds.delete(requestId);
    }

    try {
      nextPort.disconnect();
    } catch {
      // No-op: the port is already unusable.
    }

    port = null;
    nextPort = connectProviderPort();
    if (!nextPort) {
      if (requestId) {
        postToInpage(buildDisconnectedResponse(requestId));
      }
      return;
    }

    try {
      if (requestId) {
        pendingRequestIds.add(requestId);
      }
      nextPort.postMessage(message);
    } catch {
      if (requestId) {
        pendingRequestIds.delete(requestId);
        postToInpage(buildDisconnectedResponse(requestId));
      }
      scheduleReconnect();
    }
  }
}

connectProviderPort();

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== FROM_INPAGE) {
    return;
  }

  sendProviderMessage(event.data.payload);
});

window.addEventListener('beforeunload', () => {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  pendingRequestIds.clear();
  const currentPort = port;
  port = null;
  try {
    currentPort?.disconnect();
  } catch {
    // Ignore unload-time disconnect errors.
  }
});

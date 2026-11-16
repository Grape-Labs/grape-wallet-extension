export class PrivacyRateLimitError extends Error {
  readonly code = 'PRIVACY_RATE_LIMITED';
  constructor() { super('Helius is rate limiting requests. Please wait a moment and try again.'); }
}

const pause = (ms: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const stop = () => { clearTimeout(timer); reject(signal?.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  signal?.addEventListener('abort', stop, { once: true });
});

/** Pace read-only JSON-RPC calls; never replay proof requests or submissions. */
export function createPrivacyReadFetch(
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  wait: (ms: number, signal?: AbortSignal | null) => Promise<void> = pause,
  now = Date.now,
): typeof fetch {
  let queue = Promise.resolve();
  let nextStart = 0;
  return async (input, init) => {
    let method: unknown;
    try { method = JSON.parse(typeof init?.body === 'string' ? init.body : '{}').method; } catch { /* Encrypted prover bodies are not JSON-RPC reads. */ }
    const read = typeof method === 'string' && (method.startsWith('get') || method === 'simulateTransaction' || method === 'isBlockhashValid');
    if (!read) return fetchImpl(input, init);
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (init?.signal?.aborted) throw init.signal.reason;
        const delay = nextStart - now();
        if (delay > 0) await wait(delay, init?.signal);
        nextStart = now() + 550;
        const response = await fetchImpl(input, init);
        if (response.status !== 429) return response;
        const retryAfter = response.headers.get('retry-after');
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const providerDelay = retryAfter === null ? 0 : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now();
        await response.body?.cancel();
        if (attempt === 3 || providerDelay > 30_000) throw new PrivacyRateLimitError();
        await wait(Math.max(1000 * 2 ** attempt, Number.isFinite(providerDelay) ? providerDelay : 0), init?.signal);
      }
      throw new PrivacyRateLimitError();
    } finally { release(); }
  };
}

/** SDKs wrap transport errors; inspect their structured causes rather than encoded messages. */
export function privacyRateLimitMessage(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth++) {
    const value = current as { code?: unknown; context?: { statusCode?: unknown }; details?: { status?: unknown }; cause?: unknown };
    if (value.code === 'PRIVACY_RATE_LIMITED' || value.context?.statusCode === 429 || value.details?.status === 429) return new PrivacyRateLimitError().message;
    current = value.cause;
  }
  return undefined;
}

export const privacyReadFetch = createPrivacyReadFetch();

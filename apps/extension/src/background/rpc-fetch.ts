/** Bound network waits; a stalled RPC must not leave wallet screens loading forever. */
export function withRpcDeadline(fetcher: typeof fetch, timeoutMs = 20_000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(upstream?.reason);
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('RPC request timed out. Please refresh staking to try again.')), timeoutMs);
    try { return await fetcher(input, { ...init, signal: controller.signal }); }
    finally { clearTimeout(timer); upstream?.removeEventListener('abort', abort); }
  };
}

/** Share pacing across short-lived Connections using the same Helius endpoint. */
export function createPacedRpcFetch(fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  const endpoints = new Map<string, { tail: Promise<void>; next: number; cooldown: number }>();
  return async (input, init) => {
    const endpoint = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let helius = false;
    try { const host = new URL(endpoint).hostname; helius = host === 'helius-rpc.com' || host.endsWith('.helius-rpc.com'); } catch { /* Let fetch report invalid URLs. */ }
    if (!helius) return fetcher(input, init);
    let state = endpoints.get(endpoint);
    if (!state) { state = { tail: Promise.resolve(), next: 0, cooldown: 0 }; endpoints.set(endpoint, state); }
    const rateError = () => new Error('RPC rate limit reached. Please wait a moment before refreshing.');
    if (state.cooldown > Date.now()) throw rateError();
    const previous = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous;
      if (init?.signal?.aborted) throw init.signal.reason ?? new Error('Request cancelled.');
      if (state.cooldown > Date.now()) throw rateError();
      const delay = state.next - Date.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      if (init?.signal?.aborted) throw init.signal.reason ?? new Error('Request cancelled.');
      state.next = Date.now() + 250;
      if (state.cooldown > Date.now()) throw rateError();
      // Pace request starts, rather than holding every other RPC behind a slow response.
      release();
      const response = await fetcher(input, init);
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const seconds = header == null ? NaN : Number(header);
        const retryAt = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : header ? Date.parse(header) : NaN;
        state.cooldown = Math.max(Date.now() + 5000, Number.isFinite(retryAt) ? retryAt : 0);
        throw rateError();
      }
      return response;
    } finally { release(); }
  };
}
export const pacedRpcFetch = createPacedRpcFetch(withRpcDeadline((...args) => fetch(...args)));

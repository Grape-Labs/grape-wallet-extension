import { useEffect, useRef } from 'react';

/** Refresh for changed trade inputs, without retrying when submission finishes. */
export function useSwapQuoteRefresh({
  inputKey, paused, invalidate, request
}: {
  inputKey: string | null;
  paused: boolean;
  invalidate: () => void;
  request: () => void;
}) {
  const lastRequestedKey = useRef<string | null>(null);
  const callbacks = useRef({ invalidate, request });
  callbacks.current = { invalidate, request };

  useEffect(() => {
    if (paused) return;
    if (inputKey === null) {
      lastRequestedKey.current = null;
      callbacks.current.invalidate();
      return;
    }
    if (lastRequestedKey.current === inputKey) return;

    callbacks.current.invalidate();
    const timeout = window.setTimeout(() => {
      lastRequestedKey.current = inputKey;
      callbacks.current.request();
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [inputKey, paused]);
}

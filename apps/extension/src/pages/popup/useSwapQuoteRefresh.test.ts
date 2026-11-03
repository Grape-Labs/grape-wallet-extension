// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwapQuoteRefresh } from './useSwapQuoteRefresh';

function Harness(props: Parameters<typeof useSwapQuoteRefresh>[0]) {
  useSwapQuoteRefresh(props);
  return null;
}

describe('automatic swap quotes', () => {
  let root: Root;
  const request = vi.fn();
  const invalidate = vi.fn();
  const render = (inputKey: string | null, paused = false) => act(() => {
    root.render(createElement(Harness, { inputKey, paused, request, invalidate }));
  });
  const advance = () => act(() => { vi.advanceTimersByTime(350); });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement('div'));
  });
  afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });

  it('does not clear the error or request another quote after a failed submission', () => {
    render('ETH-USDC:0.04');
    advance();
    render('ETH-USDC:0.04', true);
    invalidate.mockClear();
    // Submission fails and the UI displays its error, then exits the busy state.
    render('ETH-USDC:0.04', false);
    advance();
    expect(invalidate).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the amount, token, account or network changes', () => {
    for (const key of ['amount1', 'amount2', 'token2', 'account2', 'network2']) {
      render(key); advance();
    }
    expect(request).toHaveBeenCalledTimes(5);
  });

  it('ignores unrelated rerenders and callback identity changes', () => {
    render('trade'); advance();
    render('trade'); advance();
    expect(request).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('debounces edited inputs and cancels refresh while signing', () => {
    render('old'); render('new'); advance();
    expect(request).toHaveBeenCalledTimes(1);
    render('another'); render('another', true); advance();
    expect(request).toHaveBeenCalledTimes(1);
    render('another', false); advance();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('requests a new quote when reopening the swap screen', () => {
    render('trade'); advance();
    render(null); render('trade'); advance();
    expect(request).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FoxMissionBadge } from './FoxMissionBadge';
import { sendRuntimeMessage } from '../../shared/chrome';
vi.mock('../../shared/chrome', () => ({ sendRuntimeMessage: vi.fn(async () => ({ state: 'ready', eligible: true })) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('only starts a mission lookup when the badge enters the viewport', async () => {
  let notify!: (entries: { isIntersecting: boolean }[]) => void;
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element);
  try {
    await act(() => root.render(createElement(FoxMissionBadge, { owner: 'owner', mint: 'mint' })));
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
    await act(async () => { notify([{ isIntersecting: true }]); });
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
    expect(element.textContent).toContain('In wallet');
  } finally {
    await act(() => root.unmount()); element.remove();
  }
  expect(disconnect).toHaveBeenCalled();
});

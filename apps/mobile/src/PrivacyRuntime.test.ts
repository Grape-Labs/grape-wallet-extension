// @vitest-environment jsdom
import { act, createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const engine = vi.hoisted(() => ({ props: null as any, inject: vi.fn() }));
vi.mock('react-native', () => ({ View: ({ children }: any) => createElement('div', null, children) }));
vi.mock('./generated/privacyRuntime', () => ({ privacyRuntimeHtml: '<html>local runtime</html>' }));
vi.mock('react-native-webview', () => ({ WebView: forwardRef((props: any, ref) => { engine.props = props; useImperativeHandle(ref, () => ({ injectJavaScript: engine.inject }), []); return null; }) }));
import { PrivacyRuntime, type PrivacyRuntimeHandle } from './PrivacyRuntime';
let root: Root; let element: HTMLDivElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { engine.inject.mockClear(); element = document.createElement('div'); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(() => root.unmount()); element.remove(); });
const ready = vi.fn(); const error = vi.fn();
const message = (value: unknown) => engine.props.onMessage({ nativeEvent: { data: JSON.stringify(value) } });
describe('local mobile privacy engine bridge', () => {
  it('keeps requests alive across React rerenders and resolves the matching request only', async () => {
    const ref = createRef<PrivacyRuntimeHandle>(); await act(() => root.render(createElement(PrivacyRuntime, { ref, onReady: ready, onError: error })));
    const promise = ref.current!.call({ operation: 'sync' });
    await act(() => root.render(createElement(PrivacyRuntime, { ref, onReady: () => {}, onError: () => {} })));
    message({ id: 'wrong', result: 'ignore' }); message({ id: '1', result: { registered: true } });
    await expect(promise).resolves.toEqual({ registered: true });
    expect(engine.inject).toHaveBeenCalledTimes(1);
  });
  it('rejects work when locking or changing wallets unmounts the engine', async () => {
    const ref = createRef<PrivacyRuntimeHandle>(); await act(() => root.render(createElement(PrivacyRuntime, { ref, onReady: ready, onError: error })));
    const result = ref.current!.call({ operation: 'sync' }).catch(error => error.message);
    await act(() => root.render(null)); expect(await result).toBe('Wallet session ended.');
  });
  it('blocks external navigation and disables storage, debugging and file access', async () => {
    await act(() => root.render(createElement(PrivacyRuntime, { onReady: ready, onError: error })));
    expect(engine.props.source.baseUrl).toBe('https://localhost');
    expect(engine.props.onShouldStartLoadWithRequest({ url: 'https://localhost/' })).toBe(true);
    for (const url of ['https://attacker.example','file:///tmp/private','https://localhost/other']) expect(engine.props.onShouldStartLoadWithRequest({ url })).toBe(false);
    expect(engine.props.domStorageEnabled).toBe(false); expect(engine.props.allowFileAccess).toBe(false); expect(engine.props.webviewDebuggingEnabled).toBe(false);
  });
});

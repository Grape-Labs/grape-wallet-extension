import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { privacyRuntimeHtml } from './generated/privacyRuntime';
const source = { html: privacyRuntimeHtml, baseUrl: 'https://localhost' };
export type PrivacyRuntimeHandle = { call<T>(request: Record<string, unknown>): Promise<T> };
/** A local, non-navigable browser engine supplies WebCrypto/WASM missing from Hermes. */
export const PrivacyRuntime = forwardRef<PrivacyRuntimeHandle, { onReady: () => void; onError: (message: string) => void }>(function PrivacyRuntime(props, ref) {
  const web = useRef<WebView>(null);
  const pending = useRef<{ id: string; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const counter = useRef(0);
  const ready = useRef(false);
  useEffect(() => { const timer = setTimeout(() => { if (!ready.current) fail('Private balance engine did not start. Restart it to try again.'); }, 20_000); return () => { clearTimeout(timer); if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(new Error('Wallet session ended.')); pending.current = null; } }; }, []);
  const fail = (message: string) => {
    if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(new Error(message)); pending.current = null; }
    props.onError(message);
  };
  useImperativeHandle(ref, () => ({ call: <T,>(request: Record<string, unknown>) => new Promise<T>((resolve, reject) => {
    if (pending.current || !web.current) { reject(new Error('Privacy engine is busy or unavailable.')); return; }
    const id = String(++counter.current);
    const timer = setTimeout(() => fail('Privacy request timed out. Close and reopen Private balances before trying again.'), 120_000);
    pending.current = { id, resolve, reject, timer };
    web.current.injectJavaScript(`void window.grapePrivacy(${JSON.stringify(JSON.stringify({ ...request, id }))}); true;`);
  }) }), []);
  return <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <WebView ref={web}
      source={source} originWhitelist={['https://localhost', 'about:blank']}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://localhost/' || request.url === 'https://localhost'}
      javaScriptEnabled domStorageEnabled={false} cacheEnabled={false} incognito setSupportMultipleWindows={false}
      allowFileAccess={false} mixedContentMode="never" javaScriptCanOpenWindowsAutomatically={false}
      webviewDebuggingEnabled={false} onError={() => fail('Private balance engine could not start.')}
      onContentProcessDidTerminate={() => fail('Private balance engine stopped. Reopen it to continue.')}
      onRenderProcessGone={() => { fail('Private balance engine stopped. Reopen it to continue.'); }}
      onMessage={event => {
        try {
          const value = JSON.parse(event.nativeEvent.data);
          if (value.ready) { ready.current = true; props.onReady(); return; }
          if (value.fatal) { fail(value.fatal); return; }
          const item = pending.current;
          if (!item || value.id !== item.id) return;
          clearTimeout(item.timer); pending.current = null;
          if (typeof value.error === 'string') item.reject(new Error(value.error)); else item.resolve(value.result);
        } catch { fail('Invalid response from the local privacy engine.'); }
      }} />
  </View>;
});

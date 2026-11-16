import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const module = readFileSync(fileURLToPath(new URL('../src/generated/privacyRuntime.ts', import.meta.url)), 'utf8');
const html = JSON.parse(module.slice(module.indexOf('=')+1).trim().slice(0,-1));
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const result = await new Promise((resolve,reject) => {
  const timer = setTimeout(() => reject(new Error('Runtime startup timed out')), 20000);
  const window = { ReactNativeWebView: { postMessage: raw => { const value = JSON.parse(raw); if (value.ready || value.fatal) { clearTimeout(timer); resolve(value); } } } };
  const context = { AbortController, AbortSignal, Request, Response, Headers, ReadableStream, WritableStream, TransformStream, window, crypto: webcrypto, WebAssembly, TextEncoder, TextDecoder, URL, URLSearchParams, Uint8Array, ArrayBuffer, DataView, BigInt, Buffer, atob, btoa, setTimeout, clearTimeout, console, fetch: () => { throw new Error('Startup must not download code or WASM'); } };
  try { vm.runInNewContext(script, context, { timeout: 10000 }); } catch (error) { clearTimeout(timer); reject(new Error(error.message)); }
});
if (!result.ready) throw new Error(JSON.stringify(result));
console.log('Local runtime started with WebCrypto and bundled Poseidon WASM; no network requests.');

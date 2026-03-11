import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window =
    globalThis as Window & typeof globalThis;
}

if (typeof globalThis.window !== 'undefined' && typeof globalThis.window.Buffer === 'undefined') {
  (globalThis.window as Window & typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
}

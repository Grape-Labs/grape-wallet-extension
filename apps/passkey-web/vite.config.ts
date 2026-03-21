import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const appRoot = __dirname;

export default defineConfig({
  root: appRoot,
  resolve: {
    alias: {
      '@grape/core': resolve(appRoot, '../../packages/core/src/index.ts'),
      '@grape/core/': `${resolve(appRoot, '../../packages/core/src')}/`
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        extensionPasskey: resolve(appRoot, 'extension-passkey.html')
      }
    }
  }
});

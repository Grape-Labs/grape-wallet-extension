import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const extensionRoot = __dirname;

export default defineConfig({
  root: extensionRoot,
  plugins: [react()],
  publicDir: resolve(extensionRoot, 'public'),
  resolve: {
    alias: {
      '@grape/core': resolve(extensionRoot, '../../packages/core/src/index.ts'),
      '@grape/solana': resolve(extensionRoot, '../../packages/solana/src/index.ts'),
      '@grape/ui': resolve(extensionRoot, '../../packages/ui/src/index.ts')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: resolve(extensionRoot, 'popup.html'),
        onboarding: resolve(extensionRoot, 'onboarding.html'),
        unlock: resolve(extensionRoot, 'unlock.html'),
        approval: resolve(extensionRoot, 'approval.html'),
        options: resolve(extensionRoot, 'options.html'),
        background: resolve(extensionRoot, 'src/background/index.ts'),
        'content-script': resolve(extensionRoot, 'src/content-script/index.ts'),
        inpage: resolve(extensionRoot, 'src/inpage/index.ts')
      },
      output: {
        entryFileNames: (chunkInfo) =>
          ['background', 'content-script', 'inpage'].includes(chunkInfo.name)
            ? 'assets/[name].js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});


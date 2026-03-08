import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@grape/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@grape/solana': resolve(__dirname, 'packages/solana/src/index.ts'),
      '@grape/ui': resolve(__dirname, 'packages/ui/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
});

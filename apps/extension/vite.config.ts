import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const extensionRoot = __dirname;
const workspaceRoot = resolve(extensionRoot, '../..');
const DEFAULT_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com';

function resolveMainnetRpcUrl(rawValue?: string): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return DEFAULT_MAINNET_RPC_URL;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error(`Invalid VITE_GRAPE_MAINNET_RPC_URL: "${trimmed}"`);
  }
}

function toHostPermission(rpcUrl: string): string {
  const origin = new URL(rpcUrl).origin;
  return `${origin}/*`;
}

function createManifestPlugin(mainnetRpcUrl: string): Plugin {
  return {
    name: 'grape-manifest',
    apply: 'build',
    generateBundle() {
      const manifest = {
        manifest_version: 3,
        name: 'Grape',
        version: '0.1.0',
        description: 'Chromium-first Solana wallet extension with Wallet Standard and legacy provider support.',
        icons: {
          '16': 'icons/grape_logo_white-16.png',
          '32': 'icons/grape_logo_white-32.png',
          '48': 'icons/grape_logo_white-48.png',
          '128': 'icons/grape_logo_white-128.png'
        },
        action: {
          default_title: 'Grape',
          default_icon: {
            '16': 'icons/grape_logo_white-16.png',
            '32': 'icons/grape_logo_white-32.png'
          },
          default_popup: 'popup.html'
        },
        background: {
          service_worker: 'assets/background.js',
          type: 'module'
        },
        options_page: 'options.html',
        side_panel: {
          default_path: 'sidepanel.html'
        },
        permissions: ['storage', 'sidePanel'],
        host_permissions: [
          toHostPermission(mainnetRpcUrl),
          'https://api.devnet.solana.com/*',
          'https://lite-api.jup.ag/*',
          'https://api.jup.ag/*',
          'https://api.shyft.to/*'
        ],
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['assets/content-script.js'],
            run_at: 'document_start'
          }
        ],
        web_accessible_resources: [
          {
            resources: ['assets/*.js'],
            matches: ['<all_urls>']
          }
        ],
        content_security_policy: {
          extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self';"
        }
      };

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2)
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const mainnetRpcUrl = resolveMainnetRpcUrl(env.VITE_GRAPE_MAINNET_RPC_URL);

  return {
    root: extensionRoot,
    envDir: workspaceRoot,
    plugins: [react(), createManifestPlugin(mainnetRpcUrl)],
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
      modulePreload: false,
      rollupOptions: {
        input: {
          popup: resolve(extensionRoot, 'popup.html'),
          wallet: resolve(extensionRoot, 'wallet.html'),
          sidepanel: resolve(extensionRoot, 'sidepanel.html'),
          onboarding: resolve(extensionRoot, 'onboarding.html'),
          unlock: resolve(extensionRoot, 'unlock.html'),
          approval: resolve(extensionRoot, 'approval.html'),
          options: resolve(extensionRoot, 'options.html'),
          send: resolve(extensionRoot, 'send.html'),
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
  };
});

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const extensionRoot = __dirname;
const workspaceRoot = resolve(extensionRoot, '../..');
const DEFAULT_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com';
const extensionPackage = JSON.parse(
  readFileSync(resolve(extensionRoot, 'package.json'), 'utf8')
) as { version?: string };
const EXTENSION_VERSION = extensionPackage.version?.trim();

if (!EXTENSION_VERSION) {
  throw new Error('Missing version in apps/extension/package.json');
}

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

function normalizeExtensionManifestKey(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error('Chromium extension key cannot be empty.');
  }

  try {
    if (trimmed.includes('BEGIN PUBLIC KEY')) {
      return createPublicKey(trimmed)
        .export({ format: 'der', type: 'spki' })
        .toString('base64');
    }

    if (trimmed.includes('BEGIN PRIVATE KEY') || trimmed.includes('BEGIN RSA PRIVATE KEY')) {
      return createPublicKey(createPrivateKey(trimmed))
        .export({ format: 'der', type: 'spki' })
        .toString('base64');
    }

    const normalized = trimmed.replace(/\s+/g, '');
    createPublicKey({
      key: Buffer.from(normalized, 'base64'),
      format: 'der',
      type: 'spki'
    });
    return normalized;
  } catch {
    throw new Error(
      'Invalid Chromium extension key. Use a PEM public/private key or a base64-encoded SPKI public key.'
    );
  }
}

function resolveExtensionManifestKey(env: Record<string, string>): string | undefined {
  const inlineKey = env.GRAPE_EXTENSION_KEY?.trim();
  const keyFile = env.GRAPE_EXTENSION_KEY_FILE?.trim();

  if (inlineKey && keyFile) {
    throw new Error('Set only one of GRAPE_EXTENSION_KEY or GRAPE_EXTENSION_KEY_FILE.');
  }

  if (keyFile) {
    return normalizeExtensionManifestKey(readFileSync(resolve(workspaceRoot, keyFile), 'utf8'));
  }

  if (inlineKey) {
    return normalizeExtensionManifestKey(inlineKey);
  }

  return undefined;
}

function shouldAllowEphemeralExtensionId(env: Record<string, string>): boolean {
  const rawValue = env.GRAPE_ALLOW_EPHEMERAL_EXTENSION_ID?.trim().toLowerCase();
  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes';
}

function createManifestPlugin(mainnetRpcUrl: string, extensionKey?: string): Plugin {
  return {
    name: 'grape-manifest',
    apply: 'build',
    generateBundle() {
      const manifest = {
        manifest_version: 3,
        name: 'Grape',
        version: EXTENSION_VERSION,
        ...(extensionKey ? { key: extensionKey } : {}),
        description: 'Modern multi-chain wallet for assets, collectibles, swaps, and secure dApp connections.',
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
        permissions: ['storage', 'sidePanel', 'identity', 'scripting'],
        host_permissions: [
          toHostPermission(mainnetRpcUrl),
          'https://api.mainnet-beta.solana.com/*',
          'https://api.devnet.solana.com/*',
          'https://api.coingecko.com/*',
          'https://api.geckoterminal.com/*',
          'https://ethereum-rpc.publicnode.com/*',
          'https://ethereum-sepolia-rpc.publicnode.com/*',
          'https://eth.blockscout.com/*',
          'https://eth-sepolia.blockscout.com/*',
          'https://rpc.monad.xyz/*',
          'https://testnet-rpc.monad.xyz/*',
          'https://li.quest/*',
          'https://lite-api.jup.ag/*',
          'https://api.jup.ag/*',
          'https://api.shyft.to/*',
          'https://grape.shyft.to/*'
        ],
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['assets/content-script.js'],
            run_at: 'document_end'
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
  const extensionKey = resolveExtensionManifestKey(env);
  const allowEphemeralExtensionId = shouldAllowEphemeralExtensionId(env);

  if (!extensionKey && !allowEphemeralExtensionId) {
    throw new Error(
      'Missing Chromium extension key. Add GRAPE_EXTENSION_KEY_FILE=.extension-keys/grape-chromium.pem ' +
      'or GRAPE_EXTENSION_KEY=... to the repo-root .env so rebuilt zips keep the same extension ID. ' +
      'If you are updating an existing install, reuse the original key. If you intentionally want an ephemeral unpacked-only build, set GRAPE_ALLOW_EPHEMERAL_EXTENSION_ID=true.'
    );
  }

  return {
    root: extensionRoot,
    envDir: workspaceRoot,
    plugins: [react(), createManifestPlugin(mainnetRpcUrl, extensionKey)],
    publicDir: resolve(extensionRoot, 'public'),
    resolve: {
      alias: {
        '@grape/core': resolve(extensionRoot, '../../packages/core/src/index.ts'),
        '@grape/core/': `${resolve(extensionRoot, '../../packages/core/src')}/`,
        '@grape/ethereum': resolve(extensionRoot, '../../packages/ethereum/src/index.ts'),
        '@grape/ethereum/': `${resolve(extensionRoot, '../../packages/ethereum/src')}/`,
        '@grape/monad': resolve(extensionRoot, '../../packages/monad/src/index.ts'),
        '@grape/monad/': `${resolve(extensionRoot, '../../packages/monad/src')}/`,
        '@grape/solana': resolve(extensionRoot, '../../packages/solana/src/index.ts'),
        '@grape/solana/': `${resolve(extensionRoot, '../../packages/solana/src')}/`,
        '@grape/sui': resolve(extensionRoot, '../../packages/sui/src/index.ts'),
        '@grape/sui/': `${resolve(extensionRoot, '../../packages/sui/src')}/`,
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
          background: resolve(extensionRoot, 'src/background/bootstrap.ts'),
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

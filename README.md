# Grape Wallet

Modern Solana wallet for tokens, collectibles, swaps, and secure dApp connections, built as a `pnpm` workspace with Manifest V3, React, TypeScript, Wallet Standard support, and a thin legacy injected provider layer.

## What It Does

Grape Wallet currently includes:

- Create a new 12-word Solana wallet
- Import from mnemonic
- Import from private key
- Import Ledger accounts over WebHID
- Encrypted local vault with Web Crypto
- Lock, unlock, idle auto-lock, and explicit lock action
- Multi-wallet support with wallet switching
- Built-in themes: grape, comic, sunset, matrix, tron, apple, aurora, champagne, liquid-chrome, obsidian
- SOL balance and SPL token holdings
- Send SOL and SPL tokens
- Native Jupiter-powered swaps
- Receive flow with QR code and copy address
- Saved recent recipients
- Connect/sign approvals for dApps
- Wallet Standard registration
- Legacy injected provider compatibility with `window.grape`
- Popup, expanded tab view, side panel, onboarding, unlock, approval, send, and settings surfaces
- Export for software wallets

## Release Notes

Version 0.5.90

- Added support for sending to `.sol` and `.skr` domains
- Added an address book for saved contacts with labels
- Added resolved recipient previews before sending

## Standards And Official References

The implementation was aligned against official sources:

- Chrome Extensions Manifest V3:
  https://developer.chrome.com/docs/extensions/reference/manifest
- Chrome extension service worker basics:
  https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
- Chrome side panel API:
  https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Wallet Standard:
  https://github.com/wallet-standard/wallet-standard
- Solana Wallet Standard:
  https://github.com/anza-xyz/wallet-standard

## Workspace Layout

```text
apps/extension
  MV3 extension app, React pages, background worker, content script, inpage provider

packages/core
  Vault crypto, storage models, permissions, approval state, typed runtime contracts

packages/solana
  Mnemonic/private-key derivation, Ledger support, signing, transaction helpers, provider logic

packages/ui
  Shared UI primitives

packages/wallet-adapter
  Dedicated @grape/wallet-adapter package for dApps
```

## Tech Choices

- `react` + `vite`
  Multi-entry extension build without Next.js
- `@solana/web3.js`
  Solana RPC, transactions, keypairs, and account utilities
- `@scure/bip39`
  Mnemonic generation and validation
- `micro-ed25519-hdkey`
  Solana derivation path support for `m/44'/501'/0'/0'`
- `zod`
  Runtime-validated typed messaging
- `qrcode`
  Receive QR generation
- Jupiter Price API V3 and Jupiter Swap API
  priced assets and native wallet swap execution
- Shyft Wallet API
  optional token metadata, symbols, and logos for wallet assets
- `@radix-ui/react-dropdown-menu` and `@radix-ui/react-tabs`
  Lightweight UI primitives
- `lucide-react`
  Extension UI icon set
- Web Crypto API
  PBKDF2 + AES-GCM encryption for the vault

## Prerequisites

- Node.js 20+
- `pnpm` 10+
- Chrome or another Chromium browser

## Setup

Install dependencies from the repo root:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set your mainnet RPC endpoint in `.env`:

```bash
VITE_GRAPE_MAINNET_RPC_URL=https://your-mainnet-rpc.example.com/?api-key=replace-me
VITE_GRAPE_JUP_API_KEY=your-jupiter-api-key
VITE_GRAPE_SHYFT_API_KEY=your-shyft-api-key
GRAPE_EXTENSION_KEY_FILE=.extension-keys/grape-chromium.pem
```

Notes:

- `.env` is ignored by Git
- `.extension-keys/` is ignored by Git for local Chromium signing material
- this keeps the RPC URL out of GitHub, but not out of the shipped extension bundle
- if the RPC key must be hidden from end users, use a backend/proxy instead of a client-side build variable
- Jupiter pricing uses `api.jup.ag` when `VITE_GRAPE_JUP_API_KEY` is set and falls back to `lite-api.jup.ag` otherwise
- Shyft metadata uses `wallet/all_tokens` to enrich wallet tokens with names, symbols, and logos when `VITE_GRAPE_SHYFT_API_KEY` is set
- `GRAPE_EXTENSION_KEY_FILE` can point to a PEM private key or PEM public key; `GRAPE_EXTENSION_KEY` can hold the base64 manifest key directly
- keep the same Chromium key on every build if you want future updates to replace the existing extension instead of creating a new one
- extension builds now fail by default if no stable Chromium key is configured; set `GRAPE_ALLOW_EPHEMERAL_EXTENSION_ID=true` only if you intentionally want a temporary unpacked-only build with a different ID

## Scripts

Run these from the repo root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For rebuild-on-change during extension development:

```bash
pnpm dev
```

## Build The Extension

Create the unpacked build:

```bash
pnpm build
```

The extension build automatically increments the shared release version before packaging, so each build gets a new app/manifest version.

The extension output is written to:

```text
apps/extension/dist
```

The same build also creates a ready-to-distribute versioned archive and SHA-256 file:

```text
apps/extension/releases/grape_wallet_extension.<version>.zip
apps/extension/releases/grape_wallet_extension.<version>.zip.sha256
```

Verify a downloaded archive from the releases directory with:

```bash
shasum -a 256 -c grape_wallet_extension.<version>.zip.sha256
```

The ZIP contains the contents of `dist` directly, so `manifest.json` is at the
archive root and the file is ready for Chrome Web Store upload or manual distribution.

## Keep The Same Chromium Extension

If you want Chromium to treat rebuilt packages as the same extension, keep one stable extension key and reuse it on every build.

Example local setup:

```bash
mkdir -p .extension-keys
openssl genrsa -out .extension-keys/grape-chromium.pem 2048
```

Then point `.env` at that key:

```bash
GRAPE_EXTENSION_KEY_FILE=.extension-keys/grape-chromium.pem
```

Notes:

- this sets the manifest `key` during build, which keeps the extension ID stable
- do not rotate that key unless you intentionally want a new Chromium extension ID
- if you already have the manifest public key string, set `GRAPE_EXTENSION_KEY` instead of `GRAPE_EXTENSION_KEY_FILE`
- if you omit both key settings, `pnpm build` now fails to prevent shipping a zip that installs as a separate extension
- extension builds also auto-bump the root and `apps/extension` package versions together before packaging

## Load Unpacked In Chrome

1. Run `pnpm build`
2. Open `chrome://extensions`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select `apps/extension/dist`

If you make changes:

1. rebuild with `pnpm build` or run `pnpm dev`
2. go back to `chrome://extensions`
3. click `Reload` on Grape Wallet

If you are replacing an existing Chromium install and want it to stay the same extension, make sure the build still uses the same `GRAPE_EXTENSION_KEY_FILE` or `GRAPE_EXTENSION_KEY` value as the original install.

If Chrome keeps stale icons or stale assets cached, remove the extension and load unpacked again from `apps/extension/dist`.

## First Run

After loading the extension:

1. Click the Grape Wallet extension icon
2. Create a new wallet or import an existing one
3. Set your password
4. Back up the recovery phrase if you created/imported a mnemonic wallet
5. Switch network between `devnet` and `mainnet-beta` as needed

You can also open the wallet in:

- the expanded browser tab view
- the Chrome side panel

Those actions are available from the wallet menu.

## dApp Integration

Grape exposes:

- Wallet Standard registration for modern dApps
- a legacy injected provider for compatibility

Legacy compatibility surfaces include:

- `window.grape`
- `window.grapeSolana`
- `window.solana` when no other injected wallet already owns that slot
- `isGrape = true`

### Dedicated Wallet Adapter

This repo also includes a dedicated workspace package:

```ts
import { GrapeWalletAdapter } from '@grape/wallet-adapter';

const wallets = [new GrapeWalletAdapter()];
```

The package source lives in:

```text
packages/wallet-adapter
```

If you want external dApps to install it with `npm` or `pnpm`, publish that package to npm.

## Security Model

Current protections:

- wallet secrets are encrypted at rest with Web Crypto
- plaintext secrets are not stored in `localStorage`
- connection approval is required per origin
- signing approval is required per request
- explicit lock and idle auto-lock are implemented
- approval UI shows the requesting origin and request details
- strict MV3-compatible CSP, no remote code execution

Important tradeoffs:

- this has not been externally security-audited
- browser extension wallets always carry extension/runtime attack surface
- transaction parsing is intentionally conservative and may warn on unknown programs
- Ledger support is present, but message signing is intentionally not supported in this MVP
- export is only available for software wallets, never Ledger

Practical guidance:

- reasonable for development, devnet, and low-risk testing
- not yet something to treat as production-hardened custody for meaningful funds

## Current Feature Summary

### Wallet management

- create wallet
- import mnemonic
- import private key
- import Ledger
- add more wallets
- switch between wallets
- export mnemonic/private key for software wallets
- switch between built-in visual themes

### Assets

- view active public key
- view SOL balance
- view SPL token holdings
- send SOL
- send SPL tokens
- swap supported assets through Jupiter on mainnet-beta
- receive via address QR code

### dApp flows

- connect / disconnect
- per-origin permissions
- sign message
- sign transaction
- sign all transactions
- sign and send transaction

### Extension surfaces

- popup
- expanded wallet tab
- side panel
- onboarding
- unlock
- approval
- send
- options/settings
- background service worker
- content script
- inpage provider injection

## Testing

The repo includes tests for:

- vault encryption
- permissions
- approval state
- typed message routing
- provider behavior
- derivation/import flows
- transfer helpers

Run all tests with:

```bash
pnpm test
```

## Key Paths

```text
apps/extension/src/background/index.ts
apps/extension/src/content-script/index.ts
apps/extension/src/inpage/index.ts
apps/extension/src/pages/popup/main.tsx
apps/extension/src/pages/options/main.tsx
packages/core/src
packages/solana/src
packages/wallet-adapter/src
```

## Status

This is an MVP extension wallet with real signing, approvals, send/receive, import/export, Ledger import, and dApp connectivity. The architecture is intentionally modular and testable, but the project still needs deeper security hardening and production-readiness work before it should be trusted with serious funds.

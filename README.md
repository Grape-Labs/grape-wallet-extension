# Grape Wallet

Chromium-first Solana browser extension wallet MVP built as a pnpm workspace.

## Verified standards references

Implementation was aligned against official sources before coding:

- Chrome Extensions Manifest V3 manifest reference: https://developer.chrome.com/docs/extensions/reference/manifest
- Chrome extension service worker basics: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
- Wallet Standard official repository: https://github.com/wallet-standard/wallet-standard
- Solana Wallet Standard official repository: https://github.com/anza-xyz/wallet-standard

## Workspace

```text
apps/extension      MV3 extension app, React pages, background worker, content/inpage bridge
packages/core       Vault crypto, storage models, permissions, approval state, typed messages
packages/solana     Mnemonic/account derivation, signing, transaction summaries, provider adapters
packages/wallet-adapter Dedicated Solana wallet-adapter package for dApps
packages/ui         Shared React UI primitives
```

## Package choices

- `react` + `vite`: lightweight multi-entry build for popup, onboarding, unlock, approval, options, background, content script, and inpage script.
- `@scure/bip39`: maintained mnemonic generation and validation.
- `micro-ed25519-hdkey`: browser-safe Solana SLIP-0010 account derivation at `m/44'/501'/0'/0'`.
- `@solana/web3.js`: Solana RPC, keypair, transaction serialization, and submission.
- `tweetnacl`: detached message signatures for `signMessage`.
- `zod`: typed runtime validation for background/provider messaging.
- `@solana/wallet-adapter-base`: dedicated wallet-adapter integration surface for dApps that want an explicit Grape adapter.
- Web Crypto API: PBKDF2 key derivation and AES-GCM vault encryption.

## MVP features

- Create a 12-word mnemonic wallet and derive account 0.
- Import a mnemonic wallet.
- Encrypt mnemonic secrets at rest with PBKDF2 + AES-GCM.
- Popup, onboarding, unlock, approval, and options pages.
- Background service worker, content script, and inpage provider injection.
- Per-origin connection approvals and site revocation.
- `connect`, `disconnect`, `signMessage`, `signTransaction`, `signAllTransactions`, `signAndSendTransaction`.
- Wallet Standard registration plus a thin legacy injected provider layer with `isGrape`.
- Dedicated `@grape/wallet-adapter` package for explicit wallet-adapter integration.
- Network switch between `devnet` and `mainnet-beta`.
- Balance fetch for the active account.
- Idle auto-lock and explicit lock action.

## Scripts

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Environment

Create a repo-root `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Set your custom mainnet RPC endpoint:

```bash
VITE_GRAPE_MAINNET_RPC_URL=https://your-mainnet-rpc.example.com/?api-key=replace-me
```

Notes:

- `.env` is ignored by Git.
- The endpoint is hidden from the repository, but not from end users of the extension. Browser extensions ship client-side code, so a determined user can inspect the built bundle and recover the RPC URL.
- If you need the RPC fully hidden from end users, you need a backend/proxy rather than a build-time `.env`.

## Load unpacked in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select `apps/extension/dist`.

## Development notes

- Popup entry: `apps/extension/popup.html`
- Background worker: `apps/extension/src/background/index.ts`
- Content script: `apps/extension/src/content-script/index.ts`
- Injected provider: `apps/extension/src/inpage/index.ts`
- Wallet-adapter package: `packages/wallet-adapter`
- Build output: `apps/extension/dist`

## Using `@grape/wallet-adapter`

For dApps that already use `@solana/wallet-adapter-react`, import the dedicated adapter:

```ts
import { GrapeWalletAdapter } from '@grape/wallet-adapter';

const wallets = [new GrapeWalletAdapter()];
```

The adapter detects the injected `window.grape` provider, presents itself as `Grape Wallet`, and supports:

- `connect`
- `disconnect`
- `signMessage`
- `signTransaction`
- `signAllTransactions`

## Security notes

- Mnemonics are never written to `localStorage`.
- Vault data is stored encrypted in `chrome.storage.local`.
- Signing is never auto-approved.
- Approval UI shows origin and site favicon when available.
- Transaction approval warns on unknown programs and incomplete parsing cases.
- Manifest V3 CSP stays self-hosted with no remote code execution.

## Current MVP tradeoffs

- The extension tracks an unlocked session state, but signing still asks for the password in the approval window. This avoids persisting a decrypted signer across MV3 worker suspension.
- Transaction parsing is intentionally conservative. Unknown programs are warned, not decoded.
- The derivation library is browser-safe and functional, but npm currently marks it deprecated. It should be swapped once a verified browser-safe maintained replacement is selected.

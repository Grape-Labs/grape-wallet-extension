# Grape Mobile

Android-first mobile app scaffold for Grape.

This target is intentionally separate from the extension runtime. It is meant to reuse the wallet domain packages while replacing:

- browser-extension storage
- provider injection
- popup/side-panel approval surfaces
- Chrome-specific APIs

## Planned scope

- secure vault backed by Android Keystore / iOS Keychain
- import from recovery phrase and encrypted backup
- holdings, send, activity, and chain-aware wallet switching
- WalletConnect / deep link approvals

## Local development

Install dependencies from the repo root, then:

```bash
pnpm --filter @grape/mobile start
```

For Android:

```bash
pnpm --filter @grape/mobile android
```

This scaffold is intentionally not included in the root build pipeline yet.

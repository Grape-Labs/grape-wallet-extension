# Grape Mobile

Cross-platform iOS and Android app for Grape.

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

For iOS Simulator (macOS with Xcode):

```bash
pnpm --filter @grape/mobile ios
```

## Environment

Create [apps/mobile/.env](/Users/kirk/Development/grape-wallet-extension/apps/mobile/.env) from
[apps/mobile/.env.example](/Users/kirk/Development/grape-wallet-extension/apps/mobile/.env.example)
and use Expo public vars for mobile-safe configuration:

```bash
EXPO_PUBLIC_SOLANA_RPC_URL=
EXPO_PUBLIC_PRIVACY_RPC_URL=
EXPO_PUBLIC_SUI_RPC_URL=
EXPO_PUBLIC_ETHEREUM_RPC_URL=
EXPO_PUBLIC_MONAD_RPC_URL=
EXPO_PUBLIC_SHYFT_API_KEY=
EXPO_PUBLIC_JUP_API_KEY=
```

Notes:
- `EXPO_PUBLIC_*` values are bundled into the app and visible to the client.
- Solana holdings use Shyft token metadata and Jupiter pricing when those env vars are set.
- Chain RPC URLs fall back to public defaults when the env vars are empty.

## Android builds

For a tester-installable APK:

```bash
pnpm mobile:apk
```

For a Play Store `.aab`:

```bash
pnpm mobile:aab
```

This uses the repo-root [eas.json](/Users/kirk/Development/grape-wallet-extension/eas.json) with:

- `preview`: internal distribution APK
- `production`: Android App Bundle

You will need an Expo account and EAS login before the cloud build can start.

This scaffold is intentionally not included in the root build pipeline yet.

## iOS builds

For an internally distributed `.ipa`:

```bash
pnpm --filter @grape/mobile ipa
```

For an App Store build:

```bash
pnpm --filter @grape/mobile ios-prod
```

For an EAS-hosted iOS Simulator build:

```bash
pnpm --filter @grape/mobile ios-sim
```

Device and App Store builds require an Apple Developer account and signing
credentials. Deterministic passkey wallets are currently disabled on iOS while
the native credential bridge is updated; standard imported and created wallets
use the iOS Keychain and remain supported.

## Ledger hardware wallets

The mobile app supports importing Solana accounts from a Bluetooth Ledger device.
This requires a native development or EAS build; Ledger is not available in Expo Go.

To import:

1. Unlock the Ledger, enable Bluetooth, and open the Solana app.
2. In Grape, open Settings → Wallet manager → Import wallet → Ledger.
3. Scan, select the device, choose one or more derived accounts, and import.
4. Keep the Ledger nearby and confirm transactions physically when sending or signing.

Only public addresses, derivation paths, and the paired device identifier are stored
by Grape. Ledger private keys never leave the hardware device. Mobile Ledger support
currently targets Solana over Bluetooth; USB-only devices and other chains are not yet
supported.


### Private balances

Settings → Add-ons → Private balances opts into Helius Privacy Rings for Solana software
wallets. Native setup, SOL deposits, private sends and withdrawals use the normal
transaction review. The Helius URL comes from the configured mobile RPC (or the
workspace mainnet RPC for local builds); no credential field is shown in the UI.

Metro automatically bundles the local WebCrypto/WASM runtime before resolving
the app. Run `pnpm --filter @grape/mobile privacy:check` to rebuild and check its
offline startup. A new native build is required for installed apps. See
[Privacy Rings](../../docs/PRIVACY_RINGS.md) for behavior and device-testing limits.


### Settings layout

Native Settings uses the same General, Appearance, Add-ons, Connections, Security,
and community categories as the extension, plus Recovery and Wallet manager.
Private balances are under **Settings → Add-ons**. Phone and split-view widths
use a category picker; iPad layouts use a category row or sidebar with responsive
cards. The Settings screen uses the full available tablet content width.

See [Settings layout](../../docs/EXPANDED_SETTINGS.md) for responsive rules and
validation limits. Installed apps need an updated native build to show this UI.


### Helius routing for Private balances

The general Solana RPC may remain Shyft or another provider. Private balances use
`EXPO_PUBLIC_PRIVACY_RPC_URL`, or a valid Helius mainnet RPC already configured for
the wallet. For local builds, Expo also reuses the workspace
`VITE_GRAPE_MAINNET_RPC_URL` when it is Helius. Metro inlines the resolved privacy
URL into the JS bundle, and Expo carries it in its manifest fallback. There is no
endpoint or API-key input in the Private balances UI.

For remote EAS builds, configure `EXPO_PUBLIC_PRIVACY_RPC_URL` in the selected EAS
environment (a Helius HTTPS mainnet URL with `api-key`). EAS builds fail early if
no usable Helius privacy endpoint is available, instead of shipping the add-on
with a non-Helius RPC. Restart Metro or rebuild after changing build-time RPC
configuration; installed bundles cannot acquire new build-time values by refresh.

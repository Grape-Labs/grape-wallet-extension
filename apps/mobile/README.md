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

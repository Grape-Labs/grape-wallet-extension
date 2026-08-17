# Grape Wallet 0.5.154

This release improves wallet readability and mobile navigation, fixes several
mobile overlays that could hide important actions, introduces Solana Ledger
hardware-wallet support on mobile, and adds verifiable extension release
artifacts.

## Highlights

- Added Solana Ledger hardware-wallet import and signing on mobile over Bluetooth.
- Improved token balance formatting across mobile and the browser extension.
- Made the mobile Discover browser substantially more compact.
- Fixed connection approval and token-selection overlays on smaller mobile screens.
- Added automatic versioned extension ZIP and SHA-256 generation.

## Browser extension

- Large token balances now use readable abbreviations such as `8.07M BONK` and
  `1.25B TOKEN`.
- Balances below one million use locale-aware grouping, such as `12,345 TOKEN`.
- Small balances retain enough precision to avoid displaying a non-zero balance
  as zero.
- Extension builds now produce a ready-to-distribute archive at
  `apps/extension/releases/grape_wallet_extension.<version>.zip`.
- Each archive includes a matching `.zip.sha256` checksum file for independent
  verification.
- The packaging step verifies ZIP integrity and confirms that the built manifest
  version matches the package version.

## Mobile

### Ledger hardware wallets

- Added Bluetooth discovery for compatible Ledger devices on iOS and Android.
- Added scanning and selection of multiple Solana Ledger accounts.
- Added Ledger-backed SOL and SPL-token sends with physical confirmation.
- Added Ledger signing for Grape Discover messages, legacy transactions, versioned
  transactions, and send-transaction requests.
- Ledger private keys never leave the hardware device. Grape stores only the
  public address, derivation path, and paired device identifier.
- Ledger wallets cannot export private keys or be transferred through Grape's
  device-link backup flow.

### Discover browser and approvals

- Discover browser controls now start collapsed and collapse again when returning
  to Discover.
- The collapsed browser header now uses a compact navigation row.
- Added a left-swipe gesture from Discover back to wallet Home.
- Fixed wallet connection approvals so Reject and Connect/Approve remain visible
  and tappable while long approval details scroll independently.

### Swap and asset display

- Fixed the Swap To picker so recommended-token pills are no longer clipped by
  the results list.
- Applied compact, grouped, and precision-aware token quantities throughout mobile
  holdings, asset details, Send, and Swap surfaces.

## Current Ledger limitations

- Mobile Ledger support currently targets Solana over Bluetooth.
- A native EAS or development build is required; Ledger is unavailable in Expo Go.
- USB-only Ledger devices are not currently supported by the mobile integration.
- Mobile Ledger swaps, bridges, and governance voting are not enabled yet.

## Extension download verification

The distribution files for this release are:

```text
grape_wallet_extension.0.5.154.zip
grape_wallet_extension.0.5.154.zip.sha256
```

SHA-256:

```text
49420c205e0adfe752b4f06f5faed097206cdcf7637d06f78f94eb5153f96f8d
```

Verify the downloaded archive on macOS or Linux:

```bash
shasum -a 256 -c grape_wallet_extension.0.5.154.zip.sha256
```

Expected result:

```text
grape_wallet_extension.0.5.154.zip: OK
```

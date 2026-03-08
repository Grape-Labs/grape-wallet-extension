# @grape/wallet-adapter

Dedicated Solana wallet-adapter package for Grape Wallet.

## Install

```bash
npm install @grape/wallet-adapter @solana/wallet-adapter-base @solana/web3.js
```

or

```bash
pnpm add @grape/wallet-adapter @solana/wallet-adapter-base @solana/web3.js
```

## Usage

```ts
import { GrapeWalletAdapter } from '@grape/wallet-adapter';

const wallets = [new GrapeWalletAdapter()];
```

Use it anywhere you would normally pass Solana wallet-adapter wallet instances.

## Notes

- Detects the injected Grape provider from the browser extension.
- Exposes `Grape Wallet` as a wallet-adapter-compatible adapter.
- Supports `connect`, `disconnect`, `signMessage`, `signTransaction`, and `signAllTransactions`.
- Requires the Grape Wallet browser extension to be installed in the user's browser.


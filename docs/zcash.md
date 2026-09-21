# Zcash support

Grape currently supports transparent Zcash accounts on mainnet and testnet. Transparent ZEC transfers are public on-chain; shielded balances, Unified Addresses, memos, and shielded spending are outside this first release.

## Create or restore a wallet

Creating or restoring the normal multi-chain wallet set automatically creates a Zcash account from the same mnemonic at:

```text
m/44'/133'/0'/0/0
```

After setup, open the chain selector and choose **Zcash**. You can also add a Zcash-only wallet from **Add wallet** using a 32-byte hexadecimal private key, a Zcash WIF key, or a transparent watch-only address in the extension.

## Indexed API

Balance, activity, UTXO lookup, and transaction broadcast use a public Zcash Blockbook API by default on mainnet. Override the base URL to use another Blockbook-compatible indexer:

```dotenv
VITE_GRAPE_ZCASH_INDEXER_URL=https://your-indexer.example
EXPO_PUBLIC_ZCASH_INDEXER_URL=https://your-indexer.example
```

The extension also exposes this setting under **Settings → Wallet → Custom indexed API** while Zcash is selected.

Testnet requires a custom testnet Blockbook URL. The default public endpoint is mainnet-only.

## Dapp provider

Browser pages and the mobile Discover browser can find the provider at:

```ts
const provider = window.grapewallet?.zcash ?? window.grapeZcash ?? window.zcash;
```

Supported requests follow the emerging Zcash provider method names:

```ts
const account = await provider.request({ method: 'zcash_requestAccounts' });
const balance = await provider.request({ method: 'zcash_getBalance' });
const txid = await provider.request({
  method: 'zcash_sendTransaction',
  params: [{
    to: 't1...',
    amount: '0.01',
    fundingSource: 'transparent'
  }]
});
```

Every first connection and transfer requires wallet approval. The wallet constructs and signs the Zcash transaction; dapps never receive private keys. `shielded` is returned as an empty address or zero balance until shielded wallet support is implemented.

# Private Balance preview

Grape's extension integrates `@heliuslabs/spr` 0.9.0-alpha behind
`VITE_GRAPE_PRIVACY_RINGS_ENABLED=true`. The flag defaults off. This is separate
from Houdini Private Send and the existing Token-2022 confidential transfers.

## Try it

1. Set the flag in the repo-root ignored `.env.local`, then build the extension.
2. Enable **Private balances** in Settings → Wallet, alongside the rebalancer
   add-on. It defaults off on every installation. Select your Solana software
   wallet and choose mainnet or devnet. The panel
   shows a shortened account address and network before review. External
   recipients can be expanded to inspect their full address during review. Ledger,
   watch-only, mobile, and passkey signers are not supported.
3. On the wallet home card, select the **Private** balance. A compatible Helius wallet RPC
   is reused automatically, including `VITE_GRAPE_MAINNET_RPC_URL` and a wallet
   custom RPC for the selected network. No endpoint or API-key field appears
   in the Private Balance UI. If no compatible RPC is configured, the feature
   reports that it is unavailable on that network.
4. Unlock Grape normally, then sync, review private-wallet setup, and confirm.
   Private Balance reuses the existing unlocked session; it has no password field. Registration does not deposit
   funds. Sync again once the registration confirms.
5. For the first mainnet test, deposit a small amount such as 0.001 SOL, then
   sync after confirmation and withdraw it back to your own public address.
   Network and setup costs are additional and shown before confirmation.
   Private sends require another registered private wallet.
   Every transaction has a simulated review of its amount, recipient, network
   fee and estimated public SOL debit before confirmation.

Mainnet and devnet support setup, deposit, private send, and withdrawal.
The initial transaction UI supports native SOL only; other synced balances show
mint addresses and integer base units rather than guessed token decimals.

## Keys and privacy

- The SDK derives the shielded keypair from the existing account's Ed25519 seed
  using its canonical `TSPP/derive/v1` offchain message. Restoring the same Solana
  private key recovers the same shielded identity. This works for mnemonic and
  imported private-key software accounts without changing their Solana address.
- Privacy keys exist only inside the background operation and are destroyed on
  success or failure. Private balances are decrypted locally and not persisted.
- An existing registry record must match the derived keys. Grape refuses a
  conflicting identity rather than overwriting keys or showing a zero balance.
  Viewing-key rotation/history recovery is not implemented in this preview.
- The public message-signing function rejects raw and offchain-encoded privacy
  derivation requests from websites. Such signatures reveal privacy secrets.
- Remote proving uses the SDK's signed network TEE policy and encrypted attested
  channel. No plaintext remote-prover fallback is configured. The prover enclave
  processes the transaction witness and nullifier secret; local decryption does
  not mean proofs are generated locally.
- Default Ring transfers hide amounts and assets, while addresses stay public.
  Deposits and withdrawals expose amounts and assets. A private send to an
  unregistered recipient fails; it never becomes a public withdrawal silently.
- Private Balance uses the wallet RPC configuration: build-time `VITE_*` URLs are already in
  the extension bundle, and wallet custom RPCs use the existing wallet storage.
  Credentials are sent only to the selected Helius host. A protected backend
  gateway is needed if a deployed shared key must remain secret.

## Submission recovery

Reviews expire after 40 seconds and are bound to the wallet, account, network
and endpoint. Pending submissions are stored separately for each network.
Changing inputs clears the review. Signing happens only after confirmation.
The signature and blockhash are saved before broadcast. Lost RPC responses return
the signature with an uncertain status; another submission is blocked while that
transaction may still land. Sync restores the last submission's status even after
the popup closes. Check the explorer before retrying an uncertain transaction.

Registration currently does not enable automatic UTXO merging. Accounts with too
many notes can fail SDK input selection; merging and its confirmation UI remain
future work. Balances are freshly synced before private spending, with incomplete
sync results rejected. A long history can make fresh sync slow.

## Validation

`pnpm exec vitest run packages/solana/src/privacy.test.ts apps/extension/src/background/privacy-rings.test.ts`

Tests cover deterministic recovery against the SDK's signature-based derivation,
network validation, exact lamport conversion, unsigned version-1 mainnet
registration, native version-1 signing and fee simulation, derivation signature
protection, review binding, simulation rejection, one-time submission,
and recovery from uncertain broadcast. Mocked transaction tests do not establish
live end-to-end proof generation or mainnet readiness.

Live checks during implementation confirmed HTTP 200 registration lookups on both
networks, the SDK's devnet registration-read path, and successful devnet prover
attestation. The SDK's encrypted health request returned HTTP 404. The devnet
faucet request failed, so registration/deposit/transfer/withdrawal have not been
validated with live transactions. A funded end-to-end run remains required.
Mainnet attestation and all 136 published proving-key entries also verified.
A generated empty mainnet address produced a version-1 unsigned registration
with a 5,000-lamport fee quote. RPC simulation decoded it and returned
`AccountNotFound`, as expected for an unfunded address; nothing was broadcast.
Deposits now check prover-key compatibility before funds can enter the private
balance. Registration, simulation, signing and fee inspection use the Kit 8
version-1 transaction codecs required by this SDK; the older web3.js decoder
continues to serve the wallet’s existing non-privacy flows.
The extension production build and typechecks pass. Browser visual/runtime QA
could not run because the computer-use browser host was unavailable.
The separate core-package typecheck still fails on two existing test fixtures in
`packages/core/tests/state.test.ts` (lines 331 and 399), whose `chainState` objects
omit the required `zcash` entry. Those fixtures were not changed by this feature.

References:
- https://www.helius.dev/docs/privacy/integration/wallet
- https://www.helius.dev/docs/privacy/sdk
- https://www.helius.dev/docs/privacy/endpoints

The privacy worker integration uses static SDK imports. Chrome MV3 service
workers reject dynamic `import()`, even though the same modules load in pages.

Privacy JSON-RPC reads are paced at least 550 ms apart and retry HTTP 429 at most
three times, honoring short `Retry-After` delays. Proof requests and transaction
submissions are not replayed by this read transport. Exhausted rate limits are
reported as a readable service message rather than an encoded Kit error.


## Home portfolio

The home card shows Public and Private side by side with an allocation bar.
Selecting Private expands the setup or transaction controls in place. Known
private SOL USD value is included in the hero total alongside the public
portfolio. Missing pricing and unpriced private tokens never become a fabricated
zero-dollar total. The wallet's hide-balances toggle masks both columns and the
private holdings display. Transaction review amounts remain explicit.


## Grape motion

Deposit and send previews show beads travelling along braided vines through a
grape-cluster veil, using Grape's existing logo. Withdrawal reverses the route.
These illustrations do not represent transaction progress. Reduced-motion
preferences replace the moving beads with a static route and stop the orbit.


## Hide from home

In the expanded extension and tablet view, private balance preferences live in
**Settings → Add-ons**. The compact popup keeps them under **Settings → Wallet**.

Open the Private balance controls and choose **Hide**. Restore the section from
Settings → Wallet → **Private balances** → **Show for this wallet**. The preference is saved
per Solana address and network on this installation. Hiding removes the section
and its private valuation from the home total and stops automatic private reads.
It does not close the registry account, return rent, erase keys, or move funds.

The Private balances add-on is opt-in, like Rebalance. Its installation-wide
toggle defaults off and is saved in local extension storage. When off, the home
section is not mounted and does not perform automatic private reads. Per-wallet
hide/show preferences remain saved while the add-on is off. Disabling the add-on
does not unregister an account or change private funds.

## Expanded and tablet layout

The expanded wallet uses a bounded content width, a compact portfolio header,
and full-width Public and Private summary cards. Tablet widths use an icon
navigation rail and touch-sized controls; portrait asset rows place prices under
the asset name. At wider widths the private animation and amount form appear
side by side. The compact extension popup retains its stacked layout.

Browser previews with sample data were checked at 834, 1024, and 1440 CSS pixels
without horizontal page overflow. Physical iPad testing remains outstanding.


## Native iOS and Android

Mobile Settings → Add-ons → Private balances enables this installation's add-on (off by
default). The home card supports setup, exact SOL balances, deposits, private
payments to registered recipients, and public withdrawals. Show for this wallet
controls the address/network preference. Ledger wallets are excluded. The UI
never contains a Helius endpoint or API-key field. Existing mobile RPC settings
are reused; local app configuration can fall back to the workspace mainnet RPC.
Privacy routing is separate from the general Solana RPC: local builds reuse a
Helius workspace endpoint even when regular mobile traffic uses Shyft. EAS builds
should supply `EXPO_PUBLIC_PRIVACY_RPC_URL` (or a Helius
`EXPO_PUBLIC_SOLANA_RPC_URL`). The privacy URL is inlined by Metro and included in
Expo metadata, including standalone `manifest2.extra.expoClient.extra.env`.
An unrelated custom RPC cannot hide a configured Helius privacy fallback.

Hermes cannot run the SDK's browser cryptography/WASM directly. Metro builds an
entirely local IIFE into a generated HTML string, displayed in an invisible,
non-navigable WebView. No remote scripts or WASM are downloaded. Its CSP permits
HTTPS data requests for Helius and the SDK's authenticated prover infrastructure,
while prohibiting external scripts, frames, forms and other page content.
Signing seeds are obtained through SecureStore only during an authorized wallet
operation; they are not persisted in the engine. WebView debugging, storage and
caching are disabled. The engine unmounts when the app leaves the foreground,
locks, changes wallet, disables the add-on or leaves the home screen. Unsupported
WebCrypto/Ed25519 OS versions fail before offering setup/deposits.

Every transaction uses the native transaction review. Prepared transactions are
single-use, expire after 40 seconds, and bind to the selected owner, RPC and wallet
session. The signature is durably saved before native broadcast. An uncertain
broadcast never triggers an automatic second submission. The home section links
to the pending signature and sync reads its status. Private transaction history
omits plaintext amounts. Unpriced private tokens are disclosed and cannot be
silently counted as zero in the private valuation; this version spends SOL only.

Validation: `pnpm --filter @grape/mobile privacy:check` checks WebCrypto and bundled
Poseidon initialization offline. Mobile type checking, iOS/Android Metro exports,
and focused review/submission tests cover the integration. Real-device OS/CORS
compatibility and user-confirmed setup/deposit/send/withdraw transactions still
need testing. Source and JS bundles do not update already installed native apps;
build and install a new app version to use the feature.

## In-app explanation

“How private balances work” opens from the private balance panel and Settings →
Add-ons, including before activation. The extension uses a responsive dialog;
mobile uses a native modal with the same copy from `packages/core/src/privacyGuide.ts`.
The guide covers setup, adding SOL, private sends, withdrawals, public visibility,
proof generation and Helius's role, account recovery, recipient compatibility,
fees and the current lack of a rent-reclaim flow. It distinguishes encrypted
balances from screen masking and Houdini Private Send, and links to official
Helius documentation. The existing “What stays private?” summary remains available.

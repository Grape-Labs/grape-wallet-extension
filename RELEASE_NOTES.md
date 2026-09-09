# Grape Wallet 0.5.175

**Version 0.5.175** makes transaction approvals easier to verify across the browser extension and mobile wallet, with clearer balance changes, more precise fee estimates, and a consistent review experience. It also brings Roundtrip AI to the extension’s Solana Discover directory.

## Highlights

- Transaction approvals now present estimated wallet balance changes as clear **You send** and **You receive** rows.
- Network fees in the browser extension now show both the precise SOL amount and its estimated USD value.
- Small fees and token values retain useful decimal precision instead of rounding down to **$0.00**.
- Mobile Discover and Solana Mobile Wallet Adapter requests now include native transaction simulation and balance-change previews before approval.
- Added Roundtrip AI as a featured community app in the extension’s Solana Discover directory.

## Browser extension

### Clearer transaction reviews

- Improved the approval summary to make outgoing and incoming assets easier to distinguish at a glance.
- Token quantities preserve their decoded on-chain precision, with USD estimates displayed separately when pricing is available.
- Network fees now show SOL as the primary value with the USD estimate directly underneath.
- Very small USD values use adaptive precision so low-cost transactions no longer appear to have a **$0.00** fee.
- Detailed account, instruction, warning, and simulation information remains available for deeper inspection.

### Discover

- Added **Roundtrip AI**, a community-built travel app, to the Solana Discover directory.
- Roundtrip AI is marked as featured and can be found through Discover search or the Community category.

## Mobile wallet

### Transaction previews

- Added estimated balance-change cards to Grape Discover signing requests and native Solana Mobile Wallet Adapter approvals.
- Approval sheets now identify assets being sent and received, preserve token decimal precision, and show available USD estimates.
- Network fees are displayed in SOL with their estimated USD value underneath.
- Transactions are simulated before approval, with a loading state and visible warnings when decoding or simulation identifies a risk.
- Balance changes are filtered to the active wallet and its associated Solana token accounts.
- Multi-transaction requests continue to show their full payload count while previewing the first transaction in the batch.

## Notes

- Balance changes, token prices, and network fees are estimates produced before signing and may change before confirmation.
- Pricing is shown only when a supported market-data source can identify the asset.
- Users should continue to verify the requesting site, assets, amounts, and warnings before approving any transaction.

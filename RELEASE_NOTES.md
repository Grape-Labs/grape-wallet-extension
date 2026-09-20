# Grape Wallet 0.5.226

**Version 0.5.226** brings governance participation directly into Grape Wallet, improves the Community experience, introduces optional private sends through Houdini, and streamlines the Send interface across the browser extension and mobile wallet.

## Highlights

- Grape now discovers the Solana DAOs a wallet actively participates in and displays its community, council, and delegated voting power.
- Governance discovery uses indexed Solana RPC calls and no longer depends on Shyft GraphQL.
- DAOs with no voting power are hidden, while participating DAOs are ordered from highest to lowest voting power.
- Active proposals load when a DAO is opened, reducing the initial Governance loading time.
- Proposal cards show vote choices, current totals, voting deadlines, available voting sources, and how the wallet or its delegates have already voted.
- Added optional private token sends through Houdini with quote review, route costs, delivery estimates, and persistent order tracking.
- Redesigned Send privacy as a compact selector below the recipient instead of a large panel above the form.
- Improved OG Reputation and Verification presentation in Community on extension and mobile.
- Manual portfolio refresh now bypasses fresh caches, reloads balances and market data, and shows clear progress and completion feedback.

## Governance

### Faster DAO discovery

- Replaced the unsupported governance GraphQL path with indexed RPC account queries.
- Detects community, council, and delegated governance participation for the active Solana wallet.
- Filters out DAOs where all detected voting-power balances are zero.
- Sorts participating DAOs by total voting power in descending order.
- Loads DAO membership first and fetches proposals only after the user selects a DAO.
- Adds request pacing, deduplication, and short-lived caching to reduce redundant RPC calls during refreshes.
- Redesigns the DAO overview as a compact, tappable list matching the Community tab on extension and mobile.
- Hides each zero-value community, council, or delegated balance so every DAO row shows only voting power the wallet can use.

### Proposals and voting

- Shows live proposals for the selected DAO, including their voting window and current state.
- Shows the five most recent proposals below live voting, including the recorded wallet or delegated choice when available.
- Identifies proposals that still require action from the wallet.
- Displays named proposal choices and their recorded vote totals.
- Shows whether the wallet has voted and which choice it selected.
- Separately identifies votes and available power supplied through governance delegates.
- Supports current SPL Governance proposal layouts, including version 2 proposal accounts and inherited voting deadlines.
- Keeps direct links to the full proposal on governance.so.

## Community

- Reworked the Community overview into a more compact hierarchy for reputation, verification, and tracked spaces.
- Shows total effective OG Reputation points alongside points from the latest season.
- Displays each reputation space with its community identity and score.
- Groups linked and verified identities by community for easier scanning.
- Added clearer tracked-space, linked-identity, verified-identity, and needs-verification summaries.
- Replaced raw fetch failures with useful loading, refresh, and error states.
- Applied the updated Community experience to both extension and mobile.

## Send and private transfers

### Cleaner Send experience

- Removed the duplicated Send title and excess header space from the extension.
- Moved privacy selection below the recipient as one compact field.
- Opens Public and Private send choices in a focused bottom sheet instead of permanently occupying the form.
- Applied the same privacy selector and review hierarchy to mobile.

### Optional Houdini private sends

- Adds **Private send** as an optional mode for supported tokens and mainnet networks when a Houdini service is configured.
- Uses a same-token private route so the recipient receives the selected asset without a direct wallet-to-wallet transfer.
- Loads private quotes automatically and shows the estimated output, route cost, provider, and delivery time before order creation.
- Surfaces Houdini's actual amount limits and routing errors; for example, an amount below the provider minimum now shows the required minimum.
- Saves active orders locally so they remain visible after reopening the wallet.
- Detects matching active orders and prevents accidental duplicate order creation in both the wallet client and backend service.
- Automatically reconciles interrupted order attempts with Houdini, clears confirmed stale pending markers, and keeps retry available after token or network failures.
- Keeps deposit details bound to the reviewed token, amount, recipient, wallet, and order before signing.
- Keeps Houdini API credentials in the backend service and out of extension and mobile bundles.
- Includes a quick **Use Public send** fallback when a private route is unavailable.
- Keeps the standalone Houdini deposit-address route hidden from Swap for now; Houdini is available through Private send.

## Extension and mobile parity

- Governance membership discovery, voting-power filtering, DAO sorting, proposal details, and recorded-vote visibility are available on both wallet surfaces.
- Community reputation and verification summaries use the same structure across extension and mobile.
- Send privacy, private quote review, active-order protection, and Houdini funding checks share the same core implementation.

## Notes

- Governance only lists DAOs where the wallet currently has positive community, council, or delegated voting power.
- Proposal data is fetched per DAO to keep the initial Governance view responsive.
- Houdini availability depends on the configured backend service, supported assets, provider limits, and network availability.
- Private routing reduces the direct on-chain connection between sender and recipient, but it does not guarantee anonymity.
- Users should review the quoted output, fees, destination, and deposit expiry before funding a private-send order.

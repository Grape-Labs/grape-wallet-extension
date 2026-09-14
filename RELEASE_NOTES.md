# Grape Wallet 0.5.200

**Version 0.5.200** makes Grape faster and more informative across the browser extension and mobile wallet. This release introduces efficient token metadata caching, a cleaner swap experience, immediate token-detail previews, richer discovery content, improved mobile RPC controls, and additional visual polish throughout the wallet.

## Highlights

- Redesigned the swap interface across extension and mobile with compact asset panels, clearer balances, percentage shortcuts, and improved token selection.
- Added persistent token metadata caching across extension and mobile to reduce redundant API calls while still refreshing stale information.
- Token details now appear immediately using portfolio data already loaded by the wallet instead of opening on an empty loading screen.
- Added thousands separators to large token balances for easier reading.
- Added support for testing, saving, and resetting the active Solana RPC endpoint from the mobile wallet.
- Discovery icons now support SVG artwork alongside PNG, JPEG, and other raster formats.
- Added a cached, chain-aware **Latest updates** feed to extension Discover using official Solana and Ethereum sources.
- Added cinematic, theme-aware lens-flare artwork to the wallet hero on extension and mobile.
- Improved extension startup recovery so users can retry instead of remaining stuck on the opening screen.
- Improved token cleanup by checking for a viable Jupiter route before burning and recommending a value-preserving swap when appropriate.

## Browser extension

### Cleaner swaps and token screens

- Reworked the swap screen into a denser two-panel layout that keeps both selected assets, balances, and values visible.
- Improved the token picker layout so search results remain contained within the extension viewport.
- Added clearer asset selectors and more compact percentage and confirmation controls.
- Preloads token names, symbols, artwork, balances, and estimated values while full token details continue loading.
- Formats large token balances with locale-aware thousands separators.
- Removed the persistent burn warning from the normal token overview; destructive warnings remain part of the actual burn flow.
- Checks Jupiter before opening the burn flow and prepares a swap to SOL when the expected return is greater than the estimated transaction cost.

### Discovery and performance

- Added official ecosystem updates to Discover for Solana and Ethereum.
- Feed results use a 15-minute refresh interval and a seven-day fallback cache for resilient loading.
- Feed failures remain unobtrusive, leaving the dApp directory fully usable.
- Added SVG favicon support for dApps that do not provide raster icons.
- Added persistent token metadata caching with freshness checks to reduce repeated metadata requests.

### Reliability and polish

- Added a retry state when the extension cannot finish loading wallet state.
- Refined menu, settings, token-picker, and navigation spacing to prevent controls from touching or overflowing.
- Added a theme-colored cinematic flare layer to the portfolio hero, including reduced-motion support.

## Mobile wallet

### Faster portfolio loading

- Added persistent token metadata caching to reduce repeated API and RPC work between wallet refreshes.
- Uses cached metadata immediately while refreshing expired entries in the background.
- Reuses preliminary portfolio data when opening token details to avoid an empty loading state.
- Improved large-number formatting for token balances.

### Wallet controls and design

- Added mobile controls for testing, saving, and resetting custom Solana RPC endpoints.
- Improved settings-card spacing and navigation clearance.
- Updated the swap interface to match the extension’s clearer, more compact hierarchy.
- Added SVG support for icons in mobile Discover.
- Added a lightweight, theme-aware lens flare to the mobile wallet hero.

## Notes

- The Discover feed currently uses the official Solana changelog and Ethereum Foundation feeds. Chains without a verified official feed continue to show the existing dApp directory without an empty feed section.
- Cached token metadata is refreshed according to freshness rules so performance improvements do not permanently preserve stale information.
- Burn remains destructive and still requires confirmation; the Jupiter check is intended to help preserve recoverable market value before burning.

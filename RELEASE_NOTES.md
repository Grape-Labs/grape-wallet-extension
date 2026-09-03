# Grape Wallet 0.5.171

**Version 0.5.171** expands the Discover experience across every supported chain,
brings richer token market information to mobile, and improves how private RPC
configuration is handled in extension and mobile builds.

## Highlights

- Added Android Mobile Wallet Adapter support for native Solana dApps on Saga, Seeker, and other compatible devices.
- Added an expanded in-app FAQ to mobile and the browser extension, covering supported networks, swaps, bridges, Discover, approvals, asset pricing, token management, governance, security, and custom RPCs.
- Discover recommendations now follow the selected Solana, Sui, Monad, or
  Ethereum wallet.
- Added dedicated popular-app directories for every supported chain on both the
  browser extension and mobile wallet.
- Mobile token rows now show the unit USD price and color-coded 24-hour change,
  matching the extension.
- Private Solana RPC endpoints are now supplied through local build environment
  variables instead of being committed to the repository.

## Browser extension

### Help and FAQ

- Added an expandable FAQ inside compact Settings with direct Help docs and Discord links.
- Covers Grape wallet tools, third-party routing, transaction review, asset pricing, token cleanup, governance, recovery, Ledger, biometrics, and custom RPC privacy.

### Chain-aware Discover

- Switching chains now updates the Discover heading, recommendations, featured
  apps, category filters, recent connections, and empty-state messaging.
- Solana Discover continues to feature Grape tools and popular Solana apps.
- Sui Discover includes apps such as Cetus, NAVI Protocol, Suilend, Bluefin,
  Scallop, Aftermath, and Turbos.
- Monad Discover includes the official Monad App Hub, Kuru, Uniswap,
  PancakeSwap, LFJ, aPriori, Magma, and Monad explorers.
- Ethereum Discover includes Uniswap, Aave, Lido, Safe, Curve, CoW Swap,
  OpenSea, ENS, and Etherscan.
- Category filters only show categories that contain apps for the active chain.
- Recently connected apps are filtered to the selected ecosystem so Solana-only
  sites do not appear while browsing Sui, Monad, or Ethereum.

## Mobile wallet

### Solana Mobile

- Grape can now appear as a wallet in native Android dApps using the Solana Mobile Wallet Adapter protocol.
- Added native association handling for `solana-wallet://` requests in a dedicated Android task, allowing control to return to the requesting dApp when the session finishes.
- Supports authorization, reauthorization, message signing, legacy and versioned transaction signing, and sign-and-send requests for the selected Solana wallet.
- Every connection and signing request is shown in a Grape approval sheet with the requesting dApp identity, network, selected wallet, payload count, and safety guidance.
- Added explicit rejection, invalid-authorization, low-power connection, and session-error handling.
- Mobile Wallet Adapter is Android-only; the existing in-app Discover browser remains available on both Android and iOS.

### Help and FAQ

- Added wallet guidance directly inside Settings so common questions can be answered without leaving the app.
- Expanded coverage for Grape tools and third-party integrations, including Jupiter swaps, LI.FI bridge routes, the portfolio rebalancer, chain-aware Discover, transaction approvals, Burn, Reclaim rent, governance, Verification, OG Reputation, biometrics, Ledger, and custom RPCs.
- Clearly distinguishes browsing a recommended dApp from native wallet-provider support on mobile.
- Corrected mobile release metadata so Settings and native Android/iOS App Info report version **0.5.171** instead of the old **0.4.0** value.
- Made the mobile navigation background span the full screen width and physical bottom edge, while keeping its controls above Android and iOS system navigation areas.

### Recommendations for every chain

- Mobile browser recommendations now change with the selected wallet chain.
- Added separate popular-app collections for Solana, Sui, Monad, and Ethereum.
- Grape-specific tools remain available when Solana is selected and are hidden
  on unrelated chains.
- Site icons for every chain directory are prefetched for a cleaner browsing
  experience.

### Token prices and market changes

- Mobile asset rows now preserve the token unit price and 24-hour market change
  returned by the pricing service.
- The left side of each supported token row shows its per-token USD rate, such as
  **$0.9999**.
- Positive and neutral 24-hour changes appear in green; negative changes appear
  in red.
- Total wallet value and token quantity remain visible on the right side.
- Assets without market data continue to use the existing symbol and address
  fallback instead of displaying misleading values.

## RPC configuration

- Updated extension and mobile builds to read the preferred Solana RPC from
  environment configuration.
- Extension builds use `VITE_GRAPE_MAINNET_RPC_URL`.
- Mobile builds use `EXPO_PUBLIC_SOLANA_RPC_URL`.
- RPC credentials are no longer present in tracked source files.
- The public Solana mainnet endpoint remains available as a non-secret fallback
  when no private RPC is configured.
- Ledger account discovery now uses the configured extension RPC first and falls
  back to the public endpoint if required.

## Notes

- Non-Solana recommendations can be browsed in the mobile dApp browser. Native
  Sui, Monad, and Ethereum provider injection is separate from this directory
  update and is not included in this release.
- Client-side RPC endpoints are embedded in distributed extension, APK, and IPA
  builds and can be observed at runtime even when they are not stored on GitHub.

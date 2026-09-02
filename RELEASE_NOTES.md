# Grape Wallet 0.5.170

**Version 0.5.170** expands the Discover experience across every supported chain,
brings richer token market information to mobile, and improves how private RPC
configuration is handled in extension and mobile builds.

## Highlights

- Discover recommendations now follow the selected Solana, Sui, Monad, or
  Ethereum wallet.
- Added dedicated popular-app directories for every supported chain on both the
  browser extension and mobile wallet.
- Mobile token rows now show the unit USD price and color-coded 24-hour change,
  matching the extension.
- Private Solana RPC endpoints are now supplied through local build environment
  variables instead of being committed to the repository.

## Browser extension

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

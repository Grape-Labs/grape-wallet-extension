# Grape Wallet 0.5.179

**Version 0.5.179** refreshes the wallet experience across the browser extension and mobile app with a clearer portfolio hierarchy, more useful screen space, and faster access to essential wallet actions. This release also improves mobile SOL balance reliability and makes wallet addresses and private keys easier to copy when needed.

## Highlights

- Redesigned the wallet home screen across extension and mobile with a stronger balance hero and clearer visual hierarchy.
- Expanded the browser extension to a balanced `402px` width, giving balances, tabs, and token values more room without feeling oversized.
- Theme artwork is now contained within the wallet hero, keeping the asset area cleaner and easier to read.
- Updated home navigation to a streamlined underline-tab layout.
- Improved action buttons and increased asset-row typography and numerical space.
- Added **Copy address** alongside Share on the Receive screen in both extension and mobile.
- Added a dedicated copy button when revealing a private key.
- Improved mobile SOL balance loading with retries and a fallback RPC endpoint.

## Browser extension

### Refreshed wallet home

- Widened the extension layout and ensured the lock screen and wallet content use the full available width.
- Redesigned the balance hero and primary action row for better focus and easier interaction.
- Moved theme artwork into the hero so it no longer competes with portfolio content.
- Replaced segmented home tabs with a cleaner underline treatment.
- Increased token-name, balance, and value readability while reserving more space for larger numbers.
- Updated the bottom navigation to align with the wider layout.

### Easier copying

- Added a one-tap wallet-address copy action to the Receive QR screen.
- Added a copy helper beside revealed private keys, while preserving the existing verification and reveal safeguards.

## Mobile wallet

### Consistent portfolio design

- Applied the same hero-first hierarchy used by the extension.
- Refined the balance card, action row, tabs, asset rows, and token-value spacing for improved readability.
- Limited theme artwork to the hero on the ready wallet screen for a calmer portfolio view.

### Reliability and wallet tools

- Native SOL remains visible even when zero-balance assets are hidden.
- SOL balance requests now retry and fall back to the default Solana RPC when the configured endpoint is temporarily unavailable.
- Unavailable balances are identified clearly instead of incorrectly appearing as zero.
- Added one-tap copy controls for Receive addresses and revealed private keys.

## Notes

- Private keys remain hidden until the wallet’s existing verification and reveal flow is completed.
- RPC fallback is used only when the configured Solana endpoint cannot return the native balance.

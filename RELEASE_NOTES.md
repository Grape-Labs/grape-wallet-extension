# Grape Wallet 0.5.161

This release improves transaction approvals, adds a safe way to reclaim SOL
held by empty token accounts, expands Ledger support in the browser extension,
and makes biometric unlock faster on mobile.

## Highlights

- Approval popups now show the correct approved or rejected result in place and
  close automatically after a short delay.
- Added a Solana rent-reclaim tool for reviewing and closing eligible empty token
  accounts.
- Expanded browser-extension Ledger support for Solana transactions, swaps, and
  rent reclamation.
- Added automatic biometric unlock when opening the locked mobile wallet.

## Browser extension

- Cleaned up the unlock password field into a single compact dark control with
  integrated reveal and biometric actions.
- Standardized extension themes around the new near-black surface system; themes
  now retain their accent identity without changing the app's overall structure,
  contrast, or visual density.
- Refreshed the extension home screen with a minimal dark layout, neutral header
  controls, compact actions, clean text navigation, and an open asset list.
- Reduced decorative backgrounds, borders, nested cards, and accent-color noise
  while preserving the existing wallet workflows and theme identity.
- Asset rows now consistently show the per-token USD price and 24-hour change
  beneath SOL and token names, matching the mobile portfolio layout.
- Missing mainnet market data is refreshed immediately instead of remaining absent
  until the balance cache expires.
- Replaced the duplicate bottom Receive shortcut with a Discover tab for browsing
  curated Solana dApps and reopening recently connected sites. Receive remains in
  the primary wallet action row.

### Transaction approvals

- Fixed rejected transactions incorrectly appearing to be approved afterward.
- Fixed some versioned swap confirmations showing matching SOL sent and received
  instead of the purchased token and its USD value when address lookup tables
  were used.
- Approval and rejection results now appear in the original approval popup.
- Resolved approval popups close automatically after two seconds, reducing popup
  buildup when handling multiple transactions.
- Approval controls are disabled while a response is processing to prevent
  conflicting approve and reject actions.
- Added a distinct rejected state confirming that no transaction was approved.

### Reclaim SOL rent

- Added a **Reclaim rent** tool to Solana wallet settings.
- The tool scans for eligible empty SPL Token and Token-2022 accounts and shows
  the SOL recoverable from each account.
- Accounts can be selected individually or all at once before closing them.
- Eligibility is verified again immediately before submission to avoid closing an
  account whose state has changed.
- The confirmation screen shows the selected account count and estimated SOL to
  recover before network fees.
- Supports both software wallets and Ledger wallets.

### Ledger

- Added Ledger signing and submission for supported Solana transactions in the
  browser extension.
- Added Ledger support for Solana swaps.
- Added Ledger support for closing empty token accounts and reclaiming their rent.
- EVM and Sui swaps with Ledger remain unavailable and now return a clear
  unsupported-operation message.

## Mobile

- Applied the same restrained dark design system to mobile themes, the wallet
  header, balance hierarchy, action controls, asset rows, and bottom navigation.
- Theme backgrounds are now deliberately subtle, with theme identity concentrated
  in active icons, buttons, and highlights instead of large decorative surfaces.
- The wallet selection menu now shows the combined cached value across all
  wallets and the individual USD value of every listed wallet.
- Redesigned the Discover browser with compact desktop-style tabs above a single
  navigation and address row, leaving substantially more room for web content.
- Moved app shortcuts, bookmarks, and secondary browser actions into the overflow
  menu while keeping back, forward, reload, address, and bookmark controls close
  at hand.
- The wallet now attempts biometric unlock automatically when opened on the lock
  screen and biometrics are enabled.
- Cancelling the automatic biometric prompt no longer displays an unnecessary
  error.
- Refined lock-screen and biometric-control sizing and alignment.

## Safety notes

- Closing a token account is irreversible. Only zero-balance accounts without an
  active delegate and with a compatible close authority are offered for rent
  reclamation.
- Reclaimed amounts are displayed before Solana network fees.

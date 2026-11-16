# Expanded extension Settings

At 760 CSS pixels and wider, the expanded wallet presents one settings category
at a time. A horizontal category row supports tablet widths; from 1280 pixels it
becomes a sticky sidebar. General and Connections use two columns from 960 pixels,
while portrait widths stack their cards. The settings area uses the available
wallet content width rather than the previous centered 1020-pixel cap.

- General: chain, network, custom endpoint, and balance visibility.
- Appearance: theme, custom theme editor, background, and motion.
- Add-ons: private balances and the experimental rebalancer.
- Connections: automatic connections, signing mode, and access to site management.
- Security: biometric unlock, locking, security tools, and advanced settings.
- Reputation, Verification, and Governance: community tracking.
- Help & FAQ: answers and support links.

The compact popup retains its existing Wallet accordion and all preference
handlers. Category navigation adapts when resizing and community Manage links
still open and focus the corresponding category. This change does not alter
signing, authentication, preference defaults, or saved settings.

Sample-data browser previews were checked at 834, 1024, and 1440 CSS pixels with
no horizontal page overflow. Physical iPad testing is still needed.


## Native mobile Settings

The native app now uses the same core category names and one-category-at-a-time
organization. Recovery and Wallet manager remain separate native categories.
The old 760-point Settings width cap is removed. Cards use the measured content
canvas after the app navigation and safe-area padding, rather than device width.

Phones and narrow split views use a category picker; standard iPad widths use a
swipeable category row; larger canvases use a category sidebar. Two-column cards
appear when at least 700 readable content points are available; a single card
uses the full category width. Larger accessibility
text falls back to fewer columns and the picker. Restore QR sizing includes the
card padding and quiet zone; button rows wrap. Current-wallet addresses are shortened.

Community Manage links select their category. Existing preference, authentication,
export, recovery, and signing handlers remain connected. Category switching is
disabled during export/device-link authentication and hides a revealed key when
leaving Recovery. FAQ questions retain their independent disclosures.

Validation includes native category navigation and layout tests, TypeScript,
iOS/Android Metro exports, and previews of the actual layout components through
React Native Web at phone and iPad sizes. The preview uses sample preference
controls and placeholder icons; it does not connect to a wallet. Physical-device
verification and a new installed app build are still required.

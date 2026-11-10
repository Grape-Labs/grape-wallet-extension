# Mobile native experience audit

Date: 2026-11-10. Scope: source review of `apps/mobile/App.tsx`, its wallet integrations, and Expo configuration. This is not a physical-device or visual usability audit.

## Implemented in this pass

- Android hardware Back dismisses pickers, returns from transaction forms and asset details, steps through Discover browser history, then returns to Home. At Home root it retains Android's default exit behavior. Pending signing and dApp approvals consume Back rather than silently abandoning a request.
- Tab and form scroll positions are remembered for the current session. Selecting the active bottom tab scrolls to the top. Switching tabs dismisses the keyboard and leaves form drafts in component state.
- Bottom navigation exposes tab roles and selected state to accessibility services.
- iOS Discover enables WebView back/forward gestures. Failed page loads offer retry, external opening, and address editing in the app's own UI.
- Screen entry, launch and lock breathing animations respond to the system Reduce Motion setting. Android uses drag-to-dismiss keyboard behavior; iOS retains interactive dismissal.
- Send, Swap and Bridge route to Activity immediately after locally recording submission, with a dismissible, accessible submission notice. Balance/activity refresh errors no longer turn those completed submission paths into send/swap/bridge errors. Submission is not represented as chain confirmation.
- Send's visible back control is disabled while sending. Existing biometrics and picker sheets were retained.

## Findings and next implementation priorities

| Priority | Finding | Recommended work |
| --- | --- | --- |
| High | One large component uses booleans for routes and conditionally mounts screens. This prevents a true platform navigation stack and unmounts Discover's live WebView when leaving its tab. | Introduce a bottom-tab navigator with nested native stacks; keep tab roots mounted. Migrate routes incrementally while preserving pending approvals and drafts. This enables iOS interactive swipe-back outside the WebView. |
| High | Public Send signs from its form; review and fee presentation differ across Send, Swap, Bridge and dApp requests. | Add a shared review sheet showing asset, full recipient, network, fees, source account and exact approval scope. Retain each chain's validation and explicit signing authorization. |
| High | Submission notices are session UI, not a durable confirmation tracker. A storage failure after broadcast can still leave local activity incomplete. | Track broadcast signatures independently, reconcile pending/confirmed/failed states per chain, and surface broadcast-success/storage-failure distinctly. Never invite a resend merely because balance refresh or local persistence failed. |
| Medium | Some modal pickers are centered Paper modals rather than gesture-driven native sheets. | Migrate wallet/asset/network selection to accessible sheets with drag dismissal, keyboard avoidance and safe-area handling. Keep approval dismissal explicit. |
| Medium | Drafts live in memory and are lost after process termination. | Persist non-secret drafts by wallet and network with expiry; exclude signing secrets and revalidate recipients/quotes on restore. |
| Medium | No consistent haptic feedback layer. | Add a platform-aware haptic adapter with device support checks and user preference; apply to deliberate selection, submission and failure events. |
| Medium | Data loading and refresh behavior differ across screens. | Standardize cached-first loading, stale timestamps, pull-to-refresh and offline recovery. Guard late refresh results when changing wallets. |
| Medium | Biometric unlock exists, but external app return and background/session behavior need device testing. | Test biometric cancellation, lock timeout, app backgrounding and Android Mobile Wallet Adapter handoff before changing security behavior. |
| Medium | Accessibility review is incomplete. | Audit larger text, touch targets, contrast, focus return from sheets, VoiceOver/TalkBack and remaining animations. |

## Verification

- Mobile TypeScript check: passes.
- Existing mobile helper tests: 39 passing. These cover address resolution, external handoff helpers and amount shortcuts; they do not automate native navigation or signing.
- Expo production JS/Hermes exports: iOS and Android pass. These are bundle exports, not signed IPA/APK builds.
- App lint baseline: 12 errors and 7 warnings; this pass introduced no additional diagnostics. Existing issues include unused symbols, CommonJS imports and hook dependency warnings.
- Metro emits dependency package-export fallback warnings. They did not prevent either export.

## Device acceptance checklist (not yet executed)

1. Android: open each picker and transaction form, press Back, and verify the nearest screen closes before the app exits. Confirm approval/signing requests remain explicit.
2. Scroll Home, Activity and Settings independently; switch tabs and return. Tap the selected tab and verify it scrolls to the top.
3. Open an asset's transaction detail, press Android Back, and verify it returns to that asset before Home.
4. iOS: browse multiple pages in Discover and swipe backward/forward. Confirm navigation and connected-origin state follow the displayed page.
5. Disable connectivity and load a page; test Retry, Edit address and Open externally on both platforms.
6. With a test wallet, submit a small transfer, then interrupt balance refresh. Verify Activity reports submission without a failed-send message. Repeat Swap/Bridge in their supported test environments.
7. Toggle Reduce Motion while the app is open and while locked. Check static launch/lock presentation and screen entry.
8. Test VoiceOver/TalkBack bottom-tab selection announcements and submission notices; test large text and keyboard layouts on small devices.
9. Background/foreground during drafts, biometric prompts and dApp requests. Confirm drafts and security boundaries behave as expected.

## Second upgrade batch

Implemented shared bottom-aligned review sheets for public Send, fixed Houdini deposits, Swap and Bridge. Each review captures the account, network, recipient where applicable, amount, quote route/output and available fee/slippage information. Fee estimates that are unavailable are explicitly described as unavailable; this is not a new fee estimation engine. Existing private-send and Zcash quote flows retain their specialized reviews. Confirmation is single-use, expires after one minute and is dismissed on app backgrounding/account change. Actual signing and chain validation still use the existing transaction paths.

Discover now keeps its WebView mounted (hidden and excluded from accessibility traversal off-tab) while the ready screen remains mounted. This preserves live browser history and avoids a reload on every tab switch. This is not a full native-stack migration and does not preserve a live WebView across lock/process termination.

New local Send/Swap/Bridge activity starts pending. Foreground reconciliation checks source-chain status on Solana, Ethereum and Monad using existing configured RPC endpoints. It pauses offscreen at the app level (background/locked), retries unknown results every 15 seconds and does not treat RPC failures as chain failures. Polling covers up to 20 pending records for the selected wallet per pass. A confirmed bridge source transaction is labeled **Source confirmed**, not destination delivered. Sui/Zcash and bridge destination settlement tracking remain separate follow-up work. Historical success records are not retroactively downgraded.

Submitted records are journaled separately and recovered when the wallet next loads if absent from main history. Main history takes precedence over a stale journal record. Cleanup happens only after a successful wallet-state write. Persistence errors after broadcast are presented as recording problems with the transaction ID, rather than inviting a resend. No local journal can close the interval between an external broadcast and the app receiving/recording its signature, or survive total storage failure.

Validation: mobile TypeScript passes; 58 helper tests pass, including single-use/expired review authorization, RPC status parsing, persistence failures and journal recovery. Both platform Hermes bundle exports pass. These checks do not replace device testing or signed builds.

Additional device checks:

- Review, edit and confirm each supported transaction kind with a test wallet; verify the full account and destination against the signed transfer.
- Rapidly tap Confirm twice; wait over one minute in review; change accounts or background the app. Confirm no stale review signs.
- Browse several pages, switch tabs and return; verify live browser history is retained and hidden content is absent from accessibility focus.
- Restart with a pending transaction and verify confirmation resumes. Interrupt RPC access and verify it stays pending.
- Simulate journal-only persistence and verify the transaction returns after restart without duplicates; verify a confirmed state is not downgraded by an old journal entry.

Protocol references: [Solana getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [Ethereum JSON-RPC receipt API](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_gettransactionreceipt).

## Third upgrade batch

Send now saves unfinished form fields locally, scoped by wallet ID and chain, with a 24-hour expiry. Reopening Send offers explicit Resume/Discard actions. Restoring never restores an approval or quote; the user must review again. Missing assets and unavailable private-send providers block restoration rather than silently changing the transfer. NFTs and fixed Houdini deposit orders are excluded. Only the whitelisted public form fields and private-send preference are persisted; credentials, secrets, quote payloads and orders are not stored in a draft. Storage uses the existing device-local AsyncStorage metadata store, not cloud sync. Writes and reads are serialized to keep a late save from overtaking discard or post-broadcast deletion. Other transaction forms still keep only in-memory drafts.

Activity rows open a bottom-aligned detail sheet with current status, available source/destination addresses, timestamp and selectable/copyable transaction ID. Details follow the transaction signature as remote history replaces local records. Newly created local Send and Bridge records retain their full entered destination. Solana domain recipients are still resolved by the existing signing flow; the local metadata records the entered recipient. Bridge details explicitly distinguish source confirmation from destination delivery. Sheets close on account change/lock and support Android Back.

Validation: TypeScript and 70 helper tests pass, including draft schema, expiry, scope, serialization whitelist, write ordering and activity status labels. iOS and Android Hermes bundle exports pass. App lint has no new diagnostics beyond the previously documented baseline. Device and signed-build validation remain outstanding.

Additional device checks:

- Enter a Send draft, terminate/reopen the app, unlock and open Send. Verify Resume shows the correct asset, recipient, amount and privacy preference and still requires a fresh transaction review.
- Switch wallets/networks and verify drafts do not leak into another account. Verify missing-asset/private-provider errors preserve the choice to discard.
- Discard a draft, rapidly reopen Send and verify it stays discarded. Broadcast a test transfer and verify the previous draft is not offered again.
- Open Activity details while a pending transfer confirms; verify the sheet remains open and status updates. Copy its ID and verify clipboard contents.
- Test long addresses, larger text, VoiceOver/TalkBack, sheet scrolling and Android Back on small devices.

Next structural priority: migrate boolean navigation to native tab/stack navigators, preserving the browser and the review/draft boundaries added here. Gesture-driven picker sheets, haptics, durable Swap/Bridge drafts and destination settlement tracking remain pending.

## Native navigation-stack migration

Implemented React Navigation bottom tabs inside a native-stack navigator, backed by Expo 54's supported `react-native-screens ~4.16.0`. Home, Activity, Discover and Settings have stable screen components, remain mounted, and own separate scroll views. Asset details, asset transaction details, Send, Swap, Bridge, Rebalance, Receive and Governance are native stack routes. Receive/Governance use native headers; existing wallet-flow back controls are retained. The native route determines transaction-screen visibility; the former independent visibility booleans are removed.

Native stack transitions and iOS edge-swipe Back replace the manually conditional transaction screens. A transaction opened from an asset returns to that asset on Back. Submission completion returns to the existing tab root and selects Activity. Android sheets/browser history are handled before navigator Back; the tab router returns to Home before exiting. Selection metadata is retained until the native close transition finishes, with selection IDs to avoid a late transition clearing newly opened details.

Signing, rebalance execution, token cleanup, biometric prompts, open approvals and picker/review sheets prevent native route removal. Programmatic completion navigation waits until signing finishes, and only the final requested destination is applied. Changing accounts clears pending navigation and resets the stack. Route parameters contain only selection IDs, never credentials or signing callbacks. Navigation state itself is not persisted across lock/process termination; form-draft recovery remains separate.

Safe-area ownership is split between native headers, headerless screen content and the bottom tab bar so the ready screen does not apply the same insets twice. Reduced Motion disables stack animations. Settings links can scroll into an already-mounted tab.

Native build integration:

- Added React Navigation native-stack/bottom-tabs and the Expo-compatible native screens dependency; updated the pnpm lockfile and iOS pods.
- Android already used `super.onCreate(null)`, as required for avoiding restored screen-fragment state.
- Raised older iOS resource-pod deployment targets to the configured minimum (default 15.1) in the Podfile's post-install hook to support the installed Xcode simulator SDK.
- Both the Android arm64 debug APK and unsigned iOS simulator app compile successfully. iOS/Android Hermes exports also pass. These are development builds, not signed store releases.
- TypeScript and 75 mobile helper/router tests pass. Router tests exercise Send→Asset→Tabs Back behavior, stable tab identities and the signing-navigation queue. No additional App lint diagnostics beyond the existing baseline.

This migration adds native code. Rebuild/install the app with `pnpm mobile:ios` or `pnpm mobile:android`; refreshing an older installed binary is insufficient. iOS pods have been installed for this workspace. The local Android build used Android Studio's bundled Java runtime and the installed SDK via command-scoped environment variables.

Device gesture acceptance remains outstanding: test completed/cancelled iOS edge swipes, all Android back paths, blocked gestures during signing, browser history across tab switches, keyboard and safe-area spacing, restored Send drafts, and lock/account changes. The route renderer still consumes wallet state from the main component; extracting individual screen modules and moving sheets to gesture-driven presentations remain future cleanup.

## Gesture selection sheets and branded startup

Replaced the five wallet/network/Send asset/Swap input/Swap output selection modals with Gorhom v5 bottom sheets. They support 58% and 90% snap points, a drag handle, pan-down/backdrop dismissal and an explicit accessible Close button. Vertical lists use integrated sheet scrollables; horizontal token pills use Gesture Handler. Search uses the sheet's keyboard-integrated input with interactive keyboard adjustment and blur-on-gesture. Wallet/network search and empty states are added. Native stack removal stays blocked while a picker is open; transaction reviews and signing approvals keep their existing explicit controls and were not converted to dismissible selection sheets.

Recent choices are stored as bounded ID-only history (up to eight per scope). Asset history is scoped by wallet and chain. Searches retain provider relevance; unfiltered options prioritize recent available items. Removed/unavailable choices are not fabricated back into lists. Search text, credentials and balances are not stored in recent history. Picker open clears stale asset filters. Selected rows expose selected state to accessibility services; dismissal restores focus to a still-present opener only when its original route remains active.

Selection haptics use Expo Haptics, tolerate unsupported hardware/runtime failures, and can be disabled using the persisted Haptic feedback setting. Added Gesture Handler, Expo 54-compatible Reanimated/Worklets and the modal provider at the app root. The Expo Babel preset automatically includes the Worklets plugin; no duplicate manual plugin was added.

A new code-native Grape reveal uses the existing vector logo with purple/mint particles, a ring, and a short scale/rotation settle. It is approximately 1.05 seconds and runs during loading and on setup/unlock heroes. It has no startup completion gate, artificial minimum loading time, network asset dependency, or fake progress meter. Wallet bootstrap and unlock remain independently usable. System Reduce Motion yields a static mark; motion is conservatively disabled until that preference has been read. The old launch halo loop now runs only during active setup work instead of indefinitely behind the ready screen. This is Grape-specific artwork/motion, not copied competitor assets.

Validation: TypeScript, 79 helper/router tests, iOS/Android Hermes exports, Android arm64 debug compilation and unsigned iOS simulator compilation pass. Recent-history tests cover deduplication, bounded storage, scope separation, malformed storage and stable option ordering. No new lint diagnostics were introduced. Existing App lint diagnostics remain (11 errors and 7 warnings after removing the obsolete raster-logo require).

Visual/gesture verification is still pending: an isolated simulator was available and bootable, but the connected computer-use surface does not expose Simulator (both app-name and full-path access failed). No wallet was imported, no transaction was sent, and simulator UI behavior was not claimed as verified. The empty test simulator was shut down after this check.

Device acceptance checklist:

- Cold-launch with normal/reduced motion, fast/slow local wallet loading and biometric unlock; confirm the reveal does not delay usable controls.
- Open each picker, drag between snap points, scroll long lists and pan down to close. Check Android Back and iOS keyboard dismissal.
- Search for wallet/network/token names and addresses; choose, close and reopen. Check recent ordering and missing-option behavior.
- Use VoiceOver/TalkBack and larger text; verify selected labels, explicit Close, focus return and scroll reachability.
- Disable Haptic feedback and verify selections stop producing haptics. Check a device without haptic support.
- Open a dApp approval while a selection sheet is open; verify selection sheets dismiss and signing still requires explicit approval.

These new native modules require a fresh mobile build/install (`pnpm mobile:ios` / `pnpm mobile:android`); a JavaScript refresh of an older binary is insufficient.

## Unlock regression fix

Restored the original hollow grape artwork from `assets/grape_logo_white.png`. The vector introduced for the reveal had a solid grape silhouette; the existing artwork retains the outlined/O-shaped grapes. Startup motion now animates the original mark.

Reproduced the iOS post-biometric failure in an isolated simulator harness. The harness used a dummy public watch-only address, in-memory wallet persistence, a simulated successful biometric result and no wallet secrets or signing. Before the fix, the ready screen threw **Invalid hook call** in `useContent → TabBar`. The custom tab-bar property was `tabBar={TabBar}`; React Navigation invoked it as a callback, directly calling its context hook outside a valid component hook dispatcher. It is now `tabBar={() => <TabBar />}`, so React renders the hook-owning component normally.

The same iOS runtime harness after the fix reported biometric success, successful ready-navigation mount and continued liveness without that error. A regression test exercises the tab-bar callback contract; it fails with the original wiring and passes with the fix. All 80 mobile tests and TypeScript checks pass. This is a simulated authentication result exercising the actual post-unlock UI, not a physical Face ID/Touch ID hardware test. Biometric authentication, credential handling and signing authorization were not changed. Temporary runtime stubs were removed from the source tree after the test.

## Picker presentation and Back regression fix

Reproduced both reported failures in the isolated iOS runtime. The controlled selection sheets called `dismiss()` on their initial hidden mount, before any presentation. With the installed sheet version this left the modal in `DISMISSING`; its later portal render was suppressed. The requested-open flags stayed set, and those same flags prevented Back after navigating to Send/Swap.

Selection sheets now use an explicit presentation lifecycle: an initially hidden sheet is left alone, closing during opening waits until presentation completes, and reopening during dismissal preserves the newer request. Selection-picker requests no longer participate in signing/removal guards, and route changes clear them. Actual signing, biometric, transaction-review and dApp approval guards remain in place. Home picker and Back controls also have larger touch hit areas and stable test IDs.

The fixed headless iOS integration harness invoked the real control handlers and observed native sheet index 0/-1 for wallet, network, Send asset, Swap input and Swap output, followed by Send Back → Home and Swap Back → Home. The test used dummy public watch-only addresses and no wallet secrets or transactions. These are handler/native presentation checks, not physical-device touch/gesture validation. All 85 mobile tests and TypeScript checks pass, including component-level first-open and lifecycle regressions. Temporary runtime stubs were removed after verification.

## Live Send fees and physical-device QA — 2026-11-10

Send review now requires a successful read-only fee estimate before opening confirmation. Estimates do not load signing keys. The review separates estimated network fee from the full native fee/account reserve. Signing refreshes the estimate and rejects a reserve above the approved budget; Solana and Zcash also check the final prepared transaction fee before broadcast. Unknown Solana message fees now produce an error rather than being interpreted as zero.

- Solana: estimates the actual transfer message; SPL transfers include legacy recipient ATA rent when necessary. Native Max subtracts the message fee from the RPC balance. Token Max reads the raw token-account balance. Token-2022 recipient account creation is blocked until extension-aware rent estimation is available.
- Ethereum / Monad: estimates recipient/token-call gas, reads native/token balances, and uses exact bigint units. Max reserves a rounded-up 20% gas-limit margin at the current RPC gas price. Submitted transfers use that explicit gas limit and gas price, so the gas budget is bounded; a market change can require a fresh review rather than consuming an unapproved fee. On Ethereum the displayed fee uses estimated gas and the reserve uses the buffered gas limit. On Monad both use the submitted gas limit because Monad charges that full limit ([official gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing)).
- Zcash: uses the same transparent UTXO selection and ZIP-317 fee calculation as signing. Max subtracts the fee and preserves zatoshi precision. Broadcast is blocked if the final fee exceeds the approved amount.
- Percentage shortcuts apply integer percentages to the RPC-derived spendable amount, rounding down; they no longer depend on floating-point display balances or fixed SOL reserves. A recipient is needed first because gas and recipient-account costs depend on the destination.
- Sui sends remain unavailable in this build; the Send hint now states that accurately. This change covers public Send and its Houdini funding transfer, not provider-controlled private-send delivery fees or Swap/Bridge route fee preparation. Swap/Bridge still need separate prepared-route fee estimation and native Max handling.

Validation: 105 tests pass across mobile helpers, EVM fee budgets, Zcash and Solana transfers. Mobile TypeScript and the three changed chain-package builds pass. Targeted lint passes. iOS and Android production Hermes exports are checked separately from physical-device acceptance. No transactions were sent and no wallet credentials were accessed.

Physical-device checks are **not yet passed**. A paired iPad was discovered, but CoreDevice reported Developer Mode disabled (DDI installation rejected); no Android device appeared in ADB. The user is connecting/enabling devices. No attempt was made to change device security settings or restart a device automatically.

Required acceptance on each platform before another feature batch:

| Check | iOS hardware | Android hardware | Pass condition |
| --- | --- | --- | --- |
| Top controls | Pending | Pending | Network/wallet/refresh and all asset dropdowns respond, including repeated opening after dismissal. |
| Sheets | Pending | Pending | Both snap points, scrolling, drag-down, backdrop and Close work; dismissal restores focus. |
| Back navigation | Pending | Pending | Send/Swap return correctly; cancelled/completed edge swipe and Android Back preserve drafts; signing/review guards remain effective. |
| Biometrics | Pending | Pending | Success, cancel, failure and background/resume return safely; password fallback works. |
| Keyboard | Pending | Pending | Small display, recipient input, decimal amount, picker search and rotation keep focused controls reachable. |
| Accessibility | Pending | Pending | VoiceOver/TalkBack, larger text, Reduce Motion, selected state and focus order remain usable. |
| Fees / Max | Pending | Pending | Funded test wallets show fees before review; native/token Max leaves gas; fee failure/increase blocks signing; recipient ATA creation and ZEC dust cases match review. |

Use test wallets and test networks wherever supported. Hardware validation is separate from automated handler/navigation tests; automated passes must not be recorded as successful physical taps or biometrics.

## Prepared route fees, recovery and request handling — 2026-11-10

The software follow-up completes Swap/Bridge source-fee preparation and native-asset Max for the existing executable Solana/Ethereum/Monad routes. Physical-device acceptance remains pending; the user explicitly chose to continue software checks after CoreDevice reported the paired iPad locked. No Android device was attached.

- Swap and Bridge prepare their executable payload before displaying review. Solana simulates the unsigned payload, checks the fee payer, reads the message fee and measures payer account costs. The same serialized transaction is signed after approval, rather than requesting another Jupiter transaction. Ethereum/Monad estimate the actual route call, retain an explicit gas limit/price and reserve any transaction value beyond the quoted native input. Monad's fee display uses the charged gas limit.
- Prepared routes bind the wallet ID, address, chain and quote and expire after 45 seconds. Execution revalidates them before loading a signing key. Increased gas limits, gas prices or native reserves require another review. Unknown costs, failed simulations, expired transactions and unsupported execution formats block signing. EVM routes needing an unavailable token approval are not auto-approved or assigned guessed gas costs.
- Native Swap shortcuts and Bridge's “Max after fees” use raw RPC balances, read-only probe quotes and bounded re-quoting with the largest observed reserve. No fixed gas fallback is used. If a provider cannot simulate the candidate amount, Max fails safely and retains the existing input. After changing the amount, Get routes requests a fresh route. Token shortcuts continue to use exact raw balances.
- Recipient token-account creation costs are measured by unsigned simulation rather than a fixed 165-byte rent assumption. This supports Token-2022 extension-aware costs where the transfer can be simulated; missing hook accounts and unsupported instructions fail closed. See the [Solana simulation API](https://solana.com/docs/rpc/http/simulatetransaction).
- Each rebalance leg receives a separate fee review and is journaled immediately after broadcast. Submitted legs are removed from the remaining plan, so a later cancelled/failed leg does not cause previously submitted legs to be retried. Rebalance progress says submitted/pending, and failed refreshes do not report successful broadcasts as failed. Lock, account and background changes invalidate approval and stop remaining legs.
- Restored pending activity reconciles across existing wallets rather than only the selected account. Zcash confirmations are checked through the indexer with a bounded request. Bridge success continues to mean “Source confirmed,” never destination delivery. Solana swap metadata lookups occur before broadcast to avoid post-broadcast lookup errors being presented as submission failures.
- Quote and transaction-preparation HTTP requests time out after 20 seconds. Late Swap/Bridge results and fee reviews are discarded when their input context changes. Errors/expiry leave entered amounts and recipients intact. Review approval is also bound to the current wallet session and foreground state.
- Decimal-comma keyboard input is normalized in Send, Swap and Bridge. Swap no longer silently strips a comma or other characters from malformed pasted amounts (for example, `0,5` becomes `0.5`; `1e3` stays invalid instead of becoming `13`).

Validation: 123 tests pass across mobile helpers, quote timeouts, Max convergence, prepared-route binding/budgets, decimal input, EVM route fees, Zcash confirmations and simulated token-account costs. Mobile TypeScript, Solana typecheck, Ethereum/Zcash builds and both production Hermes exports pass. Changed helper/chain files pass targeted lint; existing App diagnostics remain 12 errors / 7 warnings, with existing wallet/config diagnostics unchanged. Expo still emits pre-existing third-party export-resolution fallback warnings. No funds were sent and no credentials were accessed. These are software checks, not physical touch, gesture, biometric or accessibility acceptance.

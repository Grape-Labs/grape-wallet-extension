# Famous Fox missions integration research

Checked and implemented for the extension on 2026-11-16. Native start/claim
controls now appear on eligible mainnet NFT detail pages. No live mission
transactions were signed or submitted during implementation.

## Finding

A native Grape integration is technically feasible. The current official web
client exposes an Anchor IDL and client-side instruction builders for the live
mission program. A public, official missions SDK/source repository was not found
in the website, docs, GitHub repository search, or the developer's public repos.
Search results for Famousfoxes included unrelated/community frontend copies;
these are not a verified integration dependency.

Official references:

- https://docs.famousfoxes.com/missions
- https://docs.famousfoxes.com/holder-benefits
- https://famousfoxes.com/missions
- https://github.com/FoxyDev42?tab=repositories

## Current protocol

The documented missions program is:
`6NcdQ5WTnrPoMLbP4kvpLYa4YSwKqkNHRRE8XVf5hmv9`.

The current weekly mission opens Saturday 14:00 UTC, accepts entries for 24 hours,
and ends the following Saturday at 14:00 UTC. The official docs state that the
Fox stays locked in its wallet until claimed; missions cannot be ended early.
FFF, TFF and Friends & Foes can participate. Dens and partner NFTs cannot join
alone. Older mission examples and the classic route are not the current weekly
flow. Read mission state/times from chain rather than relying on a hardcoded
calendar.

The FFF collection address supplied in the user's screenshot matches the current
website's FFF collection constant:
`BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac`.
A wallet integration must validate the verified on-chain collection and current
ownership, not just the NFT name/symbol or image. This research did not verify
the screenshot mint on chain.

## Interfaces found in the current official frontend

Snapshot of public frontend asset URLs (hashed names can change):

- https://famousfoxes.com/assets/index-BBWJOcL5.js
- https://famousfoxes.com/assets/MissionsV2-NJKnw4Yl.js
- https://dens.famousfoxes.com/missions.json

The main bundle includes an IDL named `staking`, version `0.4.1`, with 39
instructions. Its program constructor uses the documented missions program.
Account layouts include `fox`, `mission`, `missionAccount`, `foxUpgrade`,
`chestRedemption`, and `loanAccount`.

The current MissionsV2 squad builder initializes missing Fox profiles, creates a
mission account/index, and builds `startMission` instructions for the Fox and
optional squad assets. It also handles staking transitions when needed. Relevant
IDL instructions include `initFox`, `initMissionAccount`, `startMission`,
`startMissionRoom`, `endMissionV3`, `endMissionAuth`, and `redeemChests`; several
older variants coexist and must not be selected by name alone. The start builder
supplies metadata/master-edition accounts and optional programmable-NFT token
record/auth-rule accounts. It builds instructions locally; it is not simply a
remote serialized-transaction endpoint.

The UI uses mission metadata, Fox profiles and mission accounts, plus optional
Dens, consumables and partner-collection metadata. Mission account indexing and
claim outcomes need refreshing after confirmed transactions.

## Proposed Grape implementation

1. Add a Famous Fox missions card only for verified eligible collections on
   Solana mainnet. Read current mission, Fox level/FAME, staking/lock state,
   eligibility and claim availability. Keep unrelated NFT pages unchanged.
2. Build a small typed Solana adapter against the validated program interface.
   Start with one Fox per mission, then add multi-Fox squads and optional items.
   Use Grape's configured RPC; do not copy the site's private infrastructure.
3. Review and simulate each action with the selected wallet/session, expected
   program, mint, token account and mission. Explain the lock end, setup/rent and
   network costs before sending. Preserve existing hardware/software signer
   support, error handling and confirmation tracking.
4. Support claiming/returning Foxes alongside starting missions. Re-read the
   frozen/delegate state before offering NFT transfers or marketplace actions.
5. Confirm the deployed program/IDL and current mission layouts, match current
   site-built transactions read-only, and obtain the team's supported interface
   and license terms before adopting any frontend code. Independently authored
   integration code avoids treating a public minified bundle as a reusable SDK.

No new on-chain program or separate wallet is required. An embedded official
website is a separate, quicker alternative, but does not provide native mission
controls and has not been added to Grape's embedded-site allowlist.

## Implementation and validation

`src/background/fox-missions-interface.json` contains only the public interface
fields needed by this integration, sourced from the official frontend snapshot
above. `fox-missions.ts` independently decodes discriminated program accounts and
builds instructions locally; the deployed program has no readable Anchor IDL
account, so no on-chain IDL availability is assumed. Its executable account and
live mission/Fox data were verified read-only. The screenshot Fox #7869 decoded
as locked on the current weekly mission, with 104 completed missions.

Initial scope: original Token Program, single-supply verified FFF/TFF/F&F NFTs,
including supported programmable NFTs; one unstaked Fox without boosts. Native
claim is atomic Fox return plus standard chest reward claim. Multi-asset squads,
classic missions, rare chests and other reward mints route to the official site.
No automatic unstaking, boosts, chest opening or restaking is included.

The panel gates transfer and Tensor actions while a lock, pending submission,
review or unknown Fox state exists. Background reviews bind the owner, wallet,
RPC and lock epoch, expire after 45 seconds, and are consumed once. Fresh status,
simulation, fees and wallet debit are checked before signing. Hardware signing
uses the existing Ledger path. Selection/session checks run again after signing
and after durable signature storage, before broadcast. Pending submissions are
checked against signature status and block lifetime before another action.

Tests cover live-interface account layouts, forged account owners/discriminators,
collection verification, entry/end boundaries, delegation, programmable account
metas, atomic solo claim, unsupported squads, simulation failures and review
context changes. Successful mainnet start/claim remains user-confirmed testing;
the current mission is already locked, so deployment cannot be tested live until
an entry window opens. No success on-chain is claimed from mocked simulation.

## Detection and end reminders

Eligible Fox cards in the NFT gallery read a mainnet mission badge, with limited
scan concurrency and a 30-second display cache. Opening details and refreshing
read fresh state. Refreshing wallet holdings refreshes the gallery badge. A
mission lock is shown explicitly alongside its on-chain end time.

The NFT panel's reminder switch requests the optional Chrome `notifications`
permission only on the user's click. The extension declares `alarms` to wake its
service worker and stores per-owner/per-mint preferences locally. Enabling it on
an active mission schedules the verified end. It remains enabled for subsequent
native deployments, including if the popup closes before confirmation finishes.

At the end, the worker rechecks wallet membership, verified NFT ownership,
mission state and any pending transaction without unlocking/signing. It retries
transient RPC failures and lagging/pending results. It emits one generic local
notification per mission, omitting wallet addresses and NFT names, and routes a
notification click to that Fox's details (or asks the user to select its wallet).
The preference can be disabled; reset clears reminder records/alarms. There is
no remote push service and no automatic deployment. With the browser closed,
overdue reminders are checked after it reopens; OS notification settings can
still suppress delivery.

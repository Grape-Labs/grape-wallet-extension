# NFT value and rent report

The extension Solana mainnet NFT gallery has an on-demand, read-only report. It scans the loaded collectibles with two concurrent inspections, retains partial results when stopped, and supports CSV export. Switching wallet or refreshing holdings invalidates the results. It never signs, lists, burns, or closes accounts.

## Market comparison

Magic Eden provides the collection floor resolved by mint and the last indexed sale for that mint (at most 300 activities). Collection floor is an asking price, not an executable bid, and old sales are not current appraisals. Unpriced assets remain unknown. Market results carry timestamps and warnings. The fee inputs default to explicit assumptions: 2% marketplace fee, 10% royalty only if the on-chain royalty is unknown, and 0.00001 SOL cost per action. These are scenarios, not transaction quotes. Sale net subtracts fees, creator royalty and action cost. Negative net values are retained.

## Rent comparison

Only original Token Program, initialized, single-supply, zero-decimal mints receive a token-account refund estimate. The account must contain one token, belong to the selected owner, have no delegate, be unfrozen, and allow that owner to close it. RPC failure, unsupported formats, or missing ownership leave rent unknown. Frozen/delegated assets require manual review (missions, staking, listings, and programmable NFTs can restrict transfers).

The observed token-account SOL balance is a conservative subset of a possible compatible burn-and-close refund. Metadata/edition refunds and mint rent are excluded; full burn proceeds require a fresh simulation of the NFT-specific burn instruction. Core, compressed and Token-2022 assets need separate inspection. A generic SPL burn does not by itself close a token account or recover Metaplex metadata rent.

“Compare rent recovery” means the floor scenario is below the token-account subset, not a recommendation to destroy the NFT. Rarity, membership and mission utility need manual consideration. “Explore selling” also requires a live offer and a fresh transaction preview. CSV export neutralizes formula-like metadata.

Primary reference: https://www.metaplex.com/docs/smart-contracts/token-metadata/burn

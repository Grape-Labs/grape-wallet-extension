# Discover icons

Official website icons collected on 2026-11-16 for Grape's curated Discover
entries and payment providers. `sources.json` records each directory URL and
its exact image source. Magic Eden uses its verified GitHub organization avatar
because the marketplace blocked direct favicon downloads. Roundtrip publishes
its icon as an SVG data URL; the bundled SVG is decoded from that source.

Images remain the property of their respective projects. Keep source records
when refreshing assets. SVGs were checked for scripts and external references.
Some projects publish a generic favicon rather than a distinct brand mark.

The host-to-asset map lives in `src/shared/discover-logos.ts`. Curated apps load
bundled images first; unlisted recently connected sites use their saved favicon,
then standard site icon paths, then a letter initial. No external logo service
is needed. The same icon component is used in Discover and dashboard app cards.

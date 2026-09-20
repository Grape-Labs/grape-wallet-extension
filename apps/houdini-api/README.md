# Houdini in Grape

The extension and mobile wallet integrate Houdini **standard, deposit-address swaps** alongside the existing swap routes. Swap uses the standard no-wallet-connect flow. Send also offers an opt-in Private send route using Houdini multi-hop private routing with the same token in and out. Quotes are floating, provider fees are reflected in the estimated output, deposit network fees are separate, and this integration explicitly requests zero partner markup.

## Local desktop setup

1. Put `HOUDINI_API_KEY` and `HOUDINI_API_SECRET` in `apps/houdini-api/.env`. Copy `.env.example` if starting fresh. This file is ignored by Git. Never put credentials in `VITE_*` or `EXPO_PUBLIC_*` variables.
2. Set `HOUDINI_SIGNING_SECRET` to a persistent random secret (at least 32 characters). Generate once with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it across restarts so existing order access tokens remain valid.
3. Set `ALLOWED_ORIGINS` to the exact `chrome-extension://<extension-id>` origin. Find the ID at `chrome://extensions`. Multiple origins are comma-separated.
4. Set `VITE_HOUDINI_API_URL=http://127.0.0.1:8788` in the repository-root `.env`.
5. Run `pnpm houdini:start` from the repository root using Node 22+.
6. Rebuild the extension (`pnpm --filter @grape/extension exec vite build`) and reload `apps/extension/dist` in the browser.
7. Open **Swap → Houdini · Deposit-address swap**. Search and select the input/output assets and networks, enter an amount and recipient, get quotes, and create an order only after reviewing it. **Review deposit in Send** opens Grape's ordinary transfer confirmation. It does not send automatically.

The backend must stay running for quotes and status updates. Reopen Houdini under Swap to resume saved order tracking. Send exactly the order's current deposit amount, on its specified network, before expiry. Never fund the same order twice. Creating an order is not a transfer; it only reserves deposit instructions.

## Mobile and production

Set `EXPO_PUBLIC_HOUDINI_API_URL` in `apps/mobile/.env` to the reachable **HTTPS** service origin and rebuild the app. A physical phone cannot reach the desktop's `127.0.0.1`. No production URL is configured by this change.

Host this Node service behind TLS. Set `HOST` as required by the hosting platform. Set `TRUST_PROXY=true` only when the reverse proxy overwrites X-Forwarded-For and direct access to the Node port is blocked; otherwise clients could spoof the user IP sent upstream. User IP, user agent, and timezone are forwarded to Houdini as required by its API. The service does not log credentials or order data.

Use one service instance with a persistent `HOUDINI_DATA_DIR`, protected filesystem permissions, and a stable signing secret. `orders.json` contains addresses, order details and recovery state; restrict access and establish an appropriate retention policy. Scaling to multiple instances requires replacing the file store with a shared transactional store and shared rate limiting first. Token responses are cached for five minutes. Public endpoints have an IP request limit; the service is deliberately not an arbitrary upstream proxy.

Orders are scoped by opaque signed capabilities. Quote tickets bind the recipient, refund address and token pair. Creation is deduplicated and persisted before calling Houdini: after a timeout/crash with an unknown outcome, it fails closed and requires support reconciliation instead of blindly creating another order. Keep the reported quote/order reference. The API only retains provider order lookup data for a limited period; the wallet preserves its last known local record.

## Current scope and checks

- Mainnet deposit-address standard swaps; input must match a wallet asset by network and native-token identity or exact contract/mint.
- Cross-chain recipients are explicitly entered. Memo-bearing networks are excluded; deposits with an unexpected memo are blocked.
- Order creation, deposit expiry checks, normal wallet send confirmation, polling, completion/failure/refund status and persistence are implemented.
- No automatic transfers, DEX approvals, or production deployment are performed. Private send is optional and never falls back to public routing.
- `pnpm houdini:test` uses mock upstream responses. `pnpm exec vitest run packages/houdini/src/client.test.ts` checks client deposit safeguards.

Reference: https://docs.houdiniswap.com/developer-hub/swap-flows/standard-swap

## Optional private send

On Send, Public send remains the default. Select **Private send · Houdini**, enter the amount and recipient, and choose **Review private send**. Grape resolves the held token by chain and native identity or exact contract, requests same-token `types=private` quotes, and displays the estimated recipient amount, route cost and ETA. The entered amount is the deposit amount; the recipient receives less after routing costs. Deposit network fees are additional.

Review the quote, create the order, and then review its deposit in the usual Send confirmation. Private order funding requires `anonymous: true` from Houdini. The original recipient and expected delivery remain visible while funding the provider deposit. Route availability varies by asset and amount; an unavailable private route does not trigger a public transfer. This reduces direct on-chain linkage, rather than guaranteeing anonymity.

Reference: https://docs.houdiniswap.com/developer-hub/swap-flows/send

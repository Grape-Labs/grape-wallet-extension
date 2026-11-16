# Extension app viewer

Discover defaults to opening HTTPS `governance.so` (including subdomains) and
`round-trip.ai.studio` in a dedicated extension app tab. The Discover switch
“Open Grape apps within the extension” persists locally and can route these apps
back to ordinary browser tabs. Other dApps remain external. Existing DAO,
proposal, reputation, and verification launch buttons share this preference.

The viewer validates its query URL with the same hostname allowlist. It rejects
credentials, non-HTTPS schemes, nonstandard ports, and lookalike domains. The
extension's frame CSP independently limits embedding to those origins. Remote
pages run in a sandboxed, cross-origin iframe, without top-navigation rights;
normal wallet provider connection/signing approvals still apply. Content script
injection runs in matching governance/Roundtrip frames so the existing provider
can be discovered. No direct wallet bridge or automatic approval is added.

The toolbar includes wallet navigation, reload, and Open in browser. Some future
site headers, cross-site redirects, or embedded sign-in policies may prevent
framing; the external action remains available. The toolbar identifies the
initial host; cross-origin frame navigation is controlled by the dApp itself.

Validation: hostname and launch-preference tests, extension type check, release
build, and read-only viewer previews for governance.so and Roundtrip. Installed
Chromium wallet-connect/signing flows require a user test; no transactions were
executed during implementation.

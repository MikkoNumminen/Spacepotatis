# `src/lib/securityHeaders.ts` — security notes

## Threat mitigated

- **Clickjacking against sign-in / shop** (SEC-001): an attacker
  hosts an iframe of the deployed instance and tricks an
  authenticated user into clicking through an invisible overlay.
  `frame-ancestors 'none'` (CSP) + `X-Frame-Options: DENY` close
  the iframe surface.
- **Stored-XSS amplification** (SEC-001 future-rake): if a future
  PR introduces an XSS sink, the CSP `default-src 'self'` and
  `connect-src 'self' https://accounts.google.com
  https://oauth2.googleapis.com` constrain where injected JS can
  exfiltrate to.
- **MIME sniffing** (SEC-001): `X-Content-Type-Options: nosniff`
  forces browsers to honor the declared `Content-Type` and not
  guess HTML for a JSON response.
- **Referrer leakage** (SEC-001): `Referrer-Policy:
  strict-origin-when-cross-origin` strips path + query from the
  Referer header on cross-origin navigations — query params can
  carry game state details.
- **Browser API privilege creep** (SEC-001): `Permissions-Policy`
  locks down `camera`, `microphone`, `geolocation`,
  `interest-cohort` (the FLoC interest-group surface) — none of
  which the game needs.

## Invariants enforced

- INV-OPS-1 — `getSecurityHeaders()` returns a header block that is
  applied to every route (`source: "/(.*)"`) by `next.config.ts`.
  CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy all present.

## What MUST NOT change without security review

- **`source: "/(.*)"`.** Narrowing the matcher to specific paths
  re-opens the surface for any route not matched.
- **`frame-ancestors 'none'` AND `X-Frame-Options: DENY`.** The
  X-Frame-Options is belt-and-braces for older browsers that don't
  parse CSP `frame-ancestors`; both lines are intentional.
- **`'unsafe-inline'` on `script-src` / `style-src`.** Tightening
  this to a nonce-based CSP is a future hardening pass — but it
  requires generating per-request nonces and threading them through
  every inline script Next.js injects. Removing `'unsafe-inline'`
  without the nonce setup breaks Next.js's runtime.
- **`connect-src` allow-list.** It must include `'self'` (so the
  game can hit its own API routes), `https://accounts.google.com`
  and `https://oauth2.googleapis.com` (so NextAuth's OAuth flow
  works). Tightening these breaks sign-in.

## Common mistakes

- **"Replace the manual header block with a single
  `Strict-Transport-Security` line — Vercel sets the rest"** —
  Vercel only sets HSTS by default. CSP / X-Frame-Options /
  X-Content-Type-Options are NOT set unless the app emits them.
- **"Drop `'unsafe-inline'` from `script-src` to tighten the
  CSP"** — Next.js inline scripts will refuse to execute,
  breaking the entire app. The future-hardening note at line 14-17
  documents the nonce-based path.
- **"Add `'unsafe-eval'` to script-src for a third-party library
  that needs eval"** — every `eval` usage in the app is a security
  problem; if a dependency requires it, that's a dependency choice
  to make explicitly. Don't loosen the CSP silently.

## How to test changes safely

- `npm test -- tests/security/headers.test.ts` — SEC-001 header
  presence and shape.
- Manual smoke after deploy: `curl -sI https://<deploy>/ | grep -i
  'content-security-policy\|x-frame-options\|x-content-type-options'`
  — every header must be present.

# Auth surface — security notes

Files: [`auth.ts`](auth.ts), [`authEmailVerified.ts`](authEmailVerified.ts).
Tests: [`auth.test.ts`](auth.test.ts), [`authUrlPin.test.ts`](authUrlPin.test.ts),
[`tests/security/emailVerified.test.ts`](../../tests/security/emailVerified.test.ts).

## Threat mitigated

- **Account takeover via Host-header spoofing** (SEC-012): if `AUTH_URL`
  is unset and `trustHost: true`, `@auth/core` falls back to the
  request `Host` / `X-Forwarded-Host` for callback-URL construction. On
  Vercel today this is bounded by platform host-header sanitization +
  the Google OAuth Console redirect-URI allow-list, but a deploy
  migration off Vercel or a loosening of the Console allow-list flips
  this into account-takeover-class.
- **Unverified-email session issuance** (SEC-019): a future provider /
  Workspace allow-list change could produce profiles with
  `email_verified === false`. Without the rejection, that profile
  binds an unverified email to a session.

## Invariants enforced

- INV-AUTH-1 — `signIn` callback rejects when
  `profile?.email_verified === false`. The check delegates to
  `isEmailVerifiedAcceptable` in `authEmailVerified.ts`. Any other
  value (true / null / undefined / missing profile) falls through to
  allow.
- INV-AUTH-2 — `AUTH_URL` is pinned in Vercel env vars (operator
  invariant; the code documents the requirement via a SECURITY-CRITICAL
  comment block above `trustHost: true`).
- INV-AUTH-3 — `auth.ts` carries email through to the session via the
  `jwt` and `session` callbacks. API routes resolve the row owner via
  `upsertPlayerId(session.user.email, ...)`; this is the only path
  from session to DB row.

## What MUST NOT change without security review

- **The `signIn` callback's rejection path.** Returning `false` is
  the canonical NextAuth v5 reject path (redirects to the error page
  instead of issuing a JWT). Refusing email inside the `jwt` /
  `session` callbacks is NOT equivalent — the session still issues.
- **The strict `=== false` comparison in
  `isEmailVerifiedAcceptable`.** Loosening to `!profile.email_verified`
  would reject legitimate sessions where the claim is missing — that
  is what Google sometimes does for Workspace trials and a class of
  legacy consumer accounts. The rejection must be explicit.
- **`trustHost: true` without an `AUTH_URL` pin.** If you remove
  `trustHost`, sign-in breaks on Vercel preview URLs. If you keep
  `trustHost` but `AUTH_URL` is unset in env vars, the host-header
  fallback re-emerges as a single layer. Both must hold.
- **Carrying `profile.email` through to `token.email` and
  `session.user.email`.** Removing it breaks the entire
  `upsertPlayerId(session.user.email, ...)` chain that every
  authenticated route depends on.
- **`isEmailVerifiedAcceptable` lives in its own module separate from
  `auth.ts`.** This is deliberate: the regression test imports the
  pure helper without dragging in the NextAuth runtime (`next-auth`
  pulls `next/server` at module load, which breaks under vitest's
  node environment). Inlining the helper into `auth.ts` would make
  the test impossible to run.

## Common mistakes

- **"Move the email-verification check into the `jwt` callback for
  consistency"** — `jwt` cannot cleanly reject; at best you can
  refuse to write `email` into the token, but the session still
  issues. `signIn` is the canonical hook.
- **"Tighten the rejection to `!profile.email_verified`"** — this
  rejects legitimate sessions where the claim is missing (some
  providers omit it entirely). Strict `=== false` is the correct
  rejection criterion.
- **"Remove `trustHost: true` and rely on `AUTH_URL` alone"** —
  Vercel preview deploys land on per-deploy URLs that can't all be
  enumerated as `AUTH_URL`. The combination of `trustHost: true` +
  Vercel host-header sanitization + Google OAuth Console redirect-URI
  allow-list + an `AUTH_URL` pin in env vars is the documented
  defense.

## How to test changes safely

- `npm test -- tests/security/emailVerified.test.ts` — SEC-019.
- `npm test -- src/lib/authUrlPin.test.ts` — SEC-012 doc presence.
- `npm test -- src/lib/auth.test.ts` — overall NextAuth config
  shape.
- Manual smoke: sign in with a fresh Google account, sign out, sign
  back in. Both flows must complete without redirecting through an
  unexpected callback URL.

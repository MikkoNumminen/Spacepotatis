# Threat model

This document is for the next agent — human or AI — who has to make a security-
relevant change. It names the attackers we defend against, the assets we are
protecting, the defenses already in place, and what is explicitly **out of
scope**. It does not contain exploit recipes.

The audit artifacts under `docs/security/` (`01-attack-surface.md`,
`02-findings-and-plan.md`, `02b-attack-cells.md`, `_progress.md`) carry the
finding-level detail. The companion `invariants.md` carries the
non-negotiable rules.

## Attacker categories

Six categories cover every realistic adversary a small Vercel-hosted
shoot-em-up faces. Each category lists what they can already do (their
"starting position") and what they want.

### A1 — Curious user

- **Starting position:** can sign in with their own Google account, can use
  DevTools, can read network traffic and edit local storage in their own
  browser.
- **Goal:** poke around. Often well-intentioned.
- **What they can already do that we accept:** modify local-only state in
  their own browser session (DevTools writes to the Zustand store), read every
  HTTP response their own session generates, replay their own POSTs.
- **What we defend against:** any mutation that crosses the trust boundary
  (POST /api/save, POST /api/leaderboard, POST /api/handle) is validated
  server-side; client-side state is not authoritative for anything that
  touches the database.

### A2 — Anonymous internet

- **Starting position:** unauthenticated. Can hit any public route.
- **Goal:** opportunistic — defacement, cost-burn, recon for a future targeted
  attack.
- **What they can already do that we accept:** read the public leaderboard
  (player handle + score + time + createdAt — no PII), read the static
  marketing pages.
- **What we defend against:** any unauthenticated mutation (every POST route
  requires `auth()` first), unauthenticated reads of private data (saves,
  handles, audit log), and reading email addresses or internal UUIDs.

### A3 — Leaderboard cheater

- **Starting position:** a real signed-in account. Knows the project is open
  source and can read the schemas.
- **Goal:** post implausible scores or scores for missions they have not
  completed. Take over the top of the leaderboard.
- **What they can already do that we accept:** post legitimate scores for
  missions they actually completed.
- **What we defend against:** scores above the per-mission `maxLegitScore`
  cap (SEC-014), scores for missions not in the player's server-trusted
  `completed_missions` list, scores for unknown mission ids (SEC-003), scores
  with the wrong type at the boundary (Zod schema rejection).

### A4 — Save tamperer

- **Starting position:** a real signed-in account. Can craft arbitrary
  POST /api/save bodies via DevTools or curl.
- **Goal:** inflate credits, unlock missions they have not earned, claim
  inflated playtime to loosen the credits cap, or — worst case — overwrite a
  legitimate save with INITIAL_STATE (the 2026-05-02 wipe scenario).
- **What we defend against:** the cheat-guard chain in
  `src/lib/saveValidation.ts` (`validateMissionGraph`,
  `validateNoRegression`, `validatePlaytimeDelta`, `validateCreditsDelta`).
  The credit cap is derived from the **server-stored** completed missions
  (SEC-017's `deriveCapInputMissions`), never from the request body alone.
  All four validators run inside a single transaction with `FOR UPDATE` on
  the prev row (SEC-013) so a concurrent stale-baseline overwrite cannot
  race past them. The save-state regression guard (`validateNoRegression`)
  catches the "POST INITIAL_STATE on top of a real save" pattern.

### A5 — Malicious mod / browser-extension actor

- **Starting position:** runs JavaScript in the player's browser via a
  malicious extension or a third-party script the player loaded outside our
  control.
- **Goal:** read the player's session cookie, exfiltrate save data, redirect
  the OAuth callback.
- **What they can already do that we accept:** anything inside the player's
  own browser process. Browser-extension privilege defeats application-layer
  defenses by design.
- **What we defend against:** the cookie defenses (`httpOnly`, `__Secure-`,
  `__Host-`, `sameSite=lax`) keep the session cookie out of JavaScript reach
  for in-page attackers; a CSP with `frame-ancestors 'none'` and
  `X-Frame-Options: DENY` (SEC-001) closes clickjacking against the sign-in
  flow.

### A6 — Supply-chain compromise

- **Starting position:** has compromised an upstream npm dependency, a
  GitHub Action, or — worst case — the Vercel deployment pipeline.
- **Goal:** ship malicious code as part of a normal build.
- **What we defend against:** GitHub Actions are pinned to commit SHAs
  (SEC-015), Dependabot watches the dependency surface (SEC-028), workflows
  declare minimum permissions (SEC-029), `npm ci` enforces the committed
  lockfile, `npx --no` blocks the husky pre-commit hook from auto-downloading
  packages (SEC-024), and the audit-readiness workflow uses `--body-file` so
  shell-interpolation cannot smuggle code into a job that opens GitHub
  issues (SEC-023). A full upstream compromise of `next-auth`, `@neondatabase/
  serverless`, or `next` itself is out of scope (see below).

## Assets

What we are actually protecting, in roughly descending order of "how bad if
this is breached".

| Asset | Where it lives | Why it matters |
|---|---|---|
| `AUTH_SECRET` | Vercel env var | Compromise = forge any session JWT = take over any account. Never logged, never echoed to the client, never written to `save_audit`. |
| `AUTH_GOOGLE_SECRET` | Vercel env var | Compromise = impersonate the OAuth client = redirect any Google sign-in to the attacker's callback. Same handling as `AUTH_SECRET`. |
| `DATABASE_URL` (and the unpooled variant) | Vercel env var + GitHub Actions secret | Compromise = direct read/write on Postgres = bypass every application-layer guard. |
| Player save rows (`spacepotatis.save_games`) | Postgres | Months of player progression; recovering from a wipe requires the audit log + db-backups, both of which are best-effort. |
| Leaderboard integrity (`spacepotatis.leaderboard`) | Postgres | The visible artifact of the game — a takeover trashes player trust. |
| `save_audit` rows (`spacepotatis.save_audit`) | Postgres | Forensic record, contains IP addresses (PII) and pre-validation request bodies. |
| `db-backups/` (gitignored) | Local filesystem of whoever ran a recovery script | Recovery snapshots written by `writeBackup()` before any destructive operation. |
| OAuth tokens | NextAuth JWT cookie | Compromise = single-account takeover. Encrypted via `AUTH_SECRET`. |
| Player handles and emails | Postgres | Handles are public (rendered on the leaderboard); emails are not — they should never appear in client-visible responses, and PR-merged code has been audited to log player UUIDs instead of emails on rejection paths (SEC-005). |

## Defenses by layer

Defenses are layered so a single bypass does not collapse the whole stack.
Removing one layer is a regression.

### Transport

- HTTPS only on the deployed instance (Vercel default).
- HSTS is set by Vercel's edge.
- `__Secure-` / `__Host-` cookie prefixes on the NextAuth session cookies
  pin them to HTTPS and block subdomain leakage.

### Auth

- Single provider: Google OAuth via NextAuth v5. No password store, no email
  provider, no credentials provider — no brute-force surface.
- JWT sessions; the JWT is encrypted with `AUTH_SECRET` and stored in an
  `httpOnly` cookie.
- The `signIn` callback rejects when the OAuth profile reports
  `email_verified === false` (SEC-019, defense-in-depth — Google's consumer
  flow already blocks unverified emails upstream).
- `trustHost: true` is documented as relying on Vercel's host-header
  sanitization plus the Google Console redirect-URI allow-list. Pinning
  `AUTH_URL` in the Vercel env vars is the canonical fix (SEC-012).

### Authorization

- No role model — every authenticated user has identical access. The only
  privilege boundary is "authenticated vs anonymous" plus per-row ownership.
- All authenticated routes derive `playerId` from `session.user.email` via
  `upsertPlayerId(email, ...)` in `src/lib/players.ts`. There are no
  path-param IDs, so a session cannot read or write rows belonging to a
  different account.
- The localStorage save queue stamps every pending save with `playerEmail`
  and refuses to flush a snapshot whose stamp does not match the currently
  signed-in account (`src/game/state/saveQueue.ts`). Pre-stamp `:v1` blobs
  are silently purged on read.

### Input validation

- Every POST route parses its body via a Zod schema in `src/lib/schemas/`
  before any DB I/O.
- The mission-id, augment-id, weapon-id, and solar-system-id literal unions
  are mirrored at runtime by `*_IDS` constants and `*Schema` enums; the
  `as const satisfies readonly <Id>[]` clause makes drift a compile error.
- Schemas are bounded (`.max(50)` on `WeaponInventory`, `.max(200)` on
  `seenStoryEntries`, etc. — SEC-011, SEC-016, SEC-022) so an attacker
  cannot blow up server memory or amplify into the audit table by sending
  arbitrarily long arrays.

### Cheat guards (server-side)

- `validateMissionGraph` — every entry in `completedMissions` has its
  `requires` chain transitively grounded.
- `validateNoRegression` — three monotonic fields (`completedMissions`,
  `unlockedPlanets`, `playedTimeSeconds`) cannot shrink. This is the wipe
  defense.
- `validatePlaytimeDelta` — playtime growth is bounded by wall-clock
  elapsed since the last `updated_at`.
- `validateCreditsDelta` — credit growth is bounded by per-player
  progression-aware caps. The cap inputs are derived from
  `prevRow.completed_missions` (SEC-017's `deriveCapInputMissions`), never
  from the request body's `completedMissions` alone — an attacker cannot
  bootstrap a higher cap inside the same request that requests inflated
  credits.
- The four validators run inside a single transaction with `FOR UPDATE` on
  the prev row (SEC-013). A concurrent POST blocks until the first
  transaction commits, eliminating the TOCTOU stale-baseline race.

### Database constraints

- All tables live under the `spacepotatis` Postgres schema. Cross-service
  writes to `public.*` are forbidden (CLAUDE.md §5).
- Foreign keys with `ON DELETE CASCADE` make `DELETE FROM
  spacepotatis.players WHERE id = $1` a clean GDPR right-to-erasure
  primitive (SEC-010).
- All queries go through Kysely's typed query builder. No `Kysely<any>`,
  no `sql.lit(string)`, no string-concatenated SQL. Parameterized
  bindings everywhere.

### Operational guard rails

- Direct DB writes from `scripts/` go through `scripts/_lib/dbWriteSafety.mjs`:
  `parseFlags` (dry-run by default), `requireConfirm` (gate), `writeBackup`
  (snapshot to `db-backups/` before the destructive op).
- Every POST `/api/save` writes a `save_audit` row capturing the request
  payload (capped at 64 KB — SEC-011), prev snapshot, response status,
  request IP, and user agent. Audit failures never block the save.
- GitHub Actions are pinned to commit SHAs (SEC-015); workflows declare
  minimum permissions (SEC-029); the husky pre-commit hook uses `npx --no`
  to block auto-download (SEC-024).

### Security headers

- CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and a locked-down `Permissions-Policy`
  (SEC-001). The CSP keeps `'unsafe-inline'` on `script-src` / `style-src`
  for now — Next.js inline-scripts at runtime — and is documented for a
  future nonce-based hardening pass.

## Out of scope

Threats we do **not** defend against, with the trade-off named.

- **Physical access to the player's machine.** If an attacker has shell
  access on the player's computer, every cookie defense is moot. We do
  not encrypt local state.
- **Targeted attacks on the operator's developer machine.** If an
  attacker has shell access on the maintainer's laptop, they have
  `DATABASE_URL` and `AUTH_SECRET`. We do not defend against developer-
  endpoint compromise; standard developer hygiene (FDE, OS patches,
  password manager) is assumed.
- **Nation-state-level supply-chain attacks** on `next`, `next-auth`,
  `@neondatabase/serverless`, or `kysely`. These are too large a surface
  to audit in-house. We mitigate with Dependabot + a committed lockfile
  and trust the upstream maintainers for the rest.
- **Full-day Vercel or Neon platform outages.** When the platform is
  down, the application is down. The save queue tolerates short outages;
  we do not promise availability during long ones.
- **Sustained L7 / L4 floods.** The Vercel platform absorbs platform-
  level floods; application-layer rate limiting (SEC-002) is an open
  finding awaiting a Vercel-KV / Upstash design. Until it ships, a sustained
  burst can drain the Vercel function budget.
- **Phishing.** A user who hands their Google credentials to an
  attacker has voluntarily surrendered the only auth factor we have.
  This is a Google-side problem (Google offers 2FA; we cannot enforce it
  on consumer accounts).
- **Browser-extension XSS / DOM-clobbering by an extension** the user
  has chosen to install. Browser-extension privilege defeats every
  in-page defense by design.
- **Side-channel attacks against Edge runtime** (e.g. timing attacks
  against the OAuth state cookie). NextAuth's internals do
  constant-time comparisons where it matters; we trust the framework.
- **Recovery from `db-backups/` loss.** If the operator's local disk
  is lost between a destructive script run and the next confirmation,
  the `writeBackup()` snapshot is gone too. The defense is "do not
  run destructive scripts on a host whose disk you do not trust";
  this is documented in CLAUDE.md §15 rather than enforced in code.

## Pointer to invariants

The non-negotiable security rules — the ones whose code path a future PR
must not weaken — are listed in [`invariants.md`](invariants.md).

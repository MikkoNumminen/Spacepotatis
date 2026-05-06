# Phase 2b — Maximum-attack pen-test battery

**Date:** 2026-05-04 / 2026-05-05
**Method:** 10 parallel adversarial agent cells, each scoped to a specific attack class. All read-only. All cited `path:line` for every claim.

This artifact augments [02-findings-and-plan.md](02-findings-and-plan.md) with findings the broad Phase 1 sweep missed. The original SEC-001 through SEC-010 stand; the cells confirmed five of them (SEC-002 rate-limit, SEC-003 leaderboard cast, SEC-004 error reflection, SEC-005 PII log, SEC-009 trustHost) and added 22 new findings — the most significant of which sharpens SEC-009 to medium (Cell 1) and surfaces a new medium-severity DoS amplifier (Cell 7).

## Cell-by-cell verdict

| Cell | Topic | New criticals | New mediums | New lows | New info | Confirmed-safe |
|---|---|---|---|---|---|---|
| 1 | OAuth / auth flow | 0 | 1 | 2 | 0 | OAuth state/PKCE, JWT encryption, `useReliableSession`/`useOptimisticAuth`, no middleware bypass |
| 2 | Save-game tampering | 0 | 1 | 1 | 1 | Cross-account save writes, mission-graph bypass, playtime inflation, saveQueue v1→v2 cross-account leak |
| 3 | Leaderboard manipulation | 0 | 1 | 1 | 0 | Mission-completion check (server-side), IDOR, XSS in render, scoreQueue queue tampering |
| 4 | Race conditions / TOCTOU | 0 | (overlap with Cell 2) | 2 | 0 | PR #100 saveQueue cross-account closure, recordAudit failure-mode, StrictMode double-load |
| 5 | XSS / proto pollution | 0 | 0 | 0 | 0 | Zero `dangerouslySetInnerHTML`, zero `innerHTML=`, zero `eval`, zero `postMessage`, no proto-pollution path, handle/playerName fully escaped |
| 6 | DB / SQLi / migration safety | 0 | 0 | 1 | 0 | All Kysely queries parameterized, all `sql\`\`` templates constant, all migrations safely additive |
| 7 | DoS / resource exhaustion | 0 | 2 | 1 | 0 | No ReDoS regexes, no JSON parse DoS path beyond Vercel body-size limit |
| 8 | CI / supply chain | 0 | 1 | 2 | 2 | No fork-PR secret exposure today, no dependency-confusion risk, secret scoping disciplined |
| 9 | Timing / side channels | 0 | 0 | 1 | 2 | No constant-time-comparison gaps, no JWT algo confusion (JWE), `recordAudit` non-differential |
| 10 | Secrets / client bundle | 0 | 0 | 1 | 0 | Zero `process.env` reads in client code, source maps off in prod, no commits of `.env`/credentials in git history |

**Bottom line:** **no critical, no high.** Three new mediums sharpen the original plan; one (SEC-AUTH-1, AUTH_URL pinning) elevates SEC-009 from informational to medium. The dominant new attack surface is **resource exhaustion via the audit-table** (Cell 7) — closing it removes a meaningful Neon-storage DoS amplifier.

## New findings (deduped, severity-ordered)

The 22 net-new findings below augment the original SEC-001..SEC-010 plan. New IDs continue the SEC-XXX numbering. Where a cell's finding duplicates an existing SEC-ID, this document cross-references rather than re-creating the entry.

### MEDIUM (6 new)

#### SEC-011 — `seenStoryEntries` unbounded → audit-table storage DoS (Cell 7)

- **Severity:** medium (authenticated DoS amplifier; would be high without the implicit bound of a single attacker's request rate; Cell 7 rated high but the audit's severity rubric reserves "high" for authenticated exploits with significant impact like IDOR — DoS amplifier is medium per the rubric)
- **Location:** [src/lib/schemas/save.ts:383](../../src/lib/schemas/save.ts#L383); [src/lib/schemas/save.ts:422](../../src/lib/schemas/save.ts#L422); audit insert at [src/app/api/save/route.ts:128](../../src/app/api/save/route.ts#L128) and [src/app/api/save/route.ts:149-158](../../src/app/api/save/route.ts#L149-L158); column at [db/migrations/20260503000000_add_save_audit.sql:26](../../db/migrations/20260503000000_add_save_audit.sql#L26)
- **What's wrong:** `z.array(z.string()).optional()` on `seenStoryEntries` has no `.max()` and no per-string `.max()`. Also: the `save_audit.request_payload JSONB` column stores the *pre-validation* request body verbatim. An authenticated attacker can POST a 4 MB request body (Vercel default body limit) populated with a giant `seenStoryEntries`, and each request writes ≈4 MB to `save_audit` even on validation failure (because the audit row is written from `requestPayload` at line 128 BEFORE the validators run). With no rate limit (SEC-002), the attacker fills Neon's storage budget at 4 MB × request-rate.
- **Attack scenario:**
  1. Authenticated attacker (any signed-in player) loops `fetch("/api/save", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({...validShape, seenStoryEntries: Array(10000).fill("x".repeat(400))})})`.
  2. Each call writes ≈4 MB into `spacepotatis.save_audit.request_payload`.
  3. At 100 req/sec, ~400 MB/sec into Neon. Free-tier 512 MB cap saturates in ~1.3 seconds; Hobby tier (3 GB) in ~7.5 seconds.
- **Impact:** Neon storage exhaustion; subsequent legitimate saves fail with disk-full errors; cleanup requires manual `DELETE` against the audit table.
- **Likelihood:** medium. Trivial to script; bounded only by SEC-002 rate-limit (not yet implemented).
- **Recommended fix:** **two layers**.
  1. Cap `seenStoryEntries` at the schema: `z.array(z.string().max(64)).max(200).optional()` (200 entries × 64 chars = 12.8 KB max in the array; story IDs today are short). At [src/lib/schemas/save.ts:383](../../src/lib/schemas/save.ts#L383) and [src/lib/schemas/save.ts:422](../../src/lib/schemas/save.ts#L422).
  2. In `recordAudit` / `writeSaveAudit`, cap the stored `request_payload` size: if `JSON.stringify(requestPayload).length > 64 * 1024`, store `{truncated: true, size: <length>}` instead of the full body. The audit's purpose is forensic — a 64 KB cap is generous for legitimate saves and forecloses the amplification.
- **Save-pipeline scrutiny:** Phase 3 must run `/save-roundtrip-audit` before this fix lands.
- **Verification:** unit test in `tests/security/auditAmplification.test.ts`: POST a 4 MB body, assert audit row's `request_payload` is the truncation marker, not the full body.
- **Dependencies:** SEC-002 (rate limit) reduces blast radius; both fixes desirable.
- **Status:** fixed — pending-sha; PR feat/security-sec-013-011-save-route-hardening; layer (1) caps `seenStoryEntries` at 200 entries × 64 chars on both `SavePayloadSchema` and `RemoteSaveSchema`; layer (2) `writeSaveAudit` truncates `request_payload` to `{truncated: true, size: <n>}` when `JSON.stringify(payload).length > 64 KB` (also handles unserializable payloads with `{truncated: true, reason: "unserializable"}`). Regression test [tests/security/auditAmplification.test.ts](../../tests/security/auditAmplification.test.ts) covers both layers — 7 tests including the worst-case 10000×400-char attack body and the boundary cases for the schema cap.

#### SEC-012 — `AUTH_URL` not pinned; `trustHost: true` falls back to `x-forwarded-host` (Cell 1)

- **Severity:** medium (sharpens SEC-009 from informational)
- **Location:** [src/lib/auth.ts:12](../../src/lib/auth.ts#L12); fallback path in `node_modules/@auth/core/src/lib/utils/env.ts:94-101`
- **What's wrong:** No `AUTH_URL` env var is set; `trustHost: true` causes `@auth/core`'s `createActionURL` to construct callback URLs from the request's `Host` / `X-Forwarded-Host` headers. Today this is bounded by Google's strict redirect-URI validation in the OAuth Console (the only registered redirect is the canonical Vercel URL). However the in-codebase posture is "trust whatever upstream says" — a misconfigured proxy, a future non-Vercel deploy, or a Google Console wildcard would expose it.
- **Attack scenario:** today, blocked by Google's URI pinning. If the deploy migrates to a less-strict edge (Cloudflare Workers, self-hosted Node) without re-pinning Google's URI: attacker spoofs `Host: attacker.com`, OAuth callback redirects to `attacker.com/api/auth/callback/google`, the OAuth state cookie is set and read back from `attacker.com`, attacker captures the auth code, exchanges it themselves.
- **Impact:** none today. Account takeover if the upstream guard ever loosens.
- **Likelihood:** zero on Vercel + Google's current Console config. Non-zero with any change to either.
- **Recommended fix:** Set `AUTH_URL` in Vercel env vars to the canonical production URL (`https://spacepotatis.app`). Add a `// SECURITY-CRITICAL:` comment at [src/lib/auth.ts:12](../../src/lib/auth.ts#L12) noting the dependency on the AUTH_URL pin + the Google Console redirect-URI registration.
- **Phase 3 model:** Opus (auth surface).
- **Verification:** confirm `AUTH_URL` is set in Vercel env, sign-in still works on production after deploy.
- **Dependencies:** supersedes SEC-009 (mark SEC-009 as merged into SEC-012).
- **Status:** fixed — codebase doc-only fix landed in `feat/security-sec-012-auth-url-pin` (SECURITY-CRITICAL comment block at [src/lib/auth.ts](../../src/lib/auth.ts) + regression test [src/lib/authUrlPin.test.ts](../../src/lib/authUrlPin.test.ts)). Operator action (set `AUTH_URL` in Vercel env vars; verify Google Console allow-list has only canonical URL) tracked in the PR body checklist — must be completed out-of-band before this finding is fully closed.

#### SEC-013 — TOCTOU on `prevRow` SELECT in `POST /api/save` (Cells 2 + 4)

- **Severity:** medium (Cell 4 rated high; demoted to medium since "attacker" here is the same player using two tabs / a malicious local script — same-account state corruption, not cross-account exploit. Severity rubric reserves "high" for authenticated cross-account / privilege-escalation impact.)
- **Location:** [src/app/api/save/route.ts:188-206](../../src/app/api/save/route.ts#L188-L206) (the bare `prevRow` SELECT); [src/app/api/save/route.ts:288](../../src/app/api/save/route.ts#L288) (`validateNoRegression` reads `prevForRegression` derived from the SELECT); [src/app/api/save/route.ts:370-398](../../src/app/api/save/route.ts#L370-L398) (the upsert `ON CONFLICT DO UPDATE`)
- **What's wrong:** The `prevRow` SELECT and the upsert are not wrapped in a transaction. Two concurrent POSTs from the same player (two browser tabs, multi-tab race, an attacker scripting two parallel `fetch` calls) both read the same `prevRow` baseline. Each computes its delta against the same `prev`. Postgres serializes the upsert at the row level — last-write-wins — but the application-layer regression and credit-cap guards both passed against the stale baseline. Tab A advances `completedMissions` legitimately; Tab B (with the OLD `completedMissions`) overwrites Tab A's richer state because Tab B's `prevRow` was the pre-Tab-A snapshot.
- **Attack scenario:** see Cell 4's report (numbered steps).
- **Impact:** same-account save data corruption. The "regression-shaped" overwrite is exactly the 2026-05-02-wipe-class incident the existing `validateNoRegression` was meant to prevent — the validator works fine in single-request flow but is bypassed by stale-baseline TOCTOU.
- **Likelihood:** medium. Multi-tab is a common user behavior (the game already accommodates it via the `useCloudSaveSync` hook); a malicious local script is trivial; an honest user double-clicking a save trigger could see this.
- **Recommended fix:** wrap the read+validate+write in a `BEGIN; SELECT ... FOR UPDATE; <validators>; UPSERT; COMMIT;` transaction. Kysely supports transactions via `db.transaction().execute(async trx => {...})`. The `FOR UPDATE` row lock is held until the COMMIT, so a second concurrent POST blocks on the lock and re-reads the (now-Tab-A-updated) row when the lock releases.
- **Save-pipeline scrutiny:** Phase 3 must run `/save-roundtrip-audit` before this fix lands.
- **Phase 3 model:** Opus (save-pipeline scrutiny).
- **Verification:** integration test in `tests/security/saveRace.test.ts`: dispatch two concurrent POST `/api/save` against a test DB with same player, with the second POST's payload carrying the OLD `completedMissions`. Assert the second is rejected by `validateNoRegression` rather than committing.
- **Dependencies:** none.
- **Status:** fixed — 6ebce98; PR feat/security-sec-013-011-save-route-hardening; prev-row SELECT + validators + upsert wrapped in `db.transaction().execute(async trx => { ... .forUpdate() ... })`. Regression test [tests/security/saveRace.test.ts](../../tests/security/saveRace.test.ts) asserts the transaction is opened, `.forUpdate()` is called on the prev-row SELECT, and a stale-baseline POST after a richer save commit is rejected by `validateNoRegression`.

#### SEC-014 — `score` field unbounded in `ScorePayloadSchema` (Cell 3) **Status:** fixed — d51c2a5

- **Severity:** medium (leaderboard-integrity violation; trivial exploit by any authed player)
- **Location:** [src/lib/schemas/save.ts:459-463](../../src/lib/schemas/save.ts#L459-L463); column at [db/migrations/20260424120000_initial_schema.sql:34](../../db/migrations/20260424120000_initial_schema.sql#L34)
- **What's wrong:** `ScorePayloadSchema` defines `score: z.number().int()` with no `max()`. The DB column is `INTEGER NOT NULL` (max `2,147,483,647`). Any authenticated player who has completed at least one mission can POST `{missionId:"tutorial", score:2147483647, timeSeconds:99}` and lock #1 on every leaderboard.
- **Attack scenario:** authenticated player completes any tutorial mission once (passes the server-side `mission_not_completed` check). POSTs `score: 2147483647` for that mission. Now first-place; the `time_seconds` is irrelevant to ranking (`ORDER BY lb.score DESC, lb.created_at DESC`). Repeats for every mission they have completed.
- **Impact:** complete leaderboard integrity breakdown.
- **Likelihood:** medium. Anyone with a console can do it.
- **Recommended fix:** add a per-mission max-score derivation function `maxLegitScore(missionId)` that computes `(total enemies in waves) * (max points per enemy) * (perfect-multiplier slack)` from `waves.json` + `enemies.json`. Reject scores > the cap with 422 `score_implausible`. Schema-level: also add `z.number().int().min(0).max(<global-cap>)` to the Zod payload (e.g. `max(10_000_000)` as a sanity check; the per-mission cap enforced server-side is the real guard).
- **Verification:** unit test in `tests/security/leaderboardScoreCap.test.ts`: POST `score: 2_147_483_647` for `combat-1`, assert 422.
- **Dependencies:** none. Independent of SEC-002 (rate limit) and SEC-003 (cache pollution).

#### SEC-015 — All `actions/*` GitHub Actions pinned to mutable `@v4` semver tags (Cell 8)

- **Severity:** medium (supply-chain hardening; mutable-tag exposure is the same class as the 2025 `tj-actions/changed-files` incident)
- **Location:** [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (`actions/checkout@v4`, `actions/setup-node@v4`); [.github/workflows/audit-readiness-check.yml](../../.github/workflows/audit-readiness-check.yml) (same actions)
- **What's wrong:** Three first-party `actions/*` actions are pinned to mutable `@v4` semver tags. A maintainer-account compromise (rare but happened in 2025) could push a new `v4` tag containing malicious code that runs in the next workflow run with full repo permissions.
- **Attack scenario:**
  1. Attacker compromises GitHub maintainer account or pushes a malicious tag-move to `actions/checkout`.
  2. Next push to this repo runs `actions/checkout@v4` which now resolves to the malicious code.
  3. Malicious code reads any secret in scope at the workflow level. For `audit-readiness-check.yml` that means `DATABASE_URL` (prod Neon connection) — exfiltrate to attacker server.
- **Impact:** prod database connection-string exfil → attacker reads/writes full prod data.
- **Likelihood:** low (depends on action maintainer compromise). Non-zero in practice.
- **Recommended fix:** pin every action to its full commit SHA, e.g. `actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11`. Add a `# v4.2.2` comment alongside so future bumps are deliberate. Apply to both workflows.
- **Verification:** `grep "uses:" .github/workflows/*.yml` shows only SHA-pinned actions.
- **Dependencies:** none.
- **Status:** fixed — pinned in `feat/security-sec-015-actions-sha-pin`; regression test at [src/__tests__/actionsShaPinning.test.ts](../../src/__tests__/actionsShaPinning.test.ts). SEC-028 (Dependabot) + SEC-029 (`permissions:` block) are separate Wave 5 tasks.

#### SEC-016 — `LegacyShipSchema` unbounded `record`/`array` fields (Cell 7)

- **Severity:** medium (Zod parse memory amplification; lower magnitude than SEC-011 because it's the legacy code path)
- **Location:** [src/lib/schemas/save.ts:313-317](../../src/lib/schemas/save.ts#L313-L317)
- **What's wrong:** `LegacyShipSchema` defines `unlockedWeapons: z.array(z.string()).optional()`, `weaponLevels: z.record(z.string(), z.number())`, `weaponAugments: z.record(z.string(), z.array(z.string()))` — none with `.max()` / key-count caps. The strict `ShipConfigSchema` is tried first (Zod union), but a hand-crafted body that defeats the strict branch falls through to legacy and the unbounded record/array creates a memory-amplification surface.
- **Attack scenario:** authenticated attacker POSTs a save with `weaponLevels` containing 100k keys; Zod union tries strict (fails), falls through to legacy, builds the full 100k-key record in memory before discovering downstream validation rejects.
- **Impact:** Edge worker memory burn (~100s of MB transient); not catastrophic but compounds with SEC-011.
- **Likelihood:** low (requires defeating the strict branch).
- **Recommended fix:** add `.max()` caps to all three fields. `unlockedWeapons: z.array(z.string()).max(50).optional()`, `weaponLevels: z.record(z.string(), z.number()).superRefine((rec, ctx) => Object.keys(rec).length <= 50 || ctx.addIssue(...))` (Zod 4 records use `.superRefine` for size; the exact pattern depends on the Zod version). Or: deprecate the legacy schema entirely if no live save format depends on it; an equivalent `.refine(() => false)` collapses it.
- **Verification:** unit test in `tests/security/legacyShipSchema.test.ts`: parse a 100k-key `weaponLevels`, assert validation failure.
- **Dependencies:** SEC-011 (similar fix shape).
- **Status:** fixed — 4aafede; `unlockedWeapons` capped at `.max(50)`; `weaponLevels` and `weaponAugments` capped at 50 keys via `.superRefine` with `code: "custom"` (Zod 4 does not allow `too_big` without `origin`). Regression test `tests/security/legacyShipSchema.test.ts` — 8 tests covering all three fields and the 100k-key DoS scenario.

### LOW (11 new)

#### SEC-017 — Credit-cap input is the user-submitted `completedMissions`, not server snapshot (Cell 2)

- **Severity:** low (today's content has no zero-prereq mission past tutorial; the design-circularity is a future-rake)
- **Location:** [src/lib/saveValidation.ts:143-147](../../src/lib/saveValidation.ts#L143-L147) (`computeCreditCapsForPlayer(completedMissions)` — the request body's list)
- **What's wrong:** `validateMissionGraph` runs first and ensures `completedMissions` is consistent with the unlock graph; but the cap derivation then uses the *post-graph-validation* `completedMissions` (the user-supplied list). If a future PR adds a mission with `requires: []`, an attacker can submit it as completed in the same POST that requests inflated credits, expanding their cap on the same request.
- **Recommended fix:** derive caps from `prevRow.completed_missions` (the server-side stored list) PLUS any newly-listed missions whose preconditions are entirely satisfied by `prevRow`. I.e. caps grow only by missions whose unlock chain is already grounded in the previously-stored row. Today's content makes this a no-op; the future-proofing is the value.
- **Phase 3 model:** Opus (save-pipeline scrutiny).
- **Save-pipeline scrutiny:** Phase 3 must run `/save-roundtrip-audit`.
- **Verification:** unit test in `tests/security/creditCapCircular.test.ts` constructing the future scenario.
- **Dependencies:** SEC-013 (the FOR UPDATE transaction also helps here by holding the prevRow stable).
- **Status:** fixed — staged; new `deriveCapInputMissions(prev, submitted)` helper in `src/lib/saveValidation.ts` derives the cap-input list from `prevRow.completed_missions` (FOR-UPDATE-locked) and grows only by submitted missions whose `requires` are entirely grounded in the trusted set. `src/app/api/save/route.ts` calls the helper before `computeCreditCapsForPlayer`. Regression test `tests/security/creditCapCircular.test.ts` (10 tests). Today's content is no-op for legitimate saves.

#### SEC-018 — `upsertPlayerId` SELECT-then-INSERT race (Cells 1 + 4)

- **Severity:** low (correctness/UX bug, not a security exploit; 500 on first concurrent sign-in)
- **Location:** [src/lib/players.ts:7-19](../../src/lib/players.ts#L7-L19)
- **What's wrong:** Two concurrent first-visit requests for a brand-new email both SELECT (miss), both INSERT, second hits unique violation, propagates as 500.
- **Recommended fix:** rewrite as `INSERT INTO ... ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id;` (single round-trip; Postgres serializes via the unique index).
- **Verification:** integration test with two concurrent calls.
- **Dependencies:** none.
- **Status:** fixed — ab772ea; PR feat/security-sec-018-upsert-player-race; `upsertPlayerId` collapsed to single `INSERT ... ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id` — no SELECT issued. Regression tests in `tests/security/upsertPlayerRace.test.ts` (race scenario + repeat scenario) and updated `src/lib/players.test.ts` to match new contract. Bonus: one fewer DB round-trip per sign-in.

#### SEC-019 — `email_verified` not checked in JWT callback (Cell 1)

- **Severity:** low (Google enforces `email_verified: true` for consumer accounts; defense-in-depth)
- **Location:** [src/lib/auth.ts:21-24](../../src/lib/auth.ts#L21-L24)
- **What's wrong:** the `jwt` callback writes `profile?.email` into the token without checking `profile?.email_verified`. Edge cases (Workspace trial accounts) can present an unverified email; today blocked by Google upstream.
- **Recommended fix:** `if (profile && profile.email_verified === false) return token;` — throw or skip; the user is rejected from sign-in.
- **Phase 3 model:** Opus (auth surface).
- **Verification:** unit test mocks the OAuth profile with `email_verified: false`, asserts sign-in fails.
- **Dependencies:** none.
- **Status:** fixed — pending-sha; PR feat/security-sec-019-email-verified-check; rejection placed in NextAuth's `signIn` callback (canonical reject hook — `signIn` returning `false` redirects to the error page instead of issuing a JWT; the `jwt` callback cannot cleanly reject) backed by a pure helper `isEmailVerifiedAcceptable(profile)` exported from [src/lib/authEmailVerified.ts](../../src/lib/authEmailVerified.ts) (split out of `auth.ts` so the regression test imports the helper without dragging in the NextAuth runtime — `next-auth` pulls `next/server` at module load which breaks under vitest's node env). Helper rejects strict `email_verified === false` only; missing/null/undefined claims fall through to allow (matches Google consumer contract; preserves provider-agnostic posture). Regression test [tests/security/emailVerified.test.ts](../../tests/security/emailVerified.test.ts) — 6 tests covering the strict-false reject, the verified-true accept, the omitted/null/undefined fall-through, and the dangerous "email looks legit + verified false" combo.

#### SEC-020 — Validator error-code ordering exposes guard-pass/fail structure (Cell 9)

- **Severity:** low (information disclosure of guard ordering)
- **Location:** [src/app/api/save/route.ts:245-359](../../src/app/api/save/route.ts#L245-L359)
- **What's wrong:** four validator error codes (`mission_graph_invalid`, `save_regression`, `playtime_delta_invalid`, `credits_delta_invalid`) leak which guard rejected. A scripted attacker can binary-search the cap or the regression baseline by which code returns first.
- **Recommended fix:** collapse the four 422 codes to `save_rejected` in the response body; keep the specific code in `console.warn` + `save_audit.response_error`. Exception: `save_regression` MUST remain client-visible because [src/game/state/syncCache.ts](../../src/game/state/syncCache.ts) treats it as TRANSIENT for the queue's retry logic.
- **Save-pipeline scrutiny:** Phase 3 must run `/save-roundtrip-audit`.
- **Verification:** unit test in `tests/security/validatorOpaqueCode.test.ts`: trigger each rejection class, assert response body is `{error: "save_rejected"}` (or `save_regression`), no per-validator code leaked.
- **Dependencies:** none.
- **Status:** fixed — a44782c; deviation: `isPermanent()` in `saveQueue.ts` updated to add `save_rejected` to the TRANSIENT list (the spec mentioned only `syncCache.ts` but `saveQueue.ts` is the actual retry-logic home; `playtime_delta_invalid`/`credits_delta_invalid` were TRANSIENT and their collapsed form must remain so).

#### SEC-021 — `improve-restore.mjs` missing transaction wrapper (Cells 6 + 4)

- **Severity:** low (operator-only; concurrent-with-restore-player race is the only real risk)
- **Location:** [scripts/improve-restore.mjs](../../scripts/improve-restore.mjs)
- **What's wrong:** SELECT and UPDATE are not wrapped in `BEGIN/FOR UPDATE/COMMIT`. A concurrent `restore-player.mjs --apply` can race the read-then-write window.
- **Recommended fix:** wrap in a Kysely transaction with `FOR UPDATE` row lock, mirroring `restore-player.mjs`'s pattern. Pairs naturally with SEC-007's harness retrofit.
- **Verification:** code review; no automated test.
- **Dependencies:** SEC-007 (same script).
- **Status:** fixed — commit af562f8, PR feat/security-sec-007-021-improve-restore-harness; BEGIN/FOR UPDATE/COMMIT wrapper added, regression test `scripts/improveRestoreHarness.test.mjs` covers transaction presence.

#### SEC-022 — `WeaponInventorySchema` no `.max()` (Cell 7)

- **Severity:** low (each element is well-validated; only array length is unbounded)
- **Location:** [src/lib/schemas/save.ts:190](../../src/lib/schemas/save.ts#L190)
- **What's wrong:** `z.array(WeaponInstanceSchema)` accepts arbitrary array length. Each element validates, but a 1000-element array is parseable.
- **Recommended fix:** `z.array(WeaponInstanceSchema).max(50)` (current shop balance: ~10 weapons; 50 is generous).
- **Verification:** unit test parses array of length 51, asserts failure.
- **Dependencies:** SEC-011 (same fix shape).
- **Status:** fixed — 0dcf615; `WeaponInventorySchema` now `.max(50)`. Regression test `tests/security/weaponInventoryCap.test.ts` — 4 tests (51 rejected, 50 accepted, empty accepted, single-element accepted).

#### SEC-023 — Shell-interpolation in `audit-readiness-check.yml` issue body (Cell 8)

- **Severity:** low (no current user-controlled content reaches the report file; future-rake)
- **Location:** [.github/workflows/audit-readiness-check.yml:106](../../.github/workflows/audit-readiness-check.yml#L106)
- **What's wrong:** `body="${body//REPORT_PLACEHOLDER/$report}"` shell-interpolates the readiness-report file content. If a future query result includes shell metacharacters (e.g. a player email containing `$(cmd)`), the runner executes the embedded command.
- **Recommended fix:** pass the report via `--body-file /tmp/readiness.txt` to `gh issue create`. No shell interpolation.
- **Verification:** code review; manual sanity-check by triggering the workflow.
- **Dependencies:** none.
- **Status:** fixed — 9fce81f; body assembled via heredoc concatenation + `cat >> /tmp/issue-body.txt`, passed to `gh issue create --body-file`; no shell interpolation of report content. Regression test [tests/security/auditReadinessYml.test.ts](../../tests/security/auditReadinessYml.test.ts).

#### SEC-024 — `npx lint-staged` in `.husky/pre-commit` without `--no` (Cell 8)

- **Severity:** low (developer-machine surface; depends on local cache freshness)
- **Location:** [.husky/pre-commit:2](../../.husky/pre-commit#L2)
- **What's wrong:** `npx lint-staged` may fetch a fresh copy from npm if the local cache is cold. A supply-chain compromise of `lint-staged` would execute on every developer's `git commit`.
- **Recommended fix:** `npx --no lint-staged` (refuses to download if not locally installed) or `./node_modules/.bin/lint-staged`.
- **Verification:** test that `git commit` still triggers lint-staged.
- **Dependencies:** none.
- **Status:** fixed — ca6ead0; `.husky/pre-commit` changed to `npx --no lint-staged`. Regression test [tests/security/preCommitHook.test.ts](../../tests/security/preCommitHook.test.ts).

#### SEC-025 — Full raw save-row JSON dumped to browser console on parse failure (Cell 10)

- **Severity:** low (PII to anyone with DevTools — the player's own data; not cross-user)
- **Location:** [src/game/state/sync.ts:244-246](../../src/game/state/sync.ts#L244-L246)
- **What's wrong:** `console.error("loadSave: schema rejected save row\nissues:", ..., "\nraw:", JSON.stringify(raw, null, 2))` dumps the full server response — credits, ship config, mission list — to the browser console. Anyone glancing at the player's screen with DevTools open sees their full state.
- **Recommended fix:** log the issues only; replace `\nraw:` block with `\n(raw payload omitted; see server-side logs by issue id <X>)`. Or: log a hash of the raw payload for correlation, not the payload itself.
- **Verification:** unit test mocks a parse failure, asserts `console.error` is not called with the full raw object.
- **Dependencies:** none.
- **Status:** fixed — f6cfe0a; PR #192 feat/security-sec-025-026-client-save-hygiene; `\nraw:` block removed from `console.error` call; only the Zod issues array is logged. Regression test [tests/security/saveLogPayload.test.ts](../../tests/security/saveLogPayload.test.ts) — 5 tests covering parse failure logs issues (not raw), no raw object passed, no PII field values in output.

#### SEC-026 — Save+leaderboard ordering race (Cell 4)

- **Severity:** low (transient retry storm; no data corruption)
- **Location:** [src/app/api/leaderboard/route.ts:62-86](../../src/app/api/leaderboard/route.ts#L62-L86); [src/game/state/scoreQueue.ts](../../src/game/state/scoreQueue.ts)
- **What's wrong:** if a leaderboard POST races ahead of the matching save POST, the mission-completion check sees pre-save state and returns 422 `mission_not_completed`. The scoreQueue treats 422 as transient and retries up to 50 times — eventually succeeds, but with multi-second visibility delay.
- **Recommended fix:** in [src/components/hooks/useCloudSaveSync*](../../src/components/hooks/), confirm save POST resolves before kicking off `drainScoreQueue()`. The convention exists in comments; enforce in code with an `await saveNow()` then `await drainScoreQueue()` chain.
- **Verification:** integration test simulating the race.
- **Dependencies:** none.
- **Status:** fixed — 45408ed; PR #192 feat/security-sec-025-026-client-save-hygiene; `void drainScoreQueue().then(...)` replaced with `await drainScoreQueue()` in `handleMissionComplete` in [src/components/GameCanvas.tsx](../../src/components/GameCanvas.tsx). Regression test [tests/security/saveScoreOrdering.test.ts](../../tests/security/saveScoreOrdering.test.ts) — 3 tests covering save-before-drain ordering, void-vs-await race documentation, and drain-result-before-status-update contract.

### INFORMATIONAL (5 new)

#### SEC-027 — `currentSolarSystemId` not validated against `unlockedSolarSystems` (Cell 2)

- **Location:** [src/app/api/save/route.ts:368-369](../../src/app/api/save/route.ts#L368-L369)
- **What's wrong:** the schema enum allows any valid system id; the server doesn't check the player has unlocked it.
- **Impact:** UI cosmetic — galaxy view opens at a system the player technically can't enter. No progression bypass.
- **Fix:** add a check `unlockedSolarSystems.includes(currentSolarSystemId) ?? throw 422`.
- **Status:** fixed — pending-sha; branch feat/security-sec-027-solar-system-unlock-check. Check fires inside the SEC-013 transaction after the credits guard. Rejection follows the SEC-020 collapsed-code pattern: response body returns `{error: "save_rejected"}`; `save_audit.response_error` carries `"solar_system_not_unlocked"` for forensics. Existing `route.test.ts` updated to include `unlockedSolarSystems` alongside `currentSolarSystemId` (the test was testing field persistence, not the new guard). Regression tests in `tests/security/currentSolarSystemUnlock.test.ts` (5 tests).

#### SEC-028 — No `dependabot.yml` (Cell 8)

- **Location:** repo root
- **What's wrong:** zero automated dependency-update PRs; CVEs accumulate.
- **Fix:** add `.github/dependabot.yml` with `npm` ecosystem, weekly schedule, group security updates.
- **Status:** fixed — 2221345; `.github/dependabot.yml` added with weekly Monday schedule, minor+patch grouped into one PR, major bumps individual, limit 5 open PRs. Regression test [tests/security/dependabotConfig.test.ts](../../tests/security/dependabotConfig.test.ts).

#### SEC-029 — No explicit `permissions:` block in `ci.yml` (Cell 8)

- **Location:** [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- **What's wrong:** workflow inherits repo default `GITHUB_TOKEN` permissions (may be read-write on legacy repos).
- **Fix:** add `permissions: contents: read` at workflow level.
- **Status:** fixed — 9a83242; `ci.yml` gains `permissions: contents: read` at workflow level. `audit-readiness-check.yml` already had `permissions: contents: read / issues: write` (confirmed). Regression test [tests/security/workflowPermissions.test.ts](../../tests/security/workflowPermissions.test.ts).

#### SEC-030 — Leaderboard cache hit/miss fingerprints mission popularity (Cell 9)

- **Location:** [src/lib/leaderboard.ts:57-61](../../src/lib/leaderboard.ts#L57-L61)
- **What's wrong:** unauthenticated attacker can determine which missions have hot caches via response timing.
- **Fix:** mission popularity is not sensitive; risk-accept.

#### SEC-031 — Leaderboard POST response-time oracle for own mission completion (Cell 9)

- **Location:** [src/app/api/leaderboard/route.ts:67-86](../../src/app/api/leaderboard/route.ts#L67-L86)
- **What's wrong:** 422 (early return) vs 201 (full INSERT) latency differs by ~one DB RTT. Attacker can probe own mission completion via timing alone — but the client can already check this in GameState.
- **Fix:** risk-accept. No information disclosed beyond what the authenticated user already has.

#### SEC-032 — `timeSeconds` no minimum (Cell 3)

- **Location:** [src/lib/schemas/save.ts:462](../../src/lib/schemas/save.ts#L462)
- **What's wrong:** `timeSeconds = 0` passes `nonnegative()`. Cosmetic — not used for ranking. A leaderboard reader sees `0:00` as the "completion time."
- **Fix:** optional. `z.number().int().min(MIN_PLAUSIBLE_SECONDS)` per mission. Risk-accept reasonable; the signal is purely cosmetic.

## Re-prioritized remediation order

Updated table merging Phase 2 + Phase 2b (one column per finding; Wave grouping unchanged from 02 where possible). Key changes from the original 02 plan:

- **SEC-009** is superseded by **SEC-012** (medium, not informational) — handle in the same Wave 1 fix.
- **SEC-011** is the new highest-impact medium (DoS amplifier) — promote to Wave 1.
- **SEC-013** (TOCTOU `prevRow`) and **SEC-014** (unbounded score) are independent mediums — Wave 1.
- **SEC-015** (action-pinning) is Wave 1 (CI-only, parallelizable).
- **SEC-016, 017, 020, 022** are schema-tightening + validator-opacity work; Wave 2 (touches save route + saveValidation).
- **SEC-018, 019** are auth-surface low/info; Wave 4 (auth surface, Opus, sequential with SEC-008 next-auth bump).
- **SEC-021** pairs with **SEC-007** (same script).
- **SEC-023, 024, 025, 026, 027, 028, 029** are informational/low cleanups; Wave 5.
- **SEC-030, 031, 032** are risk-accept candidates; document in plan, do not fix.

Updated waves (parallelizability respected):

- **Wave 1 (parallel, separate worktrees):** SEC-001 (headers), SEC-003 (cast), SEC-007 + SEC-021 (improve-restore harness), SEC-011 (audit-table cap), SEC-012 (AUTH_URL pin, supersedes SEC-009), SEC-013 (FOR UPDATE), SEC-014 (score cap), SEC-015 (action SHA pinning).
- **Wave 2 (sequential, save-route region):** SEC-004 (error reflection) → SEC-005 (PII log) → SEC-016 (legacy schema caps) → SEC-017 (cap circularity fix) → SEC-020 (opaque validator codes) → SEC-022 (weapon array max).
- **Wave 3 (after A-001 design):** SEC-002 (rate limit) alone.
- **Wave 4 (sequential, auth surface, Opus):** SEC-018 (upsertPlayerId race) → SEC-019 (email_verified) → SEC-008 (next-auth bump).
- **Wave 5 (parallel, doc/CI/UX):** SEC-006 (audit retention doc), SEC-010 (GDPR runbook), SEC-023 (yml issue-body fix), SEC-024 (npx --no), SEC-025 (sync.ts log), SEC-026 (await ordering), SEC-027 (currentSolarSystemId check), SEC-028 (dependabot), SEC-029 (ci.yml permissions).
- **Risk-accept (no fix):** SEC-030, SEC-031, SEC-032.

## Severity tally — final

- Critical: 0
- High: 0
- Medium: **9** (SEC-001, SEC-002, SEC-003, SEC-011, SEC-012, SEC-013, SEC-014, SEC-015, SEC-016)
- Low: **15** (SEC-004, SEC-005, SEC-006, SEC-007, SEC-017, SEC-018, SEC-019, SEC-020, SEC-021, SEC-022, SEC-023, SEC-024, SEC-025, SEC-026, plus the merged SEC-009 → SEC-012)
- Informational: **8** (SEC-008, SEC-010, SEC-027, SEC-028, SEC-029, SEC-030, SEC-031, SEC-032)
- **Total tracked findings: 32 = 29 actionable + 3 risk-accept** (the risk-accept three sit inside the 8 informational; SEC-030, SEC-031, SEC-032 are documented and intentionally not scheduled for fix).

## Bottom line

The pen-test battery turned 10 candidate findings into 32. **No critical, no high.** The audit's posture is "many medium-class hardenings, no live exploit." The single most impactful fix is **SEC-011** (audit-table size cap) — it removes a ~minute-scale Neon-storage DoS vector with a 5-line schema change plus a `recordAudit` truncation.

The original Phase 2 ordering still holds; the new findings slot naturally into the Wave 1/2/4/5 structure. Phase 3 dispatches can begin once the user reviews this artifact and the open A/B decisions in [02-findings-and-plan.md](02-findings-and-plan.md).

## Open questions for the orchestrator

1. **Severity calibration on SEC-011 + SEC-013:** Cell 4 rated SEC-013 "high"; Cell 7 rated SEC-011 "high". I demoted both to medium per the rubric (no cross-account impact in either; the attacker is the player or their script). Confirm the demotion or escalate.
2. **Risk-accept findings SEC-030, SEC-031, SEC-032:** these are cosmetic / non-sensitive timing oracles. Confirm the risk-accept stance.
3. **SEC-026 (save+leaderboard ordering):** is this already tracked elsewhere as a UX bug? If yes, deduplicate; if not, Phase 3 ships a small ordering guarantee.
4. **Does the `audit-readiness-check.yml` ever return DB content with user-supplied strings into the issue body?** SEC-023 is currently "future-rake"; if today's reports include any `players.email` / `handle`, severity goes up.

## Next phase (do not start)

Phase 3 dispatches `security-fixer` per finding in the Wave order above. Wave 1 is 8 findings — runs in 8 parallel worktrees once the open decisions are answered.

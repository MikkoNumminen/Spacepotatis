# Security invariants

This document is the canonical list of non-negotiable security rules that the
codebase enforces. Each invariant has:

- The **rule** in one sentence — what must remain true.
- **Where** it is enforced (file with line range — line numbers drift across
  refactors, so the line range is a hint to where to look, not a contract).
- **Impact** — what breaks if the rule is violated.
- **Linked finding(s)** — the SEC-XXX entry that captured the bypass scenario.

A future PR that touches one of these surfaces must preserve the rule. A
"simplification" that removes the indirection IS the regression — see the
inline `// DO NOT INLINE:` markers in code for the canonical examples.

This document does NOT name bypass recipes; the threat model and the
finding artifacts under `docs/security/` cover that. Here we name the rule
and the impact only.

---

## Authentication and session

### INV-AUTH-1 — Sign-in rejects unverified OAuth emails

- **Rule:** the NextAuth `signIn` callback returns `false` whenever the OAuth
  profile reports `email_verified === false`.
- **Where:** `src/lib/auth.ts` (signIn callback, ~line 34) →
  `src/lib/authEmailVerified.ts:26` (`isEmailVerifiedAcceptable`).
- **Impact:** without it, a provider that emits unverified-email profiles
  would let an attacker bind any email to a session. Today's only provider
  (Google consumer) blocks unverified emails upstream — the rule is
  defense-in-depth and protects against a future provider / Workspace allow-
  list change. Returning `false` is the canonical NextAuth v5 reject path
  (redirects to the error page instead of issuing a JWT); refusing email
  inside `jwt`/`session` is NOT equivalent (the session still issues).
- **Findings:** SEC-019.

### INV-AUTH-2 — `AUTH_URL` is pinned in Vercel env vars

- **Rule:** `AUTH_URL` is set in the Vercel env vars (Production AND
  Preview) to the canonical production URL. This is an operator
  invariant, not a code one — the code path documents the requirement
  via a `SECURITY-CRITICAL` comment alongside `trustHost: true`.
- **Where:** `src/lib/auth.ts` (~line 13–25, `trustHost: true` and the
  comment block above it).
- **Impact:** without it, `@auth/core` falls back to the request
  `Host` / `X-Forwarded-Host` header for callback-URL construction. On
  Vercel today this is bounded by the platform's host-header sanitization
  + Google's OAuth Console redirect-URI allow-list, but a deploy migration
  off Vercel or a loosening of the Console allow-list flips this into an
  account-takeover-class issue.
- **Findings:** SEC-012 (supersedes SEC-009).

### INV-AUTH-3 — `upsertPlayerId` is the only path from session to DB rows

- **Rule:** every authenticated route resolves the row owner via
  `upsertPlayerId(session.user.email, ...)`. There are no path-param IDs
  in any route, so a session cannot read or write rows that belong to a
  different account.
- **Where:** `src/lib/players.ts:upsertPlayerId`; called from
  `src/app/api/save/route.ts` (GET + POST), `src/app/api/handle/route.ts`
  (GET + POST), `src/app/api/leaderboard/route.ts` (POST).
- **Impact:** without identity-derived row keying, an authenticated
  attacker could swap their `playerId` to read or overwrite another
  account.
- **Findings:** baseline of Phase 1 §3 (Authorization).

---

## Save POST — the critical path

### INV-SAVE-1 — The prev-row SELECT, validators, and upsert run inside a single transaction with `FOR UPDATE`

- **Rule:** in `POST /api/save` the prev-row SELECT, every validator
  (`validateMissionGraph`, `validateNoRegression`, `validatePlaytimeDelta`,
  `validateCreditsDelta`, the SEC-027 unlock check), and the upsert
  execute inside one `db.transaction().execute(async (trx) => { … })`,
  with `.forUpdate()` on the SELECT. The row lock is held until COMMIT.
- **Where:** `src/app/api/save/route.ts:250-494` (transaction body),
  with `.forUpdate()` at line 266.
- **Impact:** without the transaction, two tabs (or a malicious local
  script firing parallel POSTs) each read the same pre-write baseline,
  and one tab's stale `completedMissions` payload can overwrite the
  other tab's richer state because both passed `validateNoRegression`
  against the stale prev row. This is a TOCTOU stale-baseline overwrite.
- **Findings:** SEC-013.

### INV-SAVE-2 — Cheat-guard validators are pure and run server-side only

- **Rule:** `validateMissionGraph`, `validateNoRegression`,
  `validatePlaytimeDelta`, and `validateCreditsDelta` in
  `src/lib/saveValidation.ts` stay pure (no I/O, no module-level mutation
  of catalog data). They run inside the save POST transaction. The
  client never gates on them.
- **Where:** `src/lib/saveValidation.ts:303` (`validateMissionGraph`),
  `src/lib/saveValidation.ts:484` (`validateNoRegression`),
  `src/lib/saveValidation.ts:410` (`validatePlaytimeDelta`),
  `src/lib/saveValidation.ts:359` (`validateCreditsDelta`).
- **Impact:** if any of these guards is removed, weakened, or moved to
  the client, every cheat scenario in `docs/security/threat-model.md` §A4
  re-opens. The 2026-05-02 wipe was exactly this class of regression.
- **Findings:** baseline (predates the audit); reinforced by SEC-013,
  SEC-017, SEC-027.

### INV-SAVE-3 — `validateNoRegression` guards three monotonic fields and intentionally NOT credits

- **Rule:** `validateNoRegression` rejects any save where
  `completedMissions`, `unlockedPlanets`, or `playedTimeSeconds` shrinks
  relative to the FOR-UPDATE-locked prev row. Credits are intentionally
  NOT guarded — market spend is a legitimate down-delta.
- **Where:** `src/lib/saveValidation.ts:484-519`.
- **Impact:** removing the guard re-opens the 2026-05-02 wipe pattern
  (POSTing INITIAL_STATE on top of a real save). Adding credits to the
  guarded set would 422 every legitimate shop purchase. The asymmetry
  is load-bearing.
- **Findings:** baseline (predates the audit; the wipe is documented in
  CLAUDE.md §11 and §15).

### INV-SAVE-4 — Credit-cap input is derived from `prevRow.completed_missions`, not `body.completedMissions`

- **Rule:** `deriveCapInputMissions(prevRow.completed_missions,
  body.completedMissions)` is the input to `computeCreditCapsForPlayer`
  inside the transaction. The function only adds a submitted mission to
  the trusted set when ALL of its `requires` are already in the trusted
  set — the unlock chain must be grounded in the previously-stored row,
  not bootstrapped inside the same request.
- **Where:** `src/lib/saveValidation.ts:226` (`deriveCapInputMissions`);
  call site at `src/app/api/save/route.ts:397`.
- **Impact:** without this indirection, an attacker could submit a
  mission with `requires: []` in the same POST that requests inflated
  credits, and the cap would expand on the same request. Today's content
  has no such `requires: []` mission past `tutorial`, so the visible
  effect is zero — but the rake closure is the value, and the future-PR
  attack surface is real.
- **Findings:** SEC-017.

### INV-SAVE-5 — `currentSolarSystemId` must be in the submitted `unlockedSolarSystems` list

- **Rule:** the save POST rejects with `solar_system_not_unlocked`
  (422) when the submitted `currentSolarSystemId` is not in the
  submitted `unlockedSolarSystems`. Today this is a defense against
  shape-not-state mismatches; if `unlocked_solar_systems` ever gets
  persisted server-side, the check should switch to a server-derived
  trusted set (see `04-other-findings.md` SEC-027 follow-up).
- **Where:** `src/app/api/save/route.ts:431-450`.
- **Findings:** SEC-027.

### INV-SAVE-6 — `save_audit.request_payload` is capped at 64 KB before insert

- **Rule:** `writeSaveAudit` in `src/app/api/save/route.ts` JSON-
  serializes the request payload, and on overflow stores
  `{truncated: true, size: <n>}` instead of the original body.
- **Where:** `src/app/api/save/route.ts:74` (`AUDIT_PAYLOAD_BYTE_CAP`),
  ~line 106-116 (the truncation logic inside `writeSaveAudit`).
- **Impact:** without the cap, an authenticated attacker can POST a
  4 MB body and amplify it into 4 MB of Neon storage per request — a
  storage-DoS amplifier. The Zod schema's `.max()` caps on
  `seenStoryEntries` (SEC-011 layer 1) bound the parsed payload, but
  the audit row stores the *pre-validation* request body for forensics,
  so the byte cap is the second layer of defense.
- **Findings:** SEC-011.

### INV-SAVE-7 — Audit writes happen OUTSIDE the transaction; audit failure never blocks a save

- **Rule:** `writeSaveAudit` is called AFTER the transaction commits
  / rolls back. The `writeSaveAudit` body itself catches every error and
  logs it via `console.error` — it never re-throws.
- **Where:** `src/app/api/save/route.ts:88-136` (`writeSaveAudit`
  function); call sites after the transaction at lines ~500-551.
- **Impact:** without the outside-transaction placement, a Neon
  outage on `save_audit` could roll back the user-visible save —
  the audit is for diagnostics, not the critical path.
- **Findings:** SEC-013 (deviation note).

### INV-SAVE-8 — 422 rejection codes collapse to `save_rejected` in the client response, except `save_regression`

- **Rule:** in the 422 response body, the validator-specific error
  codes (`mission_graph_invalid`, `playtime_delta_invalid`,
  `credits_delta_invalid`, `solar_system_not_unlocked`) collapse to a
  single opaque `save_rejected`. The exception is `save_regression`,
  which stays distinct because `saveQueue.ts:isPermanent()` treats it
  as TRANSIENT.
- **Where:** `src/app/api/save/route.ts` (~line 526-527, the
  `clientError` derivation).
- **Impact:** keeping the specific code in the response body would
  expose the validator-ordering side-channel (an attacker can see
  which guard fires in which order). Collapsing `save_regression`
  alongside the others would break the saveQueue's TRANSIENT semantics
  and start dropping queued snapshots that should retry.
- **Findings:** SEC-020.

---

## Leaderboard POST and GET

### INV-LB-1 — Score POST rejects scores above the per-mission `maxLegitScore`

- **Rule:** the leaderboard POST handler computes
  `maxLegitScore(missionId)` from the catalog data and rejects scores
  above it with 422 `score_implausible`. The `ScorePayloadSchema` Zod
  cap (`SCORE_SANITY_CAP = 10_000_000`) is the first-layer defense for
  obviously-fabricated values; `maxLegitScore` is the per-mission cap.
- **Where:** `src/app/api/leaderboard/route.ts:60-63` (cap check);
  `src/lib/saveValidation.ts:558` (`maxLegitScore`);
  `src/lib/schemas/save.ts:501` (`SCORE_SANITY_CAP`),
  `src/lib/schemas/save.ts:505` (`.max(SCORE_SANITY_CAP)`).
- **Impact:** without the cap, an attacker can post `Number.MAX_SAFE_
  INTEGER` and take over the leaderboard.
- **Findings:** SEC-014.

### INV-LB-2 — Score POST rejects scores for missions not in the player's server-trusted `completed_missions`

- **Rule:** the leaderboard POST handler reads the player's
  `completed_missions` from `save_games` (server-trusted) and rejects
  with 422 `mission_not_completed` when the submitted `missionId` is
  not in the list.
- **Where:** `src/app/api/leaderboard/route.ts:74-93`.
- **Impact:** without this, an authenticated attacker can post scores
  for any mission, including ones they have not played.
- **Findings:** baseline of Phase 1 §3 (Authorization).

### INV-LB-3 — Mission-id query parameter parses through `MissionIdSchema`

- **Rule:** `GET /api/leaderboard` parses `?mission=` via
  `MissionIdSchema.safeParse` and rejects unknown ids with 400
  `invalid_mission`. There is no `as MissionId` cast at this surface.
- **Where:** `src/app/api/leaderboard/route.ts:23-26`.
- **Impact:** without the validation, any string becomes part of the
  `unstable_cache` key — an attacker spraying random `?mission=`
  values produces unbounded cache entries that all DB-miss, defeating
  the leaderboard cache and burning DB roundtrips.
- **Findings:** SEC-003.

---

## Schema boundary

### INV-SCHEMA-1 — Every API POST body parses through a Zod schema before any DB I/O

- **Rule:** `POST /api/save`, `POST /api/leaderboard`, and
  `POST /api/handle` each call `<Schema>.safeParse(raw)` BEFORE
  computing `playerId`, BEFORE any DB read, BEFORE any DB write. There
  are no `as` casts at the network edge for parsed bodies.
- **Where:** `src/app/api/save/route.ts:164` (`SavePayloadSchema`),
  `src/app/api/leaderboard/route.ts:51` (`ScorePayloadSchema`),
  `src/app/api/handle/route.ts` (`HandlePayloadSchema`).
- **Impact:** removing the parse re-opens every input-validation
  finding (SEC-011, SEC-014, SEC-016, SEC-022) and the structural
  drift between the TS types and the wire format would silently allow
  malformed payloads to land in Postgres jsonb.
- **Findings:** baseline; reinforced by SEC-011, SEC-014, SEC-016,
  SEC-022.

### INV-SCHEMA-2 — Every array field in the save schema has a `.max()` cap

- **Rule:** `seenStoryEntries` is bounded at 200×64 chars (SEC-011),
  `WeaponInventorySchema` at 50 elements (SEC-022), and the legacy
  ship snapshot's `unlockedWeapons` at 50, `weaponLevels` and
  `weaponAugments` at 50 keys via `superRefine` (SEC-016). Both
  `SavePayloadSchema` and `RemoteSaveSchema` carry the same caps so a
  future direct-INSERT path cannot seed an unbounded list that the
  client then accepts.
- **Where:** `src/lib/schemas/save.ts:195` (WeaponInventorySchema
  cap), `src/lib/schemas/save.ts:301-355` (LegacyShipSchema caps),
  `src/lib/schemas/save.ts:417` (SavePayloadSchema seenStoryEntries),
  `src/lib/schemas/save.ts:460` (RemoteSaveSchema seenStoryEntries).
- **Impact:** without the caps, an attacker can blow up server memory
  during parse, amplify into the audit table (`save_audit.request_
  payload`), or write arbitrarily large jsonb blobs to Postgres.
- **Findings:** SEC-011, SEC-016, SEC-022.

### INV-SCHEMA-3 — `*_IDS` constants stay locked-in-lockstep with the matching TS literal unions

- **Rule:** every `*_IDS` runtime constant in
  `src/lib/schemas/save.ts` (and `WEAPON_IDS` in
  `src/game/data/weapons.ts`) carries `as const satisfies readonly
  <Id>[]`, where `<Id>` is the matching TS literal union from
  `src/types/game.ts`. Removing the satisfies clause makes drift a
  silent runtime bug.
- **Where:** `src/lib/schemas/save.ts:71-111` (`AUGMENT_IDS`,
  `MISSION_IDS`, `SOLAR_SYSTEM_IDS`); `src/game/data/weapons.ts`
  (`WEAPON_IDS`).
- **Impact:** without the lockstep, adding a new id to the TS union
  but forgetting to add it to the runtime list silently rejects every
  payload referencing the new id at the boundary — and adding a new
  id only at runtime accepts payloads referencing ids the type system
  doesn't know.
- **Findings:** baseline (CLAUDE.md §5).

---

## Save queue (client-side durability)

### INV-QUEUE-1 — Pending saves are stamped with `playerEmail` and the flush refuses a stamp mismatch

- **Rule:** every entry written to the localStorage save queue
  (`spacepotatis:pendingSave:v2`) carries a non-empty `playerEmail`
  string. `flushPendingSave` reads via `readPendingForPlayer(current
  Email)` which returns null when the stamp does not match the
  current session — the slot is left in place (a sign-in to the
  original account would still flush it).
- **Where:** `src/game/state/saveQueue.ts:83-94` (interface),
  `src/game/state/saveQueue.ts:170-176` (`readPendingForPlayer`),
  `src/game/state/saveQueue.ts:199-214` (`markSavePending`).
- **Impact:** without the stamp, a sign-out → sign-in by another
  account on the same browser would hydrate the new session with the
  prior account's snapshot and POST it as the new account — the
  cross-account leak that `:v1` (pre-stamp) shipped with. The read
  path silently purges any leftover `:v1` blob.
- **Findings:** baseline (PR #100); preserved through every
  Phase 3 fix.

### INV-QUEUE-2 — Score and save POSTs go through their respective queues; never bypass

- **Rule:** scores enqueue via `enqueueScore` and drain via
  `drainScoreQueue`; saves stamp via `markSavePending` and flush via
  `flushPendingSave`. Fire-and-forget `fetch("/api/leaderboard", …)`
  or `fetch("/api/save", …)` is forbidden for new code.
- **Where:** `src/game/state/scoreQueue.ts`,
  `src/game/state/saveQueue.ts`. Save call site
  `src/game/state/sync.ts:saveNow`. Score drain call site
  `src/components/GameCanvas.tsx`.
- **Impact:** the leaderboard contract is eventually-consistent. A
  network blip during a fire-and-forget POST loses the score; the
  queue is the durability layer.
- **Findings:** baseline (PR #82, PR #96, PR #100); reinforced by
  SEC-026 (drain ordering after save resolves).

---

## Production-write scripts

### INV-SCRIPT-1 — `writeBackup()` runs BEFORE every UPDATE / DELETE / destructive op

- **Rule:** any script under `scripts/` that issues an UPDATE or DELETE
  against production calls `writeBackup({ prevRow, scriptName, flags
  })` from `scripts/_lib/dbWriteSafety.mjs` BEFORE the destructive
  op. If `writeBackup` throws (disk full, permission denied), the
  transaction ROLLBACKs and the script exits non-zero — the backup is
  the recoverability contract.
- **Where:** `scripts/_lib/dbWriteSafety.mjs:100` (the helper);
  `scripts/restore-player.mjs:407` (call site),
  `scripts/improve-restore.mjs:173` (call site),
  `scripts/erase-player.mjs:278` (call site).
- **Impact:** the 2026-05-02 wipe taught us that direct DB writes are
  the highest-risk operations in this codebase. Without
  `writeBackup`, a misfired script destroys progression irreversibly.
- **Findings:** CLAUDE.md §15; reinforced by SEC-007, SEC-010,
  SEC-021.

### INV-SCRIPT-2 — Destructive scripts default to dry-run; `--confirm` is required to mutate

- **Rule:** scripts use `parseFlags()` from
  `scripts/_lib/dbWriteSafety.mjs`, which defaults to `--dry-run` when
  neither `--dry-run` nor `--confirm` is passed. `requireConfirm()`
  exits 0 on dry-run (after printing the planned diff) and exits 1 if
  `--confirm` is missing on a non-dry-run path. `restore-player.mjs`
  predates the helper and uses its own `--apply` flag with equivalent
  semantics.
- **Where:** `scripts/_lib/dbWriteSafety.mjs:54-91` (`parseFlags`),
  `scripts/_lib/dbWriteSafety.mjs:128-138` (`requireConfirm`).
- **Impact:** without the dry-run default, a misfired argv (wrong
  positional email, copy-paste mistake) runs the destructive op on
  the first try.
- **Findings:** SEC-007, SEC-021.

### INV-SCRIPT-3 — `--player-email=<email>` cross-check matches the positional argument

- **Rule:** every destructive script verifies the positional `<email>`
  argument matches a separate `--player-email=<email>` flag before
  proceeding. A mismatch aborts.
- **Where:** `scripts/restore-player.mjs` (hand-rolled cross-check
  near the top), `scripts/improve-restore.mjs` (parsed via the helper
  + cross-check), `scripts/erase-player.mjs` (`parseEraseFlags`).
- **Impact:** the cross-check is the second layer of defense against
  a typo in the positional argument. Operators have hit this rake at
  least once (the 2026-05-02 wipe).
- **Findings:** CLAUDE.md §15; reinforced by SEC-007, SEC-010.

---

## Operational

### INV-OPS-1 — Security headers are emitted on every route

- **Rule:** `next.config.ts` calls `getSecurityHeaders()` from
  `src/lib/securityHeaders.ts`, which emits CSP (with
  `frame-ancestors 'none'`), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and a locked-down
  `Permissions-Policy` for every route (`source: "/(.*)"`).
- **Where:** `src/lib/securityHeaders.ts:19-61`; called from
  `next.config.ts`.
- **Impact:** removing any header re-opens a defense-in-depth surface.
  The CSP `'unsafe-inline'` allowance on `script-src` / `style-src`
  is documented as required by today's Next.js inline scripts —
  tightening it to a nonce-based CSP is a future hardening pass, not
  a current invariant.
- **Findings:** SEC-001.

### INV-OPS-2 — GitHub Actions are pinned to commit SHAs, not mutable tags

- **Rule:** every `uses:` line in `.github/workflows/*.yml` references
  a 40-character commit SHA, not a tag like `@v4`. The trailing
  human-readable tag in a comment (`# v4.3.1`) is informational only.
- **Where:** `.github/workflows/ci.yml`,
  `.github/workflows/audit-readiness-check.yml`.
- **Impact:** mutable tags can be rewritten by a compromised
  upstream maintainer. SHA pins make the supply-chain surface
  auditable.
- **Findings:** SEC-015.

### INV-OPS-3 — Workflows declare minimum permissions explicitly

- **Rule:** every workflow file declares an explicit
  `permissions:` block at the workflow level, granting `contents:
  read` by default and elevating only where required (e.g. `issues:
  write` on the audit-readiness job that opens GitHub issues).
- **Where:** `.github/workflows/ci.yml`,
  `.github/workflows/audit-readiness-check.yml`.
- **Impact:** the default `GITHUB_TOKEN` permission set is too broad
  on legacy repos; an explicit minimum-permissions block scopes the
  blast radius if a workflow step is ever compromised.
- **Findings:** SEC-029.

### INV-OPS-4 — Husky pre-commit hook uses `npx --no` to block auto-download

- **Rule:** `.husky/pre-commit` invokes `npx --no lint-staged`. The
  `--no` flag forces `npx` to only run already-installed binaries —
  if `lint-staged` is missing, the hook fails fast instead of
  prompting to download an unverified package.
- **Where:** `.husky/pre-commit`.
- **Impact:** without `--no`, a developer running the hook with a
  cold `node_modules/` could be prompted to install whatever
  `lint-staged` resolves to from the public registry — a (small)
  supply-chain surface that the flag closes.
- **Findings:** SEC-024.

### INV-OPS-5 — Issue-body input never flows into a shell-interpolated string

- **Rule:** `.github/workflows/audit-readiness-check.yml` writes the
  GitHub issue body via `cat >> /tmp/issue-body.txt` heredocs and
  passes it to `gh issue create --body-file`, never `--body
  "$variable"`.
- **Where:** `.github/workflows/audit-readiness-check.yml`.
- **Impact:** without the file-based pattern, a SQL row containing a
  shell metacharacter could land in the issue body and execute as
  shell code in the runner.
- **Findings:** SEC-023.

---

## Logging hygiene

### INV-LOG-1 — Save-rejection `console.warn` calls log `playerId` (UUID), not `session.user.email`

- **Rule:** every `console.warn` on a save-rejection path logs the
  player's `playerId` (UUID) rather than `session.user.email`. The
  forensic mapping from UUID to email is the `players` table; the
  audit log uses `player_id` too.
- **Where:** `src/app/api/save/route.ts:288-450` (the four
  rejection branches inside the transaction).
- **Impact:** Vercel function logs have ~3-7 day retention and are
  accessible via the dashboard. Email addresses are PII under EU/UK
  GDPR; UUIDs are not personally identifying on their own.
- **Findings:** SEC-005.

### INV-LOG-2 — Server-error responses do not reflect `err.message`

- **Rule:** 5xx responses from `/api/save`, `/api/leaderboard`, and
  `/api/handle` return `{ error: "server_error" }` — never the raw
  `err.message`. Server-side `console.error` keeps the full error
  for ops forensics.
- **Where:** `src/app/api/save/route.ts:62, 211, 509`,
  `src/app/api/handle/route.ts` (5xx branches),
  `src/app/api/leaderboard/route.ts:34, 112`.
- **Impact:** Kysely / Neon error messages can leak SQL fragments,
  table names, and internal column names — fingerprinting the
  schema and aiding follow-up attacks.
- **Findings:** SEC-004.

### INV-LOG-3 — Client `console.error` on parse failure does not log the raw save row

- **Rule:** `loadSave`'s parse-failure branch in
  `src/game/state/sync.ts` logs the Zod `issues` array but NOT the
  raw response body. The raw row lives in the server-side `save_audit`
  table and DB snapshots.
- **Where:** `src/game/state/sync.ts` (loadSave parse-failure branch).
- **Impact:** without the trim, a player's save (potentially
  containing legacy fields) gets dumped into the browser console
  where third-party browser extensions or remote devtools sessions
  could read it.
- **Findings:** SEC-025.

---

## Database safety

### INV-DB-1 — All tables are namespaced under the `spacepotatis` schema

- **Rule:** every CREATE TABLE / ALTER TABLE / SELECT / INSERT / UPDATE
  / DELETE references `spacepotatis.<name>`, never bare `<name>` and
  never `public.<name>` (except the dbmate tracker table
  `public.spacepotatis_schema_migrations`, which is intentional).
- **Where:** `db/migrations/*.sql`, `src/lib/db.ts` (Database
  interface), all Kysely call sites.
- **Impact:** the Vercel/Neon database is shared with other services;
  writing to `public.*` would collide with / corrupt other
  applications' data.
- **Findings:** baseline (CLAUDE.md §5).

### INV-DB-2 — All queries flow through Kysely's typed query builder; no `Kysely<any>` and no `sql.lit(string)`

- **Rule:** `src/lib/db.ts` exports `Kysely<Database>`, where
  `Database` is the canonical TS interface. No file imports
  `Kysely<any>`. No file calls `sql.lit(<user-input>)`. The
  `sql\`...\`` template tag is reserved for fixed identifiers
  (`COALESCE(...)`, `EXCLUDED.<col>`, `LOWER(handle)`) — never user
  input.
- **Where:** `src/lib/db.ts:93` (`Kysely<Database>` definition);
  every API route + helper.
- **Impact:** `Kysely<any>` and `sql.lit(string)` are the two known
  Kysely SQL-injection paths (npm-audit advisories
  GHSA-wmrf-hv6w-mr66, GHSA-8cpq-38p9-67gx). Using either re-opens
  classic SQLi.
- **Findings:** baseline; documented in `01-attack-surface.md` §7.

# infra

## Purpose

Infrastructure primitives — DB client, NextAuth handlers + helpers, route
constants, cheat guards, session hooks, leaderboard read helpers. This module
owns "how we talk to the outside world": every Postgres query, every Google
OAuth handshake, every server-side guard between a hostile POST body and a
real player's row goes through here.

The contract is narrow. Anything API-route, page-route, or cheat-guard that
touches Neon, NextAuth, or `next/cache` belongs here; anything game-mechanical,
JSON-content, or render-layer does not.

## Public API

The exports listed below are the contract. Anything else exported is INTERNAL
and may be removed without notice — see [Internal](#internal) for the
deliberately-not-public surface.

### ⚠ Barrel-import limitation (`auth.ts` is carved out of `@/lib`)

PR #248 added [`src/lib/index.ts`](./index.ts) re-exporting every infra
module, intending it to be the public surface (the same pattern Tier 1-4
adopted for `types`, `schemas`, `audio`, `content`, `state`, `three`,
`phaser`).

[`auth.ts`](./auth.ts) is deliberately **NOT** re-exported from the barrel
(option (b), resolved 2026-05-29). `auth.ts` calls `NextAuth(config)` at
module load, which pulls `next-auth` → `next/server`; routing infra imports
through `@/lib` would drag that side effect into 6 test files that don't
expect it, turning every test of an infra consumer into a `Cannot find
module 'next/server'` failure. With auth carved out, **the barrel is now
safe to consume from any test context that doesn't need auth** — auth
consumers MUST use the deep path [`@/lib/auth`](./auth.ts).

See [`docs/audit/04-found-bugs.md`](../../docs/audit/04-found-bugs.md)
2026-05-29 for the resolution rationale.

### DB ([db.ts](./db.ts))

- `getDb()` — lazy-init Kysely client over Neon's serverless `Pool`. Throws
  if `DATABASE_URL` is unset. Singleton; safe to call from every API route.
- `Database` interface — canonical TypeScript shape of the schema. Single
  source of truth; **must** stay in lockstep with `db/migrations/*.sql`.
- `PlayersTable`, `SaveGamesTable`, `LeaderboardTable`, `SaveAuditTable` —
  per-table column types referenced by `Database`. Add a new column here
  in the same commit that ships the migration.

### Auth ([auth.ts](./auth.ts))

- `auth()` — NextAuth v5 server handler. Used inside API route handlers to
  read the current session.
- `handlers` — exported route handlers re-mounted at
  `src/app/api/auth/[...nextauth]/route.ts`.
- `signIn`, `signOut` — server-action helpers re-exported from NextAuth.

### Routes ([routes.ts](./routes.ts))

- `ROUTES` — single source of truth for client-side route paths. Convention:
  keys are page handles, values are URL paths. Never hard-code route literals
  elsewhere; if you find a `fetch("/api/save")` outside of `ROUTES.api.save`,
  it's a bug.

### Hooks ([useHandle.ts](./useHandle.ts), [useReliableSession.ts](./useReliableSession.ts))

- `useHandle()` — React hook. Resolves the signed-in player's public-facing
  handle via `GET /api/handle`. Module-level cache + in-flight de-dup means N
  consumers cause one round trip. Returns `{ handle, status, error, refetch }`.
- `clearHandleCache()` — drop the module-level cache. Called from sign-out.
- `useReliableSession()` — wraps NextAuth's `useSession()` with a one-shot
  retry that catches transient `/api/auth/session` failures (Edge cold-start
  race). Without this, a refreshed page could flip to `unauthenticated` and
  cascade-wipe the optimistic auth cache.
- `useOptimisticAuth()` — **MOVED in PR #248**. The composite hook now lives at
  [`src/game/state/useOptimisticAuth.ts`](../game/state/useOptimisticAuth.ts).
  Re-exported by the state barrel. The Phase 3 plan to close the `lib → game`
  backedge is complete. New consumers import from `@/game/state` (or the
  deep path `@/game/state/useOptimisticAuth`).

### Cheat guards ([saveValidation.ts](./saveValidation.ts))

Pure server-side guards. All Edge-runtime safe (no Node primitives). Run them
in this order on every authenticated `POST /api/save`; **do not skip
`validateNoRegression`** — that omission is what wiped a player on
2026-05-02.

- `validateMissionGraph({ completedMissions, unlockedPlanets })` — every
  completed mission must have its `requires` already completed; same for any
  combat-mission entry in `unlockedPlanets`.
- `validateCreditsDelta({ prev, next, caps })` — credits can only have grown
  by `deltaTime * caps.maxPerSecond + deltaCompleted * caps.maxPerFirstClear
  + CREDITS_DELTA_SLACK`. Spending (negative delta) is always allowed.
- `validatePlaytimeDelta({ prev, next, nowMs })` — `playedTimeSeconds` can
  only have grown by `wallClockSeconds + PLAYTIME_DELTA_SLACK_SECONDS`. Closes
  the credits-cap escape hatch where a cheater inflates `playedTimeSeconds`
  to claim more credits.
- `validateNoRegression({ prev, next })` — three monotonic fields
  (`completedMissions`, `unlockedPlanets`, `playedTimeSeconds`) must never
  shrink. **Wiping a save is not a legitimate game action.** A 422 here is
  TRANSIENT — saveQueue holds the snapshot and retries after the next
  successful loadSave hydrates real state. See ADR 0003.
- `getReachableSolarSystems(completedMissions)` — derive the player's
  reachable system set from server-trusted `completedMissions`. Never trust
  the request body for this.
- `computeCreditCapsForSystems(reachableSystems)` /
  `computeCreditCapsForPlayer(completedMissions)` — derive per-player caps
  from JSON content. **Don't replace these with hard-coded constants** —
  CLAUDE.md §9 calls this out specifically.
- `GLOBAL_CREDIT_CAPS`, `MAX_CREDITS_PER_SECOND`, `MAX_CREDITS_PER_FIRST_CLEAR`,
  `CREDITS_DELTA_SLACK`, `PLAYTIME_DELTA_SLACK_SECONDS` — constants exposed
  for routes and tests.

The four guards above consume only the progression fields
(`completedMissions` / `unlockedPlanets` / `credits` / `playedTimeSeconds`).
A guard validating ship/loadout state (augments, reactor, shield/armor
levels, weapon slots) reads those off the same validated POST body — their
shapes live in `ShipConfigSchema` in
[`@/lib/schemas/save.ts`](./schemas/save.ts) (`augmentInventory` capped at
50, `slots` at `MAX_WEAPON_SLOTS`). Add a `.max()` bound there before
trusting any new array (INV-SCHEMA-1 in
[`docs/security/invariants.md`](../../docs/security/invariants.md)).

### Leaderboard helpers ([leaderboard.ts](./leaderboard.ts), [players.ts](./players.ts), [handle.ts](./handle.ts), [leaderboardMapper.ts](./leaderboardMapper.ts))

- `getCachedLeaderboard(missionId, limit)` — `unstable_cache`-wrapped read of
  the per-mission leaderboard slice. 60s revalidate. Tagged
  `LEADERBOARD_CACHE_TAG`.
- `getCachedTopPilots(limit)` — composite "Top Pilots" ranking across all
  missions. Anonymous (null handle) players excluded.
- `LEADERBOARD_CACHE_TAG` — pass to `revalidateTag()` from the score-write
  route to flush every cached slice.
- `LeaderboardEntry`, `PilotEntry` — public DTOs.
- `upsertPlayerId(email, name)` — resolve email → `players.id`, inserting
  on first sight. Idempotent.
- `validateHandle(raw)` — shared rules for the public-facing handle (3–16
  chars, `[A-Za-z0-9_-]`). Used by both the API route and the client form.
- `HANDLE_MIN_LENGTH`, `HANDLE_MAX_LENGTH`, `HANDLE_PATTERN` — constants
  matching `validateHandle`.
- `mapRowToPilot(row)` / `TopPilotsRow` — pure row → DTO mapper kept in its
  own file so the leaderboard query and the unit tests share the same
  coercion logic.

## Internal

These are exported from the module but are **NOT** part of the public
contract. Treat as implementation detail; they may move or be renamed.

- `authCache` (`readAuthCache`, `writeAuthCache`, `clearAuthCache`,
  `AuthSnapshot`) in [authCache.ts](./authCache.ts) — localStorage-backed
  optimistic snapshot. Consumed by `useOptimisticAuth` /
  `useReliableSession`; not safe to read directly from random components
  (the schema can change).
- `resetReliableSessionRetry()` — test-only escape hatch for
  `useReliableSession`'s module-level retry flag.
- `isAuthVerified()` — pure helper exported for unit testing
  `useOptimisticAuth`'s decision logic.
- Per-guard helpers in `saveValidation.ts` (`safeGetMission`, `setDifference`,
  the `KILL_CADENCE_CEILING` / `PER_SECOND_SAFETY_FACTOR` /
  `PER_CLEAR_SAFETY_FACTOR` constants) — drive the public guards but are
  not part of the contract.
- `scripts/_lib/dbWriteSafety.mjs` — production-write helper used by recovery
  scripts. Lives outside `src/lib/` (it's a CLI helper, not runtime code) and
  is **not** re-exported from this module. See CLAUDE.md §15.

### Edge-vs-Node runtime split

API routes pick their runtime per-route via `export const runtime = "edge"`
or `"nodejs"`:

- **Node-only:** `src/app/api/auth/[...nextauth]/route.ts` (Google OAuth
  handshake needs Node `fs` APIs through the NextAuth provider).
- **Edge:** every other API route (`/api/save`, `/api/handle`,
  `/api/leaderboard`).

This split is enforced at the route file, not in this module — every export
here is Edge-safe. Adding a Node primitive (`fs`, `path`, `crypto.randomUUID`
pre-Node-19) to anything in `src/lib/` will break the Edge routes silently
at deploy time. **INVARIANT: every `src/lib/` module is Edge-runtime
compatible.**

## Dependencies

| Dependency | Used by | Why |
|---|---|---|
| `kysely`, `@neondatabase/serverless` | `db.ts` | Type-safe SQL over WebSocket pool. Edge-compatible. CLAUDE.md §5 forbids Prisma. |
| `next-auth` | `auth.ts`, `useReliableSession.ts`, `useOptimisticAuth.ts` | NextAuth v5. Google provider only. |
| `next/cache` | `leaderboard.ts` | `unstable_cache` for ISR-style read caching. CLAUDE.md §13. |
| `@/lib/schemas/*` | API route consumers, **not this module** | Zod schemas validate POST bodies before the cheat guards run. The guards themselves take typed inputs and trust the schema layer for shape. |
| `@/types/game` | `saveValidation.ts`, `leaderboard.ts` | `MissionId`, `SolarSystemId`, etc. |
| `@/game/data/*` | `saveValidation.ts` | Mission graph + loot pools + enemy creditValue + `SYSTEM_UNLOCK_GATES` + `weaponUpgradeCost`. Allowed `infra → content` edge; the derived caps are lazy-init (first-call getters, PR #248). |

## Invariants

- **`[...nextauth]` route stays on Node runtime.** Google's OAuth handshake
  uses Node `fs` APIs through the NextAuth provider. Every other API route
  prefers Edge. ([auth.ts](./auth.ts))
- **Every `src/lib/` export is Edge-safe.** No `fs`, no `path`, no Node-only
  primitives. The DB client uses Neon's WebSocket pool specifically so it
  works on Edge. ([db.ts](./db.ts))
- **Every save POST runs the full cheat-guard suite + `save_audit` write.**
  The order is `validateMissionGraph` → `validateNoRegression` →
  `validatePlaytimeDelta` → `validateCreditsDelta` (see the handler in
  [`src/app/api/save/route.ts`](../app/api/save/route.ts)). Skipping
  `validateNoRegression` was the 2026-05-02 wipe trigger.
  (`validateMissionGraph`, `validateNoRegression`, `validatePlaytimeDelta`,
  `validateCreditsDelta`)
- **Cheat-guard rejections are 422, transient, never 4xx-account-block.**
  See ADR 0003. saveQueue holds the snapshot and retries after a successful
  load reconciles state. (`validateNoRegression`)
- **A NEW guard call goes INSIDE the existing `.forUpdate()` transaction in
  the save route** (INV-SAVE-2 / SEC-013) and derives any trusted baseline
  from the locked prev row (`deriveCapInputMissions`), never the request
  body (SEC-017). The `writeSaveAudit` calls stay OUTSIDE the txn so an
  audit-table outage can't roll back a user-visible save. See
  [`docs/security/invariants.md`](../../docs/security/invariants.md) and
  [`saveValidation.SECURITY.md`](./saveValidation.SECURITY.md).
- **Credit caps derive from JSON content, never hard-coded constants.**
  Walking `enemies.json` + `lootPools.ts` per request keeps the cap
  proportional to balance changes — a 10× damage buff scales the cap 10×
  automatically. CLAUDE.md §9.
  (`computeCreditCapsForSystems` / `computeCreditCapsForPlayer`)
- **Reachable systems derive from server-stored `completedMissions`, never
  the request body.** The graph guard runs first; only after it passes do
  we recompute caps. Otherwise a cheater could expand their cap by claiming
  fake completions. (`getReachableSolarSystems` / `deriveCapInputMissions`)
- **DB queries should be wrapped in `unstable_cache(...,{revalidate, tags})`
  per CLAUDE.md §13.** Mutating routes call `revalidateTag()` to flush.
  Both leaderboard reads do this. ([leaderboard.ts:57](./leaderboard.ts),
  [leaderboard.ts:123](./leaderboard.ts))
- **The `Database` interface is the canonical schema.** Update it in the
  same commit as the matching `db/migrations/*.sql` file or the next save
  POST that touches the new column 500s silently in prod. CLAUDE.md §7a.
  ([db.ts:21](./db.ts))
- **All SQL goes through Kysely, all in `db.ts`.** No raw SQL outside this
  module. CLAUDE.md §5.
- **No `as` casts at the network edge.** API route handlers + client `fetch`
  consumers (`src/game/state/sync.ts`) validate via Zod. CLAUDE.md §5.

## Common pitfalls

- **`@/lib` barrel is nominal-only.** See the warning at the top of "Public
  API". Routing existing deep imports through the barrel breaks 6 test files
  via `auth.ts`'s NextAuth-at-module-load side effect. For NEW infra
  consumers, use deep paths; existing code stays on deep paths too. Open
  question logged in [04-found-bugs.md 2026-05-29](../../docs/audit/04-found-bugs.md).
- **Don't re-open the `infra → state` back-edge.** This module imports
  NOTHING from `@/game/state` anymore — the back-edge surfaced by the audit
  was closed in stages (`MAX_LEVEL` → `@/types`, `SYSTEM_UNLOCK_GATES` →
  `@/game/data`, and finally `weaponUpgradeCost` → `@/game/data/upgradeCurves`
  on 2026-06-12). If a new cheat guard needs a ship constant or balance
  curve, it lives in `@/types` (pure caps) or `@/game/data` (balance data) —
  never reach into `@/game/state`, which would re-create the module-level
  cycle. History in [04-found-bugs.md 2026-05-29](../../docs/audit/04-found-bugs.md).
- **Bypassing `validateNoRegression`** on the POST path is the
  2026-05-02-wipe footgun. The other three guards explicitly *allow*
  shrinking values (credit spending is legitimate). Only this one catches
  the empty-snapshot wipe pattern.
- **Adding raw SQL outside `db.ts`** is forbidden by CLAUDE.md §5. If you
  need a query the leaderboard/players helpers don't cover, add a new
  helper that goes through Kysely.
- **Forgetting to update the `Database` interface** when adding a migration
  column is the silent-drop bug. The save round-trip skill audits this; run
  it before merging schema-touching changes (`/save-roundtrip-audit`).
- **Adding a Node primitive** to anything in `src/lib/` (other than the
  Node-runtime auth route consumer) breaks Edge routes at deploy time
  without a clear failure signal locally.
- **Hard-coding cheat-guard constants** "for simplicity" defeats the
  progression-aware caps. Stay in `computeCreditCapsForPlayer`. CLAUDE.md §9.
- **Replacing the `unstable_cache` wrapper** on a read route invalidates the
  Vercel budget assumptions in CLAUDE.md §13. Don't do it without explicit
  sign-off and a PR-body cost note.

## How to test changes

```bash
# Whole module
npm test src/lib

# Specific files
npm test src/lib/saveValidation.test.ts
npm test src/lib/saveValidation.dataDrift.test.ts
npm test src/lib/leaderboard.test.ts
npm test src/lib/handle.test.ts
npm test src/lib/db.test.ts
npm test src/lib/auth.test.ts
npm test src/lib/authCache.test.ts
npm test src/lib/useOptimisticAuth.test.ts

# Typecheck the whole project (pre-commit hook runs this too)
npm run typecheck
```

What each test covers:

- `saveValidation.test.ts` — exhaustive coverage of every cheat guard
  (graph, credits delta, playtime delta, regression). The most important
  test file in this module; touch saveValidation.ts and these will tell you
  what broke.
- `saveValidation.dataDrift.test.ts` — sanity-checks the credit caps stay
  inside reasonable bounds when JSON content changes. Catches "an enemy's
  creditValue jumped 1000× and now everyone's cap is broken" before it
  ships.
- `leaderboard.test.ts` — both `getCachedLeaderboard` and
  `getCachedTopPilots`, fed through a fake `getDb` to keep the test
  hermetic.
- `handle.test.ts` — `validateHandle` rules.
- `db.test.ts` — `getDb()` singleton + missing-env-var error path.
- `auth.test.ts` — NextAuth callback shape (jwt + session forwarding).
- `authCache.test.ts` — read/write/clear of the optimistic cache, including
  schema-version drift.
- `useOptimisticAuth.test.ts` — the `isAuthVerified` decision tree.

## See also

- ADR 0001 — static-by-default (when API routes are Edge vs Node).
- ADR 0003 — anti-cheat is observation, not enforcement (cheat-guard
  rejections are 422 transient, never 4xx account-blocking).
- ADR 0004 — save round-trip's 8 layers (this module owns the validation
  layer + the `Database` schema definition).
- CLAUDE.md §3, §5, §7a, §9, §13 — the load-bearing constraints behind every
  invariant in this README.

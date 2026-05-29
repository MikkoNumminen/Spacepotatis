# Phase 1 — Latent issues log

Append-only log of issues surfaced during the inventory walk that are NOT structural — i.e. not boundaries, not module shape. Each is logged here for the user to triage; **none of them get fixed during the audit refactor**. Phase 3 (extraction) is forbidden from touching them.

Severity is a rough hint, not a release-grade triage.

---

## 2026-05-04 — `src/types/database.ts` is dead and out of sync
- Path: [`src/types/database.ts`](src/types/database.ts)
- Found by: zone D
- Severity: low
- Description: file has 0 importers across the codebase, AND it's missing the `SaveAuditTable` type that was added by [`db/migrations/20260503000000_add_save_audit.sql`](db/migrations/20260503000000_add_save_audit.sql). The live `Database` interface that everything actually uses is in [`src/lib/db.ts`](src/lib/db.ts).
- Suggested fix: delete `src/types/database.ts` once it's confirmed unreferenced anywhere (greppable `import .* database`).
- **Resolved 2026-05-28**: file no longer exists on master (deleted between audit pause and resume).

## 2026-05-04 — `BossScene.ts` is dead code
- Path: [`src/game/phaser/scenes/BossScene.ts`](src/game/phaser/scenes/BossScene.ts)
- Found by: zone B
- Severity: low
- Description: defined as a Phaser scene but not registered in the scene array at [`src/game/phaser/config.ts:64`](src/game/phaser/config.ts#L64). The boss fight is implemented inside `CombatScene` instead. The dangling file is misleading to anyone trying to follow scene routing.
- Suggested fix: delete the file, or wire it into a "boss fight runs in its own scene" refactor.
- **Resolved 2026-05-28**: file no longer exists on master (deleted between audit pause and resume).

## 2026-05-04 — `audit-readiness-check.yml` Node version mismatches `ci.yml`
- Path: [`.github/workflows/audit-readiness-check.yml`](.github/workflows/audit-readiness-check.yml) vs [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Found by: zone D
- Severity: low
- Description: `audit-readiness-check.yml` runs on Node 22; `ci.yml` runs on Node 20. Two different Node versions in CI for the same repo means a script can pass one and fail the other.
- Suggested fix: pick one (probably 20 to match the rest), pin in both workflows.
- **Resolved 2026-05-28 (not-a-bug)**: the workflow now carries a comment explaining the Node 22 choice — `@neondatabase/serverless` driver needs Node 22's native global WebSocket; ci.yml stays on 20 because vitest doesn't open Neon connections. Intentional divergence, documented in-file.

## 2026-05-04 — `package.json#scripts.db:migrate` calls dbmate while CLAUDE.md says use the node runner
- Path: [`package.json`](package.json) `scripts.db:migrate`
- Found by: zone D
- Severity: low
- Description: CLAUDE.md §6 + §7 instructs contributors to use `node --env-file=.env.local scripts/migrate.mjs` so dbmate isn't a hard dependency. But `npm run db:migrate` calls dbmate. Documentation drift — works for anyone with dbmate installed, surprises everyone else.
- Suggested fix: change the script to invoke `scripts/migrate.mjs`, OR update CLAUDE.md to say dbmate is in fact required.
- **Resolved 2026-05-28**: `db:migrate` now routes to `node --env-file=.env.local scripts/migrate.mjs`. The old dbmate path lives on as `db:migrate:dbmate` for anyone with dbmate installed.

## 2026-05-04 — `useOptimisticAuth.ts` is the only `lib → game` backedge
- Path: [`src/lib/useOptimisticAuth.ts:10-11`](src/lib/useOptimisticAuth.ts#L10-L11)
- Found by: zone D
- Severity: medium
- Description: `lib/` is supposed to be infrastructure with no knowledge of the game side. This file imports `@/game/state/sync` + `@/game/state/syncCache` to drive an "optimistic auth" UX where the splash trusts the cached account. Architecturally this lives on the wrong side of the fence — the auth-state cache should expose a hook that lives in `src/game/state/` (or `src/components/hooks/`) and `src/lib` should provide auth-only primitives.
- Suggested fix: move the hook to `src/components/hooks/` (or `src/game/state/`) and have `src/lib/useReliableSession.ts` stay pure-auth.

## 2026-05-04 — `loadout/WeaponDetailsModal.tsx` reaches up to `components/WeaponStats.tsx`
- Path: [`src/components/loadout/WeaponDetailsModal.tsx`](src/components/loadout/WeaponDetailsModal.tsx) → [`src/components/WeaponStats.tsx`](src/components/WeaponStats.tsx)
- Found by: zone A
- Severity: low
- Description: a child folder reaches up to its parent for a sibling component. Not a cycle, but a coupling that suggests `WeaponStats.tsx` should either move into `loadout/` (if it's used there primarily) or stay where it is and the modal should accept `WeaponStats` as a prop.
- Suggested fix: defer to Phase 2 boundaries — likely both files end up in the same module.
- **Resolved 2026-05-29 in Phase 3 Tier 5**: file moved from `src/components/WeaponStats.tsx` to `src/components/loadout/WeaponStatsView.tsx` (renamed from `WeaponStats.tsx` to dodge a case-collision with the existing `loadout/weaponStats.ts` helper on Windows/macOS-default case-insensitive filesystems). The cross-folder reach is gone — WeaponDetailsModal now imports its sibling via `./WeaponStatsView`.

## 2026-05-04 — `three/planetTexture.ts#styleFor` switch is non-exhaustive over `MissionId`
- Path: [`src/game/three/planetTexture.ts:35-147`](src/game/three/planetTexture.ts#L35-L147)
- Found by: zone C
- Severity: medium
- Description: the `styleFor(missionId)` function has a hard-coded switch covering specific mission ids. Adding a new mission to `missions.json` (which the integrity check deliberately doesn't validate against sprite/texture generators — see [`integrityCheck.ts:50-53`](src/game/data/integrityCheck.ts#L50-L53)) would Zod-validate fine but crash inside `paintDiffuse()` at render time. The TS compiler doesn't catch this because `MissionId` is a wide union and the switch returns a default fallback that doesn't actually execute every code path.
- Suggested fix: either (a) make the switch exhaustive with a `never` exhaustiveness guard so adding a `MissionId` is a tsc error, OR (b) move the styling data into `missions.json` itself so a missing entry is caught by the schema parser. (b) is more in keeping with the "data-driven" pattern of the rest of the catalog.
- **Resolved 2026-05-29 in PR #260**: chose option (b). Added `PlanetStyle` interface to `src/types/game.ts` and `PlanetStyleSchema` (Zod) to `src/lib/schemas/missions.ts` as an optional field. Backfilled `planetStyle` into all 9 entries in `src/game/data/missions.json` with the exact data the old switch returned — every planet renders identically. `styleFor()` removed; `generatePlanetSurface(missionId, baseColor, style)` now takes the style as a parameter (default fallback for future undecorated entries). `Planet.ts` passes `definition.planetStyle` through. Added boot-time integrity check in `src/game/data/integrityCheck.ts` rejecting any `kind: "mission"` entry missing `planetStyle`; matching tests in `integrityCheck.test.ts` cover both the rejection and the shop/scenery exemption.

## 2026-05-04 — `BootScene.ts` at 1819 LOC is the largest god-file
- Path: [`src/game/phaser/scenes/BootScene.ts`](src/game/phaser/scenes/BootScene.ts)
- Found by: zone B
- Severity: low (documented placeholder)
- Description: 1819 lines of procedural texture generation (every weapon bullet, pod, enemy sprite, perk icon, etc.). The zone B agent notes this is a documented placeholder pending real PNG assets. Worth flagging because it skews the god-file metric for the whole codebase, and because the in-file generators are sufficiently independent that they could be split into a `boot/` subfolder of generators with a thin `BootScene.ts` orchestrator.
- Suggested fix: defer until real art lands. If real art doesn't land soon, split the generators into per-family files (`boot/bullets.ts`, `boot/enemies.ts`, etc.) for sanity.

## 2026-05-04 — `state/stateCore.ts` runs `getAllMissions()` + `readSeenStoriesLocal()` at module load
- Path: [`src/game/state/stateCore.ts:33`](src/game/state/stateCore.ts#L33), [`:58`](src/game/state/stateCore.ts#L58)
- Found by: zone C
- Severity: low
- Description: importing `stateCore` (which is the GameState barrel's foundation) triggers `runDataIntegrityCheck` (via `getAllMissions`) and a `localStorage` read (via `readSeenStoriesLocal`) at import time. This means EVERY consumer of state, including SSR-time importers, pays for these side effects. SSR-time `localStorage` read is guarded against `typeof window === "undefined"` (see `seenStoriesLocal.ts`), so it's safe — but the side-effect-at-import-time pattern is fragile. Fine today, would bite if SSR safety changes elsewhere.
- Suggested fix: lazy-load `INITIAL_STATE` so the integrity check + localStorage read only happen on first read of `getState()`.

## 2026-05-04 — `lib/saveValidation.ts` walks `getAllLootPools()` at module load
- Path: [`src/lib/saveValidation.ts:170`](src/lib/saveValidation.ts#L170)
- Found by: zone D
- Severity: low
- Description: similar shape to the `stateCore.ts` finding: an Edge-runtime API hot path imports a module that walks the loot pools at top level. Loot pools are static, so the cost is a one-shot module-load tax — but it does mean every cold start of `/api/save` pays it. Probably fine on Vercel Edge (cached after first invocation), but worth confirming.
- Suggested fix: lazy-init the derived caps inside `validateNoRegression` rather than at module top.
- **Resolved 2026-05-29 in PR #248**: 5 module-load-time constants (`MAX_SINGLE_EQUIPMENT_REFUND`, `CREDITS_DELTA_SLACK`, `GLOBAL_CREDIT_CAPS`, `MAX_CREDITS_PER_SECOND`, `MAX_CREDITS_PER_FIRST_CLEAR`) converted to first-call getter functions. Removes the `infra → content` module-load edge.

## 2026-05-29 — `@/lib` barrel can't be the sole import path while `auth.ts` has module-load side effects
- Path: [`src/lib/index.ts`](src/lib/index.ts), [`src/lib/auth.ts`](src/lib/auth.ts)
- Found by: Phase 3 Tier 2 (infra extraction, PR #248)
- Severity: medium (architectural — blocks the audit's "everyone goes through the barrel" goal for `infra`)
- Description: PR #248 created `src/lib/index.ts` re-exporting all infra modules, but routing existing deep `@/lib/<file>` imports through the barrel broke 6 test files. The barrel's `export * from "./auth"` triggers `auth.ts` module-load, which calls `NextAuth(config)` at top level — pulling in `next-auth` → `next/server`. Test files that don't expect to load auth (e.g. `tests/security/creditCapCircular.test.ts`, `tests/security/saveLogPayload.test.ts`, `src/game/state/sync.test.ts`) fail with `Cannot find module 'next/server'`. Net result: 36 existing deep `@/lib/*` imports across 22 files stay on deep paths; the module boundary isn't enforced for `infra` the way it is for `types`, `schemas`, `audio`, `content`.
- Suggested fix: pick one —
  (a) Restructure `auth.ts` to be side-effect-free at module load by deferring `NextAuth(config)` into a `getAuth()` factory. Every `auth()` caller updates. Most thorough; touches the same files the importer migration would have touched anyway.
  (b) Carve `auth.ts` out of the barrel and keep its deep path canonical. Other infra files migrate to the barrel cleanly. Smallest change.
  (c) Accept the barrel as nominal-only. New code uses the barrel; existing code keeps deep paths. Cheapest but defeats the audit goal for `infra`.

---

## How to add a new entry

```
## YYYY-MM-DD — short title
- Path: `<file:line>`
- Found by: zone X / Phase N agent / etc.
- Severity: low / medium / high
- Description: 2-3 lines.
- Suggested fix (optional): one sentence.
```

This file is append-only. Resolved items are NOT removed — they get a "Resolved <date> in PR #<N>" line appended. That keeps the audit trail.

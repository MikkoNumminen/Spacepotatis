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

## 2026-05-04 — `BossScene.ts` is dead code
- Path: [`src/game/phaser/scenes/BossScene.ts`](src/game/phaser/scenes/BossScene.ts)
- Found by: zone B
- Severity: low
- Description: defined as a Phaser scene but not registered in the scene array at [`src/game/phaser/config.ts:64`](src/game/phaser/config.ts#L64). The boss fight is implemented inside `CombatScene` instead. The dangling file is misleading to anyone trying to follow scene routing.
- Suggested fix: delete the file, or wire it into a "boss fight runs in its own scene" refactor.

## 2026-05-04 — `audit-readiness-check.yml` Node version mismatches `ci.yml`
- Path: [`.github/workflows/audit-readiness-check.yml`](.github/workflows/audit-readiness-check.yml) vs [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Found by: zone D
- Severity: low
- Description: `audit-readiness-check.yml` runs on Node 22; `ci.yml` runs on Node 20. Two different Node versions in CI for the same repo means a script can pass one and fail the other.
- Suggested fix: pick one (probably 20 to match the rest), pin in both workflows.

## 2026-05-04 — `package.json#scripts.db:migrate` calls dbmate while CLAUDE.md says use the node runner
- Path: [`package.json`](package.json) `scripts.db:migrate`
- Found by: zone D
- Severity: low
- Description: CLAUDE.md §6 + §7 instructs contributors to use `node --env-file=.env.local scripts/migrate.mjs` so dbmate isn't a hard dependency. But `npm run db:migrate` calls dbmate. Documentation drift — works for anyone with dbmate installed, surprises everyone else.
- Suggested fix: change the script to invoke `scripts/migrate.mjs`, OR update CLAUDE.md to say dbmate is in fact required.

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

## 2026-05-04 — `three/planetTexture.ts#styleFor` switch is non-exhaustive over `MissionId`
- Path: [`src/game/three/planetTexture.ts:35-147`](src/game/three/planetTexture.ts#L35-L147)
- Found by: zone C
- Severity: medium
- Description: the `styleFor(missionId)` function has a hard-coded switch covering specific mission ids. Adding a new mission to `missions.json` (which the integrity check deliberately doesn't validate against sprite/texture generators — see [`integrityCheck.ts:50-53`](src/game/data/integrityCheck.ts#L50-L53)) would Zod-validate fine but crash inside `paintDiffuse()` at render time. The TS compiler doesn't catch this because `MissionId` is a wide union and the switch returns a default fallback that doesn't actually execute every code path.
- Suggested fix: either (a) make the switch exhaustive with a `never` exhaustiveness guard so adding a `MissionId` is a tsc error, OR (b) move the styling data into `missions.json` itself so a missing entry is caught by the schema parser. (b) is more in keeping with the "data-driven" pattern of the rest of the catalog.

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

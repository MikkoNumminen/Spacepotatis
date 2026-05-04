# Phase 4 — Documentation summary

This file accumulates each `doc-writer` agent's contribution. The orchestrator
combines them after all parallel runs land.

## Module: content

**Files touched:**

- `src/game/data/README.md` (rewritten — full module README per Phase 4 contract)
- `src/game/data/weapons.ts`
- `src/game/data/enemies.ts`
- `src/game/data/missions.ts`
- `src/game/data/perks.ts`
- `src/game/data/augments.ts`
- `src/game/data/lootPools.ts`
- `src/game/data/solarSystems.ts`
- `src/game/data/story.ts`
- `src/game/data/storyTriggers.ts`
- `src/game/data/waves.ts`
- `src/game/data/obstacles.ts`
- `src/game/data/missionWeaponRewards.ts`
- `src/game/data/integrityCheck.ts`

**TSDoc count (total `@stable` / `@internal` markers added):** 57.

By file:

| File | TSDoc blocks |
|---|---|
| `weapons.ts` | 5 |
| `enemies.ts` | 2 |
| `missions.ts` | 3 |
| `perks.ts` | 5 (1 marked `@internal`) |
| `augments.ts` | 9 |
| `lootPools.ts` | 4 |
| `solarSystems.ts` | 2 |
| `story.ts` | 7 |
| `storyTriggers.ts` | 5 |
| `waves.ts` | 2 |
| `obstacles.ts` | 2 |
| `missionWeaponRewards.ts` | 3 |
| `integrityCheck.ts` | 3 |

**Marker counts:**

- `// PUBLIC API` banners: 13 (one per accessor file).
- `// INVARIANT:` markers: 4
  - `weapons.ts` — `WEAPON_IDS` / `WeaponId` union drift.
  - `missions.ts` — integrityCheck boot trigger contract.
  - `augments.ts` — `as const satisfies` totality guard.
  - `missionWeaponRewards.ts` — bijection MissionId ↔ WeaponId.
- `// AI-NOTE:` markers: 6
  - `weapons.ts`, `enemies.ts`, `missions.ts`, `solarSystems.ts`, `waves.ts`, `obstacles.ts` — all annotate the deliberate `as` cast and the ~98 kB bundle-cost rationale tied to `jsonSchemaValidation.test.ts`.

**README:** [`src/game/data/README.md`](../../src/game/data/README.md)

**Verification:**

- `npm run typecheck` — passes after edits.

**Ambiguities surfaced:**

- The target architecture lists `REMOVED_WEAPON_BASE_COSTS` as part of the
  `content` public API, but it currently lives in
  `src/game/state/persistence/salvageRemovedWeapons.ts`. Documented as a
  legacy exception in the README; Phase 3 may relocate it.
- No prior `@stable` / `// PUBLIC API` convention existed in the codebase.
  This module is the first to use them; sibling modules (`schemas`, `state`,
  etc.) will need to follow the same convention as their doc-writer agents
  land.

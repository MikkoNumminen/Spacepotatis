# types

## Purpose

Shared TypeScript types — the canonical IDs and definitions every other module names. Pure compile-time; zero runtime. This is the **leaf** of the dependency graph: nothing here imports anything from inside `src/`. Phaser-, Three-, and React-side code can all depend on these names without dragging engines into each other's bundles.

The whole module is currently a single file ([game.ts](./game.ts), ~235 LOC). If it grows past ~400 LOC, split per domain (`weapons.types.ts`, `missions.types.ts`, etc.) with a barrel `index.ts` re-exporting the public API.

## Public API

Every export below is `@stable`. Breaking changes require a coordinated update of every consumer.

### ID type aliases (string-literal unions)

| Type | Description |
|---|---|
| `WeaponId` | Canonical id for every weapon catalog entry. Locked-in-lockstep with `WEAPON_IDS` in `src/game/data/weapons.ts` and the `WeaponIdSchema` enum in `src/lib/schemas/save.ts`. |
| `WeaponFamily` | `"potato" \| "pirate"` — catalog-tag for shop / loadout filtering. The tutorial-system shop is gated to `family: "potato"`. |
| `WeaponTier` | `1 \| 2`. Tier 1 = potato starter line; tier 2 = pirate haul. Drives the tier badge and tutorial-system shop filter. |
| `AugmentId` | Canonical id for every weapon augment. Locked-in-lockstep with `AUGMENT_IDS` in `src/lib/schemas/save.ts`. |
| `EnemyId` | Canonical id for every enemy. Locked with `ENEMY_IDS` in `src/lib/schemas/enemies.ts`. |
| `EnemyBehavior` | `"straight" \| "zigzag" \| "homing" \| "boss"` — the AI mode every enemy picks at spawn. |
| `ObstacleId` | Canonical id for indestructible space junk. Locked with `OBSTACLE_IDS` in `src/lib/schemas/obstacles.ts`. |
| `ObstacleBehavior` | `"drift"` today; reserved for future variants. |
| `MissionId` | Canonical id for every mission / shop / scenery planet. Locked with `MISSION_IDS` in `src/lib/schemas/save.ts`. |
| `SolarSystemId` | Canonical id for each top-level solar system (`"tutorial" \| "tubernovae"` today). Locked with `SOLAR_SYSTEM_IDS` in `src/lib/schemas/save.ts`. |
| `PlanetKind` | `"mission" \| "shop" \| "scenery"` — discriminator for `MissionDefinition.kind`. |

### Definition interfaces (read-only catalog rows)

| Interface | Description |
|---|---|
| `WeaponDefinition` | One row of `weapons.json`. Carries fire-rate, projectile count, AoE / slow params, cosmetic tints, family + tier metadata. |
| `EnemyDefinition` | One row of `enemies.json`. HP, speed, behavior, score / credit value, sprite + fire cadence. |
| `ObstacleDefinition` | One row of `obstacles.json`. Indestructible space junk — collision damage and hitbox only. |
| `WaveSpawn` | One enemy-cohort spec inside a wave (count, formation, anchor x). |
| `ObstacleSpawn` | Same as `WaveSpawn` for obstacles, minus the `vee` formation. |
| `WaveDefinition` | One wave: id + duration + array of spawns + optional obstacle spawns. |
| `MissionWaves` | All waves bound to a single `MissionId`. |
| `MissionDefinition` | One row of `missions.json`. Difficulty, orbit math, music track, prereqs, ring + perks-allowed flag. |
| `SolarSystemDefinition` | One row of `solarSystems.json`. Sun tint + size, ambient hue, galaxy-bed music track. |
| `PlanetRing` | Optional ring-around-planet decoration. |

> ShipConfig, WeaponSlots, ReactorConfig, and WeaponInstance are intentionally **not here** — they live in `src/game/state/ShipConfig.ts` because they are gameplay state, not shared cross-engine schema.

## Internal

None. Single-file module today.

## Dependencies

**None.** This is the leaf — it MUST stay that way. No imports from `src/lib/`, `src/game/`, `src/components/`, `src/app/`. Adding one creates a back-edge that breaks the dependency partial order documented in `docs/audit/02-target-architecture.md`.

## Invariants

- **`*_IDS` ↔ `*Id` lockstep.** Every literal-union ID type has a matching runtime array elsewhere:
  - `WeaponId` ↔ `WEAPON_IDS` in `src/game/data/weapons.ts`
  - `AugmentId` ↔ `AUGMENT_IDS` in `src/lib/schemas/save.ts`
  - `EnemyId` ↔ `ENEMY_IDS` in `src/lib/schemas/enemies.ts`
  - `ObstacleId` ↔ `OBSTACLE_IDS` in `src/lib/schemas/obstacles.ts`
  - `MissionId` ↔ `MISSION_IDS` in `src/lib/schemas/save.ts`
  - `SolarSystemId` ↔ `SOLAR_SYSTEM_IDS` in `src/lib/schemas/save.ts`
  Each runtime array uses `as const satisfies readonly <Id>[]` — the `satisfies` clause fails to typecheck if the lists drift apart. **Don't disable this guard.**
- **No Phaser / Three / React imports.** This file must remain renderer-agnostic. Adding `import { Scene } from "phaser"` here would pull Phaser into every page that touches a `MissionId`, including SSR routes that must stay engine-free.
- **`fireRateMs > 0` (downstream).** The `WeaponDefinition.fireRateMs` and `EnemyDefinition.fireRateMs` numerics get divided by in DPS / spawn math. The matching schemas reject zero / negative values; downstream code assumes the schemas held.

## Common pitfalls

- **Adding a new ID variant requires updating BOTH the type union here AND the matching `*_IDS` array.** Forgetting one half passes typecheck on its own but trips the `satisfies` guard the moment both sides typecheck together — and CI runs that. The `/equipment`, `/new-enemy`, `/new-mission`, and `/new-solar-system` skills already encode this two-step.
- **Renaming a definition field is a cross-module breaking change.** The matching schema in `src/lib/schemas/` carries a compile-time drift guard (a `_xCheck = (x: _SchemaInferred): RealType => x` line) — rename here, expect that line to fail tsc until you rename in the schema too.
- **No runtime values in this file.** Adding a `const` here means callers paying for it on every page even when they only wanted a type. Constants live in `src/game/data/` (catalogs) or `src/game/state/ShipConfig.ts` (gameplay tunables).

## How to test changes

```bash
npm run typecheck    # the satisfies guards + downstream usage checks
npm test             # downstream behavior tests catch shape implications
```

Types themselves carry no test surface. Effects of a type change show up in:
- `src/lib/schemas/*.test.ts` (compile-time drift guards on every schema)
- `src/game/data/__tests__/jsonSchemaValidation.test.ts` (JSON ↔ schema drift gate)
- `src/game/state/**/*.test.ts` (persistence migrators)

If the typecheck passes everywhere after a type edit, the change is safe by construction.

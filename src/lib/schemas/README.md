# schemas

## Purpose

Zod runtime validators for every API boundary AND for every JSON catalog. The single source of truth for "what shape is this byte stream?" Server input (`/api/save`, `/api/leaderboard`, `/api/handle`) gets parsed through these on every request; client-side `fetch` consumers (e.g. `src/game/state/sync.ts`) parse server responses through them too. Catalog schemas are run once per `npm test` against the JSON files as a **CI drift gate** — they intentionally do NOT parse at module load, because pulling Zod into static-page bundles cost ~98 kB per route before that pattern landed (CLAUDE.md §5 "Game code", §11 "JSON ↔ schema drift gate").

Two distinct uses, one folder:

1. **Boundary schemas** — `SavePayloadSchema`, `RemoteSaveSchema`, `ScorePayloadSchema`, `HandlePayloadSchema`. Run on every API request / response.
2. **Catalog schemas** — `WeaponsFileSchema`, `EnemiesFileSchema`, `ObstaclesFileSchema`, `MissionsFileSchema`, `SolarSystemsFileSchema`, `WavesFileSchema`. Run once per CI build via `src/game/data/__tests__/jsonSchemaValidation.test.ts`.

## Public API

Every schema is exported alongside its `z.infer`-derived type alias where the type is consumed elsewhere. All exports below are `@stable`.

### Boundary schemas (server input / output)

| Export | Validates | Inferred type |
|---|---|---|
| `SavePayloadSchema` ([save.ts](./save.ts)) | Body of `POST /api/save`. Tolerates the legacy ship shape via `LegacyOrShipConfigSchema` so old clients can still write. | `SavePayload` |
| `RemoteSaveSchema` ([save.ts](./save.ts)) | Server response of `GET /api/save`. The Postgres jsonb row deserialized into a typed snapshot. | `RemoteSave` |
| `ScorePayloadSchema` ([save.ts](./save.ts)) | Body of `POST /api/leaderboard`. Tightened to the `MissionId` enum so a hand-crafted POST can't seed the table with arbitrary strings. | `ScorePayload` |
| `HandlePayloadSchema` ([handle.ts](./handle.ts)) | Body of `POST /api/handle`. Trim → length → pattern, mirroring `validateHandle()` in `src/lib/handle.ts`. | `HandlePayload` |

### Catalog schemas (JSON files under `src/game/data/`)

| Export | Validates | Notes |
|---|---|---|
| `WeaponsFileSchema` ([weapons.ts](./weapons.ts)) | `weapons.json` | `fireRateMs > 0` rejects Infinity-divide in DPS math |
| `EnemiesFileSchema` ([enemies.ts](./enemies.ts)) | `enemies.json` | `fireRateMs.positive().nullable()` — `null` = "doesn't shoot" |
| `ObstaclesFileSchema` ([obstacles.ts](./obstacles.ts)) | `obstacles.json` | indestructible space junk |
| `MissionsFileSchema` ([missions.ts](./missions.ts)) | `missions.json` | difficulty is `1 \| 2 \| 3` (rejects stringified ints); `musicTrack: string.min(1).nullable()` rejects "" footgun |
| `SolarSystemsFileSchema` ([solarSystems.ts](./solarSystems.ts)) | `solarSystems.json` | `galaxyMusicTrack: string.min(1)` (same "" footgun) |
| `WavesFileSchema` ([waves.ts](./waves.ts)) | `waves.json` | enemy / mission ids referenced via the corresponding ID schemas |

### Sub-schemas re-exported for cross-file reuse

These are `@stable` because other catalog schemas reference them — they form the spine of the schema graph:

| Export | Defined in | Used by |
|---|---|---|
| `WeaponIdSchema`, `AugmentIdSchema`, `MissionIdSchema`, `SolarSystemIdSchema` | [save.ts](./save.ts) | every catalog schema that references those ids |
| `EnemyIdSchema`, `ENEMY_IDS` | [enemies.ts](./enemies.ts) | `WavesFileSchema` |
| `ObstacleIdSchema`, `OBSTACLE_IDS` | [obstacles.ts](./obstacles.ts) | `WavesFileSchema` |
| `WEAPON_IDS` (re-export) | [save.ts](./save.ts) | tests + back-compat — original lives in `src/game/data/weapons.ts` |
| `AUGMENT_IDS`, `MISSION_IDS`, `SOLAR_SYSTEM_IDS` | [save.ts](./save.ts) | tests + the matching `z.enum` builders |
| `WeaponInstanceSchema`, `WeaponSlotsSchema`, `WeaponInventorySchema`, `ReactorConfigSchema`, `ShipConfigSchema`, `LegacyShipSchema`, `LegacyOrShipConfigSchema` | [save.ts](./save.ts) | save-route handler + `sync.ts` parse |

## Internal

- **Compile-time drift guards.** Every schema file ends with `type _X = z.infer<typeof XSchema>; const _xCheck = (x: _X): RealType => x; void _xCheck;` lines. They have no runtime effect — their job is to fail `tsc` if the schema's inferred type stops being assignable to the canonical TS interface in `src/types/game.ts` or `src/game/state/ShipConfig.ts`. **Don't delete these.** Without them, a field renamed in `types/game.ts` could leave the schema silently out of sync until runtime data happened to drift the same way.
- **`_primitives.ts`** does not exist today. If shared helpers (e.g. `SafePositiveIntSchema`) appear, add them in a `_primitives.ts` and DO NOT re-export from any per-file schema's barrel — keep them internal so consumers can't reach around the boundary schemas.

## Dependencies

`types` only. Importing from anywhere else (notably `src/game/state/ShipConfig.ts`) is a deliberate exception for `save.ts`, which mirrors gameplay-state types live in that file rather than `src/types/game.ts`. **Do not** add imports from `src/game/data/`, `src/components/`, `src/game/phaser/`, or `src/game/three/`. The schemas must stay parseable on the Edge runtime.

## Invariants

- **Schema-vs-`as`-cast pattern (CLAUDE.md §11).** API routes and client `fetch` consumers MUST use these schemas — no `as` casts at the network edge. Catalog accessors in `src/game/data/*.ts` do exactly one `as` cast at module load with NO runtime parse — soundness is enforced by the CI drift gate (`src/game/data/__tests__/jsonSchemaValidation.test.ts`), which runs the matching schema against each JSON on every push. **Don't re-add `Schema.parse(jsonData)` at module load** — that's the ~98 kB regression the audit forbade.
- **`*_IDS satisfies readonly <Id>[]` lock.** Every runtime ID array (`WEAPON_IDS`, `AUGMENT_IDS`, `MISSION_IDS`, `SOLAR_SYSTEM_IDS`, `ENEMY_IDS`, `OBSTACLE_IDS`) carries `as const satisfies readonly <Id>[]` and feeds a `z.enum`. The `satisfies` clause makes drift between the literal union in `src/types/game.ts` and the runtime list a compile error.
- **`fireRateMs.positive()`** wherever it appears — both `WeaponDefinitionSchema` and `EnemyDefinitionSchema` reject 0 / negative because the gameplay loop divides into it as a frequency. A single 0 would produce `Infinity` DPS or an infinite spawn loop.
- **`musicTrack` / `galaxyMusicTrack`: `z.string().min(1)`** — empty string is a footgun because the audio engine treats `""` as "release the slot". Rejecting it at the schema layer prevents silently killing the bed for an entire system.
- **`LegacyOrShipConfigSchema` is permissive on purpose.** Pre-loadout, named-slots, and id-array ship shapes still live in Postgres rows. The strict `ShipConfigSchema` wins when the payload is well-formed; otherwise `LegacyShipSchema` parses it so `migrateShip()` in `src/game/state/persistence/` can do the cleanup. **Don't tighten the legacy branch** — that would reject saves whose `shipConfig` is `{}` (an older POST bug stored that for some accounts) and the rejection cascades into the entire `RemoteSaveSchema` parse, losing credits + completed missions.

## Common pitfalls

- **Forgetting to update the schema when a type changes.** The compile-time drift guards catch *structural* drift (renamed / retyped fields). They do NOT catch a legitimate field deletion if both sides are deleted in lockstep. Always run `npm test src/lib/schemas` after a type change to confirm the boundary tests still pass.
- **Adding a new ID variant in only one place.** The two-step is: (1) extend the literal union in `src/types/game.ts`, (2) extend the matching `*_IDS` array (here or in `src/game/data/weapons.ts` for `WEAPON_IDS`). The relevant content skills (`/equipment`, `/new-enemy`, `/new-mission`, `/new-solar-system`) already encode this — invoke them before hand-editing.
- **Pulling Zod into a hot import path.** A schema export is a runtime value, not just a type. Importing one into a file that lands on a static page's first-load JS pulls Zod in too. If you only need the inferred type, `import type { SavePayload } from "@/lib/schemas/save"` — the `type`-only import is erased at compile time.
- **Adding `Schema.parse(jsonData)` at module load.** See "Invariants" above. The CI drift gate is the only place that should run a catalog schema's `.parse()` at load time.

## How to test changes

```bash
npm test src/lib/schemas    # boundary + catalog schemas
npm test src/game/data      # catalog drift gate + cross-file integrity
npm run typecheck           # the satisfies guards + drift checks at the bottom of each file
```

Each schema file has a matching `*.test.ts` (handle, save, weapons, enemies, missions, solarSystems, waves). The drift gate test at `src/game/data/__tests__/jsonSchemaValidation.test.ts` parses each JSON catalog through its schema once per `npm test` — this is the only place schemas run at module-touch time.

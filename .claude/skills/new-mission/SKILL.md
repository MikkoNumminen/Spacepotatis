---
name: new-mission
description: Scaffold a new combat mission across missions.json, waves.json, the galaxy planet binding, and a smoke test — in one shot.
---

# When to use
"/new-mission", "add a mission", "scaffold a planet", or any new playable combat mission / shop planet. NOT for tweaking an existing mission's balance — edit JSON directly.

# Inputs (ask once, in one message)
1. `missionId` — kebab-case, unique vs `src/game/data/missions.json`.
2. `displayName`.
3. `kind` — `PlanetKind` from `src/types/game.ts`:
   - `"mission"` — combat; requires ≥1 wave entry in `waves.json`.
   - `"shop"` — dock-only, opens `/shop`. No waves.
   - `"scenery"` — overworld set-dressing. No waves/shop/quest panel. Used by Spurdospärdersi (id `"shop"`) as parent body that the Market station orbits via `orbitParentId`.
4. `difficulty` — `1`|`2`|`3` (planet-color fallback; ignored for shops).
5. `solarSystemId` — required; must be in `src/game/data/solarSystems.json`. Default `"tutorial"` for starting cluster, `"tubernovae"` for second. New system → run `/new-solar-system` first.
6. Wave count + enemy mix — only when `kind === "mission"`.

# Steps
1. Read `missions.json`; verify id unique; pick non-overlapping `orbitRadius`/`startAngle`/`orbitNode` **within the same `solarSystemId`** (different systems can't collide).
2. Read `enemies.json`; confirm every spawn enemy id exists. Valid ids:
   - **Aphids:** `aphid`, `aphid-giant`, `aphid-queen`, `aphid-empress` (tutorial boss — wired into `boss-1`)
   - **Beetles:** `beetle-scarab`, `beetle-rhino`, `beetle-stag`
   - **Caterpillars:** `caterpillar-hornworm`, `caterpillar-army`, `caterpillar-monarch` (defined as boss in `enemies.json` but not wired into any wave today)
   - **Spiders:** `spider-wolf`, `spider-widow`, `spider-jumper`
   - **Dragonflies:** `dragonfly-common`, `dragonfly-heli`, `dragonfly-damsel`
   - **Pirates (tubernovae):** `pirate-skiff`, `pirate-cutlass`, `pirate-marauder`, `pirate-corsair`, `pirate-frigate`, `pirate-galleon`, `pirate-dreadnought` (tubernovae boss — wired into `burnt-spud`)
   New enemy needed? Stop and run `/new-enemy` first.
3. Append to `missions.json` `missions` array using `MissionDefinition` from `src/types/game.ts`. Required: `id`, `kind`, `name`, `description`, `difficulty`, `solarSystemId`, `texture` (`/textures/planets/<id>.jpg`), `orbitRadius`, `orbitSpeed`, `startAngle`, `scale`, `requires` (existing mission ids), `musicTrack` (`/audio/music/<id>.ogg` or `null` for shops). Required for `kind: "mission"`: `planetStyle` (a `PlanetStyle` object from `src/types/game.ts`: `noiseScale`, `octaves`, `bandStrength`, `featureColor`, `featureThreshold`, `featureMix`, `craters`, `craterSizeRange`) — `integrityCheck.ts` rejects a combat mission without it. Optional for `shop`/`scenery`. Optional: `orbitTilt`, `orbitNode`, `ring`, `perksAllowed`, `orbitParentId` (a `MissionId` — body orbits that parent's world position instead of system origin; example: the `id: "market"` entry orbiting `id: "shop"`).
4. Extend `MissionId` union in `src/types/game.ts` with the new literal (sort by appearance in `missions.json`).
5. If `kind === "mission"`, append `{ missionId, waves: [...] }` to `waves.json`. Each wave: `id` (conventionally `"<missionId>-wave-N"`), `durationMs`, `spawns: [{ enemy, count, delayMs, intervalMs, formation, xPercent }]`. Formation ∈ `"line" | "vee" | "scatter" | "column"`. `xPercent` ∈ `0..1`. Per-spawn budget: `delayMs + max(0, count-1)*intervalMs <= durationMs` (enforced by data test).
6. Galaxy binding is automatic — `src/game/three/GalaxyScene.ts` filters `MISSIONS` by active `solarSystemId`. **`SceneRig` picks renderer by kind**: `kind: "shop"` → `Station.ts` (mechanical mesh, hard-coded hull/accent/light colors — `MISSION_COLOR_OVERRIDE` does NOT apply); `kind: "mission" | "scenery"` → `Planet.ts` (procedural sphere). For a distinct look on a `mission`/`scenery` planet, set the planet's `planetStyle` object in `missions.json` (`noiseScale`/`octaves`/`bandStrength`/`featureColor`/`featureThreshold`/`featureMix`/`craters`/`craterSizeRange`); for a base hue beyond the difficulty palette, add a `MISSION_COLOR_OVERRIDE` entry in `Planet.ts`. To restyle a shop, edit `Station.ts` constants directly. Tell user they can drop a JPG at `public/textures/planets/<id>.jpg` later (procedural fallback otherwise; shops ignore the JPG).
7. If this mission unlocks a different system on completion, add `[missionId, solarSystemId]` to the `SYSTEM_UNLOCK_GATES` Map in `src/game/data/systemUnlocks.ts` (re-exported from `stateCore.ts` for backward-compat callers; `completeMission()` there reads it). (Currently `boss-1` unlocks `tubernovae`.)
8. Run `npm run typecheck && npm test`; fix failures. `src/game/data/data.test.ts` enforces the invariants below.
9. Report new mission id, files modified, and any planet-texture asset still owed.

> **Tutorial weapon gating.** Shop weapon visibility is per-mission-unlock: a weapon is buyable only once its unlocking mission appears in `MISSION_WEAPON_REWARDS` (`src/game/data/missionWeaponRewards.ts`), surfaced via `getBuyableWeaponIds` in `src/components/ShopUI.tsx` — not a solar-system filter. The `src/game/data/lootPools.ts` tutorial pool still scopes in-system DROPS to tier-1 weapons. Either way, exposing non-tutorial weapons is `/equipment` work, not `/new-mission`.

# Invariants
- `missionId` unique in `missions.json`.
- Every `requires` entry exists in `missions.json`.
- Every spawn `enemy` exists in `enemies.json`.
- Every `mission`-kind has ≥1 wave in `waves.json`.
- Every `mission`-kind has a `planetStyle` (enforced by `integrityCheck.ts`).
- `MissionId` union in `src/types/game.ts` includes the new id.
- `solarSystemId` resolves in `solarSystems.json`.
- No `any`; no balance constants in `.ts` (numbers go in JSON).
- Per-spawn budget: `delayMs + max(0, count-1)*intervalMs <= durationMs`.
- `texture` starts with `/textures/`; `musicTrack` is `null` or starts with `/audio/`.
- `npm test` passes.

# Files
Modifies:
- `src/game/data/missions.json` — append entry.
- `src/game/data/waves.json` — append waves block (only `kind === "mission"`).
- `src/types/game.ts` — extend `MissionId` union.

Modifies (conditional):
- `src/game/data/systemUnlocks.ts` — `SYSTEM_UNLOCK_GATES` (only if unlocking another system; re-exported from `stateCore.ts`).
- `src/game/three/Planet.ts` + `src/game/three/planetTexture.ts` — only for per-mission color identity.

Creates (optional, only if user supplies asset):
- `public/textures/planets/<id>.jpg` — procedural fallback otherwise.
- `public/audio/music/<id>.ogg` — use `null` `musicTrack` if absent.

Does NOT touch: `src/game/three/GalaxyScene.ts` (auto-bound), `src/game/phaser/systems/WaveManager.ts` (re-exports `getWavesForMission`).

## Freshness check

These checks assert the load-bearing files, type names, and invariants this skill scaffolds against still hold. Paths are repo-relative (project scope → `scope_root`).

```toml
[[check]]
kind = "path_exists"
path = "src/game/data/missions.json"

[[check]]
kind = "path_exists"
path = "src/game/data/waves.json"

[[check]]
kind = "file_contains"
path = "src/types/game.ts"
pattern = "export interface MissionDefinition"

[[check]]
kind = "file_contains"
path = "src/types/game.ts"
pattern = "readonly planetStyle\\?: PlanetStyle"

[[check]]
kind = "file_contains"
path = "src/game/data/integrityCheck.ts"
pattern = "planetStyle is required for combat missions"

[[check]]
kind = "file_contains"
path = "src/game/data/systemUnlocks.ts"
pattern = "export const SYSTEM_UNLOCK_GATES"

[[check]]
kind = "file_contains"
path = "src/game/three/planetTexture.ts"
pattern = "export function generatePlanetSurface"

[[check]]
kind = "file_contains"
path = "src/components/ShopUI.tsx"
pattern = "getBuyableWeaponIds"
```

---
name: new-mission
description: Scaffold a new combat mission across missions.json, waves.json, the galaxy planet binding, and a smoke test — in one shot.
---

# When to use
The user says "/new-mission", "add a mission", "scaffold a planet", or otherwise asks for a new playable combat mission or shop planet in the galaxy. Do NOT use for tweaking an existing mission's balance — edit the JSON directly.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `missionId` — kebab-case, unique. Must NOT collide with existing ids in `src/game/data/missions.json`.
2. `displayName` — shown on the planet label and mission panel.
3. `kind` — one of `"mission"` | `"shop"` | `"scenery"` (this is the full `PlanetKind` union in `src/types/game.ts`):
   - `"mission"` — combat planet with waves; `kind === "mission"` requires at least one wave entry in `waves.json`.
   - `"shop"` — dock-only; clicking opens `/shop`. No waves.
   - `"scenery"` — pure overworld set-dressing. No waves, no shop UI, no quest-panel entry. Used today by the Spurdospärdersi planet (id `"shop"`) in tutorial as a parent body that the Market station orbits via `orbitParentId`.
4. `difficulty` — `1` | `2` | `3` (drives planet color, used as a fallback when no per-mission color override exists; ignored for shops).
5. `solarSystemId` — required. Must be one of the ids in `src/game/data/solarSystems.json`. Default to `"tutorial"` if the user is adding to the starting cluster; use `"tubernovae"` for the second cluster. If the user wants a brand-new system, run `/new-solar-system` first.
6. Wave count and rough enemy mix (e.g. "3 waves, mostly dragonflies + one Monarch Caterpillar boss"). Only required when `kind === "mission"`.

# Steps
1. Read `src/game/data/missions.json` to confirm the new id is unique and to pick non-overlapping `orbitRadius` / `startAngle` / `orbitNode` values **within the same `solarSystemId`** (planets in different systems can't collide).
2. Read `src/game/data/enemies.json` to confirm every enemy id you plan to spawn exists. Valid ids today (post bug-themed redesign):
   - **Aphids:** `aphid`, `aphid-giant`, `aphid-queen`, `aphid-empress` (tutorial boss)
   - **Beetles:** `beetle-scarab`, `beetle-rhino`, `beetle-stag`
   - **Caterpillars:** `caterpillar-hornworm`, `caterpillar-army`, `caterpillar-monarch` (tubernovae boss)
   - **Spiders:** `spider-wolf`, `spider-widow`, `spider-jumper`
   - **Dragonflies:** `dragonfly-common`, `dragonfly-heli`, `dragonfly-damsel`
   If the user wants a new enemy type, stop and tell them to run `/new-enemy` first (this skill does not add enemies).
3. Append a new entry to `missions.json` `missions` array using the canonical `MissionDefinition` shape from `src/types/game.ts`. Required fields: `id`, `kind`, `name`, `description`, `difficulty` (1|2|3), `solarSystemId` (SolarSystemId literal), `texture` (`/textures/planets/<id>.jpg`), `orbitRadius`, `orbitSpeed`, `startAngle`, `scale`, `requires` (array of existing mission ids), `musicTrack` (`/audio/music/<id>.ogg` or `null` for shops). Optional: `orbitTilt`, `orbitNode`, `ring: { innerRadius, outerRadius, tilt }`, `perksAllowed`, `orbitParentId` (a `MissionId` — when set, the body orbits the named parent's current world position instead of the system origin; used today by `id: "market"` orbiting `id: "shop"` in `missions.json:81`. Without it, station-style entries float at the system origin).
4. Update the `MissionId` union in `src/types/game.ts` to include the new id literal. Keep the union sorted by appearance in `missions.json`.
5. If `kind === "mission"`, append a `{ missionId, waves: [...] }` entry to `src/game/data/waves.json`. Each wave needs `id` (string, conventionally `"<missionId>-wave-N"`), `durationMs`, and `spawns: [{ enemy, count, delayMs, intervalMs, formation, xPercent }]`. Formation is `"line" | "vee" | "scatter" | "column"`. `xPercent` is `0..1`. The data test enforces `delayMs + (count-1)*intervalMs <= durationMs` per spawn — keep waves within their own duration budget.
6. Galaxy planet binding is automatic: `src/game/three/GalaxyScene.ts` filters `MISSIONS` by the active `solarSystemId` and constructs a `Planet` per match. No manual wiring required. The planet texture path in `texture` should resolve under `public/`; if no file is committed there yet, the planet still renders via procedural fallback in `src/game/three/planetTexture.ts`. If you want a distinct color identity (not just the difficulty palette), also add an entry to `MISSION_COLOR_OVERRIDE` in `src/game/three/Planet.ts` and a hand-tuned preset case in `planetTexture.ts#styleFor`. Mention to the user that they can drop a JPG at `public/textures/planets/<id>.jpg` later to replace the procedural surface.
7. If the new mission should unlock a different solar system on completion, add a `[missionId, solarSystemId]` entry to `SYSTEM_UNLOCK_GATES` in `src/game/state/stateCore.ts`. (Currently `boss-1` unlocks `tubernovae`.) Note: the GameState barrel re-exports this, so old `import * as GameState from "@/game/state/GameState"` callers still resolve.
8. Run `npm run typecheck && npm test` and fix any failures. The integrity tests in `src/game/data/data.test.ts` enforce: unique mission ids, every `requires` entry exists, every `kind === "mission"` mission has at least one wave, every wave references a known mission id, every spawn references a known enemy id, every `solarSystemId` resolves to a known system, and the wave duration budget rule above.
9. Report back: the new mission id, the files modified, and any planet-texture asset still owed.

> **Tutorial-system family gating.** Any new mission whose `solarSystemId === "tutorial"` will only see `family: "potato"` weapons in shop drops and shop UI — the gating logic lives in `src/game/data/lootPools.ts` (the tutorial pool's `weapons` array) and `src/components/ShopUI.tsx` (the `currentSolarSystemId === "tutorial"` filter on `getAllWeapons()`). If a tutorial mission should expose a non-potato weapon family, that's `/equipment` work, not `/new-mission`.

# Invariants this skill enforces
- New `missionId` is unique across `missions.json`.
- Every entry in `requires` already exists in `missions.json`.
- Every spawn `enemy` exists in `enemies.json`.
- Every `mission`-kind mission has at least one wave in `waves.json`.
- `MissionId` union in `src/types/game.ts` includes the new id.
- `solarSystemId` resolves to an entry in `solarSystems.json`.
- No `any` types introduced. No game-balance constants in `.ts` code — all numbers go in JSON.
- Per-spawn budget: `delayMs + max(0, count-1) * intervalMs <= durationMs`.
- `texture` starts with `/textures/`; `musicTrack` is `null` or starts with `/audio/`.
- `npm test` passes after the change.

# Files this skill modifies / creates
Modifies:
- `src/game/data/missions.json` — append new mission entry.
- `src/game/data/waves.json` — append new mission waves block (only when `kind === "mission"`).
- `src/types/game.ts` — extend the `MissionId` union literal.

Modifies (only if the new mission unlocks a different system):
- `src/game/state/stateCore.ts` — add a `SYSTEM_UNLOCK_GATES` entry.

Modifies (only if you want a per-mission color identity):
- `src/game/three/Planet.ts` — `MISSION_COLOR_OVERRIDE` entry.
- `src/game/three/planetTexture.ts` — `styleFor` case for a hand-tuned procedural preset.

Creates (optional, only if the user supplies the asset):
- `public/textures/planets/<missionId>.jpg` — planet surface texture. Procedural fallback renders if absent.
- `public/audio/music/<missionId>.ogg` — combat music. Use `null` `musicTrack` if absent.

Does NOT touch:
- `src/game/three/GalaxyScene.ts` — planets are bound automatically from `missions.json` filtered by active system.
- `src/game/phaser/systems/WaveManager.ts` — re-exports `getWavesForMission` from the data layer; reads JSON at runtime.

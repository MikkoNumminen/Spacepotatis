---
name: new-mission
description: Scaffold a new combat mission across missions.json, waves.json, the galaxy planet binding, and a smoke test — in one shot.
---

# When to use
The user says "/new-mission", "add a mission", "scaffold a planet", or otherwise asks for a new playable combat mission or shop planet in the galaxy. Do NOT use for tweaking an existing mission's balance — edit the JSON directly.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `missionId` — kebab-case, unique. Must NOT collide with existing ids in `src/game/phaser/data/missions.json`.
2. `displayName` — shown on the planet label and mission panel.
3. `kind` — `"mission"` | `"shop"` (treat "hub" as `"shop"` until a hub kind exists).
4. `difficulty` — `1` | `2` | `3` (drives planet color; ignored for shops).
5. Wave count and rough enemy mix (e.g. "3 waves, mostly zigzag + one boss"). Only required when `kind === "mission"`.
6. Solar system the mission belongs to — default to `"tutorial"`. Do NOT add a `solarSystemId` field yet (see TODO below).

# Steps
1. Read `src/game/phaser/data/missions.json` to confirm the new id is unique and to pick non-overlapping `orbitRadius` / `startAngle` / `orbitNode` values (spread orbits so planets don't collide visually).
2. Read `src/game/phaser/data/enemies.json` to confirm every enemy id you plan to spawn exists. Valid ids today: `basic`, `zigzag`, `kamikaze`, `boss-1`. If the user wants a new enemy type, stop and tell them to define it in `enemies.json` first (this skill does not add enemies).
3. Append a new entry to `missions.json` `missions` array using the canonical `MissionDefinition` shape from `src/types/game.ts`. Required fields: `id`, `kind`, `name`, `description`, `difficulty` (1|2|3), `texture` (`/textures/planets/<id>.jpg`), `orbitRadius`, `orbitSpeed`, `startAngle`, `scale`, `requires` (array of existing mission ids), `musicTrack` (`/audio/music/<id>.ogg` or `null` for shops). Optional: `orbitTilt`, `orbitNode`, `ring: { innerRadius, outerRadius, tilt }`, `perksAllowed`.
4. Update the `MissionId` union in `src/types/game.ts` to include the new id literal. Keep the union sorted by appearance in `missions.json`.
5. If `kind === "mission"`, append a `{ missionId, waves: [...] }` entry to `src/game/phaser/data/waves.json`. Each wave needs `id` (string, conventionally `"<missionId>-wave-N"`), `durationMs`, and `spawns: [{ enemy, count, delayMs, intervalMs, formation, xPercent }]`. Formation is `"line" | "vee" | "scatter" | "column"`. `xPercent` is `0..1`. The data test enforces `delayMs + (count-1)*intervalMs <= durationMs` per spawn — keep waves within their own duration budget.
6. Galaxy planet binding is automatic: `src/game/three/GalaxyScene.ts` iterates every entry in `missions.json` and constructs a `Planet` per definition. No manual wiring required. The planet texture path in `texture` should resolve under `public/`; if no file is committed there yet, the planet still renders via procedural fallback in `src/game/three/planetTexture.ts`. Mention to the user that they can drop a JPG at `public/textures/planets/<id>.jpg` later.
7. Run `npm run typecheck && npm test` and fix any failures. The integrity tests in `src/game/phaser/data/data.test.ts` enforce: unique mission ids, every `requires` entry exists, every `kind === "mission"` mission has at least one wave, every wave references a known mission id, every spawn references a known enemy id, and the wave duration budget rule above.
8. Report back: the new mission id, the files modified, and any planet-texture asset still owed.

# Invariants this skill enforces
- New `missionId` is unique across `missions.json`.
- Every entry in `requires` already exists in `missions.json`.
- Every spawn `enemy` exists in `enemies.json`.
- Every `mission`-kind mission has at least one wave in `waves.json`.
- `MissionId` union in `src/types/game.ts` includes the new id.
- No `any` types introduced. No game-balance constants in `.ts` code — all numbers go in JSON.
- Per-spawn budget: `delayMs + max(0, count-1) * intervalMs <= durationMs`.
- `texture` starts with `/textures/`; `musicTrack` is `null` or starts with `/audio/`.
- `npm test` passes after the change.

# Files this skill modifies / creates
Modifies:
- `src/game/phaser/data/missions.json` — append new mission entry.
- `src/game/phaser/data/waves.json` — append new mission waves block (only when `kind === "mission"`).
- `src/types/game.ts` — extend the `MissionId` union literal.

Creates (optional, only if user supplies the asset):
- `public/textures/planets/<missionId>.jpg` — planet surface texture. Procedural fallback renders if absent.
- `public/audio/music/<missionId>.ogg` — combat music. Use `null` `musicTrack` if absent.

Does NOT touch:
- `src/game/three/GalaxyScene.ts` or `src/game/three/Planet.ts` — planets are bound automatically from `missions.json`.
- `src/game/phaser/systems/WaveManager.ts` — re-exports `getWavesForMission` from the data layer; reads JSON at runtime.

# TODO — when multi-solar-system lands
Once `src/game/phaser/data/solarSystems.json` exists, this skill must also: (a) require a `solarSystemId` input, (b) add a `solarSystemId: SolarSystemId` field to the new `MissionDefinition` entry, (c) update the `MissionDefinition` type in `src/types/game.ts`. Until then, do NOT add the field — it would break `MissionDefinition` consumers.

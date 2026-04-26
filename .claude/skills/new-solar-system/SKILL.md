---
name: new-solar-system
description: Add a new solar system to the galaxy — solarSystems.json entry, SolarSystemId union extension, optional unlock gating, and mission-binding TODO list.
---

# When to use
The user says "/new-solar-system", "add a solar system", "scaffold a galaxy", or otherwise asks for a new selectable star system in the galaxy overworld. Do NOT use it to add a single planet inside an existing system — use `/new-mission` for that.

The multi-system data model is already live (see `src/game/phaser/data/solarSystems.json` for the canonical shape and existing entries `tutorial` and `tubernovae`). This skill just appends a new system on top.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `systemId` — kebab-case, unique across `solarSystems.json`.
2. `name` — display name shown in the warp picker and HUD (e.g. `"Tubernovae Cluster"`).
3. `description` — one short sentence shown in the warp picker.
4. `sunColor` — hex like `"#ff7755"`. Drives the central star tint via `Sun.ts`.
5. `sunSize` — multiplier on the base sun radius (existing examples: 1.0 for tutorial, 1.4 for tubernovae). Default 1.0.
6. `ambientHue` — hex like `"#2a1014"`. Currently informational; reserved for future ambient-light tinting.
7. `unlockBy` — either `"default"` (system unlocked at game start) OR a `MissionId` literal that, once completed, unlocks this system.

# Steps
1. **Append the new system entry** to `src/game/phaser/data/solarSystems.json`. The shape is exactly:
   ```json
   {
     "id": "<systemId>",
     "name": "<name>",
     "description": "<description>",
     "sunColor": "<#RRGGBB>",
     "sunSize": <number>,
     "ambientHue": "<#RRGGBB>"
   }
   ```
   Do NOT add `planets`, `unlockedByDefault`, or `unlockedAfter` fields — none of those exist in the current schema. Default-unlocked status lives in `GameState.INITIAL_STATE.unlockedSolarSystems` (currently `["tutorial"]`); per-mission unlock gating lives in `SYSTEM_UNLOCK_GATES` in the same file.
2. **Extend the `SolarSystemId` union** in `src/types/game.ts` to include the new id literal. Keep the union sorted by appearance in `solarSystems.json`.
3. **Wire the unlock**:
   - If `unlockBy === "default"`: append the new id to the `INITIAL_STATE.unlockedSolarSystems` array in `src/game/state/GameState.ts`. (Most systems should NOT default-unlock; the player should earn them.)
   - If `unlockBy === "<missionId>"`: add a `[missionId, systemId]` entry to `SYSTEM_UNLOCK_GATES` (also in `GameState.ts`). The existing `boss-1 → tubernovae` entry is the template. The unlock fires inside `completeMission()`.
4. **Add tests** to `src/game/state/GameState.test.ts`:
   - One test that completing the gating mission pushes the new system id into `unlockedSolarSystems`.
   - One test that `setSolarSystem("<systemId>")` is rejected when the system is not yet unlocked.
   Reuse the patterns already in the file (the `tubernovae` tests are the template).
5. **Add tests** to `src/game/phaser/data/data.test.ts` if missing: every system has a unique `id`, every id used by a `MissionDefinition.solarSystemId` resolves to a real system. (These are likely already present — verify before adding.)
6. **Mission-binding TODO list.** This skill does NOT create missions. After it lands, tell the user: "Run `/new-mission` for each planet you want in `<systemId>`, with `solarSystemId: \"<systemId>\"`." Until at least one mission targets the new system, `GalaxyScene` will render an empty starfield when the player warps to it.
7. **Run** `npm run typecheck && npm test` and fix any failures. The most common failure is forgetting to extend `SolarSystemId` after editing `solarSystems.json`.
8. **Report back** the new system id, the files modified, the unlock condition, and the "now run `/new-mission` for these planets" reminder.

# Invariants this skill enforces
- `solarSystems.json` is valid JSON with the exact six-field shape above.
- Every system `id` is unique.
- Every `SolarSystemId` literal in the union has a matching JSON entry, and vice versa.
- Every `MissionDefinition.solarSystemId` resolves to a known system (existing test).
- A non-default unlock has a corresponding `SYSTEM_UNLOCK_GATES` entry, OR an explicit `INITIAL_STATE.unlockedSolarSystems` push, OR is intentionally unreachable.
- No `any` types introduced. No game-balance constants in `.ts` code.
- `npm test` passes after the change.

# Files this skill modifies
Always:
- `src/game/phaser/data/solarSystems.json` — append the new system entry.
- `src/types/game.ts` — extend the `SolarSystemId` union literal.

Conditionally:
- `src/game/state/GameState.ts` — `INITIAL_STATE.unlockedSolarSystems` (default-unlock) OR `SYSTEM_UNLOCK_GATES` (mission-gated).
- `src/game/state/GameState.test.ts` — unlock + warp-rejection tests.
- `src/game/phaser/data/data.test.ts` — only if existing referential tests don't already cover the new system.

Does NOT touch:
- `src/game/three/GalaxyScene.ts` — the active system is read from `GameState.currentSolarSystemId`; planets are filtered automatically.
- `src/game/three/Sun.ts` — sun appearance is data-driven from `solarSystems.json` already.
- `src/components/GameCanvas.tsx` — the warp picker (`WarpPicker`) iterates `getAllSolarSystems()` filtered to `unlockedSolarSystems`; no UI wiring needed.
- `src/game/phaser/data/missions.json` — adding a system without missions is fine. Use `/new-mission` to populate.

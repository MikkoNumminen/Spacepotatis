---
name: new-solar-system
description: Scaffold a new solar system — solarSystems.json entry, Three.js scene wiring, planet stubs, and mission-binding TODO list.
---

# When to use
The user says "/new-solar-system", "add a solar system", "scaffold a galaxy", or otherwise asks for a new selectable star system in the galaxy overworld. This skill bootstraps the multi-system data model on its first run and appends additional systems on every run after that. Do NOT use it to add a single planet inside an existing system — use `/new-mission` for that.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `systemId` — kebab-case, unique. Must NOT collide with existing ids in `src/game/phaser/data/solarSystems.json` (after first run; on first run this becomes the second entry alongside the auto-migrated `tutorial`).
2. `name` — display name shown in the system selector and HUD.
3. `starColor` — hex like `"#ffd27a"`. Drives the central star tint.
4. `planetCount` — integer, number of empty planet slots to seed (each gets a stub `{ id, missionId: "" }` for the user to bind later via `/new-mission`).
5. `unlockBy` — either `"default"` (system unlocked at game start) OR a `MissionId` literal that, once completed, unlocks this system.

# Steps
1. **First-run check.** If `src/game/phaser/data/solarSystems.json` does NOT exist:
   a. Create it with a single migrated entry covering today's solo galaxy. Use this exact shape:
      ```json
      [
        {
          "id": "tutorial",
          "name": "Tutorial System",
          "starColor": "#ffd27a",
          "unlockedByDefault": true,
          "planets": [
            { "id": "<missionId>", "missionId": "<missionId>" }
            // one entry per existing mission in src/game/phaser/data/missions.json
          ]
        }
      ]
      ```
   b. Add a `solarSystemId: "tutorial"` field to every existing entry in `src/game/phaser/data/missions.json`.
   c. Add `readonly solarSystemId: SolarSystemId;` to `MissionDefinition` in `src/types/game.ts` and add a new `export type SolarSystemId = "tutorial" | ...` union (sorted by appearance in `solarSystems.json`).
   d. Outline (do NOT write) the `GalaxyScene.ts` changes needed: read `solarSystems.json`, accept an `activeSystemId` prop/option, filter `MISSIONS` to those whose `solarSystemId === activeSystemId`, and tint `Sun.ts` with the active system's `starColor`. Leave a short TODO comment block at the top of `GalaxyScene.ts` listing the work — full migration of the scene is one-time and tracked separately.
   e. Add a TODO note to `src/game/state/GameState.ts` describing the `unlockedSystems: readonly SolarSystemId[]` axis that needs to be added alongside `unlockedPlanets`. Do NOT implement it here.
2. **Append the new system entry** to `solarSystems.json`. Required fields: `id`, `name`, `starColor`, `unlockedByDefault` (true if `unlockBy === "default"`, else false), `planets` (array of `{ id, missionId: "" }` stubs sized by `planetCount`; planet `id` should be `"<systemId>-planet-N"`). If `unlockBy` is a `MissionId`, also set `unlockedAfter: "<missionId>"`.
3. **Extend the `SolarSystemId` union** in `src/types/game.ts` to include the new id literal. Keep the union sorted by appearance in `solarSystems.json`.
4. **Mission-binding TODO list.** For each empty planet stub, emit a TODO line in the final report telling the user: "Run `/new-mission` with `solarSystemId: "<systemId>"` to bind a mission to planet `<planetId>`." Do NOT pre-create mission entries — that is the `/new-mission` skill's job.
5. **Add tests** to `src/game/phaser/data/data.test.ts` covering: (a) every `solarSystemId` on a mission references a real system; (b) every non-empty `planet.missionId` references a real mission; (c) every system has a unique `id`; (d) at least one system is `unlockedByDefault`. Reuse the existing import pattern (`import solarSystemsJson from "./solarSystems.json"`).
6. **Run** `npm run typecheck && npm test` and fix any failures. The most common failures are: a mission with no `solarSystemId`, a `SolarSystemId` literal missing from the union, or a `planets[].missionId` referencing a deleted mission.
7. **Report back** the new system id, the files modified, the TODO list of unbound planets, and (on first run only) explicit confirmation that the migration ran.

# Invariants this skill enforces
- `solarSystems.json` exists and contains at least one entry with `unlockedByDefault: true`.
- Every system `id` is unique.
- Every `MissionDefinition` in `missions.json` has a `solarSystemId` that matches an existing system.
- Every non-empty `planets[].missionId` resolves to a mission in `missions.json`.
- `SolarSystemId` union in `src/types/game.ts` includes every id used in `solarSystems.json` and `missions.json`.
- No `any` types introduced. No game-balance constants in `.ts` code — system metadata lives in JSON.
- `npm test` passes after the change.

# Files this skill modifies / creates
Creates (first run only):
- `src/game/phaser/data/solarSystems.json` — new canonical system registry; seeded with a migrated `tutorial` entry.

Modifies (every run):
- `src/game/phaser/data/solarSystems.json` — append the new system entry.
- `src/types/game.ts` — extend the `SolarSystemId` union; on first run also add `solarSystemId` to `MissionDefinition`.
- `src/game/phaser/data/data.test.ts` — add referential-integrity tests for systems on first run; no-op on later runs unless coverage gaps appear.

Modifies (first run only):
- `src/game/phaser/data/missions.json` — add `"solarSystemId": "tutorial"` to every existing mission entry.
- `src/game/three/GalaxyScene.ts` — leave a TODO comment block describing the per-system filter + active-system prop work.
- `src/game/state/GameState.ts` — leave a TODO note about the `unlockedSystems` axis.

Does NOT touch:
- `src/game/three/Planet.ts`, `Starfield.ts`, `CameraController.ts` — planet rendering and shared scene infra are reused unchanged across systems.
- `src/components/MissionSelect.tsx` — system-aware UI is a separate, follow-up task.
- Any Phaser scene files — combat does not care about which system the mission belongs to.

# Notes on first-run vs. later runs
- **First run** (no `solarSystems.json`): performs the one-time migration (step 1) AND adds the new system. Expect to touch six files.
- **Later runs**: skip step 1 entirely; only steps 2–7 apply. Expect to touch two or three files (`solarSystems.json`, `src/types/game.ts`, optionally the test file).
- Detect first run by checking for `src/game/phaser/data/solarSystems.json`. If it exists, the migration is done.

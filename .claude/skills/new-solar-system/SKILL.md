---
name: new-solar-system
description: Add a new solar system to the galaxy — solarSystems.json entry, SolarSystemId union extension, optional unlock gating, REQUIRED on-system-enter cinematic (voice + music), and mission-binding TODO list.
---

# When to use
The user says "/new-solar-system", "add a solar system", "scaffold a galaxy", or otherwise asks for a new selectable star system in the galaxy overworld. Do NOT use it to add a single planet inside an existing system — use `/new-mission` for that.

The multi-system data model is already live (see `src/game/data/solarSystems.json` for the canonical shape and existing entries `tutorial` and `tubernovae`). This skill just appends a new system on top.

# Inputs the user must provide
Ask once, in a single message, for any missing fields:
1. `systemId` — kebab-case, unique across `solarSystems.json`.
2. `name` — display name shown in the warp picker and HUD (e.g. `"Tubernovae Cluster"`).
3. `description` — one short sentence shown in the warp picker.
4. `sunColor` — hex like `"#ff7755"`. Drives the central star tint via `Sun.ts`.
5. `sunSize` — multiplier on the base sun radius (existing examples: 1.0 for tutorial, 1.4 for tubernovae). Default 1.0.
6. `ambientHue` — hex like `"#2a1014"`. Currently informational; reserved for future ambient-light tinting.
7. `unlockBy` — either `"default"` (system unlocked at game start) OR a `MissionId` literal that, once completed, unlocks this system.
8. **`introVoiceAsset`** (REQUIRED) — local file path to the chapter-opener voiceover (typically under `D:\koodaamista\AudiobookMaker\out\spacepotatis\`). Every solar system ships with an on-system-enter cinematic; this is non-optional. Will be re-encoded if oversized and copied to `public/audio/story/<systemId>-intro-voice.mp3`.
9. `introMusicAsset` (OPTIONAL) — local file path to a system-specific music bed. If omitted, defaults to reusing `/audio/story/great-potato-awakening-music.ogg` (the tubernovae intro pattern).
10. `introBody` and `introLogSummary` — short spoken paragraphs (Grandma reads aloud) and richer written paragraphs (Story log synopsis). Match the tone of existing `tubernovae-cluster-intro`.

# Steps
1. **Append the new system entry** to `src/game/data/solarSystems.json`. The shape is exactly:
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
   Do NOT add `planets`, `unlockedByDefault`, or `unlockedAfter` fields — none of those exist in the current schema. Default-unlocked status lives in `INITIAL_STATE.unlockedSolarSystems` (currently `["tutorial"]`) in `src/game/state/stateCore.ts`; per-mission unlock gating lives in `SYSTEM_UNLOCK_GATES` in the same file.
2. **Extend the `SolarSystemId` union** in `src/types/game.ts` to include the new id literal. Keep the union sorted by appearance in `solarSystems.json`.
3. **Wire the unlock**:
   - If `unlockBy === "default"`: append the new id to the `INITIAL_STATE.unlockedSolarSystems` array in `src/game/state/stateCore.ts`. (Most systems should NOT default-unlock; the player should earn them.)
   - If `unlockBy === "<missionId>"`: add a `[missionId, systemId]` entry to `SYSTEM_UNLOCK_GATES` (also in `stateCore.ts`). The existing `boss-1 → tubernovae` entry is the template. The unlock fires inside `completeMission()`. The `hydrate()` path in `persistence.ts` also re-derives unlocks from `completedMissions` on every load — so a player who cleared the gating mission *before* you added this entry will still get the unlock retroactively on next page refresh.
4. **Add tests** to `src/game/state/GameState.test.ts`:
   - One test that completing the gating mission pushes the new system id into `unlockedSolarSystems`.
   - One test that `setSolarSystem("<systemId>")` is rejected when the system is not yet unlocked.
   Reuse the patterns already in the file (the `tubernovae` tests are the template).
5. **Add tests** to `src/game/data/data.test.ts` if missing: every system has a unique `id`, every id used by a `MissionDefinition.solarSystemId` resolves to a real system. (These are likely already present — verify before adding.)
6. **Mission-binding TODO list.** This skill does NOT create missions. After it lands, tell the user: "Run `/new-mission` for each planet you want in `<systemId>`, with `solarSystemId: \"<systemId>\"`." Until at least one mission targets the new system, `GalaxyScene` will render an empty starfield when the player warps to it.
7. **Scaffold the on-system-enter cinematic.** This is REQUIRED — every solar system ships with one. Either invoke `/new-story` with the system's intro inputs OR add the entry inline:
   - Re-encode the voice asset to ≤500 KB (typically `ffmpeg -i in.mp3 -ac 1 -b:a 64k out.mp3`) and copy to `public/audio/story/<systemId>-intro-voice.mp3`.
   - If `introMusicAsset` was supplied, copy it to `public/audio/story/<systemId>-intro-music.ogg`. Otherwise reuse `/audio/story/great-potato-awakening-music.ogg`.
   - Add a `STORY_ENTRIES` entry in `src/game/data/story.ts` with id `<systemId>-cluster-intro` (or similar — match existing naming), `mode: "modal"`, `voiceDelayMs: 3000`, `autoTrigger: { kind: "on-system-enter", systemId: "<systemId>" }`. Extend the `StoryId` union literal accordingly.
   - Add a fires-when-fresh assertion to `selectOnSystemEnterEntry` in `src/game/data/storyTriggers.test.ts` covering: id matches, `mode === "modal"`, `musicTrack !== null`, `voiceTrack` under `/audio/story/`. The tubernovae block is the template.
8. **Run** `npm run typecheck && npm test` and fix any failures. The most common failures are forgetting to extend `SolarSystemId` after editing `solarSystems.json`, or shipping a system without its paired on-system-enter entry (the storyTriggers test will catch the latter).
9. **Report back** the new system id, the files modified, the unlock condition, the cinematic story id you scaffolded, and the "now run `/new-mission` for these planets" reminder. Optionally suggest running `/new-story` again to add an `on-system-cleared-idle` close (Template D) for the new system, mirroring `sol-spudensis-cleared` — that one stays optional because it doesn't fire until every mission in the system is completed.

# Invariants this skill enforces
- `solarSystems.json` is valid JSON with the exact six-field shape above.
- Every system `id` is unique.
- Every `SolarSystemId` literal in the union has a matching JSON entry, and vice versa.
- Every `MissionDefinition.solarSystemId` resolves to a known system (existing test).
- A non-default unlock has a corresponding `SYSTEM_UNLOCK_GATES` entry, OR an explicit `INITIAL_STATE.unlockedSolarSystems` push, OR is intentionally unreachable.
- **Every solar system has a paired `on-system-enter` `STORY_ENTRIES` entry in `src/game/data/story.ts`** with `mode: "modal"` and a non-null `musicTrack`. No silent map swaps — the cinematic is the connective narrative tissue between systems.
- No `any` types introduced. No game-balance constants in `.ts` code.
- `npm test` passes after the change.

# Files this skill modifies
Always:
- `src/game/data/solarSystems.json` — append the new system entry.
- `src/types/game.ts` — extend the `SolarSystemId` union literal.
- `src/game/data/story.ts` — append the on-system-enter cinematic entry + extend the `StoryId` union.
- `src/game/data/storyTriggers.test.ts` — fires-when-fresh assertion for the new cinematic in the `selectOnSystemEnterEntry` describe block.
- `public/audio/story/<systemId>-intro-voice.mp3` — new voiceover asset (re-encoded ≤500 KB).

Conditionally:
- `public/audio/story/<systemId>-intro-music.ogg` — only if a system-specific music bed was provided. Otherwise the entry reuses `/audio/story/great-potato-awakening-music.ogg`.
- `src/game/state/stateCore.ts` — `INITIAL_STATE.unlockedSolarSystems` (default-unlock) OR `SYSTEM_UNLOCK_GATES` (mission-gated).
- `src/game/state/GameState.test.ts` — unlock + warp-rejection tests.
- `src/game/data/data.test.ts` — only if existing referential tests don't already cover the new system.

Does NOT touch:
- `src/game/three/GalaxyScene.ts` — the active system is read from `GameState.currentSolarSystemId`; planets are filtered automatically.
- `src/game/three/Sun.ts` — sun appearance is data-driven from `solarSystems.json` already.
- `src/components/GameCanvas.tsx` — the warp picker (`WarpPicker`) iterates `getAllSolarSystems()` filtered to `unlockedSolarSystems`; no UI wiring needed.
- `src/game/data/missions.json` — adding a system without missions is fine. Use `/new-mission` to populate.
- `src/game/data/lootPools.ts` / `src/components/ShopUI.tsx` — weapon-family availability for the new system's shop and loot drops is configured by the system's entry in `lootPools.ts` (the `weapons` array) and the `family` field on entries in `weapons.json`. Adding a new system inherits the default (all families allowed unless gated). If the new system should feature carrots, turnips, or potatoes specifically — or any other family-level gating — that's `/equipment` work, not this skill.

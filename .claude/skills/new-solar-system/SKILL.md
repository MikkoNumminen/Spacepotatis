---
name: new-solar-system
description: Add a new solar system to the galaxy — solarSystems.json entry, SolarSystemId union extension, optional unlock gating, REQUIRED on-system-enter cinematic (voice + music), and mission-binding TODO list.
---

# When to use
User says "/new-solar-system", "add a solar system", "scaffold a galaxy". For a single planet inside an existing system, use `/new-mission` instead.

The multi-system data model is live; see `src/game/data/solarSystems.json` (existing: `tutorial`, `tubernovae`).

# Inputs (ask once for any missing)
1. `systemId` — kebab-case, unique.
2. `name` — display name (e.g. `"Tubernovae Cluster"`).
3. `description` — one short sentence for warp picker.
4. `sunColor` — hex like `"#ff7755"` (drives `Sun.ts` tint).
5. `sunSize` — sun radius multiplier (tutorial 1.0, tubernovae 1.4). Default 1.0.
6. `ambientHue` — hex; reserved for future ambient tinting.
7. `unlockBy` — `"default"` OR a `MissionId` literal that unlocks this system on completion.
8. **`introVoiceAsset` (REQUIRED)** — local path to chapter-opener voiceover (typically `D:\koodaamista\AudiobookMaker\out\spacepotatis\`). Every system ships with on-system-enter cinematic — non-optional. Re-encoded and copied to `public/audio/story/<systemId>-intro-voice.mp3`.
9. **`introMusicAsset` (REQUIRED)** — system-specific bed. Don't reuse another arc's bed; each new system gets its own. Re-encoded and copied to `public/audio/story/<systemId>-intro-music.ogg`.
10. `introBody` + `introLogSummary` — spoken paragraph (Grandma) + Story-log synopsis. Match `tubernovae-cluster-intro` tone.

# Steps
1. **Append to `src/game/data/solarSystems.json`**:
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
   No `planets`, `unlockedByDefault`, or `unlockedAfter` — none exist in schema. Default-unlock lives in `INITIAL_STATE.unlockedSolarSystems` in `src/game/state/stateCore.ts`; mission-gated unlocks live in `SYSTEM_UNLOCK_GATES` in the same file.
2. **Extend `SolarSystemId` union** in `src/types/game.ts`. Keep sorted by `solarSystems.json` order.
3. **Wire unlock** in `src/game/state/stateCore.ts`:
   - `"default"` → push id into `INITIAL_STATE.unlockedSolarSystems`. (Most systems should be earned, not default.)
   - `"<missionId>"` → add `[missionId, systemId]` to `SYSTEM_UNLOCK_GATES` (template: `boss-1 → tubernovae`). Fires in `completeMission()`. `hydrate()` in `persistence.ts` re-derives unlocks from `completedMissions`, so retroactive unlocks work on next refresh.
4. **Tests in `src/game/state/GameState.test.ts`** (mirror tubernovae tests):
   - Completing the gating mission pushes id into `unlockedSolarSystems`.
   - `setSolarSystem("<systemId>")` rejected when locked.
5. **Verify `src/game/data/data.test.ts`** covers id-uniqueness + `MissionDefinition.solarSystemId` resolution. Likely already present.
6. **Mission-binding reminder.** This skill creates no missions. Tell user: "Run `/new-mission` for each planet in `<systemId>` with `solarSystemId: \"<systemId>\"`." Empty system = empty starfield in `GalaxyScene`.
7. **Scaffold the on-system-enter cinematic (REQUIRED).** Either invoke `/new-story` (Template E) or inline:
   - Re-encode voice ≤500 KB (`ffmpeg -i in.mp3 -ac 1 -b:a 64k out.mp3`) → `public/audio/story/<systemId>-intro-voice.mp3`.
   - Copy `introMusicAsset` to `public/audio/story/<systemId>-intro-music.ogg`. Music is REQUIRED — every new arc gets its own bed. Don't fall back to reusing the awakening track.
   - Add `STORY_ENTRIES` entry in `src/game/data/story.ts`: id `<systemId>-cluster-intro`, `mode: "modal"`, `voiceDelayMs: 3000`, `autoTrigger: { kind: "on-system-enter", systemId: "<systemId>" }`. Extend `StoryId` union.
   - Add fires-when-fresh assertion in `selectOnSystemEnterEntry` block of `src/game/data/storyTriggers.test.ts`: id, `mode === "modal"`, `musicTrack !== null`, `voiceTrack` under `/audio/story/`. Tubernovae block is template.
8. **Run** `npm run typecheck && npm test`. Common failures: forgot to extend `SolarSystemId`; shipped without paired on-system-enter entry (storyTriggers test catches this).
9. **Report** new id, files modified, unlock condition, cinematic story id, the `/new-mission` reminder. Optionally suggest `/new-story` Template D for `on-system-cleared-idle` close (mirrors `sol-spudensis-cleared`) — optional, fires only when system fully cleared.

# Invariants
- `solarSystems.json` is valid JSON with the six-field shape above.
- Every system `id` is unique; every `SolarSystemId` literal has a matching JSON entry and vice versa.
- Every `MissionDefinition.solarSystemId` resolves to a known system.
- Non-default unlock has a `SYSTEM_UNLOCK_GATES` entry, an explicit `INITIAL_STATE.unlockedSolarSystems` push, or is intentionally unreachable.
- **Every system has a paired `on-system-enter` `STORY_ENTRIES` entry with `mode: "modal"` and non-null `musicTrack`.** No silent map swaps.
- No `any`. No game-balance constants in `.ts`.
- `npm test` passes.

# Files modified
Always:
- `src/game/data/solarSystems.json` — append entry.
- `src/types/game.ts` — extend `SolarSystemId`.
- `src/game/data/story.ts` — append cinematic + extend `StoryId`.
- `src/game/data/storyTriggers.test.ts` — fires-when-fresh assertion.
- `public/audio/story/<systemId>-intro-voice.mp3` — re-encoded ≤500 KB.

Conditionally:
- `public/audio/story/<systemId>-intro-music.ogg` — only if system-specific bed supplied.
- `src/game/state/stateCore.ts` — `INITIAL_STATE.unlockedSolarSystems` OR `SYSTEM_UNLOCK_GATES`.
- `src/game/state/GameState.test.ts` — unlock + warp-rejection tests.
- `src/game/data/data.test.ts` — only if existing tests miss the new system.

Does NOT touch:
- `src/game/three/GalaxyScene.ts`, `src/game/three/Sun.ts`, `src/components/GameCanvas.tsx` (WarpPicker) — all data-driven from `solarSystems.json` + `unlockedSolarSystems`.
- `src/game/data/missions.json` — use `/new-mission`.
- `src/game/data/lootPools.ts` / `src/components/ShopUI.tsx` — weapon-family availability is `/equipment` work (the system's `lootPools.ts` `weapons` array + `family` field on `weapons.json` entries). New systems inherit "all families allowed" by default.

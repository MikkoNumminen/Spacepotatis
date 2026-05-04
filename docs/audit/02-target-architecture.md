# Phase 2 — Target module architecture

Read [01-inventory.md](01-inventory.md) and [04-found-bugs.md](04-found-bugs.md) first. This file ONLY proposes; nothing here gets executed without explicit approval. Phase 3 is the executor.

## Goals

The proposed structure exists to make four things true:

1. **Subsystems are isolated behind explicit public APIs.** A change inside one module cannot silently affect an unrelated one. Imports across module boundaries must go through the module's `index.ts` — never reach into a sibling's internals.
2. **AI agents can change one module without reading the rest of the codebase.** Each module's README answers "what does this own, what doesn't it, what breaks if I get it wrong" in one screenful.
3. **Save data has its own fortified perimeter.** Every change to the persistence sub-cluster runs the existing `/save-roundtrip-audit` skill before commit. The 8-layer round-trip is too easy to silently break.
4. **The dependency graph is acyclic and shallow.** Phase 1 confirmed zero cycles today. The proposed structure preserves that and shortens the longest dependency chain.

## Proposed modules

Ten top-level modules. The number is deliberate — fewer would cluster the save-data risk against everything else; more would shred the catalog accessors into per-id files that fight cohesion.

The ten are arranged in a dependency partial order: every arrow points "up" (to a module that's loaded first). No back-edges allowed.

```
               ┌──────────────────────────┐
               │           ui             │
               │ (React components)       │
               └─────────┬────────────────┘
                         │
        ┌────────────────┼─────────────────────────┐
        │                │                         │
┌───────▼────────┐  ┌────▼─────────┐    ┌──────────▼──────────┐
│      app       │  │    phaser    │    │       three         │
│ (Next.js shell │  │ (combat)     │    │ (galaxy overworld)  │
│  + API routes) │  └────┬─────────┘    └──────────┬──────────┘
└───────┬────────┘       │                         │
        │                │                         │
        │            ┌───┴───────┐                 │
        │            │   audio   │                 │
        │            │ (engines  │                 │
        │            │  + bus)   │                 │
        │            └────┬──────┘                 │
        │                 │                        │
        ▼                 ▼                        ▼
   ┌─────────────────────────────────────────────────────┐
   │                       state                         │
   │   (GameState barrel + slices + persistence)        │
   └─────────────────────────┬───────────────────────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │     content      │
                   │ (catalog +       │
                   │  integrity)      │
                   └─────────┬────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
            ┌─────▼─────┐         ┌─────▼─────┐
            │   infra   │         │  schemas  │
            │ (db, auth │         │ (Zod)     │
            │  routes,  │         └─────┬─────┘
            │  guards)  │               │
            └─────┬─────┘               │
                  │                     │
                  └─────────┬───────────┘
                            │
                       ┌────▼────┐
                       │  types  │
                       └─────────┘
```

Acyclic. Longest chain is 5 hops (`ui → app → state → content → schemas → types`).

---

### Module: `types`

- **Purpose**: shared TypeScript types — the canonical IDs and definitions that every other module names. Pure compile-time; zero runtime.
- **Files (current paths)**:
  - `src/types/game.ts` (235 LOC, currently the entirety of the module)
  - DELETE: `src/types/database.ts` (3 LOC, dead, see `04-found-bugs.md`)
- **Public API**:
  - Type aliases: `WeaponId`, `WeaponFamily`, `WeaponTier`, `AugmentId`, `EnemyId`, `MissionId`, `SolarSystemId`, `StoryId` (re-exported), `PerkId`, `WeaponPosition`
  - Definitions: `WeaponDefinition`, `EnemyDefinition`, `MissionDefinition`, `SolarSystemDefinition`, `WeaponInstance`, `MissionWaves`
  - All exports `// PUBLIC API` and marked `@stable`
- **Internal**: none — this is a flat types module. If it grows past ~400 LOC, split per domain (weapons.types.ts, missions.types.ts, etc.) as internal subfolder with re-exports through `index.ts`.
- **Dependencies**: NONE. This is the leaf.
- **Owned data**: none. Pure types.
- **Allowed side effects**: none — pure.
- **Test surface**: none today; types are exercised through the modules that use them.

**Migration risk**: low. The whole module is one file. The dead `database.ts` is deleted as part of this extraction (matches `04-found-bugs.md` finding).

---

### Module: `schemas`

- **Purpose**: Zod runtime validators for every API boundary AND for every JSON catalog (CI drift gate). The single source of truth for "what shape is this byte stream?"
- **Files**: `src/lib/schemas/*` (all 8 schemas + 8 tests).
- **Public API**:
  - Boundary schemas: `SavePayloadSchema`, `RemoteSaveSchema`, `LeaderboardScorePayloadSchema`, `LeaderboardScoreSchema`, `HandleUpdatePayloadSchema`
  - Catalog schemas: `WeaponsFileSchema`, `EnemiesFileSchema`, `WavesFileSchema`, `MissionsFileSchema`, `SolarSystemsFileSchema`
  - Each is exported alongside its `z.infer`-derived type alias.
- **Internal**: shared primitives (e.g. `SafePositiveIntSchema`, `SafeFloatSchema`) live in a `_primitives.ts` and are NOT re-exported.
- **Dependencies**: `types` only.
- **Owned data**: none — schemas are values but immutable.
- **Allowed side effects**: none — pure validators.
- **Test surface**: existing `src/lib/schemas/*.test.ts` files.

**Migration risk**: low. Whole subfolder moves intact. The schema is already a clean boundary.

---

### Module: `content`

- **Purpose**: the JSON catalog accessors and the cross-reference integrity check. Owns "what weapons / enemies / missions / perks / augments / loot pools / solar systems / story entries exist".
- **Files**: every `*.ts` and `*.json` under `src/game/data/`. Grouped:
  - Accessors: `weapons.ts`, `enemies.ts`, `missions.ts`, `perks.ts`, `augments.ts`, `lootPools.ts`, `solarSystems.ts`, `story.ts`, `storyTriggers.ts`, `missionWeaponRewards.ts`, `waves.ts`
  - JSON catalogs: same names with `.json` extension where applicable
  - Integrity check: `integrityCheck.ts`
  - Test layer: `*.test.ts` files plus `__tests__/jsonSchemaValidation.test.ts`
- **Public API**:
  - Accessor functions: `getWeapon`, `getAllWeapons`, `getMission`, `getAllMissions`, `getEnemy`, `getAllEnemies`, `getPerk`, `getAllPerks`, `getAugment`, `getAllAugments`, `getSolarSystem`, `getAllSolarSystems`, `getAllLootPools`, `getStoryEntry`, `STORY_ENTRIES`, `STORY_IDS`, `isKnownStoryId`, `selectFirstTimeEntry`, `selectOnSystemEnterEntry`, `selectOnMissionSelectEntry`, `selectReadyClearedIdleEntries`, `selectReadyAllClearedIdleEntries`, `MISSION_WEAPON_REWARDS`, `getBuyableWeaponIds`, `getMissionForWeapon`, `runDataIntegrityCheck` (mostly for tests), `getAllMissionWaves`, `REMOVED_WEAPON_BASE_COSTS`
  - ID arrays: `WEAPON_IDS`, `AUGMENT_IDS`, `PERK_IDS`
- **Internal**: Zod parses (the `as` cast pattern at module load — see CLAUDE.md §11) and the `randomXxx()` selectors used only by reward logic. The raw JSON blobs are imported but NEVER re-exported — consumers go through accessors.
- **Dependencies**: `schemas` (parse-once at module load), `types` (transitively). NEVER `state` or higher.
- **Owned data**: the parsed catalogs themselves (immutable post-load).
- **Allowed side effects**: parse JSON at module load, run `runDataIntegrityCheck` once. **Cannot** read localStorage, network, or any state mutators.
- **Test surface**: existing `src/game/data/*.test.ts` plus `__tests__/jsonSchemaValidation.test.ts` (CI drift gate).

**Migration risk**: low. Already cohesive; the only outbound dep is `schemas`. Note `INVARIANT`: integrity check fires at module load via `missions.ts` — Phase 3 must preserve this trigger or persistence breaks at boot.

---

### Module: `infra`

- **Purpose**: infrastructure primitives — DB client, auth, route constants, cheat-guards, session hooks. Owns "how we talk to the outside world".
- **Files**:
  - DB: `src/lib/db.ts`
  - Auth: `src/lib/auth.ts`, `src/lib/useReliableSession.ts`
  - Routes: `src/lib/routes.ts`, `src/lib/useHandle.ts`
  - Leaderboard helpers: `src/lib/leaderboard.ts`, `src/lib/players.ts`, `src/lib/handle.ts`
  - Cheat guards: `src/lib/saveValidation.ts`
  - Tests: matching `*.test.ts` files
  - DOES NOT include: `src/lib/useOptimisticAuth.ts` — moves to `state` (it's the only `lib → game` backedge today; see violations).
- **Public API**:
  - `db` (Kysely client), `Database` interface
  - `auth()` (NextAuth handler), `signIn`, `signOut` re-exports
  - `ROUTES` constants
  - `useHandle()` hook, `useReliableSession()` hook
  - `validateNoRegression`, `validateMissionGraph`, `deriveCreditCap`, `validatePlayedTimeDelta`, `validateLeaderboardCompletion`
  - `getLeaderboard`, `revalidateLeaderboard`
- **Internal**: Edge-vs-Node runtime guards, the `_lib/dbWriteSafety.mjs` recovery helper (NOT re-exported — used only by recovery scripts).
- **Dependencies**: `schemas` (validates inbound payloads), `types`. NEVER `content`, `state`, `phaser`, `three`, `audio`, `ui`, `app`.
- **Owned data**: the Kysely client connection. Auth session data flows through but isn't owned here.
- **Allowed side effects**: DB connections, NextAuth init, edge runtime declarations.
- **Test surface**: `src/lib/*.test.ts` (especially `saveValidation.test.ts`, `leaderboard.test.ts`, `handle.test.ts`).

**Migration risk**: medium. The `useOptimisticAuth.ts` move is a real fix — currently violates the proposed boundary. Done as part of this extraction, not a separate cleanup.

**Sub-split candidate**: `saveValidation.ts` is 440 LOC mixing 5 guards. Phase 3 should split into `saveValidation/{missionGraph,credits,playtime,regression,leaderboardCompletion}.ts` with `index.ts` re-exporting. NOT mandatory for the boundary; can defer.

---

### Module: `state`

- **Purpose**: the GameState barrel + slices + the entire save round-trip pipeline. Owns "what does the player currently have, what have they completed, and how do we put that on disk".
- **Files**:
  - Barrel: `src/game/state/GameState.ts`, `src/game/state/useGameState.ts`
  - Core: `src/game/state/stateCore.ts`, `src/game/state/ShipConfig.ts`
  - Mutators: `src/game/state/shipMutators.ts`, `src/game/state/pricing.ts`, `src/game/state/rewards.ts`
  - Persistence sub-cluster: `src/game/state/persistence.ts` + `src/game/state/persistence/*` migrators (helpers, legacyShared, types, migrateNewShape, migrateLegacyIdArray, migrateNamedSlots, migratePrimaryWeapon, safetyNet, salvageRemovedWeapons)
  - Sync sub-cluster: `src/game/state/sync.ts`, `src/game/state/syncCache.ts`, `src/game/state/saveQueue.ts`, `src/game/state/scoreQueue.ts`, `src/game/state/seenStoriesLocal.ts`
  - **Moved IN from infra**: `src/lib/useOptimisticAuth.ts` → `src/game/state/useOptimisticAuth.ts` (closes the only `lib → game` backedge)
- **Public API** (the GameState barrel re-exports these — anything not here is INTERNAL):
  - State accessors: `getState`, `subscribe`, `commit`, `useGameState`
  - Mutators: every `buy*`, `equip*`, `install*`, `grantWeapon`, `grantAugment`, `addCredits`, `spendCredits`, `addPlayedTime`, `completeMission`, `setSolarSystem`, `markStorySeen`, `isMissionCompleted`, `isPlanetUnlocked`, `resetForTests`
  - Save round-trip surface: `loadSave`, `saveNow`, `flushSaveQueue`, `markSavePending`, `enqueueScore`, `drainScoreQueue`, `clearLoadSaveCache`, `LoadResult` type
  - Hooks: `useOptimisticAuth`
  - ShipConfig values: `DEFAULT_SHIP`, `MAX_LEVEL`, `MAX_AUGMENTS_PER_WEAPON`, `MAX_WEAPON_SLOTS`, `weaponDamageMultiplier`, `weaponUpgradeCost`, all `*UpgradeCost` curves, all `getMax*` derived getters
  - Constants: `SYSTEM_UNLOCK_GATES`, `INITIAL_STATE`
- **Internal**: every `persistence/*` migrator (only `persistence.ts` exposes `hydrate`/`toSnapshot`); the cache module's mutable refs; the localStorage key constants.
- **Dependencies**: `content`, `schemas`, `infra` (for `db` access — wait, NO; `db` access lives in API routes, not state directly. `state/sync.ts` calls `/api/save` via fetch, which is a network call, not a `db` import). Re-check: `state` → `content` only. `schemas` is used through `content`'s parsers + through `state/sync.ts`'s payload validation.
- **Owned data**: the in-memory `state` object (singleton in `stateCore.ts`); the cached account-stamped pending save; the load result.
- **Allowed side effects**: localStorage I/O (save queue + seen-stories), network I/O (sync.ts hits `/api/save`, `/api/leaderboard`), module-load JSON parses are inherited from `content`.
- **Test surface**: existing `src/game/state/**/*.test.ts` (substantial — `GameState.test.ts`, `ShipConfig.test.ts`, `sync.test.ts`, `pricing.test.ts`, every persistence migrator's test, `saveQueue.test.ts`, `scoreQueue.test.ts`).

**Migration risk**: HIGH. This module owns the save round-trip, the highest-risk surface in the codebase. Phase 3 extraction MUST run `/save-roundtrip-audit` before commit. The persistence sub-folder is intentionally preserved — its layout is already correct.

**Sub-split candidate**: `sync.ts` at 516 LOC and `shipMutators.ts` at 366 LOC are over the soft 300 LOC limit. Defer the split until after the module boundary lands; splitting both is a follow-up PR.

---

### Module: `audio`

- **Purpose**: every audio engine + the mute fan-out bus. Owns playback lifecycle and category-based mute.
- **Files**: every `*.ts` under `src/game/audio/`, including the test fixtures.
  - `AudioBus.ts`
  - `music.ts`, `story.ts`, `storyLogAudio.ts`, `menuBriefingAudio.ts`, `itemSfx.ts`, `leaderboardAudio.ts`, `sfx.ts`
  - Tests: matching `*.test.ts`
- **Public API**:
  - `audioBus` (singleton)
  - Engines: `menuMusic`, `combatMusic`, `shopMusic`, `storyAudio`, `storyLogAudio`, `menuBriefingAudio`, `itemSfx`, `leaderboardAudio`, `sfx`
  - Each engine's per-method API (`.play()`, `.stop()`, `.duck()`, `.unduck()`, `.loadTrack()`, etc.)
- **Internal**: the per-engine `register(category, this)` calls happen in constructors and are not re-exposed. The categories `"music" | "voice" | "sfx"` are hidden; only `setMasterMuted` / `setCategoryMuted` are public.
- **Dependencies**: `types` only. (Today `sfx.ts` may not even need types.) NO dependency on `state`, `content`, `infra`, `phaser`, `three`, `ui`.
- **Owned data**: the audio element pool, the mute state.
- **Allowed side effects**: HTMLAudioElement creation, Web Audio API context setup, network fetches for audio files.
- **Test surface**: `src/game/audio/__tests__/*` plus matching `*.test.ts`.

**Migration risk**: low. Already cohesive and dependency-free. Safe to extract first if desired.

---

### Module: `three`

- **Purpose**: the three.js galaxy overworld scene. Owns starfield, sun, planets, orbits, raycasting.
- **Files**: every `*.ts` under `src/game/three/`. Includes:
  - `SceneRig.ts` (renderer/lighting/fog/starfield factory)
  - `Sun.ts`, `Planet.ts`, `planetTexture.ts`, `Orbit.ts`, `Starfield.ts`
  - Galaxy scene assembly: `GalaxyScene.ts` (or wherever the orchestrator lives — verify in Phase 3)
- **Public API**:
  - `createSceneRig(options)`, `disposeSceneRig`
  - `GalaxyScene` constructor + lifecycle methods
  - Per-mesh helpers used by tests
- **Internal**: per-mission texture style switch (currently `planetTexture.ts#styleFor` — see `04-found-bugs.md` for the latent issue: this switch is non-exhaustive over `MissionId`).
- **Dependencies**: `content` (mission/solarSystem catalog reads), `types`. NO `state` (galaxy view reads from state via UI props, not directly).
- **Owned data**: three.js scene graph, mesh refs.
- **Allowed side effects**: WebGL context setup, animation frame scheduling, asset loading.
- **Test surface**: existing `src/game/three/*.test.ts` if any (Phase 1 noted 12 files in zone, exact test count to confirm).

**Migration risk**: medium. The `planetTexture.ts#styleFor` non-exhaustive switch is a latent crash; recommend the data-driven fix (move per-mission style into `missions.json`) BEFORE the boundary lands, so the new schema gates additions. NOT mandatory — can defer to post-audit.

---

### Module: `phaser`

- **Purpose**: the Phaser combat layer. Owns scenes, entities, systems, the typed event bus, and the typed registry.
- **Files**: every `*.ts` under `src/game/phaser/`. Includes:
  - Scenes: `BootScene.ts` (1819 LOC — see god-files), `GalaxyScene.ts` (if used), `CombatScene.ts`, `BossScene.ts` (DEAD — delete per `04-found-bugs.md`), `MenuScene.ts`, `PauseScene.ts`
  - Entities: `Player.ts`, `Enemy.ts`, `Bullet.ts`, `PowerUp.ts`, plus `entities/player/*`
  - Systems: `WeaponSystem.ts`, `weaponMath.ts`, `Controls.ts`, `wave/*`, `MotionTilt.ts`
  - Cross-cutting: `events.ts` (typed bus), `registry.ts` (typed registry), `config.ts` (scene array)
  - Combat scene helpers: `scenes/combat/{CombatHud,CombatVfx,DropController,PerkController}.ts`
  - Test harness: `__tests__/fakeScene.ts`, plus matching `*.test.ts`
- **Public API**:
  - `createPhaserGame(parent: HTMLElement, ...)` (the entry point that the React canvas hook uses)
  - The typed event union (`PhaserEvent`) + emit/on wrappers from `events.ts`
  - The registry typed accessors (`registry.set`, `registry.get`)
  - `SCENE_KEYS` constant from `config.ts`
- **Internal**: every individual scene/entity/system. The wider game.events.* and game.registry.* surfaces are NEVER exposed to consumers — the wrappers are the contract.
- **Dependencies**: `types`, `content`, `state`, `audio`. NEVER `three`, `ui`, `app`, `infra` directly.
- **Owned data**: Phaser game instance, scene graph, group/pool refs.
- **Allowed side effects**: Canvas DOM manipulation, audio triggers (via `audio` module engines), state mutations (via `state` module mutators).
- **Test surface**: extensive — `__tests__/fakeScene.ts` plus per-system / per-entity tests.

**Migration risk**: medium. Cohesive zone; the only outbound deps are well-defined. The `BossScene.ts` deletion is a side fix per `04-found-bugs.md`. The `BootScene.ts` 1819-LOC split into per-family files (`boot/bullets.ts`, `boot/enemies.ts`, etc.) is a separate follow-up; the boundary doesn't depend on it.

---

### Module: `app`

- **Purpose**: the Next.js shell — pages, layouts, API routes, middleware. Owns "what URL maps to what code".
- **Files**: every `*.tsx` and `*.ts` under `src/app/`. Includes:
  - Pages: `app/page.tsx`, `app/play/page.tsx`, `app/shop/page.tsx`, `app/leaderboard/page.tsx`
  - Layouts: `app/layout.tsx`, per-route `layout.tsx` if any
  - API routes: `app/api/auth/[...nextauth]/route.ts`, `app/api/save/route.ts`, `app/api/leaderboard/route.ts`, `app/api/handle/route.ts`
  - Generated images: `app/icon.tsx`, `app/opengraph-image.tsx`, `app/apple-icon.tsx`, `app/twitter-image.tsx`
  - Tests: `app/api/save/route.test.ts`, etc.
- **Public API**: routes are the public API — there's no `index.ts` to import from. This module is a SINK, not a SOURCE.
- **Internal**: per-route handlers, server-side rendering helpers.
- **Dependencies**: `infra` (DB, auth, route constants, cheat guards), `state` (toSnapshot/hydrate for save endpoint), `schemas` (input validation), `content` (leaderboard mission lookups), `types`. NEVER `ui` (server components must not import client components without explicit `"use client"`), NEVER `phaser` / `three` / `audio` (those are client-only).
- **Owned data**: per-request scope only (no module-level state).
- **Allowed side effects**: DB writes, auth flows, audit log writes, image generation.
- **Test surface**: per-API-route tests (most importantly `app/api/save/route.test.ts`).

**Migration risk**: low. The directory IS the module by Next.js convention; no file moves needed within. Boundary fix is enforcing the import-only-from-public-API rule — `app/` files currently reach into `src/components/`, `src/lib/`, etc., directly. This is fine; the proposed fix is just to standardize on the new module barrels (`@/lib/index`, `@/state/index`, etc.) once they exist.

---

### Module: `ui`

- **Purpose**: every React component — the entire client-rendered DOM. Owns the layout, interactions, animations, and the wiring between user input and state mutators.
- **Files**: every `*.tsx` and `*.ts` under `src/components/`. Includes:
  - Top-level: `GameCanvas.tsx`, `ShopUI.tsx`, `Splash.tsx`, `LandingShell.tsx`, etc.
  - Subfolders: `galaxy/`, `loadout/`, `story/`, `hooks/`, `ui/`
  - Tests: `*.test.tsx`
  - **Plus**: `src/lib/useOptimisticAuth.ts` is REMOVED from `lib` and the import target switches to `state`; UI consumers re-import from there.
- **Public API**: this is also a SINK module. There's no `index.ts`. Apps consume specific components. The contract IS the prop interfaces of each top-level component.
- **Internal**: subfolder components (`galaxy/`, `loadout/`, etc.). Cross-folder reach (e.g. `loadout/WeaponDetailsModal.tsx` reaching up to `components/WeaponStats.tsx` per `04-found-bugs.md`) is FORBIDDEN post-extraction. Either move the parent into the subfolder or pass it as a prop.
- **Dependencies**: `state`, `content`, `audio`, `infra` (auth + routes), `types`. NEVER `phaser` / `three` / `app` directly. NEVER reaches the database or schemas (those flow through `infra` / `state`).
- **Owned data**: React component-local state.
- **Allowed side effects**: DOM manipulation (via React), audio triggers (via `audio` engines), state mutations (via `state` mutators), GSAP timelines, network fetches (via `state/sync.ts` only — never raw `fetch`).
- **Test surface**: per-component `*.test.tsx`.

**Migration risk**: medium-high. Highest-fan-in module. The god-files (`GameCanvas` 452, `ShopUI` 408, `QuestPanel` 387, `WeaponCard` 210) need split before the boundary calcifies — a 452-LOC orchestrator with 11 responsibilities is exactly the kind of thing the audit is supposed to break up. Phase 3 should split these as part of the extraction, NOT as a separate follow-up.

---

## Current code that violates the proposed structure

### Reaches into a sibling module's INTERNAL

- **`src/components/loadout/WeaponDetailsModal.tsx`** imports from `src/components/WeaponStats.tsx` (child folder reaching up to parent). Both end up in `ui`, but per the proposed boundary, `loadout/` is a sub-folder and reaching its parent is questionable. Fix during Phase 3: either move `WeaponStats.tsx` into `loadout/` (if used only there), or pass it as a prop. Logged in `04-found-bugs.md`.

### `lib → game` backedges

- **`src/lib/useOptimisticAuth.ts:10-11`** imports from `@/game/state/sync` + `@/game/state/syncCache`. The whole point of `infra/` is to be importable by `state/`, not the other way around. The fix is to MOVE `useOptimisticAuth.ts` into `state/`. The import path changes from `@/lib/useOptimisticAuth` to `@/game/state/useOptimisticAuth`. Importers in `ui/` update accordingly.

### Catalog accessor reach (Zod parse at module load — which module owns this?)

- **`src/game/state/stateCore.ts:33`** runs `getAllMissions()` at module load via `MISSIONS = getAllMissions()`. This triggers `runDataIntegrityCheck` (which is a side effect of importing `missions.ts` from `content`). Acceptable: `state` → `content` is a proposed allowed direction. The side-effect-at-import pattern is logged in `04-found-bugs.md` as latent (not structural).

- **`src/lib/saveValidation.ts:170`** walks `getAllLootPools()` at module load. Acceptable: `infra` → `content` would be a backedge. Solution in Phase 3: either accept this as `infra` → `content` IS allowed (small adjustment to the diagram, since cheat guards genuinely need catalog data), OR lazy-init the derived caps inside `validateNoRegression`. Recommend the latter; it makes `infra` a true leaf-of-leaves.

### No cycles introduced by the proposed boundary

Cross-checked the diagram. Every arrow points "up". The only ambiguity is `infra` ↔ `content` for `saveValidation.ts` — resolved by lazy-init recommendation above. If we keep the dependency, the diagram needs an edge `infra → content`, which is fine (still acyclic).

### Catalog accessors imported from many surprising places

- Phase 1 flagged `useGameState` and `ROUTES` as legitimately many-importer. Both stay in their proposed modules (`state` and `infra`). No drift to address.

---

## Migration order

The order is "leaves first, core last". Each tier can run in parallel within itself (file-disjoint).

### Tier 1 — leaves (parallelizable)

1. **`types`** — risk: low. Single-file move + `database.ts` deletion. Estimated 30 minutes for one extractor.
2. **`schemas`** — risk: low. Folder rename `src/lib/schemas/` → `src/schemas/`. Update import paths (one find/replace). Estimated 1 hour.
3. **`audio`** — risk: low. Rename `src/game/audio/` → `src/audio/` (or keep path and just create `index.ts`). Estimated 1 hour.

### Tier 2 — first-order dependents (parallelizable AFTER tier 1)

4. **`content`** — risk: low-medium. Owns the integrity check; `module-load side effect` must be preserved. Estimated 2 hours.
5. **`infra`** — risk: medium. Includes the `useOptimisticAuth.ts` move OUT (closes the lib→game backedge) and the optional `saveValidation.ts` lazy-init refactor. Estimated 3 hours.

### Tier 3 — state core (sequential, MUST wait for tier 2)

6. **`state`** — risk: HIGH. The save round-trip lives here. Phase 3 extraction MUST run `/save-roundtrip-audit` BEFORE commit. The `useOptimisticAuth.ts` move-IN happens in this extraction. Estimated 4 hours.

### Tier 4 — view layers (parallelizable AFTER tier 3)

7. **`three`** — risk: low. Cohesive zone. Optional fix: move per-mission style data into `missions.json` to close the `planetTexture.ts#styleFor` non-exhaustive switch.
8. **`phaser`** — risk: medium. Cohesive zone. Includes `BossScene.ts` deletion. The `BootScene.ts` split is a follow-up PR.
9. **`app`** — risk: low. No file moves; just standardizing imports onto the new barrels.

### Tier 5 — UI (sequential, last)

10. **`ui`** — risk: medium-high. Highest fan-in. Includes splitting `GameCanvas.tsx` (452), `ShopUI.tsx` (408), `QuestPanel.tsx` (387), `WeaponCard.tsx` (210). Estimated 6 hours.

**Parallelism opportunity**: tiers 1, 2, and 4 can each run their modules in parallel `module-extractor` worktrees. Tiers 3 and 5 are serial. Estimated total wall-clock with parallelism: ~12 hours of agent time.

---

## Per-module risk assessment

| Module | Risk | Verification | Save-data gate | God-file split inside |
|---|---|---|---|---|
| types | low | `npm run typecheck` | no | none |
| schemas | low | `npm test src/schemas` (after move) | no | none |
| audio | low | `npm test src/audio` | no | `music.ts` 441 LOC (defer split) |
| content | low-medium | `npm test`; verify integrityCheck still fires at boot | no | `integrityCheck.ts` 351 (acceptable) |
| infra | medium | `npm test src/lib`; auth flows manually smoked | no | `saveValidation.ts` 440 (split recommended in Phase 3) |
| state | **HIGH** | `npm test`; `/save-roundtrip-audit` REQUIRED before commit | **YES** | `sync.ts` 516, `shipMutators.ts` 366, `saveQueue.ts` 346, `scoreQueue.ts` 355 (defer split) |
| three | low | `npm test src/three`; manual galaxy-view smoke | no | `Planet.ts` 341, `planetTexture.ts` 405 (defer split) |
| phaser | medium | `npm test`; combat smoke (one full mission) | no | `BootScene.ts` 1819 (defer; placeholder), `CombatScene.ts` 299 (borderline), inline `applyBulletAoE` is the next visible split |
| app | low | `npm run build`; smoke each route | no | `app/api/save/route.ts` 407 (defer; route handler is dense by nature) |
| ui | medium-high | `npm run build` + manual smoke of every section | no | `GameCanvas.tsx` 452, `ShopUI.tsx` 408, `QuestPanel.tsx` 387, `WeaponCard.tsx` 210 (split DURING extraction, not after) |

---

## Latent-issue interaction with Phase 3

Each entry in `04-found-bugs.md`, ranked by whether it must be hot-fixed before Phase 3:

| Issue | When to fix | Reason |
|---|---|---|
| `src/types/database.ts` dead | DURING Phase 3 (types extraction) | Trivial deletion; happens during the types module move. |
| `BossScene.ts` dead code | DURING Phase 3 (phaser extraction) | Same — delete during the extraction. |
| `audit-readiness-check.yml` Node 22 vs 20 | BEFORE Phase 3 | One-line config fix; eliminates a CI-flake variable from the audit. |
| `package.json db:migrate` calls dbmate | BEFORE Phase 3 | One-line fix; aligns CLAUDE.md and reality. Optional. |
| `useOptimisticAuth.ts` lib→game backedge | DURING Phase 3 (state extraction) | Resolved by the move proposed above. |
| `loadout/WeaponDetailsModal.tsx` reaches parent | DURING Phase 3 (ui extraction) | Resolved by the WeaponStats.tsx relocation. |
| `planetTexture.ts#styleFor` non-exhaustive | OPTIONAL before Phase 3 | The data-driven fix moves per-mission style into `missions.json`, which is a content-schema change. Doing it before Phase 3 means the new boundary inherits the safer shape. |
| `BootScene.ts` 1819 LOC | DEFER post-audit | Placeholder pending real PNG assets. Splitting prematurely creates churn. |
| `stateCore.ts` module-load side effects | DEFER post-audit | Works today; lazy-init is a polish pass. |
| `saveValidation.ts` module-load lootPools walk | OPTIONAL before Phase 3 | Resolves the only `infra → content` ambiguity. Doing it cleans the dependency diagram. |

Recommendation: hot-fix the two CI/config-only items (Node version, db:migrate script) BEFORE Phase 3 starts. They're 5-minute changes and remove noise from the refactor PRs. Defer the rest to during-Phase-3 or post-audit.

---

## Open questions for the orchestrator

1. **Hot-fix policy.** Confirm: hot-fix the two config items before Phase 3 (Node version alignment + db:migrate script), defer the rest. Or hot-fix nothing and defer all to post-audit?
2. **`saveValidation.ts` lazy-init.** Tier 2 (`infra`) extraction is the natural place to do this. Do it inline, or call it out as a follow-up PR after the `infra` boundary lands?
3. **`ui` god-file splits.** The proposal says split `GameCanvas` / `ShopUI` / `QuestPanel` / `WeaponCard` DURING the `ui` extraction. This is non-trivial — each split is a small refactor in itself. Acceptable, or split to a follow-up PR?
4. **Module path renames.** Today: `src/lib/`, `src/types/`, `src/components/`, `src/game/data/`, `src/game/state/`, `src/game/three/`, `src/game/phaser/`, `src/game/audio/`, `src/app/`. The proposed structure could keep these paths and just add `index.ts` barrels (zero file moves), OR consolidate to `src/{types,schemas,infra,content,state,audio,three,phaser,app,ui}/` (substantial moves but cleaner). Pick one before Phase 3.
5. **`BootScene.ts` placeholder.** Real art may never land. After 6 months, should the audit include the per-family split anyway?

---

## Next phase (do not start)

**Phase 3** — mechanical extraction, one module per `module-extractor` invocation, in the migration order above. Tier 1 (types/schemas/audio) parallelizable; tier 2 (content/infra) parallelizable after tier 1; tier 3 (state) serial; tier 4 (three/phaser/app) parallelizable after tier 3; tier 5 (ui) serial last.

Save-data gate: any extraction touching the round-trip surface MUST run `/save-roundtrip-audit` before commit (per CLAUDE.md §7a + `docs/INCIDENT_RUNBOOK.md`).

**Phase 4** (documentation) follows. Per the orchestrator's note in this PR, Phase 4 may be authored against the PROPOSED boundaries even if Phase 3 hasn't run yet — module READMEs reference the proposed structure with current file paths cross-linked, so the docs stay valid through the extraction.

**Phase 5** (verification) — pending Phase 3 + Phase 4 completion. Re-derives dependency graph; spot-checks 3 modules for "could a fresh agent change this safely with only the docs?".

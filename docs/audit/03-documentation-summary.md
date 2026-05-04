# Phase 4 — Documentation summary

This file accumulates each `doc-writer` agent's contribution. The orchestrator
combines them after all parallel runs land.

## Module: content

**Files touched:**

- `src/game/data/README.md` (rewritten — full module README per Phase 4 contract)
- `src/game/data/weapons.ts`
- `src/game/data/enemies.ts`
- `src/game/data/missions.ts`
- `src/game/data/perks.ts`
- `src/game/data/augments.ts`
- `src/game/data/lootPools.ts`
- `src/game/data/solarSystems.ts`
- `src/game/data/story.ts`
- `src/game/data/storyTriggers.ts`
- `src/game/data/waves.ts`
- `src/game/data/obstacles.ts`
- `src/game/data/missionWeaponRewards.ts`
- `src/game/data/integrityCheck.ts`

**TSDoc count (total `@stable` / `@internal` markers added):** 57.

By file:

| File | TSDoc blocks |
|---|---|
| `weapons.ts` | 5 |
| `enemies.ts` | 2 |
| `missions.ts` | 3 |
| `perks.ts` | 5 (1 marked `@internal`) |
| `augments.ts` | 9 |
| `lootPools.ts` | 4 |
| `solarSystems.ts` | 2 |
| `story.ts` | 7 |
| `storyTriggers.ts` | 5 |
| `waves.ts` | 2 |
| `obstacles.ts` | 2 |
| `missionWeaponRewards.ts` | 3 |
| `integrityCheck.ts` | 3 |

**Marker counts:**

- `// PUBLIC API` banners: 13 (one per accessor file).
- `// INVARIANT:` markers: 4
  - `weapons.ts` — `WEAPON_IDS` / `WeaponId` union drift.
  - `missions.ts` — integrityCheck boot trigger contract.
  - `augments.ts` — `as const satisfies` totality guard.
  - `missionWeaponRewards.ts` — bijection MissionId ↔ WeaponId.
- `// AI-NOTE:` markers: 6
  - `weapons.ts`, `enemies.ts`, `missions.ts`, `solarSystems.ts`, `waves.ts`, `obstacles.ts` — all annotate the deliberate `as` cast and the ~98 kB bundle-cost rationale tied to `jsonSchemaValidation.test.ts`.

**README:** [`src/game/data/README.md`](../../src/game/data/README.md)

**Verification:**

- `npm run typecheck` — passes after edits.

**Ambiguities surfaced:**

- The target architecture lists `REMOVED_WEAPON_BASE_COSTS` as part of the
  `content` public API, but it currently lives in
  `src/game/state/persistence/salvageRemovedWeapons.ts`. Documented as a
  legacy exception in the README; Phase 3 may relocate it.
- No prior `@stable` / `// PUBLIC API` convention existed in the codebase.
  This module is the first to use them; sibling modules (`schemas`, `state`,
  etc.) will need to follow the same convention as their doc-writer agents
  land.

## Module: audio

**README**: [`src/game/audio/README.md`](../../src/game/audio/README.md)

**Branch**: `docs/audit-phase-2` (Phase 4 audio worktree commit on top of content agent's commit).

**Scope**: every `*.ts` engine file under `src/game/audio/`, plus the AudioBus.

**Files touched:**

| File | Change |
|---|---|
| `src/game/audio/README.md` | Created. Sections: Purpose, Public API, Internal, Dependencies, Invariants, Common pitfalls, Files, How to test changes. |
| `src/game/audio/AudioBus.ts` | PUBLIC API banner + TSDoc on `audioBus`, `AudioCategory`, `AudioBusEngine`, `AudioBusState`, `register`, `isMasterMuted`, `isMuted`, `setMasterMuted`, `setCategoryMuted`, `getState`, `subscribe`. INTERNAL marker on `Listener`, `AudioBus` class, private snapshot helpers. |
| `src/game/audio/music.ts` | PUBLIC API banner + TSDoc on `menuMusic`, `combatMusic`, `shopMusic`, `init`, `loadTrack`, `arm`, `ensurePlaying`, `setMuted`, `duck`, `unduck`, `stop`. INTERNAL on `EngineOptions`, `MusicEngine` class, every private method. INVARIANT note in `stop()` for the iOS budget release. |
| `src/game/audio/story.ts` | PUBLIC API banner + TSDoc on `storyAudio`, `play`, `stop`, `setMuted`. INTERNAL on private methods, `tweenVolume`, `clamp01`, class. |
| `src/game/audio/storyLogAudio.ts` | PUBLIC API banner + TSDoc on `storyLogAudio`, `play`, `stop`, `setMuted`. INTERNAL on `StoryLogAudio` class, `tween`, private fade. |
| `src/game/audio/menuBriefingAudio.ts` | PUBLIC API banner + TSDoc on `menuBriefingAudio`, `MenuBriefingItem`, `playSequence`, `arm`, `stop`, `setMuted`. INTERNAL on class + private methods. |
| `src/game/audio/itemSfx.ts` | PUBLIC API banner + TSDoc on `itemSfx`, `weapon`, `augment`, `upgrade`, `money`, `shield`, `perk`, `setMuted`. INTERNAL on class + `play`. INVARIANT on the no-template-cache pattern (PR #69). |
| `src/game/audio/leaderboardAudio.ts` | PUBLIC API banner + TSDoc on `leaderboardAudio`, `play`, `stop`, `setMuted`. INTERNAL on class + private `startVoice`. |
| `src/game/audio/sfx.ts` | PUBLIC API banner + TSDoc on `sfx`, `setMuted`, `laser`, `explosion`, `hit`, `pickup`. INVARIANT block at file head for the disposal+sink contract. AI-NOTE for adding new play* methods. INTERNAL on `autoDispose`, `SoundContext`, `SoundEngine` class, `ensureCtx`, `getNoiseBuffer`. |

**Counts:**

- `// PUBLIC API` banners: **8** (one per engine file).
- TSDoc blocks added: **47** total — covers every public type, singleton export, and exported method per the proposed `audio` public API in `02-target-architecture.md`.
  - `AudioBus.ts`: 11 (3 types + 6 methods + bus singleton + 1 method group note)
  - `music.ts`: 11 (3 singletons + 8 methods)
  - `story.ts`: 4 (singleton + 3 methods)
  - `storyLogAudio.ts`: 4 (singleton + 3 methods)
  - `menuBriefingAudio.ts`: 6 (singleton + interface + 4 methods)
  - `itemSfx.ts`: 8 (singleton + 7 methods)
  - `leaderboardAudio.ts`: 4 (singleton + 3 methods)
  - `sfx.ts`: 7 (singleton + 5 methods + setMuted)
- `// INVARIANT:` markers: **4**
  - `AudioBus.register` — every engine MUST register in its constructor.
  - `music.ts:stop` — release HTMLAudioElement to free iOS Safari ~6-element budget.
  - `itemSfx.ts` head — no template-element cache (PR #69).
  - `sfx.ts` head — disposal + sink contract (master gain, autoDispose).
- `// AI-NOTE:` markers: **1** — recipe block in `sfx.ts` for adding a new `play*` method.
- `// INTERNAL` markers: **19** across the 8 files (private classes, helper functions, private methods, internal types).

**Verification:**

- `npm run typecheck` — passes (no logic changes).
- No tests added or modified — `src/game/audio/*.test.ts` already cover the public API; nothing was missing per the doc-writer contract.

**Ambiguities surfaced:**

- **`storyAudio` category mismatch.** Registered as `music` even though it plays a voice line on top of a bed. The constructor has a TODO about per-category sliders; documented the current "bed + voice fade together" trade-off in the README's Public API + Internal sections without changing logic.
- **Module path rename.** `02-target-architecture.md` Q4 leaves the `src/game/audio/` → `src/audio/` rename open. The README references the current path; if the rename ships, only the README link in this file (and the cross-reference in the README itself) needs updating.
## Root-level documentation

Owner: root-level `doc-writer` agent (this worktree).

### CLAUDE.md additions

- §4 (file ownership) — added a forward-reference paragraph to §17
  explaining that the table is the day-to-day file lookup while §17 is
  the rule lookup. Existing table preserved verbatim.
- §11 (Where things live) — added a forward-reference sentence to §17
  for the module-level boundary view. Existing concern table preserved
  verbatim.
- §17 (Module boundaries — post-audit map) — NEW section. ~50 lines.
  Includes the 10-module summary table, the boundary rules (acyclic
  graph, sinks, `infra → content` edge, save round-trip perimeter),
  and cross-links to ADRs in `docs/decisions/` plus the ARCHITECTURE.md
  module-graph section.

### ARCHITECTURE.md additions

- §11 (Module dependency graph — post-audit) — NEW top-level section
  appended after the existing "Things worth noting for future work"
  section. ~150 lines. Includes:
  - §11.1 the ASCII dependency graph (verbatim from
    `docs/audit/02-target-architecture.md`)
  - §11.2 the module summary table
  - §11.3 a step-by-step data-flow walkthrough of a save POST through
    all 10 modules and all 8 layers of the save round-trip
  - §11.4 the migration order for Phase 3 (gated, not executed)
  - Cross-links to all 7 ADRs and to the per-module READMEs

### ADRs created (`docs/decisions/`)

All 7 ADRs are dated 2026-05-04 and status `accepted`. Each is 50–90
lines (Context / Decision / Consequences).

- [docs/decisions/0001-static-by-default-on-vercel-hobby.md](decisions/0001-static-by-default-on-vercel-hobby.md)
  — why every page exports `force-static`, why API routes are the only
  Functions, why no middleware on game routes.
- [docs/decisions/0002-no-prisma-kysely-only.md](decisions/0002-no-prisma-kysely-only.md)
  — why Kysely + raw SQL migrations instead of an ORM.
- [docs/decisions/0003-anti-cheat-observation-not-enforcement.md](decisions/0003-anti-cheat-observation-not-enforcement.md)
  — why cheat-guard rejections are HTTP 422 transient (queued for
  retry) rather than account-blocking; why `save_audit` is forensics,
  not enforcement.
- [docs/decisions/0004-save-round-trip-eight-layers.md](decisions/0004-save-round-trip-eight-layers.md)
  — why the save pipeline has 8 distinct layers and why the
  `/save-roundtrip-audit` skill exists.
- [docs/decisions/0005-content-as-json-not-code.md](decisions/0005-content-as-json-not-code.md)
  — why every game balance value lives in `src/game/data/*.json`, why
  accessors do an `as` cast at module load with CI as the drift gate.
- [docs/decisions/0006-typed-phaser-event-bus-and-registry.md](decisions/0006-typed-phaser-event-bus-and-registry.md)
  — why string-keyed Phaser events and registry access are forbidden.
- [docs/decisions/0007-modular-architecture-audit-2026-05-04.md](decisions/0007-modular-architecture-audit-2026-05-04.md)
  — why the 2026-05-04 audit was undertaken, what the 10-module shape
  achieves, why Phase 3 is gated behind explicit user approval.

### Notes / ambiguities

- The audit input artifacts (`docs/audit/01-inventory.md`,
  `docs/audit/02-target-architecture.md`, `docs/audit/04-found-bugs.md`)
  were not present in this agent's worktree at start; cherry-picked
  from `master` so the deliverable lives in a self-consistent branch.
- `docs/audit/03-documentation-summary.md` (this file) was created by
  this agent. Other Phase 4 doc-writers should append their sections
  below; the orchestrator merges across worktrees.
- Existing CLAUDE.md content was preserved verbatim. The two
  forward-reference edits in §4 and §11 are pure additions, not
  rewrites.

## Module: types

Worktree branch: `worktree-agent-a3de117ab045dc1c5`.

### READMEs created
- [src/types/README.md](../../src/types/README.md) — purpose, public API table, internal, dependencies, invariants (`*_IDS satisfies` lock, no Phaser/Three imports, downstream `fireRateMs > 0`), common pitfalls, test instructions.

### TSDoc blocks added
- [src/types/game.ts](../../src/types/game.ts) — 18 `@stable` TSDoc blocks covering every public-API export:
  - Type aliases: `WeaponId`, `AugmentId`, `WeaponFamily`, `WeaponTier`, `EnemyId`, `EnemyBehavior`, `ObstacleId`, `ObstacleBehavior`, `MissionId`, `SolarSystemId`, `PlanetKind` (11)
  - Interfaces: `WeaponDefinition`, `EnemyDefinition`, `ObstacleDefinition`, `WaveSpawn`, `ObstacleSpawn`, `WaveDefinition`, `MissionWaves`, `SolarSystemDefinition`, `PlanetRing`, `MissionDefinition` (10 — `WaveSpawn` and `ObstacleSpawn` documented as adjacent neighbors)
  - Total: 21 TSDoc blocks (some types share grouping comments, but each export got its own block).

### Code-level markers added
- [src/types/game.ts](../../src/types/game.ts):
  - 1 `// PUBLIC API` banner (file header)
  - 1 `// AI-NOTE:` (leaf-of-graph reminder forbidding back-edge imports)
  - INVARIANT lines folded into individual TSDoc blocks (`WeaponDefinition`, `EnemyDefinition`, `MissionDefinition`).

## Module: schemas

Worktree branch: `worktree-agent-a3de117ab045dc1c5`.

### READMEs created
- [src/lib/schemas/README.md](../../src/lib/schemas/README.md) — purpose (boundary vs catalog split), public API tables (boundary schemas, catalog schemas, sub-schemas), internal (compile-time drift guards), dependencies (`types` only), invariants (CLAUDE.md §11 schema-vs-as-cast pattern, `*_IDS satisfies` lock, `fireRateMs.positive()`, `musicTrack.min(1)`, `LegacyOrShipConfigSchema` permissiveness), common pitfalls, test instructions.

### TSDoc blocks added
Files touched (7) with TSDoc block counts:

| File | TSDoc blocks added |
|---|---|
| [src/lib/schemas/save.ts](../../src/lib/schemas/save.ts) | 18 (3 ID list constants, 4 ID schemas, 5 ship sub-schemas, `LegacyShipSchema`, `LegacyOrShipConfigSchema`, `SavePayloadSchema` + `SavePayload`, `RemoteSaveSchema` + `RemoteSave`, `ScorePayloadSchema` + `ScorePayload`, `WEAPON_IDS` re-export) |
| [src/lib/schemas/weapons.ts](../../src/lib/schemas/weapons.ts) | 2 (`WeaponDefinitionSchema`, `WeaponsFileSchema`) |
| [src/lib/schemas/enemies.ts](../../src/lib/schemas/enemies.ts) | 4 (`ENEMY_IDS`, `EnemyIdSchema`, `EnemyDefinitionSchema`, `EnemiesFileSchema`) |
| [src/lib/schemas/obstacles.ts](../../src/lib/schemas/obstacles.ts) | 4 (`OBSTACLE_IDS`, `ObstacleIdSchema`, `ObstacleDefinitionSchema`, `ObstaclesFileSchema`) |
| [src/lib/schemas/missions.ts](../../src/lib/schemas/missions.ts) | 2 (`MissionDefinitionSchema`, `MissionsFileSchema`) |
| [src/lib/schemas/solarSystems.ts](../../src/lib/schemas/solarSystems.ts) | 2 (`SolarSystemDefinitionSchema`, `SolarSystemsFileSchema`) |
| [src/lib/schemas/waves.ts](../../src/lib/schemas/waves.ts) | 5 (`WaveSpawnSchema`, `ObstacleSpawnSchema`, `WaveDefinitionSchema`, `MissionWavesSchema`, `WavesFileSchema`) |
| [src/lib/schemas/handle.ts](../../src/lib/schemas/handle.ts) | 2 (`HandlePayloadSchema`, `HandlePayload`) |

Total schemas TSDoc blocks: **39**.

### Code-level markers added
- 8 file-header `// PUBLIC API` banners (one per schema file).
- 2 `// AI-NOTE:` markers in `save.ts` (no-runtime-parse rule, `LegacyShipSchema` "don't tighten this" inside its TSDoc).
- 1 `// AI-NOTE:` in `weapons.ts` (no-runtime-parse rule with concrete bundle-size cost).
- 5 `// INVARIANT:` markers (in `save.ts` for `*_IDS satisfies` lock, in `enemies.ts` and `obstacles.ts` for the same lock pattern, plus inline INVARIANT lines folded into TSDoc blocks for `WeaponDefinitionSchema`, `EnemyDefinitionSchema`, `MissionDefinitionSchema`, `SolarSystemDefinitionSchema`, `WaveSpawnSchema`, `WaveDefinitionSchema`, `ObstacleDefinitionSchema`, `ScorePayloadSchema`, `RemoteSaveSchema`).
- 6 `@internal` markers on shared / drift-guard helpers (compile-time guard locals in `save.ts`, `LegacyWeaponInstanceSchema` in `save.ts`, `EnemyBehaviorSchema` and `ObstacleBehaviorSchema`, `FormationSchema` and `ObstacleFormationSchema` in `waves.ts`, drift guard locals in `handle.ts`).

### Open questions
None. Every public-API export listed in `02-target-architecture.md` for both modules has a TSDoc block. The two modules are pure / leaf-tier and the existing top-of-file comments already documented the load-bearing "why this funny thing exists" — those were promoted to `// AI-NOTE:` / `// INVARIANT:` markers rather than rewritten.

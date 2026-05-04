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

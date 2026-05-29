# Phase 5 — Final verification report

> Audit verdict, top-line: **PARTIALLY COMPLETE.** Phase 3 landed all ten
> modules with green CI (1380/1380 tests, typecheck, lint, build). The
> proposed dependency graph holds for 8 of 10 modules; two real
> back-edges (`infra → state` via `saveValidation.ts`, `schemas → state`
> via `schemas/save.ts`) remain in master and were NOT captured in Phase
> 2 as violations. The most-load-bearing risk surface (save round-trip)
> passed `/save-roundtrip-audit` during the state extraction.
> Outstanding follow-ups: the `infra` barrel is nominal-only (logged in
> 04-found-bugs.md 2026-05-29), the `infra/schemas → state` back-edges
> need triage, and 4 god-files (`GameCanvas`, `ShopUI`, `QuestPanel`,
> `WeaponCard`) ship un-split. None block the audit verdict — they are
> tracked work, not regressions.

## 1. Dependency graph re-derivation

Method: walked every barrel + grepped every `from "@/<module>/..."` and
`from "@/<module>"` import across `src/**/*.{ts,tsx}` and
`tests/**/*.{ts,tsx}`. Edges below count cross-module references only
(intra-module imports excluded). Numbers are import-site counts, not
distinct-files counts where a file has multiple imports.

### Per-module summary

#### `types` ([`src/types/index.ts`](../../src/types/index.ts))
- **Imports from**: nothing (leaf).
- **Imported by (barrel)**: 86 files via `from "@/types"`. PR #240 promised
  86; reality is 86. **MATCH.**
- **Imported by (deep paths)**: 1 file —
  [`tests/security/creditCapCircular.test.ts`](../../tests/security/creditCapCircular.test.ts)
  still uses `from "@/types/game"`. Single residual; not blocking.

#### `schemas` ([`src/lib/schemas/index.ts`](../../src/lib/schemas/index.ts))
- **Imports from**: `types` (via `@/types`). Plus the back-edge below.
- **Imported by (barrel)**: 4 files via `from "@/lib/schemas"`:
  [`src/app/api/save/route.ts:8`](../../src/app/api/save/route.ts),
  [`src/app/api/handle/route.ts:7`](../../src/app/api/handle/route.ts),
  [`src/app/api/leaderboard/route.ts:9`](../../src/app/api/leaderboard/route.ts),
  [`src/game/data/__tests__/jsonSchemaValidation.test.ts:34`](../../src/game/data/__tests__/jsonSchemaValidation.test.ts).
- **Imported by (deep paths)**: 0 outside the schemas module's own files
  + 1 dynamic `await import("@/lib/schemas/save")` from
  [`src/game/state/sync.ts:298`](../../src/game/state/sync.ts).
  PR #241 said 4 importers routed through the barrel; reality is 4.
  **MATCH.**
- **Back-edge:** [`src/lib/schemas/save.ts:30-36`](../../src/lib/schemas/save.ts)
  imports `ReactorConfig`, `ShipConfig`, `WeaponInstance`,
  `WeaponInventory`, `WeaponSlots`, `MAX_LEVEL`, `MAX_WEAPON_SLOTS` from
  `@/game/state/ShipConfig`. This is `schemas → state` — a back-edge
  against the Phase 2 graph (which has `state → schemas`). **NOT logged
  in Phase 2's violations list.** See "Graph deltas" below.

#### `audio` ([`src/game/audio/index.ts`](../../src/game/audio/index.ts))
- **Imports from**: `types` only.
- **Imported by (barrel)**: 23 files via `from "@/game/audio"`. PR #244
  promised 24 importer lines; reality is 23 files / 23 import statements.
  **MATCH within ±1** (the doc counted lines; this counts files).
- **Imported by (deep paths)**: 0 outside the audio module.

#### `content` ([`src/game/data/index.ts`](../../src/game/data/index.ts))
- **Imports from**: `schemas` (parse-once at module load), `types`.
- **Imported by (barrel)**: 47 files via `from "@/game/data"` (53 total
  import statements — `ShopUI.tsx` and `WeaponCard.tsx` each have 3–4
  multi-import lines). PR #247 promised 46; reality is 47. **MATCH ±1.**
- **Imported by (deep paths)**: 1 file —
  [`src/game/data/storyTriggers.ts:2`](../../src/game/data/storyTriggers.ts)
  uses `from "@/game/data/story"` (intra-module file). The single
  external residual is zero. **Clean.**
- INVARIANT preserved: barrel re-exports from `./missions` (line 14),
  which transitively runs `runDataIntegrityCheck` at module load. Boot
  contract intact.

#### `infra` ([`src/lib/index.ts`](../../src/lib/index.ts))
- **Imports from**: `schemas` (none direct — `auth.ts` and `db.ts` use
  schemas at boundaries, not at module load), `types`, `content`
  (saveValidation → @/game/data), and TWO cross-module deep paths
  (back-edges, see below).
- **Imported by (barrel `@/lib`)**: **0 files.** No consumer routes
  through the barrel. Every importer reaches deep paths.
- **Imported by (deep paths `@/lib/...`)**: 29 files / 49 import statements:
  - `@/lib/routes` (8 files): `app/page.tsx`, `app/shop/page.tsx`,
    `app/leaderboard/page.tsx`, `app/play/error.tsx`, `app/shop/error.tsx`,
    `app/leaderboard/error.tsx`, `components/GameCanvas.tsx`,
    `components/HandlePrompt.tsx`, `components/PlayButton.tsx`,
    `components/SaveLoadErrorOverlay.tsx`, `lib/useHandle.ts`,
    `game/state/sync.ts`
  - `@/lib/auth` (3 API routes + `app/api/auth/[...nextauth]/route.ts`)
  - `@/lib/db` (3 API routes + `lib/leaderboard.ts`)
  - `@/lib/neonRetry` (3 API routes + `lib/leaderboard.ts`)
  - `@/lib/players` (3 API routes)
  - `@/lib/saveValidation` (1 API route + 1 test)
  - `@/lib/leaderboard` (2 server components)
  - `@/lib/authCache` (`components/SignInButton.tsx`,
    `game/state/useOptimisticAuth.ts`, `game/state/guestCache.ts`)
  - `@/lib/useHandle` (`components/SignInButton.tsx`,
    `game/state/useOptimisticAuth.ts`)
  - `@/lib/useReliableSession` (`components/hooks/useCloudSaveSync.ts`,
    `game/state/useOptimisticAuth.ts`)
  - `@/lib/handle` (`components/HandlePrompt.tsx`)
  - `@/lib/authEmailVerified` (1 test)
- **Barrel routing percentage: 0 / 29 = 0%.** PR #248 disclosed this:
  the `auth.ts` side-effect (top-level `NextAuth(config)`) makes routing
  test files through the barrel fail with `Cannot find module
  'next/server'`. 04-found-bugs.md 2026-05-29 logs the limitation.
- **Outbound back-edges from `infra`** (NOT in Phase 2 violations):
  - [`src/lib/saveValidation.ts:19-23`](../../src/lib/saveValidation.ts):
    `import { MAX_LEVEL, weaponUpgradeCost } from "@/game/state/ShipConfig"`
    and `import { SYSTEM_UNLOCK_GATES } from "@/game/state/stateCore"`.
    This is `infra → state`.
  - Co-exists with forward edges `state → infra` via
    `state/sync.ts → @/lib/routes`,
    `state/useOptimisticAuth.ts → @/lib/authCache/useHandle/useReliableSession`,
    `state/guestCache.ts → @/lib/authCache`.
  - Combined, **`infra ↔ state` is bidirectional in master.** This is
    structurally a cycle at the module level (TypeScript accepts it
    because no symbol-level cycle exists; both directions only import
    constants and types).

#### `state` ([`src/game/state/index.ts`](../../src/game/state/index.ts))
- **Imports from**: `content` (catalog accessors), `schemas` (only via
  dynamic `await import` in sync.ts), `types`, `infra` (forward edges
  noted above).
- **Imported by (barrel)**: 40 files (count from PR #250). Verification:
  47 import statements via `from "@/game/state"`, distributed across 40
  files. **MATCH** with PR #250's "40 importers updated".
- **Imported by (deep paths)**: 11 import statements across 11 files.
  Breakdown:
  - **Test-file exceptions (7 files, expected per Phase 3 plan):**
    [`tests/security/saveLogPayload.test.ts:2,4`](../../tests/security/saveLogPayload.test.ts)
    (deep imports for `clearLoadSaveCache`, `setCurrentPlayerEmail`,
    `clearSaveQueue`),
    [`src/components/hooks/useCloudSaveSyncLogic.test.ts:8`](../../src/components/hooks/useCloudSaveSyncLogic.test.ts)
    (type import from `@/game/state/sync`),
    [`src/components/loadout/augmentImpact.test.ts:4`](../../src/components/loadout/augmentImpact.test.ts)
    (`@/game/state/ShipConfig`),
    [`src/game/phaser/scenes/combat/DropController.test.ts:21,22`](../../src/game/phaser/scenes/combat/DropController.test.ts)
    (`import * as GameState`, then `ownsAnyOfType` for vi.mock targeting),
    [`src/game/phaser/entities/player/SlotModResolver.test.ts:7`](../../src/game/phaser/entities/player/SlotModResolver.test.ts),
    [`src/game/phaser/entities/player/PlayerCombatant.test.ts:7`](../../src/game/phaser/entities/player/PlayerCombatant.test.ts),
    [`src/game/phaser/entities/player/PlayerFireController.test.ts:11`](../../src/game/phaser/entities/player/PlayerFireController.test.ts).
    The Phase 3 plan flagged 7 test-file deep-path exceptions; reality
    is 7. **MATCH.**
  - **Non-test back-edges** (2 files, NOT logged in Phase 2 or in 04):
    [`src/lib/saveValidation.ts:22-23`](../../src/lib/saveValidation.ts)
    and [`src/lib/schemas/save.ts:35-36`](../../src/lib/schemas/save.ts)
    — both reach `@/game/state/ShipConfig`. These are the back-edges
    flagged under `infra` and `schemas` above.
- **Barrel routing percentage (non-test): 40 / 42 = 95%.**

#### `three` ([`src/game/three/index.ts`](../../src/game/three/index.ts))
- **Imports from**: `content`, `types`.
- **Imported by (barrel)**: 1 file —
  [`src/components/hooks/useGalaxyScene.ts`](../../src/components/hooks/useGalaxyScene.ts).
- **Imported by (deep paths)**: 3 dynamic-import call-sites
  intentionally kept on deep paths for code-splitting:
  [`src/components/GameCanvas.tsx:181`](../../src/components/GameCanvas.tsx)
  (`await import("@/game/three/TransitionManager")`),
  [`src/components/LandingBackground.tsx:32`](../../src/components/LandingBackground.tsx)
  (`import("@/game/three/LandingScene")`),
  [`src/components/hooks/useGalaxyScene.ts:94`](../../src/components/hooks/useGalaxyScene.ts)
  (`await import("@/game/three/GalaxyScene")`).
  PR #251 documented 3 deep-path dynamic exceptions; reality is 3.
  **MATCH.**

#### `phaser` ([`src/game/phaser/index.ts`](../../src/game/phaser/index.ts))
- **Imports from**: `content`, `state`, `audio`, `types`.
- **Imported by (barrel)**: 3 files —
  [`src/components/hooks/usePhaserGame.ts`](../../src/components/hooks/usePhaserGame.ts),
  [`src/components/GameCanvas.tsx`](../../src/components/GameCanvas.tsx),
  [`src/components/galaxy/VictoryModal.tsx`](../../src/components/galaxy/VictoryModal.tsx).
- **Imported by (deep paths)**: 0 cross-module. Barrel is minimal
  intentionally (config/events/registry only, scenes/entities/systems
  NOT re-exported — DOM side-effect avoidance, see the barrel header).
  PR #252's design intent matches reality. **MATCH.**

#### `app` (sink, no `index.ts`)
- **Imported by (any path)**: 0 files (`grep "@/app/"` returned nothing).
  Sink module as designed. **MATCH.**

#### `ui` (sink, no `index.ts`)
- **Imported by (deep paths)**: 7 files inside `src/app/` mount specific
  components (`src/app/page.tsx`, `src/app/shop/page.tsx`,
  `src/app/play/page.tsx`, `src/app/leaderboard/page.tsx`,
  `src/app/leaderboard/loading.tsx`, `src/app/layout.tsx`,
  `src/app/providers.tsx`). Sink consumed by `app/` only. **MATCH.**
- WeaponStats relocation: file moved from `src/components/WeaponStats.tsx`
  to [`src/components/loadout/WeaponStatsView.tsx`](../../src/components/loadout/WeaponStatsView.tsx).
  Rename to `WeaponStatsView` was forced by case-collision with the
  existing lowercase helper `src/components/loadout/weaponStats.ts`
  (the per-augment impact math, not the rendering component). PR #253
  logged the rename inline. **MATCH.**

### Graph deltas vs Phase 2 proposed

Phase 2's proposed graph (02-target-architecture.md):

```
ui → state → content → schemas → types
ui → state → content → infra  → schemas → types
ui → audio → types
phaser/three → content + state + audio (phaser) / content + types (three)
app → infra + state + schemas + content + types
```

**Confirmed edges in master:**

| Edge | Direction matches plan? | Evidence |
|---|---|---|
| `ui → state` | YES | 14+ files in src/components/ import @/game/state |
| `ui → content` | YES | `ShopUI.tsx`, `LoadoutMenu.tsx`, etc. |
| `ui → audio` | YES | `MenuMusic.tsx`, `GameCanvas.tsx`, etc. |
| `ui → infra` | YES (deep paths only) | `Leaderboard.tsx → @/lib/leaderboard` etc. |
| `state → content` | YES | `stateCore.ts → @/game/data` |
| `state → infra` | YES (forward, planned) | `sync.ts → @/lib/routes`, `useOptimisticAuth.ts → @/lib/authCache,useHandle,useReliableSession`, `guestCache.ts → @/lib/authCache` |
| `content → schemas` | YES (CI drift gate only) | barrel preserves contract |
| `schemas → types` | YES | `lib/schemas/*.ts → @/types` |
| `infra → content` | YES | `saveValidation.ts → @/game/data` |
| `audio → types` | YES (only types) | None outbound from `src/game/audio/` to other modules |
| `phaser → content/state/audio/types` | YES | `CombatScene.ts → @/game/data/missions, @/game/state, @/game/audio` |
| `three → content/types` | YES | `Planet.ts → @/game/data/missions, @/types` |
| `app → infra/state/content/schemas/types` | YES | API routes import all five |

**Edges in master NOT in the proposed graph (back-edges):**

| Edge | Reversed? | Evidence | Severity |
|---|---|---|---|
| `infra → state` | YES (cycle with `state → infra`) | [`src/lib/saveValidation.ts:19-23`](../../src/lib/saveValidation.ts) imports `MAX_LEVEL`, `weaponUpgradeCost`, `SYSTEM_UNLOCK_GATES` from `@/game/state/ShipConfig` + `@/game/state/stateCore` | **medium — module-level cycle** |
| `schemas → state` | YES | [`src/lib/schemas/save.ts:29-36`](../../src/lib/schemas/save.ts) imports `ReactorConfig`, `ShipConfig`, `WeaponInstance`, `WeaponInventory`, `WeaponSlots`, `MAX_LEVEL`, `MAX_WEAPON_SLOTS` from `@/game/state/ShipConfig` | **medium — leaf reaches up two tiers** |

Neither was logged in Phase 2's "Current code that violates the proposed
structure" section. Both pre-date the audit but were not surfaced during
Phase 1 inventory. They are not new regressions; Phase 3 preserved them
unchanged. Phase 2's violations list is incomplete by these two edges.

TypeScript compiles successfully and 1380 tests pass. The cycle does
not manifest as a build failure because at the symbol level there is no
actual circular reference (state imports `ROUTES` from infra — a const;
infra imports `MAX_LEVEL` from state — also a const; module-load order
is well-defined). The architectural concern stands regardless: a cycle
in the module graph means a change to `state/ShipConfig.ts`'s exports
forces re-walks of `infra` and `schemas` test suites, defeating the
audit's "subsystems are isolated" goal.

### Cycle verification

- No `madge --circular` tool installed; equivalent grep walk confirms
  no symbol-level cycle (no file imports itself; no file imports a
  downstream file that imports back symbol-for-symbol). The cycle is
  at the module-boundary level only, as documented above.
- TypeScript build green; `tsc --noEmit` returns 0.

## 2. Boundary enforcement check

| Module | Barrel? | External importers via barrel | External importers via deep paths | Routing % | Note |
|---|---|---|---|---|---|
| `types` | yes | 86 | 1 | **99%** | only `tests/security/creditCapCircular.test.ts` residual |
| `schemas` | yes | 4 | 0 (module-load) + 1 dynamic | **100%** at module load | dynamic import from `state/sync.ts` is intentional code-split |
| `audio` | yes | 23 | 0 | **100%** | cleanest module |
| `content` | yes | 47 | 0 cross-module | **100%** | the one deep-path importer is intra-module |
| `infra` | yes | 0 | 29 (all callers) | **0%** | barrel is nominal-only; `auth.ts` side-effect blocks routing (04-found-bugs 2026-05-29) |
| `state` | yes | 40 | 11 (7 test exceptions + 2 non-test back-edges + 2 intra-module) | **95%** non-test, **78%** including tests | 7 test-file exceptions match plan; 2 non-test back-edges from `infra`/`schemas` are the architectural concern |
| `three` | yes | 1 | 3 (intentional dynamic-import code-splitting) | **25%** static + intentional dynamic | matches PR #251 design intent |
| `phaser` | yes (minimal) | 3 | 0 cross-module | **100%** | barrel scope intentionally narrow (config/events/registry only) |
| `app` | n/a (sink) | n/a | 0 | n/a | nothing imports `@/app/*` — sink |
| `ui` | n/a (sink) | n/a | 7 (Next.js pages mounting components) | n/a | only `src/app/*` files import `@/components/*` — sink |

### Sink verification

- `grep "@/components/index"` — no matches.
- `grep "@/app/index"` — no matches.
- Neither sink has a barrel; nothing wrongly imports from one.

### `state` test-file deep-path enumeration

The 7 test files reaching `@/game/state/<deep>` (per the Phase 3 plan):

1. [`tests/security/saveLogPayload.test.ts`](../../tests/security/saveLogPayload.test.ts)
   — needs `clearLoadSaveCache`, `setCurrentPlayerEmail`, `clearSaveQueue`
   from cache + queue layers directly.
2. [`src/components/loadout/augmentImpact.test.ts`](../../src/components/loadout/augmentImpact.test.ts)
   — pulls `weaponDamageMultiplier`, `WeaponInstance` from
   `@/game/state/ShipConfig` for isolated DPS math test.
3. [`src/components/hooks/useCloudSaveSyncLogic.test.ts`](../../src/components/hooks/useCloudSaveSyncLogic.test.ts)
   — type-only import of `LoadResult` from `@/game/state/sync`.
4. [`src/game/phaser/scenes/combat/DropController.test.ts`](../../src/game/phaser/scenes/combat/DropController.test.ts)
   — `import * as GameState from "@/game/state/GameState"` because the
   test uses `vi.spyOn(GameState, "...")` to stub mutators; needs the
   concrete module object.
5–7. [`src/game/phaser/entities/player/SlotModResolver.test.ts`](../../src/game/phaser/entities/player/SlotModResolver.test.ts),
   [`PlayerCombatant.test.ts`](../../src/game/phaser/entities/player/PlayerCombatant.test.ts),
   [`PlayerFireController.test.ts`](../../src/game/phaser/entities/player/PlayerFireController.test.ts)
   — all three reach `@/game/state/ShipConfig` for `DEFAULT_SHIP`,
   `newWeaponInstance`, `WeaponInstance`.

All 7 are legitimate test-isolation reasons. None are accidental.

## 3. Fresh-agent test — spot-check 3 modules

For each module I read ONLY: the README, the `index.ts` (if any), and
CLAUDE.md §17. Below: "Could a fresh agent make a typical change
safely?"

### `state` — score: **PASS**

Change considered: add a new field `lastCompletedMissionAt: number` to
`StateSnapshot` (timestamp of the most recent completion).

What the README says:
- The 8-layer save round-trip invariant is named at the top of the file
  (line 86 — "Adding a `StateSnapshot` field that doesn't thread through
  ALL 8 layers causes silent drops").
- Pointer to `/save-roundtrip-audit` skill before commit (line 86).
- The hydration gate (`isHydrationCompleted`) is explicitly named as the
  client-side half of the 2026-05-02 wipe defense (line 90).
- `INITIAL_STATE.unlockedSolarSystems` is FALLBACK only — derive the real
  set inside `hydrate()` from `completedMissions` ∩ `SYSTEM_UNLOCK_GATES`
  (line 88). This kind of "looks-like-truth but isn't" trap is exactly
  what a fresh agent would walk into.
- `persistence/` sub-folder is "entirely internal" — only `persistence.ts`
  exposes `hydrate`/`toSnapshot` (line 69). A fresh agent will not
  accidentally edit a migrator and miss the salvage ordering.
- The list of test files (lines 110-122) covers every migrator + the
  durability queues.

What's missing or weak: the back-edge from `infra/saveValidation.ts →
state/ShipConfig` and `schemas/save.ts → state/ShipConfig` is NOT in
the README. A fresh agent renaming an export in `ShipConfig.ts` would
break `lib/saveValidation.ts` and `lib/schemas/save.ts` and only learn
about it at `npm run typecheck` time. The state README's "Dependencies"
table says state depends on schemas/lib but doesn't warn about reverse
edges. Documenting this is a docs-only follow-up.

Verdict: a fresh agent with the README + index.ts + CLAUDE.md §17 can
make a typical save-shape change safely. The save-roundtrip-audit skill
catches what the README doesn't. **PASS.**

### `infra` — score: **PARTIAL**

Change considered: add a new cheat guard `validateWeaponInventoryShape`
for the next round of save-payload hardening.

What the README does well:
- Names the public surface clearly (every cheat guard, every exported
  constant — `src/lib/README.md` "Cheat guards" section, lines 63-95).
- Calls out the `validateNoRegression` 2026-05-02 footgun with a
  history reference ("Skipping `validateNoRegression` was the
  2026-05-02 wipe trigger" — line 67).
- Lists the lib → game backedge explicitly with an AI-NOTE
  (lines 60-61), explaining why `useOptimisticAuth` is the one
  legitimate exception. (Note: the README still names useOptimisticAuth
  as living in `src/lib/`, but per PR #248 the file has moved to
  `src/game/state/`. README drift, minor.)
- Documents the Edge-vs-Node split (lines 138-152).
- Tests enumerated (lines 233-243).

What's weak:
- The barrel-limitation gotcha is NOT in the README. PR #248 carved
  `auth.ts` out of barrel routing because top-level `NextAuth(config)`
  side-effects broke test files that go through the barrel. A fresh
  agent reading the README expects "import via @/lib" to be the public
  contract, but the actual contract is "import via deep paths because
  the barrel doesn't enforce anything". The 04-found-bugs.md
  2026-05-29 entry has the full story (three resolution options
  enumerated), but the README points to ADR 0007, CLAUDE.md §3-§13,
  and the threat model — none of which mention the barrel limitation.
- The `saveValidation.ts → @/game/state/ShipConfig` back-edge for
  `MAX_LEVEL` and `weaponUpgradeCost` is NOT mentioned. A fresh agent
  will not know that adding a `MAX_LEVEL`-equivalent constant in
  `ShipConfig` couples `state` to `infra`.

Gaps a fresh agent would hit:
1. Tries to add the guard, imports from `@/lib/saveValidation`, runs
   tests — fine. Then for completeness, tries to route their new
   import through `@/lib` barrel — gets `Cannot find module
   'next/server'` and loses 30 min figuring out why.
2. Their new guard reads from `ShipConfig` (reasonable — most save
   payloads have ship state). They do not notice this creates a
   stronger `infra → state` coupling because no one told them about
   the existing one.

Verdict: the README is good but not complete. Two known issues from
04-found-bugs.md 2026-05-29 + this report (§1 back-edges) need to land
in the README. **PARTIAL.**

### `ui` — score: **PARTIAL**

Change considered: add a new stat display to the weapon details modal
(e.g. "expected DPS at level 5").

What the README does well:
- The `WeaponStatsView.tsx` quirk is documented in the "Internal"
  section (line 38): "The previous cross-folder reach
  `loadout/WeaponDetailsModal.tsx` → `components/WeaponStats.tsx` was
  resolved during Phase 3 Tier 5 — the component now lives at
  `loadout/WeaponStatsView.tsx` next to its sole consumer (renamed
  from `WeaponStats.tsx` to dodge a case collision with the existing
  `loadout/weaponStats.ts` helper on case-insensitive filesystems;
  the symbol export name is still `WeaponStats`)."
- Names the four god-files explicitly (line 67-68) so a fresh agent
  knows not to balloon them further.
- Sink-module status called out at line 5.
- Strong invariants list (lines 56-65) covers the SSR-off rule, the
  client-component rule, the audio-singleton pattern.

What's weak / a fresh agent would hit:
1. The file IS `WeaponStatsView.tsx` but the exported symbol IS STILL
   `WeaponStats`. A fresh agent reading the README understands the
   rename rationale, but if they grep for `import { WeaponStats }`
   they will find it only in `loadout/WeaponDetailsModal.tsx` — fine.
   But if they go to add a new consumer, will they import from
   `./WeaponStatsView` (file path) or `./WeaponStats` (symbol)? The
   README mentions both names without an example. A fresh agent might
   guess wrong on first try.
2. The "import from `./WeaponStatsView`" path is the correct one but
   is not shown as an explicit example. A code-snippet in the README
   would close this gap.
3. The case-collision phrasing ("dodge a case collision with the
   existing `loadout/weaponStats.ts` helper") is technically correct
   but the relationship between the two files is implicit: a
   non-camelCase `.ts` file holds DPS math, the PascalCase `.tsx`
   file holds the view, and they share a name on case-insensitive
   filesystems. A fresh agent on Windows or macOS-default might
   create a third file like `WeaponStatsDetail.tsx` next to them and
   not know the lowercase file exists.

Minor docs gap, not a blocker. **PARTIAL.**

### Spot-check summary

| Module | Verdict | Critical gap | Severity |
|---|---|---|---|
| state | PASS | back-edges from infra/schemas not in README | minor (caught by typecheck) |
| infra | PARTIAL | barrel limitation not in README; infra → state back-edge not in README; stale useOptimisticAuth path | medium (fresh-agent productivity loss) |
| ui | PARTIAL | WeaponStatsView quirk explained but no import example | minor |

## 4. Latent issues remaining

From 04-found-bugs.md, items with NO "Resolved" line:

### `useOptimisticAuth.ts` lib → game backedge (2026-05-04)

- **Status**: RESOLVED INDIRECTLY during Phase 3 Tier 2 (PR #248). The
  file MOVED from `src/lib/useOptimisticAuth.ts` to
  `src/game/state/useOptimisticAuth.ts`. The lib → game backedge no
  longer exists at this path (the file is now IN state, not lib; the
  flipped direction `state → infra` for `authCache`/`useHandle`/
  `useReliableSession` IS the planned forward edge). 04-found-bugs.md
  does NOT have a "Resolved" line on this entry; it should be marked
  resolved.

### `three/planetTexture.ts#styleFor` switch non-exhaustive (2026-05-04)

- Status: UNRESOLVED. Phase 3 did NOT touch planetTexture.ts.
- Phase 3 impact: Phase 3 added an `index.ts` barrel re-exporting
  `planetTexture.ts`; the `styleFor` switch is still in the source
  file unchanged. The latent crash is preserved.
- Severity reaffirm: medium. A new mission added to `missions.json`
  still Zod-validates fine and still crashes inside `paintDiffuse()`
  at render time.
- Phase 3 made the fix EASIER: the `three` module now has a barrel +
  a README that explicitly names the issue in "Sharp edges" (line
  46-48). A fresh agent adding a new mission knows to also add a
  `styleFor` case.
- No new urgency: nobody added a new mission between 2026-05-04 and
  2026-05-29.

### `BootScene.ts` 1819 LOC god-file (2026-05-04)

- Status: UNRESOLVED. Phase 3 explicitly deferred per the migration plan.
- Phase 3 impact: the `phaser` barrel is intentionally minimal
  (config/events/registry only) so scenes are NOT re-exported. This
  preserves the deletion-friendliness of the placeholder code — when
  real art lands, the file moves to per-family `boot/` files without
  changing any consumer.
- Severity reaffirm: low (documented placeholder).
- New urgency: none.

### `state/stateCore.ts` module-load side effects (2026-05-04)

- Status: UNRESOLVED.
- Phase 3 impact: the `state` barrel re-exports from `./GameState`
  which re-exports from `./stateCore`. Importing `@/game/state` still
  triggers the module-load side effects. Phase 3 preserved the
  behavior intentionally (the integrity check is the boot contract;
  lazy-loading it loses the "boot-time fail-fast" property the
  README invariant relies on).
- Severity reaffirm: low. Fine today.
- New urgency: none.

### `@/lib` barrel can't be the sole import path while `auth.ts` has module-load side effects (2026-05-29)

- Status: UNRESOLVED.
- Phase 3 impact: this issue was DISCOVERED during Phase 3 Tier 2 and
  is the blocker behind the `infra` barrel's 0% routing percentage.
  The audit's "everyone goes through the barrel" goal for `infra` is
  not met. Three resolution options enumerated in 04-found-bugs.md
  (a: refactor auth.ts to defer NextAuth init; b: carve auth.ts out
  of the barrel; c: nominal-only barrel).
- Severity reaffirm: medium. Architectural — defeats the audit goal
  for `infra`.
- New urgency: ESCALATED. Phase 5's spot-check on infra was PARTIAL
  precisely because of this issue. The infra README does not mention
  it, so fresh agents lose time discovering it. Either fix (option a
  or b) or document it explicitly in the README.

### `infra → state` and `schemas → state` back-edges (NEW — surfaced by this Phase 5 verification)

- Status: UNRESOLVED. Pre-dates the audit. NOT in 04-found-bugs.md.
- Locations:
  - [`src/lib/saveValidation.ts:19-23`](../../src/lib/saveValidation.ts)
    → `@/game/state/ShipConfig`, `@/game/state/stateCore`
  - [`src/lib/schemas/save.ts:29-36`](../../src/lib/schemas/save.ts)
    → `@/game/state/ShipConfig`
- Phase 3 impact: Phase 3 preserved them unchanged.
- Severity: medium. Module-level cycle between `infra` and `state`
  (and `schemas` reaching up two tiers to `state`). TypeScript
  compiles; tests pass; the cycle is "data, not behavior" — but the
  audit's "subsystems are isolated" goal fails for `state ↔ infra`.
- Recommended action: log a new entry in 04-found-bugs.md; propose a
  resolution (lift `MAX_LEVEL`, `MAX_WEAPON_SLOTS`, `weaponUpgradeCost`,
  `SYSTEM_UNLOCK_GATES`, and the ShipConfig type interfaces into a
  pure-types module under `types/` or a new `state-types/` leaf module
  that `schemas` and `infra` can depend on without pulling the full
  state behavior).

## 5. Summary

- **Audit goal — achieved?** Partially. The 10 modules ship; 8/10 have a
  barrel; the proposed dependency graph holds for 8/10; the highest-risk
  surface (save round-trip) passed `/save-roundtrip-audit`; module
  READMEs land for 6 modules; ADRs land for 7 decisions; CLAUDE.md §17
  + ARCHITECTURE.md §11 published.
- **Test / typecheck / build status across extractions**: green at
  9af858a. `npm test` 1380/1380 pass. `npm run typecheck` clean.
  `npm run lint` clean. `npm run build` clean.
- **Major risk surfaces**: save round-trip preserved (8 layers intact,
  hydration gate intact, validateNoRegression intact, saveQueue
  durability intact). Auth handler kept on Node runtime; all other API
  routes Edge. No new latent crash introduced by Phase 3.
- **Outstanding follow-up work** (none block the audit verdict):
  1. `infra` barrel is nominal-only (auth.ts side-effect); pick option
     a, b, or c from 04-found-bugs.md 2026-05-29.
  2. `infra → state` and `schemas → state` back-edges; log + plan a
     resolution.
  3. Four god-files (`GameCanvas` 452, `ShopUI` 408, `QuestPanel` 387,
     `WeaponCard` 210) ship un-split.
  4. `three/planetTexture.ts#styleFor` non-exhaustive switch still
     present.
  5. `state` README should add the back-edge warning.
  6. `infra` README should explain the barrel limitation + update the
     stale `useOptimisticAuth` path.
  7. `ui` README should add an import example for `WeaponStatsView`.
- **Verdict**: **AUDIT PARTIALLY COMPLETE.** The modular structure is
  in place and load-bearing. Two architectural gaps (`infra` barrel
  routing, `infra/schemas → state` back-edges) need follow-up before
  the structure is fully airtight. None of the gaps regress production
  behavior or break the save-data perimeter.

## Open questions for the orchestrator

- **Should `useOptimisticAuth.ts` get an explicit "Resolved" line in
  04-found-bugs.md** since the file moved during Phase 3 Tier 2? The
  entry's original concern (lib → game backedge) is gone but the
  resolution line is missing.
- **Should the two new back-edges (`infra → state`, `schemas → state`)
  be logged in 04-found-bugs.md** as 2026-05-30 entries with the same
  three-option resolution shape used for the `auth.ts` barrel
  limitation entry?
- **Documentation polish — in or out of scope for the audit?** The
  three README gaps surfaced in §3 (state's back-edge warning, infra's
  barrel-limitation note + stale path, ui's WeaponStatsView import
  example) are doc-only — they need a doc-writer pass. Do they go in
  this audit's wind-down PRs, or are they punted to a follow-up?
- **Phase 3 Tier 5 god-file splits**: the `ui` README acknowledges 4
  god-files ship un-split. Is splitting them part of "Phase 3
  complete" or explicitly deferred to a post-audit follow-up? (The
  original Phase 2 plan said "split during Phase 3"; reality says
  they didn't. No README claims they did. Just clarifying scope.)

## Next phase (do not start)

No "Phase 6" exists in the audit spec. The audit ends here. The
orchestrator's next move is to review this report with the user,
decide which §5 outstanding items to schedule, and close the audit's
parent PR — OR open a follow-up wave to address the two architectural
gaps (`infra` barrel + the cross-module back-edges). Either path is
valid; the audit's verdict (PARTIALLY COMPLETE) does not depend on
that decision.

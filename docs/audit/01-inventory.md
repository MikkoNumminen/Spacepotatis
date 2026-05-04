# Phase 1 — Codebase inventory

Spacepotatis modular-architecture audit, Phase 1. Read-only walk of every meaningful source file. **No proposals here** — that's Phase 2's job. This artifact is evidence, not direction.

> Synthesized from four parallel zone artifacts produced by independent `refactor-architect` agents. Each zone artifact is appended verbatim below; the synthesis sections at the top of this file are the cross-cutting findings that span zones.

## Method

Four parallel `refactor-architect` agents, each running in an isolated git worktree, walked one disjoint zone of the repo and produced a zone-specific inventory file. A fifth pass (this file) concatenates them and adds cross-cutting synthesis. No source code was modified during Phase 1.

| Zone | Scope | Files inventoried |
|---|---|---|
| A | `src/app/`, `src/components/` and subfolders | 52 (48 source + 4 test) |
| B | `src/game/phaser/` (entire tree, incl. `__tests__/`) | 41 (28 production + 13 test) |
| C | `src/game/data/`, `src/game/state/` (incl. `persistence/`), `src/game/three/`, `src/game/audio/` | 94 (data 25 + state 27 + three 12 + audio 17 + various tests) |
| D | `src/lib/`, `src/lib/schemas/`, `src/types/`, `src/middleware.ts`, `db/migrations/`, `scripts/`, root configs | 67 (lib 22 + schemas 16 + types 2 + db 5 + scripts 11 + configs 11) |

Headline total: **~254 files** inventoried (production source + tests + JSON catalogs + SQL migrations + root configs). The exact count varies by what counts as "meaningful" — JSON test fixtures, lockfile, generated `.next/` output, vendored sprites are all excluded.

## Cross-cutting findings (synthesis)

The four zone observations sections are the source of truth for everything below; this synthesis is a digest with cross-zone joins.

### 1. Cross-zone coupling map

UI (zone A) reaches into:
- `@/game/state/{GameState,useGameState,sync,syncCache}` — 14 importers across `GameCanvas`, `ShopUI`, `useStoryTriggers`, etc. **Intentional**: the GameState barrel is the public API for state.
- `@/game/state/ShipConfig` — 10 importers, the loadout cluster's data spine. **Intentional**.
- `@/lib/{routes,useOptimisticAuth}` — 6 importers each (auth UX cluster). **Mostly intentional**, but see latent issue: `useOptimisticAuth` is a `lib → game` backedge that shouldn't be in `lib`.
- `@/game/audio/*` — fired from React effects. **Intentional but fragile**: same engines fire from Phaser scenes too, so two render paths share global audio state.

Phaser (zone B) reaches into:
- `@/game/state/GameState` + `@/game/state/rewards` from `CombatScene` (most state-mutating writer in the zone).
- `@/game/state/{GameState,ShipConfig}` from `DropController` (weapon-pickup ladder).
- `@/game/audio/sfx` from `PlayerCombatant` (5 audio reach edges total).
- **Zero reach into `src/components/`** — clean boundary.

Shared game (zone C) reaches into:
- `@/lib/schemas/*` — Zod parsers from data accessors and from save state.
- `@/lib/db.ts` — state persistence (sync.ts, persistence.ts).
- `@/types/game.ts` — shared types.
- `@/components/` — **none**. (Audio engines are fired FROM components, but the audio module doesn't import them.)

Infrastructure (zone D) is imported by everyone but reaches OUT only via:
- **`src/lib/useOptimisticAuth.ts:10-11` reaches into `@/game/state/sync` + `@/game/state/syncCache`** — the only `lib → game` backedge in the codebase. Logged in `04-found-bugs.md`.

### 2. Accidental coupling vs intentional shared utilities

| File / module | Importer count | Verdict |
|---|---|---|
| `@/game/state/useGameState` | many (UI cluster) | **Intentional** — the React subscription hook. |
| `@/lib/routes` | many | **Intentional** — centralized route constants per CLAUDE.md §11. |
| `@/game/data/{weapons,enemies,missions,perks,augments,solarSystems,lootPools,story,storyTriggers,integrityCheck}` accessors | many across UI + Phaser | **Intentional** — the catalog public API. |
| `@/types/game.ts` | many | **Intentional** — shared TS types. |
| `@/game/audio/*` | UI + Phaser | **Intentional but fragile** — see synthesis #5 (cross-cutting concerns). |
| `@/lib/saveValidation.ts` | API only | **Intentional** — Edge cheat-guard. |
| `@/game/state/ShipConfig` | UI loadout + Phaser combat | **Intentional** — single source of truth for ship math. |
| `@/components/WeaponStats.tsx` reached from `loadout/WeaponDetailsModal.tsx` | 1 cross-folder edge | **Suspected accidental** — child→parent reach. Logged in `04-found-bugs.md`. |

### 3. Cycles

**None across any zone.** All four agents independently confirmed no import cycles. The closest "almost-cycle" is the `loadout/ → components/` parent-reach (above), which is acyclic but architecturally questionable. Phaser's PerkController ↔ DropController construction-order dance is resolved via lazy `() => x` accessors at scene boot — closures, not cycles.

### 4. God-files (sorted by LOC desc)

| Path | LOC | Why flagged | Likely split |
|---|---|---|---|
| [`src/game/phaser/scenes/BootScene.ts`](src/game/phaser/scenes/BootScene.ts) | 1819 | procedural texture generation for every sprite | Documented placeholder; split into `boot/` subfolder by family if real art doesn't land soon. |
| [`src/lib/saveValidation.ts`](src/lib/saveValidation.ts) | 440 | Edge-runtime cheat guards (mission DAG + credit caps + playtime delta + leaderboard completion + regression no-shrink) | Split per guard kind: `saveValidation/{missionGraph,credits,playtime,regression}.ts`. |
| [`src/game/audio/music.ts`](src/game/audio/music.ts) | 441 | menu + combat + shop music engines all in one | Split per bed (`menuMusic.ts`, `combatMusic.ts`, `shopMusic.ts`) sharing a base. |
| [`src/components/GameCanvas.tsx`](src/components/GameCanvas.tsx) | 452 | 11 distinct responsibilities (mode machine, fade overlay, save/score-queue triggers, victory state, story-trigger wiring, …) | Split via more `useX` hooks; the orchestrator stays but loses 200+ LOC. |
| [`scripts/restore-player.mjs`](scripts/restore-player.mjs) | 478 | recovery script with --apply gate + before-state print + safety prompts | Acceptable for one-off recovery; flagged for completeness. |
| [`src/components/ShopUI.tsx`](src/components/ShopUI.tsx) | 408 | 6 mutator wirings + 2 audio side-effect lifecycles + 3 catalog sections | Split by section: `shop/HullSection.tsx`, `shop/WeaponsSection.tsx`, `shop/AugmentsSection.tsx`. |
| [`src/app/api/save/route.ts`](src/app/api/save/route.ts) | 407 | 5 distinct error-code branches + forensic audit writer | Split error-handling out; route stays thin. |
| [`src/game/three/planetTexture.ts`](src/game/three/planetTexture.ts) | 405 | per-mission style switch + paint pipeline | Move per-mission style into `missions.json` (also closes a latent crash, see `04-found-bugs.md`). |
| [`src/components/galaxy/QuestPanel.tsx`](src/components/galaxy/QuestPanel.tsx) | 387 | 5 sub-components in one file | Split each `Section`/`Row`/`SuggestedRow` into a per-component file. |
| [`src/game/state/shipMutators.ts`](src/game/state/shipMutators.ts) | 366 | every `buy*`, `equip*`, `install*` mutator | Group by surface: `shipMutators/{weapons,augments,reactor,armor,shield}.ts`. |
| [`src/game/state/scoreQueue.ts`](src/game/state/scoreQueue.ts) | 355 | leaderboard durability queue | Reasonable; flagged because it lives next to `saveQueue.ts` and the two could share a base. |
| [`src/game/data/integrityCheck.ts`](src/game/data/integrityCheck.ts) | 351 | every cross-reference between content collections | Single responsibility, just dense. Acceptable. |
| [`src/game/state/saveQueue.ts`](src/game/state/saveQueue.ts) | 346 | localStorage save durability + flush | See `scoreQueue.ts` — sibling pair, share a base. |
| [`src/game/three/Planet.ts`](src/game/three/Planet.ts) | 341 | mesh + ring + atmosphere assembly | Split atmosphere/ring into helpers. |
| [`src/game/phaser/scenes/CombatScene.ts`](src/game/phaser/scenes/CombatScene.ts) | 299 | orchestrator + inline `applyBulletAoE` | Borderline; `applyBulletAoE` (lines 208-242) is the next visible split. |
| [`src/components/hooks/useStoryTriggers.ts`](src/components/hooks/useStoryTriggers.ts) | 281 | 4 trigger surfaces + 2 cleanup contracts | Borderline. Acceptable as a single hook because the trigger surfaces share a tight invariant. |
| [`src/types/game.ts`](src/types/game.ts) | 235 | shared types for the entire game | Acceptable — single-responsibility (just types). |
| [`src/components/loadout/WeaponCard.tsx`](src/components/loadout/WeaponCard.tsx) | 210 | mixes presentation with mutators | Split mutator wiring out into a parent. |

### 5. Cross-cutting concerns

| Concern | Where it lives today | Notes |
|---|---|---|
| State barrel + listener pattern | [`src/game/state/`](src/game/state/) | Barrel re-export at `GameState.ts`. Slices: `stateCore`, `shipMutators`, `persistence`, `pricing`. |
| Save round-trip | `state/persistence.ts` + `state/persistence/*` migrators + `state/sync.ts` + `state/syncCache.ts` + `state/saveQueue.ts` + `state/scoreQueue.ts` + `lib/db.ts` + `lib/schemas/save.ts` + `lib/saveValidation.ts` + `app/api/save/route.ts` | The highest-risk surface. The existing `/save-roundtrip-audit` skill walks every `StateSnapshot` field through 8 layers. |
| Auth | `lib/{auth,useReliableSession,useOptimisticAuth}` + components consuming `useSession()` | NextAuth v5 (Google OAuth). One backedge from `lib` → `game` (logged). |
| Integrity / drift | [`src/game/data/integrityCheck.ts`](src/game/data/integrityCheck.ts) | Cross-reference walker; runs at module load via `missions.ts`. |
| Routes | [`src/lib/routes.ts`](src/lib/routes.ts) + `useHandle` | Centralized constants. |
| Phaser event bus | [`src/game/phaser/events.ts`](src/game/phaser/events.ts) + [`registry.ts`](src/game/phaser/registry.ts) | Typed wrappers. **Zero string-keyed violations** found in zone B. |
| Audio mute fan-out | [`src/game/audio/AudioBus.ts`](src/game/audio/AudioBus.ts) | All engines self-register; bus drives mute. |
| Story trigger seen-set | `state/seenStoriesLocal.ts` + `data/storyTriggers.ts` + `components/hooks/useStoryTriggers.ts` | Local + server union. |
| Edge runtime config | `app/api/save/route.ts`, `app/api/leaderboard/route.ts`, `app/api/handle/route.ts` | `export const runtime = "edge"`. |
| Static-by-default page rendering | every `app/*/page.tsx` | `export const dynamic = "force-static"` on most. |

### 6. Save round-trip surface (highest-risk for any extraction)

Per zone C's exhaustive list, plus zones A + D for callers:

- `src/game/state/persistence.ts` (orchestrator)
- `src/game/state/persistence/{helpers,legacyShared,types,migrateNewShape,migrateLegacyIdArray,migrateNamedSlots,migratePrimaryWeapon,safetyNet,salvageRemovedWeapons}.ts` (per-shape migrators)
- `src/game/state/{stateCore,seenStoriesLocal,sync,syncCache,saveQueue,scoreQueue}.ts`
- `src/game/data/storyTriggers.ts` (consumed by hydrate via the seen-set)
- `src/lib/db.ts` (Kysely client + `Database` interface)
- `src/lib/schemas/save.ts` (Zod schemas: `SavePayloadSchema`, `RemoteSaveSchema`)
- `src/lib/saveValidation.ts` (cheat guards)
- `src/app/api/save/route.ts` (POST + GET + audit writer)
- `db/migrations/*.sql` (every migration that touches `save_games` or `save_audit`)

**Phase 3 rule**: any extraction that moves any file in this list MUST trigger `/save-roundtrip-audit` before commit. This is non-negotiable per CLAUDE.md §7a + `docs/INCIDENT_RUNBOOK.md`.

### 7. Latent issues found during the walk

Logged in [`docs/audit/04-found-bugs.md`](04-found-bugs.md). Summary:

- `src/types/database.ts` is dead and out of sync (missing `SaveAuditTable`).
- `BossScene.ts` is dead code (not registered in scene array).
- `audit-readiness-check.yml` Node 22 vs `ci.yml` Node 20.
- `package.json#scripts.db:migrate` calls dbmate while CLAUDE.md tells contributors to use the node runner.
- `useOptimisticAuth.ts` is the only `lib → game` backedge.
- `loadout/WeaponDetailsModal.tsx` reaches up to `components/WeaponStats.tsx`.
- `three/planetTexture.ts#styleFor` switch is non-exhaustive over `MissionId` — Zod-valid mission ids can crash at render.
- `BootScene.ts` at 1819 LOC (documented placeholder).
- `state/stateCore.ts` runs side effects (integrity check + localStorage read) at module load.
- `lib/saveValidation.ts` walks `getAllLootPools()` at module load (Edge cold-start tax).

These are NOT touched in the audit refactor. They're for the user to triage.

## Open questions for the orchestrator

1. **Phase 4 doc scope.** Should documentation be applied to the existing file structure (treating Phase 2's proposed boundaries as logical groupings only), or is Phase 3 (mechanical extraction) a hard prerequisite for Phase 4?
2. **Latent-issues fix policy.** All latent issues are logged in `04-found-bugs.md`. Should any be hot-fixed as a side PR before Phase 3 starts (e.g. delete `database.ts`, normalize Node versions)? Or strictly defer all to post-audit?
3. **`BootScene.ts` 1819 LOC.** Counts as a god-file but is mostly placeholder texture generators. Is a split (per-family files in a `boot/` subfolder) in scope for this audit, or strictly post-audit when real art lands?
4. **`@audit-readiness-check`'s active save-audit experiment.** Per the auto-memory entry, content removal during this window is forbidden. Phase 3 includes file MOVES, not catalog edits — confirm that MOVES of `state/persistence/*.ts` files are still safe (they should be, as long as the live IDs remain valid, but the round-trip audit is the canary).

## Next phase (do not start)

**Phase 2** — propose module boundaries grounded in this inventory. For each proposed module: name, purpose, files, public API, internals (forbidden imports), dependencies, owned data, allowed side effects. Plus a dependency diagram, a violations list (current code that crosses proposed boundaries), a migration order (leaves first, core last), and per-module risk assessment. Output: `docs/audit/02-target-architecture.md`.

---

# Per-zone artifacts (verbatim)

The following four sections are the unmodified zone artifacts that fed the synthesis above. Each was committed separately to its agent's worktree branch; they're concatenated here for the canonical record.


---

# Zone A — UI / app shell / React components (verbatim)

# Phase 1 — Zone A: UI / app shell / React components

Read-only inventory of every meaningful source file under `src/app/` and `src/components/` (including `galaxy/`, `loadout/`, `story/`, `hooks/`, `ui/` subfolders) plus their colocated `*.test.ts(x)` files. Excludes `src/game/`, `src/lib/`, `src/types/`, root configs.

48 source files + 4 test files = **52 files inventoried**.

## File-by-file inventory

| Path | Purpose (1 sentence) | Imports (count + sample) | Imported by (count + sample) | Side effects | Public API status |
|---|---|---|---|---|---|
| `src/app/layout.tsx` | Root App-Router layout: HTML shell, viewport+OG metadata, mounts `<Providers>` and `<MenuMusic />` once. | 4 imports — `next` (Metadata/Viewport), `./globals.css`, `./providers`, `@/components/MenuMusic`. | Next.js framework only (root layout). | Reads `process.env.NEXT_PUBLIC_SITE_URL`/`VERCEL_*`; `import "./globals.css"` injects global Tailwind. | Default export `RootLayout`; named exports `viewport`, `metadata`. |
| `src/app/page.tsx` | Force-static landing page composing 5 client islands inside a `<LandingShell>`. | 8 imports — `next/link`, `@/components/{LandingBackground,LandingShell,MuteToggle,PlayButton,SignInButton}`, `@/components/ui/buttonClasses`, `@/lib/routes`. | Next.js framework. | None at module scope; `export const dynamic = "force-static"`. | Default export `Home`; `dynamic` re-export. |
| `src/app/play/page.tsx` | Force-static `/play` shell that dynamically imports `GameCanvas` with `ssr:false`. | `next/dynamic`. | Next.js framework. | `nextDynamic(...)` evaluates at module load and triggers chunk-split for `@/components/GameCanvas`. | Default `PlayPage`; `dynamic` re-export. `"use client"`. |
| `src/app/shop/page.tsx` | Force-static `/shop` page wraps `LoadoutMenu mode="market"` + `ShopUI` under `StickyHeader`. | 5 imports — `@/components/{LoadoutMenu,ShopUI}`, `@/components/ui/{StickyHeader,ShopCreditsTicker}`, `@/lib/routes`. | Next.js framework. | None at module scope. | Default `ShopPage`; `dynamic` re-export. |
| `src/app/providers.tsx` | Wraps children in NextAuth's `SessionProvider`. | `next-auth/react`, `react` (type). | Imported by `layout.tsx` line 3. | Mounts the SessionProvider context (network call to `/api/auth/session` post-hydration). | Named `Providers`. `"use client"`. |
| `src/app/apple-icon.tsx` | Build-time static iOS touch-icon via `next/og` `ImageResponse` (potato silhouette). | `next/og`. | Next.js framework convention. | None at module scope; `export const dynamic = "force-static"`. | Default `AppleIcon`; `size`, `contentType`, `dynamic`. |
| `src/app/opengraph-image.tsx` | Build-time static OG card (1200×630). | `next/og`. | `twitter-image.tsx` re-exports it; Next.js scrapers consume the route. | None at module scope; `export const dynamic = "force-static"`. | Default `OpenGraphImage`; `alt`, `size`, `contentType`, `dynamic`. |
| `src/app/twitter-image.tsx` | Single-line re-export of OG image. | `./opengraph-image`. | Next.js framework. | None. | Re-exports default + `alt`/`size`/`contentType`. |
| `src/app/leaderboard/page.tsx` | ISR (`revalidate=60`) page rendering per-mission Leaderboard tables. | 6 imports — `@/game/data/missions`, `@/components/{Leaderboard,LeaderboardBriefing,TopPilots}`, `@/components/ui/StickyHeader`, `@/lib/routes`. | Next.js framework. | Module-load: `getCombatMissions()` reads JSON-backed accessor (synchronous; warm-data only). | Default `LeaderboardPage`; `revalidate`. |
| `src/app/leaderboard/error.tsx` | Segment error boundary for `/leaderboard` (red panel + Retry/Home). | `next/link`, `@/lib/routes`. | Next.js framework. | None. | Default `LeaderboardError`. `"use client"`. |
| `src/app/leaderboard/loading.tsx` | Streamed Suspense fallback that renders `<Splash steps={...}>`. | `@/components/Splash`. | Next.js framework. | None. | Default `LeaderboardLoading`. |
| `src/app/api/auth/[...nextauth]/route.ts` | Re-exports NextAuth v5 GET/POST handlers, pinned to Node runtime. | `@/lib/auth`. | Next.js framework. | None at module scope; runtime: cookies, OAuth callbacks. | `GET`, `POST`, `runtime`. |
| `src/app/api/auth/[...nextauth]/route.test.ts` | Pins re-export contract + Node runtime declaration. | `vitest`; mocks `@/lib/auth`. | Test runner. | `vi.mock` patches module graph. | Test only. |
| `src/app/api/handle/route.ts` | Edge-runtime `GET`/`POST` for player-handle CRUD with case-insensitive collision check + Postgres unique-violation translation. | 5 imports — `next/server`, `kysely`, `@/lib/auth`, `@/lib/db`, `@/lib/players`, `@/lib/schemas/handle`. | Client `fetch(ROUTES.api.handle, …)` in `HandlePrompt.tsx`. | DB SELECT/UPDATE on `spacepotatis.players`; logs `console.error`; enforces `runtime = "edge"`. | `GET`, `POST`, `runtime`. |
| `src/app/api/handle/route.test.ts` | Mocks `@/lib/{auth,db,players}` and asserts auth/Zod/conflict behavior. | `vitest`. | Test runner. | `vi.mock` for the 3 deps. | Test only. |
| `src/app/api/leaderboard/route.ts` | Edge-runtime `GET` (cached top-N) + `POST` (mission-completion-guarded score insert + `revalidateTag`). | 7 imports — `next/server`, `next/cache`, `@/lib/auth`, `@/lib/db`, `@/lib/leaderboard`, `@/lib/players`, `@/lib/schemas/save`, `@/types/game`. | Client `fetch` from the score queue (out of zone). | DB SELECT/INSERT; calls `revalidateTag(LEADERBOARD_CACHE_TAG)`; uses `runtime = "edge"`. **Has `as MissionId` cast at L27 — annotated as deliberate.** | `GET`, `POST`, `runtime`. |
| `src/app/api/leaderboard/route.test.ts` | Mocks auth/players/leaderboard/db/`next/cache`; asserts cache flush + 422 on uncompleted mission. | `vitest`. | Test runner. | `vi.mock` chain. | Test only. |
| `src/app/api/save/route.ts` | Edge-runtime `GET` (load) + `POST` (Zod-validated, regression-/playtime-/credits-guarded upsert with forensic `save_audit` log). | 8 imports — `next/server`, `kysely`, `@/lib/auth`, `@/lib/db`, `@/lib/players`, `@/lib/schemas/save`, `@/lib/saveValidation`, `@/types/game`. | Client `fetch` in `@/game/state/sync` (out of zone). | DB SELECT/UPSERT on `spacepotatis.save_games`; INSERT `save_audit` (best-effort); `console.error/warn`; `runtime = "edge"`. **Largest API route at 407 LOC.** | `GET`, `POST`, `runtime`. |
| `src/app/api/save/route.test.ts` | Walks every guard branch + audit insertion path. | `vitest`. | Test runner. | `vi.mock` for auth/db/players. | Test only. |
| `src/components/GameCanvas.tsx` | Top-level `/play` orchestrator: galaxy↔combat mode swap, fade overlay, save+score-queue triggers, story-trigger wiring, splash+overlay gating. | 30 imports — `next/navigation`, `next-auth/react`, 9× `@/game/{audio,phaser,state,data,three(dynamic)}`, 6× `@/components/{galaxy,story,hooks}`, `@/lib/{routes,useOptimisticAuth}`. | `src/app/play/page.tsx` via `next/dynamic`. | `useEffect` with `document.addEventListener("visibilitychange")` + `window.addEventListener("online")`; calls `combatMusic.{loadTrack,stop}` / `menuMusic.{duck,unduck}`; dynamic `import("@/game/three/TransitionManager")`; `requestAnimationFrame`; mutates `setSolarSystem` (game state). **452 LOC — flagged as god-file.** | Default `GameCanvas`. `"use client"`. |
| `src/components/HandlePrompt.tsx` | Modal that POSTs `/api/handle`; surfaces 409/500/network errors. | 2 imports — `@/lib/handle`, `@/lib/routes`. | `PlayButton.tsx`. | Network: `fetch(ROUTES.api.handle, {method:"POST"})`; `window.addEventListener("keydown")`; auto-focus on input. | Default `HandlePrompt`; `HandlePromptProps`. `"use client"`. |
| `src/components/LandingBackground.tsx` | Mounts a Three.js cinematic backdrop on the landing page; honors `prefers-reduced-motion`. | None at module scope; dynamic `import("@/game/three/LandingScene")`. | `src/app/page.tsx`. | `useEffect` reads `window.matchMedia`; constructs and disposes a `LandingScene`; WebGL canvas. | Default `LandingBackground`. `"use client"`. |
| `src/components/LandingShell.tsx` | Wraps landing children in a `SplashGate`; mounts `MenuBriefing` only after splash dismissal. | 4 imports — `@/components/{MenuBriefing,Splash,SplashGate}`, `@/lib/useOptimisticAuth`. | `src/app/page.tsx`. | None directly (delegates audio gating to MenuBriefing/MenuMusic). | Default `LandingShell`. `"use client"`. |
| `src/components/Leaderboard.tsx` | Server Component; renders per-mission top-N table via `getCachedLeaderboard`. | 2 imports — `@/types/game`, `@/lib/leaderboard`. | `src/app/leaderboard/page.tsx`. | `await getCachedLeaderboard(...)` (Neon DB through `unstable_cache`). | Default async `Leaderboard`. |
| `src/components/LeaderboardBriefing.tsx` | Mounts on `/leaderboard`; schedules a 5s lead-in voice cue, cancels on unmount. | `@/game/audio/leaderboardAudio`. | `src/app/leaderboard/page.tsx`. | `useEffect` plays/stops `leaderboardAudio`. | Default `LeaderboardBriefing`. `"use client"`. |
| `src/components/LoadoutMenu.tsx` | Composer for the shop loadout: SlotGrid + buy-slot + EQUIPPED/INVENTORY lists + augment inventory + 2 modal pickers. | 9 imports — `@/game/state/{GameState,ShipConfig,useGameState}`, `@/game/data/weapons`, 6× `@/components/loadout/*`. | `src/app/shop/page.tsx`. | Calls `buyWeaponSlot()` (state mutator). | Default `LoadoutMenu` (Props.mode is currently a no-op flag, line 29 `void _props;`). `"use client"`. |
| `src/components/MenuBriefing.tsx` | Mounted-once landing-page voice queue (PLAY/CONTINUE nudge → warning → surrender → system-briefing) with autoplay-rearm gesture listeners. | 2 imports — `@/game/audio/menuBriefingAudio`, `@/lib/useOptimisticAuth`. | `LandingShell.tsx`. | `useEffect` adds `pointerdown`/`keydown` window listeners; calls `menuBriefingAudio.playSequence/arm/stop`. | Default `MenuBriefing`. `"use client"`. |
| `src/components/MenuMusic.tsx` | Root-mounted galaxy bed track switcher tied to `currentSolarSystemId`; first-gesture init+arm. | 3 imports — `@/game/audio/music`, `@/game/state/useGameState`, `@/game/data/solarSystems`. | `src/app/layout.tsx` (mounted globally). | `useEffect` adds `pointerdown`/`keydown` window listeners; calls `menuMusic.{init,arm,ensurePlaying,loadTrack}`. | Default `MenuMusic`. `"use client"`. |
| `src/components/MuteToggle.tsx` | Session-only mute button driven by the AudioBus singleton. | `@/game/audio/AudioBus`. | `src/app/page.tsx` AND `src/components/galaxy/HudFrame.tsx`. | `audioBus.subscribe(...)` + `setMasterMuted` mutation. | Default `MuteToggle`. `"use client"`. |
| `src/components/PlayButton.tsx` | Auth-aware landing CTA; intercepts clicks before verification settles, opens `HandlePrompt` for first-handle flow. | 5 imports — `next/navigation`, `./HandlePrompt`, `./ui/buttonClasses`, `@/game/audio/menuBriefingAudio`, `@/lib/{routes,useOptimisticAuth}`. | `src/app/page.tsx`. | `router.push`; `menuBriefingAudio.stop()`. | Default `PlayButton`. `"use client"`. |
| `src/components/SaveLoadErrorOverlay.tsx` | z-60 overlay shown on `useCloudSaveSync` `load-failed`; offers Retry/Home/dismiss. | 2 imports — `next/link`, `@/lib/routes`, `@/game/state/sync` (type). | `GameCanvas.tsx`. | None directly (callers wire onRetry to `clearLoadSaveCache` + reload). | Default `SaveLoadErrorOverlay`; `SaveLoadErrorOverlayProps`. `"use client"`. |
| `src/components/ShopUI.tsx` | Three-section shop UI: hull/shield/reactor upgrades, weapon catalog (per-mission unlock gate), augment catalog. | 18 imports — `@/game/state/{GameState,sync,ShipConfig,useGameState}`, `@/game/data/{story,weapons,augments,missionWeaponRewards}`, `@/game/audio/{itemSfx,music,story}`, 4× `@/components/loadout/*`, `@/types/game`. | `src/app/shop/page.tsx`. | `useEffect` plays `storyAudio.play` + on-shop-open story trigger; ducks/unducks `menuMusic` + plays `shopMusic`; calls `markStorySeen` + `saveNow()`; mutators on every Buy button (`buyWeapon`, `buyAugment`, `buyShield/Armor/ReactorCapacity/ReactorRecharge`). **408 LOC — flagged as god-file.** | Default `ShopUI`. `"use client"`. |
| `src/components/SignInButton.tsx` | Landing sign-in/sign-out chip; on sign-out wipes 4 caches before NextAuth's redirect. | 6 imports — `next-auth/react`, `./ui/buttonClasses`, `@/lib/{authCache,useOptimisticAuth,useHandle}`, `@/game/state/{syncCache,saveQueue}`. | `src/app/page.tsx`. | Calls `clearAuthCache/clearHandleCache/clearLoadSaveCache/clearSaveQueue` then `signOut()`/`signIn("google")`. | Default `SignInButton`. `"use client"`. |
| `src/components/Splash.tsx` | Pure presentational boot splash with checklist. | None outside React. | `LandingShell`, `GameCanvas`, `src/app/leaderboard/loading.tsx`. | Inline `<style>` defines a CSS keyframe. | Default `Splash`; `SplashStep`. `"use client"`. |
| `src/components/SplashGate.tsx` | 600ms-min-display + 400ms-fade splash gate; `failed=true` short-circuits both timers. | `./splashGateLogic`. | `LandingShell`, `GameCanvas`. | `setTimeout`s; calls `onDismiss?.()` once when fully unmounted. | Default `SplashGate`. `"use client"`. |
| `src/components/splashGateLogic.ts` | Pure decision functions: `shouldHideSplash` + `shouldUnmountImmediately`. | None. | `SplashGate.tsx`, `SplashGate.test.ts`. | None. | Named exports. |
| `src/components/SplashGate.test.ts` | Pins both decision helpers (incl. PR #101 regression guard). | `vitest`, `./splashGateLogic`. | Test runner. | None. | Test only. |
| `src/components/TopPilots.tsx` | Server Component; renders composite top-pilots table via `getCachedTopPilots`. | `@/lib/leaderboard`. | `src/app/leaderboard/page.tsx`. | `await getCachedTopPilots(...)` (Neon DB through `unstable_cache`). | Default async `TopPilots`. |
| `src/components/UserMenu.tsx` | In-galaxy account dropdown (Story log button); intentionally has no sign-out. | 2 imports — `next-auth/react`, `@/lib/useOptimisticAuth`. | `galaxy/HudFrame.tsx`. | `useEffect`s: `document.addEventListener("mousedown")` + `window.addEventListener("keydown")` while open. | Default `UserMenu`. `"use client"`. |
| `src/components/WeaponStats.tsx` | Two-column DPS/energy/spread/blast/slow stat grid; folds in mark + augments. | `@/game/state/ShipConfig`, `@/game/data/augments`, `@/types/game`. | `loadout/WeaponDetailsModal.tsx`. | None. | Named `WeaponStats`. |
| `src/components/galaxy/HudFrame.tsx` | Top-left stats / center title / bottom hint / top-right MuteToggle+UserMenu chrome over the 3D canvas. | 5 imports — `@/types/game`, `@/components/{MuteToggle,UserMenu}`, `@/game/state/useGameState`, `@/game/data/solarSystems`. | `GameCanvas.tsx`. | None. | Default `HudFrame`. `"use client"`. |
| `src/components/galaxy/QuestPanel.tsx` | Suggested/Available/Locked/Cleared/Shop bucketing UI tied to `currentSolarSystemId`; auto-expands suggestion. | 6 imports — `@/types/game`, `@/game/data/{missions,solarSystems}`, `@/game/state/useGameState`, `./questBuckets`. | `GameCanvas.tsx`. | None directly; calls back via props. **387 LOC — flagged as borderline god-file.** | Default `QuestPanel`. `"use client"`. |
| `src/components/galaxy/VictoryModal.tsx` | Mission-result modal with reward + 8-state sync banner (`VictorySyncStatus`); plays a category-matched sfx on first-clear. | 3 imports — `@/game/phaser/config` (type), `@/game/audio/itemSfx`, `@/game/state/rewards`. | `GameCanvas.tsx`. | `useEffect`s: `window.addEventListener("keydown")`; calls `itemSfx.{weapon,augment,upgrade,money}` once. | Default `VictoryModal`; `VictorySyncStatus`. `"use client"`. |
| `src/components/galaxy/WarpPicker.tsx` | Modal lister of unlocked solar systems with the current one disabled. | `@/types/game`, `@/game/data/solarSystems`, `../ui/buttonClasses`. | `GameCanvas.tsx`. | None. | Default `WarpPicker`. `"use client"`. |
| `src/components/galaxy/questBuckets.ts` | Pure bucketing helper for QuestPanel. | `@/types/game`. | `QuestPanel.tsx`, `QuestPanel.test.ts`. | None. | Named `bucketMissions`, `QuestBuckets`. |
| `src/components/galaxy/QuestPanel.test.ts` | Pins bucketing contract; smoke-tests against real `missions.json`. | `vitest`, `./questBuckets`, `@/game/data/missions`, `@/types/game`. | Test runner. | Module load reads JSON. | Test only. |
| `src/components/hooks/useCloudSaveSync.ts` | React hook that drives splash + overlay state through `loadSave` + cache + auth. | 4 imports — `@/game/state/{sync,syncCache}`, `@/lib/useReliableSession`, `./useCloudSaveSyncLogic`. | `GameCanvas.tsx`. | `useEffect` calls `setCurrentPlayerEmail()` (cross-zone state mutation) + `loadSave()` (network). | Named `useCloudSaveSync`. `"use client"`. |
| `src/components/hooks/useCloudSaveSyncLogic.ts` | Pure helpers: `loadResultToState`, `cachedResultToState`, `decideFetch`. | `@/game/state/sync` (types only). | `useCloudSaveSync.ts`, `useCloudSaveSyncLogic.test.ts`. | None. | Named exports + types. |
| `src/components/hooks/useCloudSaveSyncLogic.test.ts` | Locks load-failure mapping behavior (PR #101 follow-up). | `vitest`, `./useCloudSaveSyncLogic`, `@/game/state/sync` (type). | Test runner. | None. | Test only. |
| `src/components/hooks/useGalaxyScene.ts` | Hook owning the Three.js GalaxyScene lifecycle and statusMap diffing. | 3 imports — `@/types/game`, `@/game/data/missions`, `@/game/three/GalaxyScene` (type only; runtime `await import`). | `GameCanvas.tsx`. | Mutates `canvas.style.touchAction`; dynamic `await import("@/game/three/GalaxyScene")`; constructs/disposes a GalaxyScene; calls `scene.applyStatuses` on updates. | Named `useGalaxyScene`. `"use client"`. |
| `src/components/hooks/usePhaserGame.ts` | Hook that mounts `Phaser.Game` into the ref'd div via dynamic `createPhaserGame`. | `@/game/phaser/config` (type), `@/types/game`. | `GameCanvas.tsx`. | Dynamic `await import("@/game/phaser/config")`; instantiates+destroys a Phaser.Game. | Named `usePhaserGame`. `"use client"`. |
| `src/components/hooks/useStoryTriggers.ts` | Hook orchestrating 4 story-trigger kinds (`first-time`, `on-system-enter`, `on-mission-select`, `on-system-cleared-idle`/`on-all-cleared-idle`). | 6 imports — `@/types/game`, `@/game/data/{story,storyTriggers}`, `@/game/audio/{story,storyLogAudio}`, `@/game/state/{GameState,sync}`. | `GameCanvas.tsx`. | `setTimeout`/`setInterval`; calls `storyAudio.{play,stop}`, `storyLogAudio.{play,stop}`, `markStorySeen()`, `saveNow()`. **281 LOC — borderline; one concern (story triggers) but high effect density.** | Named `useStoryTriggers` + types. `"use client"`. |
| `src/components/loadout/AugmentDetailsModal.tsx` | Per-augment voiceover modal; convention `/audio/augments/{id}-voice.mp3`. | 4 imports — `@/game/audio/story`, `@/game/data/augments`, `../ui/buttonClasses`, `./dots`. | `ShopUI.tsx`. | `useEffect`s: plays/stops `storyAudio`; `window.addEventListener("keydown")`. | Named `AugmentDetailsModal`. `"use client"`. |
| `src/components/loadout/AugmentInventoryList.tsx` | Static list of free augments waiting to install. | `@/game/data/augments`, `@/types/game`, `./dots`. | `LoadoutMenu.tsx`. | None. | Named `AugmentInventoryList`. |
| `src/components/loadout/AugmentPicker.tsx` | Modal listing augments eligible to install on a weapon instance. | 4 imports — `@/game/data/augments`, `@/game/state/ShipConfig`, `@/types/game`, `./dots`. | `LoadoutMenu.tsx`. | None directly. | Named `AugmentPicker`. |
| `src/components/loadout/SlotGrid.tsx` | Grid of weapon slot buttons + helper `slotLabel`. | `@/game/data/weapons`, `@/game/state/ShipConfig`, `./dots`. | `LoadoutMenu.tsx`, `selectors.ts`, `SlotPicker.tsx`. | None. | Named `SlotGrid`, `slotLabel`. |
| `src/components/loadout/SlotPicker.tsx` | Modal that picks a weapon instance for an empty slot or unequips current. | 4 imports — `@/game/state/ShipConfig`, `./SlotGrid` (label), `./dots`, `./selectors`. | `LoadoutMenu.tsx`. | None directly. | Named `SlotPicker`. |
| `src/components/loadout/WeaponCard.tsx` | Compact loadout/inventory row with DPS, augments badge, install/upgrade/sell. | 7 imports — `@/game/state/{GameState,ShipConfig}`, `@/game/data/augments`, `@/types/game`, `./dots`, `./WeaponDetailsModal`. | `WeaponList.tsx`. | Calls `buyWeaponUpgrade` / `sellWeapon` mutators on click. **210 LOC.** | Named `WeaponCard`. |
| `src/components/loadout/WeaponDetailsModal.tsx` | Spec-sheet modal; plays `/audio/weapons/{id}-voice.mp3` on open. | 6 imports — `@/game/audio/story`, `@/game/data/augments`, `@/types/game`, `@/components/WeaponStats`, `../ui/buttonClasses`, `./dots`. | `WeaponCard.tsx`, `ShopUI.tsx`. | `useEffect`s: `storyAudio.play/stop`; `window.addEventListener("keydown")`. | Named `WeaponDetailsModal`. `"use client"`. |
| `src/components/loadout/WeaponList.tsx` | Renders heading + a `<WeaponCard>` per `WeaponEntry`. | `@/game/state/ShipConfig`, `./WeaponCard`, `./selectors`. | `LoadoutMenu.tsx`. | None directly. | Named `WeaponList`. |
| `src/components/loadout/dots.tsx` | Two tiny presentational dots (`WeaponDot`, `AugmentDot`) used as color tags. | None. | 7 callers across `loadout/` + `ShopUI.tsx`. | None. | Named exports. |
| `src/components/loadout/selectors.ts` | Pure helpers: `getEquippedEntries` / `getInventoryEntries` returning `WeaponEntry` rows. | `@/game/state/ShipConfig`, `@/types/game`, `@/game/data/weapons`, `./SlotGrid` (label). | `LoadoutMenu.tsx`, `SlotPicker.tsx`, `WeaponList.tsx`. | None. | Named exports + types. |
| `src/components/loadout/useLoadoutSelection.ts` | Tiny hook holding `picker` + `augPickerPos` selection state and bound mutators. | `@/game/state/GameState`, `@/game/state/ShipConfig`, `@/types/game`. | `LoadoutMenu.tsx`. | Calls `equipWeapon` / `installAugment` mutators when picker resolves. | Named `useLoadoutSelection`. |
| `src/components/story/StoryListModal.tsx` | Lists every story entry the player has unlocked + replay button. | `@/game/data/story`, `../ui/buttonClasses`. | `GameCanvas.tsx`. | `useEffect` adds `keydown` window listener for ESC. | Default `StoryListModal`. `"use client"`. |
| `src/components/story/StoryModal.tsx` | Cinematic popup; ducks `menuMusic` in `first-time` mode, plays voice on top in `replay-from-log`. | 4 imports — `@/game/data/story` (type), `@/game/audio/{story,music}`, `../ui/buttonClasses`. | `GameCanvas.tsx`. | `useEffect`s: `storyAudio.play/stop`, conditional `menuMusic.duck/unduck`, `window.addEventListener("keydown")`. | Default `StoryModal`. `"use client"`. |
| `src/components/ui/ShopCreditsTicker.tsx` | Live credit balance subscriber for the sticky shop header. | `@/game/state/useGameState`. | `src/app/shop/page.tsx`. | None directly. | Default `ShopCreditsTicker`. `"use client"`. |
| `src/components/ui/StickyHeader.tsx` | Shared sticky page header (back button + title + optional right slot). | `next/link`, `./buttonClasses`. | `src/app/shop/page.tsx`, `src/app/leaderboard/page.tsx`. | None. | Default `StickyHeader`; `StickyHeaderProps`. |
| `src/components/ui/buttonClasses.ts` | Three shared Tailwind class strings: `BUTTON_PRIMARY`, `BUTTON_NAV`, `BUTTON_BACK`. | None. | 6 callers (page+modals). | None. | Named exports. |

## Zone-level observations

### Coupling clusters

1. **GameCanvas mega-cluster.** `src/components/GameCanvas.tsx` (452 LOC) is the single hub for the in-game `/play` experience. It composes 11 components from 4 sub-folders (`galaxy/`, `story/`, `hooks/`, `loadout/` indirectly) AND reaches across 9 distinct `@/game/{audio,phaser,state,data,three}` modules AND 2 `@/lib` modules AND `next-auth/react`. Every other UI file in the zone funnels into it directly or transitively. (`GameCanvas.tsx:6-32` for the import list.)
2. **Loadout cluster.** `src/components/loadout/` files form a tightly-knit graph: `selectors.ts` ↔ `SlotGrid.tsx` (label dependency); `WeaponList → WeaponCard → WeaponDetailsModal → WeaponStats`; `SlotPicker`/`AugmentPicker`/`AugmentInventoryList` all depend on `dots.tsx`. Entry points are `LoadoutMenu.tsx` (shop loadout) and `ShopUI.tsx` (modals + dots reuse). `WeaponDetailsModal` reaches up to `@/components/WeaponStats` (`loadout/WeaponDetailsModal.tsx:7`) — the only "child reaches into parent" link inside the zone.
3. **Auth UX cluster.** `useOptimisticAuth` (out of zone) is consumed by `LandingShell.tsx`, `MenuBriefing.tsx`, `PlayButton.tsx`, `SignInButton.tsx`, `UserMenu.tsx`, `GameCanvas.tsx` — six callers. `useReliableSession` is consumed only by `useCloudSaveSync.ts`. The `firstVisit` + `isVerified` pair is wired into the splash + briefing gate logic on the landing page (`LandingShell.tsx:14`, `PlayButton.tsx:26`, `MenuBriefing.tsx:13`).
4. **Splash + overlay duo.** `Splash.tsx` is reused by both `LandingShell.tsx` and `GameCanvas.tsx`, AND by `src/app/leaderboard/loading.tsx`. `SplashGate.tsx` only by the two client orchestrators. `SaveLoadErrorOverlay` only by `GameCanvas.tsx`.
5. **Audio side-effect spray.** Eleven of the 48 source files import `@/game/audio/*`. Multiple components each call `storyAudio.play/stop` directly: `ShopUI`, `StoryModal`, `WeaponDetailsModal`, `AugmentDetailsModal`, `useStoryTriggers`. The single shared `storyAudio` instance has five UI owners; the audit comment in `useStoryTriggers.ts:25-29` already documents the lifecycle hazard this creates.

### Cross-zone couplings (`src/game/...`, `src/lib/...`, `src/types/...`)

The UI zone reaches out to **12 distinct `@/game/*` modules**, **9 distinct `@/lib/*` modules**, and `@/types/game`. Tally below counts each cross-zone target by number of zone-A files that import it.

`@/game/state/*` (the most touched cluster):
- `@/game/state/GameState` — 6 importers (`ShopUI`, `LoadoutMenu`, `WeaponCard`, `useLoadoutSelection`, `useStoryTriggers`, `GameCanvas`).
- `@/game/state/ShipConfig` — 8 importers (`ShopUI`, `LoadoutMenu`, `WeaponCard`, `WeaponList`, `selectors`, `SlotGrid`, `SlotPicker`, `AugmentPicker`, `WeaponStats`, `useLoadoutSelection`).
- `@/game/state/useGameState` — 5 importers (`ShopUI`, `LoadoutMenu`, `MenuMusic`, `HudFrame`, `QuestPanel`, `ShopCreditsTicker`, `GameCanvas`).
- `@/game/state/sync` — 5 importers (`ShopUI`, `useStoryTriggers`, `useCloudSaveSync`, `useCloudSaveSyncLogic`, `SaveLoadErrorOverlay`, `GameCanvas`) — `loadSave`, `saveNow`, `LoadResult`, `LoadFailureReason`, `flushSaveQueue`, `drainScoreQueue`.
- `@/game/state/syncCache` — 3 importers (`useCloudSaveSync`, `SignInButton`, `GameCanvas`).
- `@/game/state/saveQueue` — 1 importer (`SignInButton`).
- `@/game/state/scoreQueue` — 1 importer (`GameCanvas`).
- `@/game/state/rewards` — 1 importer (`VictoryModal`).

`@/game/data/*`:
- `solarSystems` — `MenuMusic`, `HudFrame`, `QuestPanel`, `WarpPicker`, `GameCanvas`.
- `missions` — `useGalaxyScene`, `QuestPanel`, `QuestPanel.test`, `GameCanvas`, `src/app/leaderboard/page.tsx`.
- `weapons` — `LoadoutMenu`, `ShopUI`, `SlotGrid`, `selectors`.
- `augments` — `ShopUI`, `WeaponCard`, `WeaponDetailsModal`, `WeaponStats`, `AugmentPicker`, `AugmentInventoryList`, `AugmentDetailsModal`.
- `story` — `ShopUI`, `useStoryTriggers`, `StoryListModal`, `StoryModal`, `GameCanvas`.
- `storyTriggers` — `useStoryTriggers`.
- `missionWeaponRewards` — `ShopUI`.

`@/game/audio/*`:
- `music` — `ShopUI`, `StoryModal`, `MenuMusic`, `GameCanvas`.
- `story` — `ShopUI`, `useStoryTriggers`, `StoryModal`, `WeaponDetailsModal`, `AugmentDetailsModal`.
- `storyLogAudio` — `useStoryTriggers`.
- `menuBriefingAudio` — `MenuBriefing`, `PlayButton`.
- `leaderboardAudio` — `LeaderboardBriefing`.
- `itemSfx` — `ShopUI`, `VictoryModal`.
- `AudioBus` — `MuteToggle`.

`@/game/phaser/*`: only the **type** `CombatSummary` from `phaser/config` (in `GameCanvas.tsx`, `usePhaserGame.ts`, `VictoryModal.tsx`) plus a runtime dynamic `import("@/game/phaser/config")` inside `usePhaserGame.ts` for `createPhaserGame`. Compliant with `ssr:false` rule.

`@/game/three/*`: type-only imports of `GalaxyScene`, `MissionStatus`, `MissionStatusMap` in `useGalaxyScene.ts`; dynamic `await import("@/game/three/GalaxyScene")` and `await import("@/game/three/TransitionManager")` in `useGalaxyScene.ts` and `GameCanvas.tsx`; dynamic `import("@/game/three/LandingScene")` in `LandingBackground.tsx`. Compliant with `ssr:false` rule.

`@/lib/*`:
- `routes` — 6 importers (`HandlePrompt`, `PlayButton`, `SaveLoadErrorOverlay`, `GameCanvas`, `src/app/page.tsx`, `src/app/shop/page.tsx`, `src/app/leaderboard/page.tsx`, `src/app/leaderboard/error.tsx`).
- `useOptimisticAuth` — 6 importers (`LandingShell`, `MenuBriefing`, `PlayButton`, `SignInButton`, `UserMenu`, `GameCanvas`).
- `useHandle` — 1 importer (`SignInButton` — for `clearHandleCache`).
- `authCache` — 1 importer (`SignInButton`).
- `useReliableSession` — 1 importer (`useCloudSaveSync`).
- `handle` — 1 importer (`HandlePrompt` — for `validateHandle`/`HANDLE_MIN_LENGTH`).
- `leaderboard` — 2 importers (`Leaderboard`, `TopPilots`).
- `auth` — 4 importers (all 4 API routes).
- `db` — 3 importers (`save/route`, `handle/route`, `leaderboard/route`).
- `players` — 3 importers (same 3 routes).
- `schemas/save` — 2 importers (`save/route`, `leaderboard/route`).
- `schemas/handle` — 1 importer (`handle/route`).
- `saveValidation` — 1 importer (`save/route`).

`@/types/game` — 11 importers: `Leaderboard`, `WeaponStats`, `ShopUI`, `GameCanvas`, all 4 of `galaxy/*`, `loadout/{selectors,WeaponDetailsModal,WeaponCard,AugmentInventoryList,AugmentPicker,SlotPicker(transit), useLoadoutSelection}`, hooks (`useGalaxyScene`, `usePhaserGame`, `useStoryTriggers`), 2 API routes (`save/route`, `leaderboard/route`).

### God-files (>300 LOC AND many responsibilities)

| File | LOC | Responsibilities found |
|---|---|---|
| `src/components/GameCanvas.tsx` | 452 | mode state machine (galaxy/combat) · fade overlay · save+score-queue triggers (mount, visibility, online) · auto-warp logic · planet click→QuestPanel selection bridge · victory sync-status state machine · story-trigger lifecycle wiring · save-load error overlay gating · combat music duck/unduck contract · optimistic auth gating of mission-complete I/O · mid-flight `missionSeqRef` race guard. Imports 30 modules. **Consolidation point — every cross-zone touchpoint funnels here.** |
| `src/components/ShopUI.tsx` | 408 | hull/shield section · reactor section · weapon catalog (per-mission unlock gate) · augment catalog · "owned counters" · on-shop-open story trigger + `markStorySeen` + `saveNow()` · per-shop music duck cycle · 6 distinct mutators wired via inline handlers · 2 nested helper components (`Row`, `TierBadge`). |
| `src/app/api/save/route.ts` | 407 | GET save · audit-row writer · POST validation funnel (Zod → mission graph → regression → playtime → credits caps → upsert) · 5 distinct error-code branches · SQL upsert with `ON CONFLICT` clause · best-effort audit on every code path including 400/422/500. Probably acceptable per-route but has the most distinct branches in the zone. |
| `src/components/galaxy/QuestPanel.tsx` | 387 | bucketing consumption · suggested+available+locked+cleared+shop sections (5 sub-section types) · 4 sub-components (`Section`, `SuggestedRow`, `CollapsibleRow`, `ShopRow`, `SystemClearCta`) · 2 useEffect hooks for expansion control · "all-systems-cleared" CTA logic. **Borderline god-file** — clear single concern but multiple sub-components. |

`useStoryTriggers.ts` (281 LOC) is just under the limit but bears mention: it owns 4 distinct trigger surfaces with 4 separate effects, several refs, and 2 distinct cleanup contracts (per-effect storyAudio.stop guarding via `weStartedAudio` flag). Single concern, but high cognitive density.

`WeaponCard.tsx` (210 LOC) is borderline — it carries a tier badge sub-component, an augment summary sub-component, AND mixes presentation with two state mutators (`buyWeaponUpgrade`, `sellWeapon`).

### Suspected accidental coupling

1. **`SlotGrid.tsx` exports both `SlotGrid` AND `slotLabel`.** `slotLabel` is a pure string helper used by `selectors.ts:4`, `SlotPicker.tsx:2`, and `SlotGrid.tsx` itself. Importing `selectors.ts` therefore drags `SlotGrid.tsx` (and its `getWeapon` data dependency) into modules that only want labels. Should live in `slotLabel.ts` (or `selectors.ts`).
2. **`MuteToggle.tsx` is mounted in three places at once.** `src/app/page.tsx:21` (landing), `galaxy/HudFrame.tsx:87` (in-game HUD), and an implicit second instance via the same `<MuteToggle>` rendered inside `LandingShell` only when not on the home page. Each subscribes to the bus separately; harmless but a redundancy worth noting.
3. **`getStoryEntry` in GameCanvas is a duplicate concern.** `GameCanvas.tsx:27,410` looks up the entry to pass to `<StoryModal>`. `StoryModal` already accepts a `StoryEntry` so this works, but the lookup might more naturally live in `useStoryTriggers` next to `setActiveStory`.
4. **`shop` page is force-static yet `LoadoutMenu` requires GameState that exists only post-hydration.** `src/app/shop/page.tsx` exports `force-static` (good for Vercel budget) and renders a client tree underneath. The client tree (`LoadoutMenu`, `ShopUI`) reads `useGameState`, which is a singleton bound at hydration. This works but is fragile — any future server component sneaking onto the page would see INITIAL_STATE and crash a credits read. Not a current bug, just brittle.
5. **`api/leaderboard/route.ts:27` has an `as MissionId` cast at the network edge.** Documented as deliberate (legacy mission ids), but it directly contradicts the §5 rule "No `as` casts at the network edge" in CLAUDE.md. Either the rule needs a documented exception here or the route should look up `mission_id` from a server-side enum.
6. **`src/components/WeaponStats.tsx` lives outside `loadout/` despite being used only by `loadout/WeaponDetailsModal.tsx`.** No other importer. Easy move that would tighten the loadout cluster.
7. **`src/components/Splash.tsx` is consumed across three zones.** Used by `LandingShell` (landing page), `GameCanvas` (game), and `src/app/leaderboard/loading.tsx` (leaderboard segment). All four references look identical (`<Splash steps={...} />`) — a proper `ui/Splash.tsx` location would mirror `ui/StickyHeader` placement.
8. **`questBuckets.ts` lives at `galaxy/` but is purely data-shape logic** — no React, no JSX. It's a small file (41 LOC) and tightly coupled to QuestPanel, so likely fine here, but if a non-galaxy mission summary surface ever emerges it would migrate to `@/game/data/`.
9. **`src/app/twitter-image.tsx` is a 1-line re-export of `opengraph-image.tsx`.** Necessary for Next.js convention but easy to miss when changing the OG card; leave a code comment in `opengraph-image.tsx` warning that twitter inherits it. (None today.)

### Cycles inside the zone

No import cycles found.

The closest thing to a cycle is the loadout sub-graph:

```
loadout/selectors.ts → loadout/SlotGrid.tsx (for slotLabel)
loadout/SlotGrid.tsx → loadout/dots.tsx
loadout/SlotPicker.tsx → loadout/SlotGrid.tsx (for slotLabel)
loadout/SlotPicker.tsx → loadout/selectors.ts (for InventoryEntry)
loadout/WeaponCard.tsx → loadout/WeaponDetailsModal.tsx
loadout/WeaponDetailsModal.tsx → @/components/WeaponStats   (parent reach — not a cycle, but unusual direction)
```

`WeaponDetailsModal` reaching back up to `@/components/WeaponStats.tsx` is the only "child reaches up" edge — see "Suspected accidental coupling" #6.

Tests don't introduce cycles either:
- `splashGateLogic.ts` ↔ `SplashGate.test.ts` (test → impl).
- `questBuckets.ts` ↔ `QuestPanel.test.ts` (test → impl).
- `useCloudSaveSyncLogic.ts` ↔ `useCloudSaveSyncLogic.test.ts` (test → impl).

### Side effects (DOM, localStorage, network, audio, GSAP, Phaser/Three init, NextAuth, etc.)

Counted by category, with the originating file path:

#### Window / document listeners (DOM globals)

- `src/components/HandlePrompt.tsx:31` — `window.addEventListener("keydown")` (Escape to cancel).
- `src/components/MenuBriefing.tsx:41-42` — `window.addEventListener("pointerdown", "keydown")` (autoplay gesture rearm).
- `src/components/MenuMusic.tsx:32-33` — `window.addEventListener("pointerdown", "keydown")` (music gesture init).
- `src/components/UserMenu.tsx:41-42` — `document.addEventListener("mousedown")` + `window.addEventListener("keydown")` (close-on-outside).
- `src/components/galaxy/VictoryModal.tsx:79` — `window.addEventListener("keydown")` (Space/Enter to dismiss).
- `src/components/loadout/AugmentDetailsModal.tsx:39` — `window.addEventListener("keydown")` (ESC/Enter close).
- `src/components/loadout/WeaponDetailsModal.tsx:48` — `window.addEventListener("keydown")` (ESC/Enter close).
- `src/components/story/StoryListModal.tsx:23` — `window.addEventListener("keydown")` (ESC close).
- `src/components/story/StoryModal.tsx:73` — `window.addEventListener("keydown")` (ESC/Enter close).
- `src/components/GameCanvas.tsx:318-323` — `document.addEventListener("visibilitychange")` + `window.addEventListener("online")` (save+score queue drain triggers).
- `src/components/LandingBackground.tsx:19` — `window.matchMedia("(prefers-reduced-motion: reduce)")`.

#### Direct DOM mutation

- `src/components/hooks/useGalaxyScene.ts:76` — `canvas.style.touchAction = "none"`.
- `src/components/GameCanvas.tsx:103` — `window.location.reload()` (retry after load failure).

#### localStorage / session storage

- **None directly in zone A.** All localStorage I/O is delegated to `@/game/state/{syncCache, saveQueue, scoreQueue}` and `@/lib/{authCache, useHandle}` — out-of-zone modules. The `MuteToggle.tsx` header (line 12-18) explicitly calls out "do NOT persist to localStorage."

#### Network (fetch / DB / NextAuth)

- `src/components/HandlePrompt.tsx:51` — `fetch(ROUTES.api.handle, {method:"POST"})`.
- `src/components/SignInButton.tsx:35,72` — `signOut()` / `signIn("google")` from `next-auth/react`.
- `src/components/UserMenu.tsx:63` — `signIn("google")`.
- `src/components/hooks/useCloudSaveSync.ts:83` — `loadSave()` (delegates to `@/game/state/sync`, which fetches `/api/save` GET).
- `src/components/Leaderboard.tsx:18` — `await getCachedLeaderboard(...)` (Server Component, runs at ISR / build).
- `src/components/TopPilots.tsx:9` — `await getCachedTopPilots(...)` (Server Component).
- `src/app/leaderboard/page.tsx:13` — module-load `getCombatMissions()` (synchronous data accessor).
- All four API routes — Neon DB SELECT/INSERT/UPDATE through Kysely.

#### Audio engines

Module-load: none — the engines are lazy singletons.

`useEffect` audio I/O calls:

- `MenuMusic.tsx:28-31, 41` — `menuMusic.{init, arm, ensurePlaying, loadTrack}`.
- `MenuBriefing.tsx:32, 40, 47` — `menuBriefingAudio.{playSequence, arm, stop}`.
- `LeaderboardBriefing.tsx:13-15` — `leaderboardAudio.{play, stop}`.
- `MuteToggle.tsx:23, 27` — `audioBus.{subscribe, setMasterMuted}`.
- `PlayButton.tsx:38` — `menuBriefingAudio.stop()`.
- `ShopUI.tsx:87, 97, 106-110` — `storyAudio.{play, stop}`, `menuMusic.{duck, unduck}`, `shopMusic.{loadTrack, stop}`.
- `StoryModal.tsx:43-52, 58-65` — `storyAudio.{play, stop}`, `menuMusic.{duck, unduck}` (first-time only).
- `WeaponDetailsModal.tsx:34-42`, `AugmentDetailsModal.tsx:26-34` — `storyAudio.{play, stop}`.
- `VictoryModal.tsx:55-69` — `itemSfx.{weapon, augment, upgrade, money}`.
- `GameCanvas.tsx:131-143, 186-187, 227, 287` — `combatMusic.{loadTrack, stop}`, `menuMusic.{duck, unduck}`.
- `useStoryTriggers.ts:128-132, 155-158, 184, 229-233, 260` — `storyAudio.{play, stop}`, `storyLogAudio.{play, stop}`.

#### Three.js init

- `LandingBackground.tsx:28-37` — dynamic `import("@/game/three/LandingScene")` then `new LandingScene().start()`.
- `useGalaxyScene.ts:82-99` — dynamic `import("@/game/three/GalaxyScene")` then `new GalaxyScene(canvas, ...)`.
- `GameCanvas.tsx:166` — dynamic `import("@/game/three/TransitionManager")` for `fade(...)`.

#### Phaser init

- `usePhaserGame.ts:33-39` — dynamic `import("@/game/phaser/config")` then `await createPhaserGame(...)`.

#### GSAP

- **Zero direct GSAP usage in this zone.** `GameCanvas.tsx:166-168` does fade transitions through `@/game/three/TransitionManager` (out of zone), which is where any GSAP would live.

#### Cache / cookies / NextAuth

- `src/app/api/leaderboard/route.ts:99` — `revalidateTag(LEADERBOARD_CACHE_TAG)` after a successful score insert.
- `src/app/providers.tsx:10` — `<SessionProvider>` triggers `/api/auth/session` after hydration.
- `src/app/api/auth/[...nextauth]/route.ts:6` — re-exports `handlers` (cookie-based JWT session).

#### State mutators (called by UI handlers; mutators live in `@/game/state/*`, side effects flow through that singleton)

- `LoadoutMenu.tsx:69` — `buyWeaponSlot()`.
- `useLoadoutSelection.ts:18, 25` — `equipWeapon`, `installAugment`.
- `WeaponCard.tsx:132, 141` — `buyWeaponUpgrade`, `sellWeapon`.
- `ShopUI.tsx:13, 124, 130, 134, 138, 262, 324` — `buyArmorUpgrade`, `buyAugment`, `buyReactorCapacityUpgrade`, `buyReactorRechargeUpgrade`, `buyShieldUpgrade`, `buyWeapon`, `markStorySeen`.
- `GameCanvas.tsx:72` — `setSolarSystem`.
- `useStoryTriggers.ts:16` — `markStorySeen`, plus `saveNow()` calls after.

#### Module-load / SSR-time evaluation

- `src/app/leaderboard/page.tsx:13` — `const COMBAT_MISSIONS = getCombatMissions();` (at module load on every render, but `getCombatMissions` is a JSON-backed accessor with one `as` cast and zero runtime parsing).
- `src/app/apple-icon.tsx`, `src/app/opengraph-image.tsx` — bake at build time only (`force-static`).

No file in this zone reads `process.env.*` outside of `src/app/layout.tsx:10-15` (the canonical site URL) and the API routes (which read DB env vars indirectly via `getDb()`).


---

# Zone B — Phaser combat layer (verbatim)

# Phase 1 — Zone B: Phaser combat layer

Scope: every file under `src/game/phaser/` (scenes, entities, systems, the `events.ts` / `registry.ts` / `config.ts` wiring, the `__tests__/fakeScene.ts` harness, and every `*.test.ts`). Twenty-eight production source files plus thirteen tests = 28 + 13 inventoried below; LOC totals 4,956 (production+tests under root) + 1,690 (combat helpers + player helpers) = 6,646 LOC across the zone.

## File-by-file inventory

| Path | Purpose (1 sentence) | Imports (count + sample) | Imported by (count + sample) | Side effects | Public API status |
|---|---|---|---|---|---|
| `src/game/phaser/config.ts` (87 LOC) | Owns `VIRTUAL_WIDTH/HEIGHT`, `OBSTACLE_DEPTH`, `SCENE_KEYS`, `BootData` / `CombatSummary` types, and the `createPhaserGame` async factory that wires Boot/Combat/Pause scenes and seeds the registry. | 5 (`@/types/game`, `@/game/state/rewards`, `./registry`, dynamic `phaser`, dynamic `./scenes/*`) | Multiple inside zone (CombatScene, PauseScene, BootScene, BossScene, CombatHud, CombatVfx, WaveManager, Obstacle) + 3 outside (`src/components/GameCanvas.tsx:6`, `src/components/galaxy/VictoryModal.tsx:4`, `src/components/hooks/usePhaserGame.ts:4,33`). | Side effect on call: `new Phaser.Game(...)` boots WebGL/Canvas + Arcade physics, calls `game.scene.start(...)`, writes `bootData`/`summary` into the Phaser registry via `setBootData`. | Public — `createPhaserGame` and `CombatSummary` are the cross-zone seam to React. |
| `src/game/phaser/events.ts` (23 LOC) | Typed combat-scene event bus. Defines `CombatEvent` discriminated union (`playerDied` / `allWavesComplete` / `abandon`) plus `emit(scene, event)` and `on(scene, type, handler)` wrappers around `scene.events`. | 1 (`phaser` type-only) | 4 (`scenes/CombatScene.ts:11`, `scenes/PauseScene.ts:3`, `systems/WaveManager.ts:12`, `entities/player/PlayerCombatant.ts:9`). | None at module scope. Calling `emit` mutates `scene.events`. | Public, internal. The mandated wrapper per CLAUDE.md §5 / §9. |
| `src/game/phaser/registry.ts` (22 LOC) | Typed accessors for the Phaser game-level registry. Single `REGISTRY_KEYS` table, `getSummary` / `setSummary` / `setBootData`. | 2 (type-only `phaser`, type-only `./config`) | 2 (`config.ts:3`, `scenes/CombatScene.ts:12`). | None at module scope; setters mutate `game.registry`. | Public, internal. Mandated wrapper per CLAUDE.md §5 / §9. Uses one `as` cast on read at line 13 to narrow `unknown`. |
| `src/game/phaser/scenes/BootScene.ts` (1819 LOC) | Asset preloader replacement: at `create()` time programmatically generates ~50 placeholder textures (player ship, every weapon's bullet, every pod, every enemy variant, asteroid, powerups, perk icons, spark particle) into Phaser's texture cache, then transitions to `CombatScene`. | 2 (`phaser`, `../config`) | Referenced by `config.ts:44` (dynamic `import("./scenes/BootScene")`). | At `create()`: ~31 calls to `this.add.graphics()` followed by `g.generateTexture(key, w, h)` and `g.destroy()`. Calls `this.scene.start(SCENE_KEYS.Combat, this.bootData)`. | Public — instantiated via `createPhaserGame`. |
| `src/game/phaser/scenes/BossScene.ts` (17 LOC) | Stub scene reserved for scripted boss phase logic. Today it just exists; not registered in `config.ts`. | 2 (`phaser`, `../config`) | None inside zone (file unreferenced; not in the `scene: [...]` array at `config.ts:64`). | None — `create()` is empty. | Public, but currently unused. Dead-ish placeholder. |
| `src/game/phaser/scenes/CombatScene.ts` (299 LOC) | The orchestrator scene. Owns `BulletPool` ×2, `EnemyPool`, `ObstaclePool`, `PowerUpPool`, the `Player`, `WaveManager`, `ScoreSystem`, `CombatVfx`, `CombatHud`, `DropController`, `PerkController`. Wires collisions, listens for typed events, runs the per-frame end-of-mission predicate, applies bullet AoE, hooks pause keys, calls `combatMusic.loadTrack` on entry / `stop` on shutdown, and computes the final `CombatSummary` plus first-clear reward. | 18 — sample: `../config`, `../entities/Bullet`, `../entities/Enemy`, `../entities/Obstacle`, `../entities/Player`, `@/game/state/GameState`, `../events`, `../registry`, `@/game/audio/sfx`, `@/game/audio/music`, `@/game/data/missions`, `@/game/state/rewards`, `../entities/PowerUp`, `../systems/WaveManager`, `../systems/CollisionSystem`, `../systems/ScoreSystem`, `./combat/CombatVfx`, `./combat/CombatHud`, `./combat/DropController`, `./combat/PerkController`. | Referenced by `config.ts:45` (dynamic). | At `create()`: physics bounds, particle/group construction, collision wiring, perk/drop controller construction, HUD build, key listener registration, music load. At `update()`: per-frame finish predicate, score/HUD tick. At `finish()`: writes `GameState.addPlayedTime`, `addCredits`, `completeMission`, calls `setSummary` on registry, schedules a 350ms delayedCall to `bootData.onComplete()`. | Public — instantiated via `createPhaserGame`. |
| `src/game/phaser/scenes/PauseScene.ts` (60 LOC) | Overlay scene launched from `CombatScene.togglePause()`. Owns its own keyboard input so P resumes / ESC abandons (the latter `emit`s `{type:"abandon"}` to combat). | 2 (`phaser`, `../config`, `../events`) | Started by `CombatScene.togglePause()` (`scenes/CombatScene.ts:258`). Registered at `config.ts:64`. | Side effects on `create()`: drawing 4 GameObjects, registering 2 once-keys. `resume()` / `abandon()` mutate scene-manager state. | Public scene class. |
| `src/game/phaser/scenes/combat/CombatHud.ts` (140 LOC) | Renders score, credits, shield/armor/energy bars, and the active-perk chip stack inside the combat scene. Reads HUD state via injected `snapshot()` callback. | 3 (`phaser`, `../../config`, `../../../data/perks`) | 1 (`scenes/CombatScene.ts:22`). | At `build()`: 7 GameObjects added. At `update()`: bar redraw + label updates. At `refreshPerkChips()`: rebuilds the chip container from scratch each call. | Public class within the combat helper cluster. |
| `src/game/phaser/scenes/combat/CombatVfx.ts` (86 LOC) | Visual + targeting helpers used by CombatScene: starfield bg, floating damage numbers, particle explosions, find-closest-enemy scan for homing bullets. | 3 (`phaser`, `../../config`, `../../entities/Enemy` type-only) | 1 (`scenes/CombatScene.ts:21`). | At `drawBackground()`: 80 `g.fillCircle` writes to a single graphics object. Damage / particle helpers create transient GameObjects + tweens with `onComplete: destroy`. | Public class within the combat helper cluster. |
| `src/game/phaser/scenes/combat/DropController.ts` (175 LOC) | Loot drop policy. Owns the 18% drop chance + 25/75 perk-vs-permanent split, the `nextWeaponUpgrade` ladder, and the "+SHIELD" / "+¢25" / "+ <name>" pickup flash. Routes to `itemSfx.shield/money/weapon/perk` on apply. | 13 — sample: `phaser`, `@/types/game`, `@/game/state/GameState`, `@/game/audio/sfx`, `@/game/audio/itemSfx`, `../../entities/PowerUp`, `../../entities/Enemy` type-only, `../../entities/Player` type-only, `../../systems/ScoreSystem` type-only, `../../../data/perks`, `../../../data/missions`, `../../../data/weapons`, `@/game/state/ShipConfig`. | 2 (`scenes/CombatScene.ts:23`, test file). | Reads + writes `GameState`. Calls `sfx.pickup()` and `itemSfx.*`. Spawns transient text objects + tweens. | Public class within the combat helper cluster. |
| `src/game/phaser/scenes/combat/PerkController.ts` (78 LOC) | Mission-only perk state (`overdrive`, `hardened`, `emp`). Manages an `activePerks` set + `empCharges` counter, applies perk effects to the live `Player`, and renders the EMP detonation flash + camera flash + `sfx.explosion()`. | 5 (`phaser`, `@/game/audio/sfx`, `../../entities/Bullet` type-only, `../../entities/Player` type-only, `../../../data/perks`). | 1 (`scenes/CombatScene.ts:24`). | `apply` mutates `Player.hasOverdrive` / `hasHardened`; `triggerActive` disables every active enemy bullet via `enemyBullets().children.iterate`. | Public class within the combat helper cluster. |
| `src/game/phaser/entities/Bullet.ts` (181 LOC) | `Bullet` extends `Phaser.Physics.Arcade.Sprite` with friendly/hostile flag, damage, optional homing config, optional gravity, optional `BulletEffect` (explosion + slow). `BulletPool` extends `Phaser.Physics.Arcade.Group`. | 2 (`phaser`, `../systems/weaponMath`) | 7 (`scenes/CombatScene.ts`, `entities/Enemy.ts:3`, `systems/CollisionSystem.ts:2`, `systems/WaveManager.ts:8`, `systems/WeaponSystem.ts:2`, `scenes/combat/PerkController.ts:3`, tests). | `preUpdate` mutates body velocity (gravity, homing). `deactivate` returns the sprite to the pool. Out-of-bounds check disables body. | Public — `Bullet`, `BulletEffect`, `BulletPool`, `BulletPoolOptions`, two texture-key constants. |
| `src/game/phaser/entities/Enemy.ts` (280 LOC) | `Enemy` extends `Phaser.Physics.Arcade.Sprite` with hp, slow-debuff state, behavior switch (straight/zigzag/homing/boss), a 3-phase boss FSM + scripted shot patterns, and per-frame motion-tilt cosmetic. `EnemyPool` extends `Phaser.Physics.Arcade.Group`. | 5 (`phaser`, `@/types/game`, `./Bullet`, `../../data/enemies`, `./motionTilt`) | 5 (`scenes/CombatScene.ts:6,7`, `scenes/combat/CombatVfx.ts:3`, `scenes/combat/DropController.ts:13`, `systems/CollisionSystem.ts:3`, `systems/WaveManager.ts:9`). Re-exports `getEnemy`. | `spawn` reconfigures body + texture + customData hitbox. `preUpdate` writes velocity / position / angle / scale. Boss firing path calls `enemyPool.spawn(...)`. | Public — `Enemy`, `EnemyPool`, re-export of `getEnemy`. |
| `src/game/phaser/entities/Obstacle.ts` (81 LOC) | `Obstacle` extends `Phaser.Physics.Arcade.Sprite` (no hp, no firing). Tracks `lastHitPlayerAt` so CollisionSystem can apply per-obstacle damage cooldown. `ObstaclePool` is the matching group. | 4 (`phaser`, `@/types/game`, `../../data/obstacles`, `../config`). | 4 (`scenes/CombatScene.ts:8`, `systems/CollisionSystem.ts:4`, `systems/WaveManager.ts:10`, tests). | `spawn` enables body + sets random angle/spin + circular body. `preUpdate` deactivates when below world bounds. | Public — `Obstacle`, `ObstaclePool`, re-export of `getObstacle`. |
| `src/game/phaser/entities/Player.ts` (141 LOC) | `Player` extends `Phaser.Physics.Arcade.Sprite`. Composes `PlayerCombatant` (defenses), `PlayerFireController` (fire path), `PodController` (visual side-pods), `WeaponSystem`-per-slot, and keyboard `Controls`. Owns smoothed velocity + bank/squash easing + mid-mission perk flags. | 8 (`phaser`, `@/types/game`, `../systems/WeaponSystem`, `../systems/Controls`, `./Bullet` type-only, `@/game/state/ShipConfig`, `./player/SlotModResolver`, `./player/PlayerCombatant`, `./player/PlayerFireController`, `./player/PodController`). | 5 (`scenes/CombatScene.ts:9`, `systems/CollisionSystem.ts:5`, `scenes/combat/DropController.ts:14`, `scenes/combat/PerkController.ts:4`, tests). | `preUpdate` mutates velocity, angle, scale, energy regen, fires weapons. `setSlotWeapon` mutates the shared slot arrays + reconciles pods. | Public class. |
| `src/game/phaser/entities/PowerUp.ts` (55 LOC) | `PowerUp` sprite + pool. `PowerUpKind` is a discriminated union — string literals (`shield` / `credit` / `weapon`) or `{perk: PerkId}`. Provides the `isPerkKind` type guard. | 2 (`phaser`, `../../data/perks`) | 4 (`scenes/CombatScene.ts:17`, `scenes/combat/DropController.ts:7-12`, `systems/CollisionSystem.ts:6`, tests). | `spawn` swaps texture + sets velocity. | Public — `PowerUp`, `PowerUpPool`, type aliases, `isPerkKind`. |
| `src/game/phaser/entities/motionTilt.ts` (68 LOC) | Pure-math "lean into your motion" easing helper used per-frame by `Enemy`. Computes target angle + scaleX/scaleY from velocity vs. catalog speed and eases. | 0 — pure module. | 2 (`entities/Enemy.ts:5`, test). | None — pure functions. | Public — `MotionTiltState`, `computeMotionTilt`. |
| `src/game/phaser/entities/player/PlayerCombatant.ts` (86 LOC) | Holds the player's defensive resources (shield/armor/energy + maxes), plus damage cascade, hardened reduction, energy/shield regen tick, death emission. | 4 (`phaser`, `@/game/state/ShipConfig`, `../../events`, `@/game/audio/sfx`). | 2 (`entities/Player.ts:12`, test). | `takeDamage` calls `sfx.hit()`, `scene.cameras.main.shake`, sprite tint flash, `emit(scene, {type:"playerDied"})` on death. | Public — `PlayerCombatant`, `SHIELD_REGEN_PER_SEC`, `SHIELD_REGEN_DELAY_MS`. |
| `src/game/phaser/entities/player/PlayerFireController.ts` (78 LOC) | Per-slot fire-attempt path. Holds the per-slot `WeaponSystem` cooldowns + shared references to slot-instance and slot-mods arrays. `fireAll` walks every slot and plays `sfx.laser()` at most once per tick. | 5 (`@/game/state/ShipConfig`, `../../systems/WeaponSystem`, `@/game/audio/sfx`, `./SlotModResolver`, `./PlayerCombatant` type-only, `./slotLayout`). | 2 (`entities/Player.ts:13`, test). | `tryFireSlot` mutates `combatant.energy`. `fireAll` plays `sfx.laser()` if any shot fired. | Public class. |
| `src/game/phaser/entities/player/PodController.ts` (83 LOC) | Visual-only side-pod sprites for slots ≥ 1. Reconciles to a `WeaponInstance` array; creates/destroys pods so each slot's pod sprite matches its weapon's `podSprite`. Per-frame `sync(player)` mirrors player position/angle/scale. | 3 (`phaser`, `@/game/state/ShipConfig`, `@/game/data/weapons`, `./slotLayout`). | 1 (`entities/Player.ts:14`). | `reconcile` adds/destroys sprites. `sync` writes pod position/angle/scale. | Public class. |
| `src/game/phaser/entities/player/SlotModResolver.ts` (58 LOC) | Pure resolver: collapses a `WeaponInstance` (level + augments) into a per-slot `SlotMods` (damageMul, fireRateMul, projectileBonus, energyCost, turnRateMul). | 4 (`@/types/game`, `@/game/state/ShipConfig`, `../../../data/weapons`, `../../../data/augments`). | 2 (`entities/Player.ts:8`, test). | None — pure functions. | Public — `SlotMods`, `NEUTRAL_SLOT_MODS`, `resolveSlotMods`, `slotModsForGrantedWeapon`. |
| `src/game/phaser/entities/player/slotLayout.ts` (17 LOC) | One-export module: `slotXOffset(index)` maps a slot index to a fixed `[0,-36,36,-72,72,-108,108]` x-offset. Shared by `PlayerFireController` (bullet spawn) and `PodController` (pod position) so bullets emerge from the rendered pod. | 0 — pure module. | 2 (`entities/player/PlayerFireController.ts:6`, `entities/player/PodController.ts:4`). | None. | Public — `slotXOffset`. |
| `src/game/phaser/systems/CollisionSystem.ts` (89 LOC) | `wireCollisions` registers all `physics.add.overlap` pairs (4 base + 3 obstacle = 7 max) and dispatches each to a `CollisionHandlers` callback. Owns the 400ms per-obstacle damage cooldown. | 5 (`phaser`, `../entities/Bullet`, `../entities/Enemy`, `../entities/Obstacle`, `../entities/Player`, `../entities/PowerUp`). | 1 (`scenes/CombatScene.ts:19`). | Side effect on call: 4–7 `physics.add.overlap` registrations on the scene. Each wired callback deactivates bodies and calls handlers. | Public — `wireCollisions`, `CollisionHandlers`. |
| `src/game/phaser/systems/Controls.ts` (47 LOC) | `Controls` interface (`moveX/moveY/fire`) + `createKeyboardControls(scene)` factory. Hooks WASD + arrows + Space and registers Space key-capture so the browser doesn't scroll. | 1 (`phaser`). | 2 (`entities/Player.ts:4`, test). | Side effect on call: `kb.createCursorKeys`, `kb.addKeys`, `kb.addKey`, `kb.addCapture`. | Public — `Controls`, `createKeyboardControls`. |
| `src/game/phaser/systems/ScoreSystem.ts` (39 LOC) | In-memory score/credits/combo tracker. Combo windows at 2.5s, capped at x8, multiplies score (not credits). | 0. | 2 (`scenes/CombatScene.ts:20`, `scenes/combat/DropController.ts:15` type-only, test). | None — pure stateful class. | Public — `ScoreSystem`. |
| `src/game/phaser/systems/WaveManager.ts` (178 LOC) | Drives wave progression for a mission. Reads waves from `getWavesForMission(missionId)`, schedules every `WaveSpawn` + `ObstacleSpawn` via `scene.time.delayedCall`, and on duration tick advances to the next wave or `emit`s `allWavesComplete`. Exposes `isOnLastWave`, `allSpawnsFired`, `finishEarly` so `CombatScene.update` can cut a boss-cleared wave short. | 7 (`phaser`, `@/types/game`, `../entities/Bullet` type-only, `../entities/Enemy` type-only, `../entities/Obstacle` type-only, `../config`, `../events`, `../../data/waves`). | 2 (`scenes/CombatScene.ts:18`, test). | `start` schedules every spawn for wave 0. `advance` schedules the next wave + a duration timer. Side effect: `enemies.spawn(...)` and `obstacles.spawn(...)` calls. Re-exports `getWavesForMission`. | Public — `WaveManager`. |
| `src/game/phaser/systems/WeaponSystem.ts` (78 LOC) | Per-slot fire-rate gate + projectile dispatch. Reads weapon definition, applies `FireModifiers`, computes spread vectors, spawns N bullets with damage / homing / gravity / `BulletEffect`. | 4 (`@/types/game`, `../entities/Bullet` type-only, `../../data/weapons`, `./weaponMath`). | 2 (`entities/Player.ts:3`, `entities/player/PlayerFireController.ts:2`, test). | Side effect on `tryFire`: 1+ `pool.spawn(...)` calls. Mutates `lastFireMs`. | Public — `WeaponSystem`, `FireModifiers`. |
| `src/game/phaser/systems/weaponMath.ts` (72 LOC) | Pure math helpers: `canFire`, `degToRad`, `spreadVectors`, `steerVelocity` (homing). | 0. | 3 (`entities/Bullet.ts:2`, `systems/WeaponSystem.ts:4`, test). | None — pure functions. | Public — `BulletVector`, `canFire`, `degToRad`, `spreadVectors`, `steerVelocity`. |
| `src/game/phaser/__tests__/fakeScene.ts` (207 LOC) | Hand-rolled Phaser-Scene mock. Provides `createFakeTime` (controllable `delayedCall` queue with `advance(deltaMs)` / `fireAll()`), `createFakeScene` (mocks `add.*`, `physics.add.overlap`, `tweens.add`, `cameras.main`, `events.emit/on`, keyboard stubs), `createFakeSprite`. | 1 (`vitest`). | 6 test files (`CollisionSystem.test.ts:3`, `Controls.test.ts:15`, `WaveManager.test.ts:14`, `PlayerCombatant.test.ts:8`, `PerkController.test.ts:10`, `DropController.test.ts:20`). | None — defining only. | Public test harness — `createFakeScene`, `createFakeSprite`, `FakeScene`, `FakeTime`. |

### Tests at a glance

| Path | LOC | Subject | Notes |
|---|---|---|---|
| `src/game/phaser/entities/motionTilt.test.ts` | 84 | Pure-math sat-test for `computeMotionTilt`. | No Phaser. |
| `src/game/phaser/entities/player/PlayerCombatant.test.ts` | 176 | Damage cascade, hardened reduction, regen, death-emit. | Uses `createFakeScene` + `createFakeSprite`; asserts on `scene.events.emit("playerDied", ...)` mock. |
| `src/game/phaser/entities/player/PlayerFireController.test.ts` | 189 | Slot fire path, energy gating, overdrive multiplication. | Uses `WeaponSystem` real + `vi.fn` slot. |
| `src/game/phaser/entities/player/SlotModResolver.test.ts` | 131 | Damage/fireRate/energy folding from level + augments. | Pure. |
| `src/game/phaser/scenes/combat/DropController.test.ts` | 239 | Drop ladder + perk vs. permanent split + GameState weapon grants. | `vi.mock("phaser")` stubs Sprite/Group at module load. |
| `src/game/phaser/scenes/combat/PerkController.test.ts` | 154 | Apply each perk, EMP charge accounting, bullet field clear. | `vi.mock("phaser")` stubs `BlendModes`. |
| `src/game/phaser/systems/CollisionSystem.test.ts` | 303 | Overlap-pair count + each callback's mutation behavior. | Captures the `physics.add.overlap` calls via mockImplementation. |
| `src/game/phaser/systems/Controls.test.ts` | 116 | Keyboard plugin probing + per-axis `moveX/moveY/fire`. | `vi.mock("phaser")` stubs `KeyCodes`. |
| `src/game/phaser/systems/ScoreSystem.test.ts` | 69 | Combo window, score×combo, addCredits/Score helpers. | Pure. |
| `src/game/phaser/systems/WaveManager.test.ts` | 243 | Wave 0 schedule + `allWavesComplete` emit + obstacle path. | `vi.mock("phaser")` stubs `Math.Clamp`. |
| `src/game/phaser/systems/WeaponSystem.test.ts` | 148 | Spread/projectile-count, fire-rate gate, homing config plumb. | Uses `vi.fn` BulletPool. |
| `src/game/phaser/systems/weaponMath.test.ts` | 150 | Pure math sat-tests. | Pure. |

## Zone-level observations

### Scene lifecycle (boot → menu → galaxy/combat) and the typed event-bus + registry pattern

`src/components/hooks/usePhaserGame.ts:33` dynamically imports `createPhaserGame` (`config.ts:39`) and instantiates the Phaser game with `parentRef.current` and an `onComplete` callback. `createPhaserGame` registers the scene array `[BootScene, CombatScene, PauseScene]` (`config.ts:64`), seeds `BootData` into the registry via `setBootData(game, data)` (`config.ts:83`), and starts `BootScene` (`config.ts:84`).

`BootScene.create()` (`scenes/BootScene.ts:18`) generates ~50 placeholder textures via Phaser graphics objects (no asset preload from disk) and immediately calls `this.scene.start(SCENE_KEYS.Combat, this.bootData)`. There is NO menu scene inside Phaser — menus live in the React layer (`src/components/`); the React hook decides when to mount/destroy the game.

`CombatScene.create()` (`scenes/CombatScene.ts:55`) constructs every collaborator in the right order: vfx → pools → player → score → perk-controller (lazy refs to player/enemyBullets/dropController/hud) → drop-controller (lazy ref to player/score and `(perkId,x,y)=>perks.apply(...)`) → hud → collision wiring → wave manager → typed event subscriptions → keys → `combatMusic.loadTrack` → `waves.start()`. Every event subscription uses `on(this, "<type>", handler)` from `events.ts`. Combat "completion" is signalled via `setSummary(this.game, summary)` on the registry and a delayedCall that invokes `bootData.onComplete()`, which the React hook reads back via `getSummary` (`config.ts:71`).

`PauseScene` (`scenes/PauseScene.ts:7`) is launched as an OVERLAY via `this.scene.launch(SCENE_KEYS.Pause)` and `this.scene.pause()` in `CombatScene.togglePause()` (`scenes/CombatScene.ts:258-259`). It owns its own keyboard input so P resumes / ESC `emit`s `{type:"abandon"}` to the paused combat scene (`scenes/PauseScene.ts:58`).

`BossScene` (`scenes/BossScene.ts`) is a placeholder — it's defined but NOT registered in the scene array at `config.ts:64`. The header comment says "delegates boss encounters to CombatScene"; today it is dead code reserved for a later split.

The typed event bus has THREE types only: `playerDied` (emitted from `PlayerCombatant.takeDamage` at `entities/player/PlayerCombatant.ts:66` when armor hits 0), `allWavesComplete` (from `WaveManager.finishEarly` at `systems/WaveManager.ts:78`), `abandon` (from `PauseScene.abandon` at `scenes/PauseScene.ts:58`). All three are observed only by `CombatScene.create()` (`scenes/CombatScene.ts:159-163`).

The registry has TWO keys only: `summary` (written by `CombatScene.finish`, read by the `bootData.onComplete` adapter in `config.ts:67-82`) and `bootData` (written by `createPhaserGame`, never read inside the zone — only via `BootScene.init(data)` which receives the same object via Phaser's scene-start data plumbing).

### Coupling clusters (CombatScene cluster, Player cluster, Bullet/weapons cluster, etc.)

Three clusters live inside this zone:

1. **CombatScene orchestrator cluster** — `scenes/CombatScene.ts` + the four files in `scenes/combat/` (`CombatHud`, `CombatVfx`, `DropController`, `PerkController`). CombatScene constructs all four; Combat helpers consume injected accessors (lazy `player()`, `enemyBullets()`, `score()`) plus injected callbacks (e.g. `(perkId,x,y) => perks.apply(...)`). Internal coupling via lambda closures rather than imports, so the file-level dep graph stays acyclic.

2. **Player cluster** — `entities/Player.ts` composes `entities/player/{PlayerCombatant, PlayerFireController, PodController, SlotModResolver, slotLayout}.ts`. `PlayerCombatant` reaches outside the zone for `@/game/state/ShipConfig` and `@/game/audio/sfx`; `PlayerFireController` reaches for `WeaponSystem` (in-zone) + `@/game/audio/sfx`; `PodController` reaches for `@/game/data/weapons`. `slotLayout` is shared by `PlayerFireController` and `PodController` so bullets fire from where the pod is drawn.

3. **Bullet/weapons cluster** — `entities/Bullet.ts` + `systems/WeaponSystem.ts` + `systems/weaponMath.ts`. `Bullet` consumes `weaponMath.steerVelocity` for homing. `WeaponSystem` consumes `weaponMath.canFire/spreadVectors` and emits via `BulletPool.spawn`. The cluster has clean separation — `Bullet` is the data carrier, `WeaponSystem` is the dispatcher, `weaponMath` is the pure math.

`Enemy`, `Obstacle`, `PowerUp` are siblings of these clusters with their own pools; they don't reach into the player cluster (Enemy reaches into the Bullet cluster only via its `enemyPool: BulletPool` for shot firing).

### Cross-zone couplings (data / state / audio — flag any reach into `src/components/`)

The Phaser zone has the following cross-zone import surfaces (sorted by frequency):

| Cross-zone target | Files reaching it | Sample |
|---|---|---|
| `@/game/data/*` (perks, weapons, missions, enemies, obstacles, waves, augments) | 10 in-zone files | `entities/Enemy.ts:4`, `entities/Obstacle.ts:3`, `entities/PowerUp.ts:2`, `systems/WeaponSystem.ts:3`, `systems/WaveManager.ts:13`, `entities/player/SlotModResolver.ts:6,7`, `entities/player/PodController.ts:3`, `scenes/combat/DropController.ts:16,17,18`, `scenes/combat/CombatHud.ts:3`, `scenes/combat/PerkController.ts:5` |
| `@/game/state/*` (`GameState`, `ShipConfig`, `rewards`) | 6 in-zone files | `scenes/CombatScene.ts:10,16`, `scenes/combat/DropController.ts:3,19`, `entities/Player.ts:6`, `entities/player/PlayerCombatant.ts:3`, `entities/player/PlayerFireController.ts:1`, `entities/player/PodController.ts:2`, `entities/player/SlotModResolver.ts:4`, `config.ts:2` |
| `@/game/audio/*` (`sfx`, `music`, `itemSfx`) | 4 in-zone files | `scenes/CombatScene.ts:13,14`, `scenes/combat/DropController.ts:4,5`, `scenes/combat/PerkController.ts:2`, `entities/player/PlayerCombatant.ts:10`, `entities/player/PlayerFireController.ts:3` |
| `@/types/game` | 6 in-zone files | `config.ts:1`, `entities/Enemy.ts:2`, `entities/Obstacle.ts:2`, `entities/Player.ts:2`, `entities/player/SlotModResolver.ts:1`, `systems/WaveManager.ts:2`, `systems/WeaponSystem.ts:1`, `scenes/combat/DropController.ts:2` |

**Top 3 highest-coupling cross-zone reaches:**
1. **`CombatScene` → `@/game/state/GameState` + `@/game/state/rewards`** (`scenes/CombatScene.ts:10,16`) — calls `GameState.getState`, `addPlayedTime`, `addCredits`, `isMissionCompleted`, `completeMission`, plus `rollMissionReward` + `applyMissionReward`. CombatScene is the single biggest writer to global state from inside this zone.
2. **`DropController` → `@/game/state/GameState` + `@/game/state/ShipConfig`** (`scenes/combat/DropController.ts:3,19`) — calls `GameState.grantWeapon`, reads `getState().ship`, calls `ownsAnyOfType(ship, id)`. The `nextWeaponUpgrade` ladder lives here.
3. **`PlayerCombatant` → `@/game/audio/sfx` + `@/game/state/ShipConfig`** (`entities/player/PlayerCombatant.ts:3,10`) — derives max shield/armor/energy from `ShipConfig` constants and plays `sfx.hit()` on damage. Audio reach happens at five places total in the zone (CombatScene, DropController, PerkController, PlayerCombatant, PlayerFireController).

**No reach into `src/components/`.** The zone never imports React/Next code; the React layer is the consumer (`src/components/GameCanvas.tsx:6`, `src/components/galaxy/VictoryModal.tsx:4`, `src/components/hooks/usePhaserGame.ts:4,33` only consume `CombatSummary` type + `createPhaserGame` factory). Boundary is clean in that direction.

**No reach into `src/game/three/`.** Searched explicitly. Confirms CLAUDE.md §5 "no cross-domain imports" rule.

### God-files (>300 LOC AND many responsibilities)

Two files cross the 300-LOC threshold. Per CLAUDE.md §5 the rule is "files over ~300 lines need a justification or get split":

1. **`src/game/phaser/scenes/BootScene.ts` — 1,819 LOC.** Single responsibility (procedural texture generation for ~50 placeholder sprites), but with 31 distinct `drawX(...)` private methods that share nothing structurally. The class header (`scenes/BootScene.ts:5`) explicitly says "Drop real PNGs into public/sprites and this file becomes a proper asset preloader." This is a documented placeholder, not god behavior — every method has the same shape (graphics → fill ops → generateTexture → destroy). The natural split if asset-loading lands is one file per category (player, bullets, enemies, pirates, powerups, perks). It's the largest LOC count in the zone by 6x.

2. **`src/game/phaser/scenes/CombatScene.ts` — 299 LOC.** Just under the threshold but worth noting because of the responsibility count: scene lifecycle, pool construction, collision wiring, perk + drop wiring, HUD wiring, music loading, AoE explosion logic (`applyBulletAoE` at lines 208-242 — a chunk of GAMEPLAY logic that's not delegated to a helper), kill handling, pause toggle, and `finish` + summary write + first-clear reward. It's the orchestrator AND it carries the bullet-AoE algorithm inline. The 2026-04-27 audit already pulled HUD / Vfx / Drop / Perk out into `combat/`; the AoE math is the next visible split candidate but stays here today.

No other file crosses 300 LOC. `Enemy.ts` (280) is the next highest.

### Suspected accidental coupling

- **`scenes/combat/DropController.ts` reaches into `@/game/state/GameState` + `@/game/state/ShipConfig`** for the weapon-pickup ladder (`grantWeapon`, `getState().ship`, `ownsAnyOfType`). The drop policy "give the player a new weapon" must mutate global state somewhere; doing it inline mixes "decide what dropped" with "apply that drop to global state." Could be passed in as an injected callback (the same way perks are: `onPerk: (perkId, x, y) => void`). That decoupling would also let DropController be tested without `GameState.resetForTests()` (`scenes/combat/DropController.test.ts:73-79`).
- **`scenes/CombatScene.ts:208-242` (`applyBulletAoE`)** lives on the scene but only manipulates the enemy group + a vfx call. It's pure-ish gameplay logic stranded inside the scene class. Pulling it into a `BulletAoeSystem` (or onto `CombatVfx`/`Enemy`) would shrink CombatScene below 250 LOC.
- **`entities/player/PlayerCombatant.ts:66` emits `playerDied` directly** to the scene event bus, but it's owned by `Player`, not by the scene. The Player class never listens for it; `CombatScene` is the listener. Acceptable, but it does mean `PlayerCombatant` is the lowest-level emitter of a scene-wide event — slightly surprising layering for a "defenses + damage cascade" helper.
- **`PowerUp` re-imports `PERKS` from `@/game/data/perks`** (`entities/PowerUp.ts:2`) only to use `PERKS[kind.perk].textureKey`. If perks ever grow more visual properties this will pull more data into the entity. Today it's a single field read; not a concern yet.
- **`getEnemy`, `getObstacle`, `getWavesForMission`** are re-exported from their host entity/system files (`entities/Enemy.ts:7`, `entities/Obstacle.ts:6`, `systems/WaveManager.ts:15`). Existing callers (e.g. `scenes/combat/DropController.ts:17` → `getMission` from `@/game/data/missions` directly) sometimes go to the data module, sometimes go through the re-export. Inconsistent; not load-bearing.

### Cycles inside the zone

No file-level import cycles. The dep graph is a DAG with `config.ts` near the root, `events.ts` and `registry.ts` as utility leaves, the data/audio modules outside the zone as further leaves, and `CombatScene` as the deepest aggregator. Closures + lazy accessors are used to avoid construction-order cycles between CombatScene's collaborators (e.g. `PerkController` and `DropController` both receive `() => player` / `() => enemyBullets` thunks; `PerkController` is constructed BEFORE `DropController` and gets `(text, color, x, y) => this.dropController.flashPickup(...)` as a callback; see `scenes/CombatScene.ts:86-100`).

### Side effects (Phaser create/update, asset loading, tweens, particles, group management)

- **Asset loading** — none from disk. `BootScene.create()` synchronously builds every texture via `Phaser.GameObjects.Graphics → generateTexture(key)`, then `g.destroy()`. ~31 invocations.
- **Group management** — five pools live on `CombatScene`: `playerBullets`, `enemyBullets` (`BulletPool`), `enemies` (`EnemyPool`), `obstacles` (`ObstaclePool`), `powerUps` (`PowerUpPool`). Each extends `Phaser.Physics.Arcade.Group` and manages its own object recycling via `this.get()`.
- **Per-frame side effects** — `Bullet.preUpdate` (gravity + homing + out-of-bounds), `Enemy.preUpdate` (behavior switch + slow-debuff expiry + motion tilt + boss FSM), `Obstacle.preUpdate` (drift + out-of-bounds), `PowerUp.preUpdate` (out-of-bounds), `Player.preUpdate` (smoothed velocity + bank/squash + pod sync + regen + fire), `CombatScene.update` (score tick + HUD update + finish predicate).
- **Tweens** — `CombatVfx.floatDamageNumber`, `DropController.flashPickup`, `PerkController.detonateEmp`. All three pair `tweens.add` with an `onComplete: destroy` so transient text/graphics objects clean up after themselves.
- **Particles** — `CombatVfx.emitExplosionParticles` adds a one-shot emitter, calls `emitter.explode(count)`, then schedules a 700ms `delayedCall` to destroy the emitter.
- **Timers (`scene.time.delayedCall`)** — used by `WaveManager.advance` (wave duration), `WaveManager.schedule/scheduleObstacle` (per-spawn delay+interval), `Enemy.takeDamage` (40ms tint clear), `PlayerCombatant.takeDamage` (80ms tint clear), `CombatVfx.emitExplosionParticles` (700ms emitter destroy), `CombatScene.finish` (350ms onComplete delay).
- **Camera FX** — `PlayerCombatant.takeDamage` calls `scene.cameras.main.shake(120, 0.006)`. `PerkController.detonateEmp` calls `scene.cameras.main.flash(120, 255, 200, 240, false)`.
- **Audio side effects** — `CombatScene` calls `combatMusic.loadTrack(mission.musicTrack)` at create and `combatMusic.stop()` on `Phaser.Scenes.Events.SHUTDOWN`. `sfx.explosion` / `pickup` / `hit` / `laser` are fired from CombatScene, DropController, PerkController, PlayerCombatant, and PlayerFireController. `itemSfx.shield/money/weapon/perk` from DropController only.
- **Phaser registry writes** — exactly two: `setBootData` in `config.ts:83`, `setSummary` in `scenes/CombatScene.ts:293`.
- **Phaser event emits** — exactly three event types, all through `emit()`: `playerDied`, `allWavesComplete`, `abandon`.

### Test harness — the fakeScene + time-queue pattern; what's unit-testable today

`__tests__/fakeScene.ts` mocks the slice of `Phaser.Scene` the helpers actually touch. `createFakeTime()` (`__tests__/fakeScene.ts:30-63`) backs `scene.time.delayedCall` with a queue + `advance(deltaMs)` (fires due callbacks while incrementing `now`) and `fireAll()` (drains everything, with a 10-iter guard against infinite re-enqueue). `createFakeScene()` mocks `add.{existing,graphics,text}`, `physics.{add.overlap, add.existing, world.bounds}`, `time` (the FakeTime), `input.keyboard.{createCursorKeys, addKeys, addKey, addCapture}` with isDown stubs, `tweens.add`, `cameras.main.{shake, flash}`, `events.{emit,on,off,emitted}` (where `emitted` is a recorded array test code can read), and a `sound.add` stub.

Six test files use it: `Controls.test.ts`, `CollisionSystem.test.ts`, `WaveManager.test.ts`, `PlayerCombatant.test.ts`, `PerkController.test.ts`, `DropController.test.ts`. Pure-math files (`weaponMath.test.ts`, `motionTilt.test.ts`, `SlotModResolver.test.ts`, `ScoreSystem.test.ts`) skip the harness entirely.

Three tests `vi.mock("phaser", ...)` to stub a thin slice of the real Phaser namespace (`KeyCodes`, `BlendModes`, `Math.Clamp`) so the SUT's `import * as Phaser from "phaser"` succeeds without booting Phaser's device-detection (which throws under node).

Unit-testable today (without booting Phaser):
- `weaponMath`, `motionTilt`, `ScoreSystem`, `SlotModResolver` (pure).
- `WeaponSystem` (uses a fake BulletPool object).
- `Controls` (FakeScene + phaser stub).
- `CollisionSystem` (FakeScene; intercepts `physics.add.overlap`).
- `WaveManager` (FakeScene + phaser stub for `Math.Clamp`).
- `PlayerCombatant` (FakeScene + FakeSprite).
- `PlayerFireController` (uses real `WeaponSystem` + fake BulletPool).
- `DropController` (FakeScene + heavy `vi.mock("phaser", ...)` to stub `Phaser.Physics.Arcade.Sprite/Group` because of transitive imports through `PowerUp`/`Enemy`/`Player`).
- `PerkController` (FakeScene + phaser stub for `BlendModes`).

Not unit-tested today (no `*.test.ts` file): `BootScene` (procedural drawing — very low-value unit tests; visual smoke would catch regressions better), `BossScene` (placeholder), `CombatScene` (orchestrator — too many collaborators to mock cheaply), `PauseScene`, `CombatHud`, `CombatVfx`, `Bullet`, `Enemy`, `Obstacle`, `Player`, `PowerUp`, `PodController`, `slotLayout`. The pattern in this zone is that the orchestrator + the entity classes that extend `Phaser.Physics.Arcade.Sprite` are NOT unit-tested directly; their behavior is exercised through the helper unit tests, with full-pipeline integration left to manual play.

### String-keyed event/registry usages (any `scene.events.emit("...")` or `game.registry.set("...")` outside the typed wrappers — these would be VIOLATIONS to flag)

**Zero violations.**

The only `scene.events.emit(...)` / `scene.events.on(...)` calls in production code are inside the wrapper functions themselves at `src/game/phaser/events.ts:14` and `src/game/phaser/events.ts:22`. Those calls source the string from a typed `event.type` / `T` parameter, not from a literal — by construction the only strings reaching `scene.events` are `"playerDied" | "allWavesComplete" | "abandon"`.

The only `game.registry.set(...)` / `game.registry.get(...)` calls are inside `src/game/phaser/registry.ts` (lines 13, 17, 21), all sourcing the key from the typed `REGISTRY_KEYS` const-object.

The two test files that reference `scene.events` (`systems/WaveManager.test.ts:51,137`, `entities/player/PlayerCombatant.test.ts:83,91`) read the FakeScene's `emitted` array — a Vitest mock recording field, not a real Phaser event call. Not a violation.

CLAUDE.md §5 + §9 wrapper invariant holds across the entire zone.

---

# Zone C — shared game (data + state + three + audio) (verbatim)

# Phase 1 — Zone C: shared game (data + state + three + audio)

Read-only file-by-file inventory of `src/game/data/`, `src/game/state/`,
`src/game/three/`, and `src/game/audio/` (incl. `*.test.ts` + the
`persistence/` subfolder + `__tests__/` subfolders). Sibling zones
(`src/game/phaser/`, `src/components/`, `src/lib/`, `src/app/`) are out of
scope for this artifact and are referenced only as cross-zone callers.

Each table cell cites paths relative to the repo root with `path:line` form
where load-bearing.

---

## File-by-file inventory

### Sub-zone: data — `src/game/data/`

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|---|---|---|---|---|---|
| `src/game/data/augments.ts` | AUGMENTS record + `getAugment` / `getAllAugments` / `foldAugmentEffects` / `MAX_AUGMENTS_PER_WEAPON` / `NEUTRAL_AUGMENT_EFFECTS` / `AUGMENT_IDS` (`augments.ts:31-83`, `:105-122`). | `@/types/game` (`AugmentId`). | `data/integrityCheck.ts:59`, `data/lootPools.test.ts`, `state/persistence/helpers.ts:7`, `state/persistence/salvageRemovedWeapons.ts:18`, `state/shipMutators.ts:20`, `phaser/entities/player/SlotModResolver.ts`, `phaser/scenes/combat/DropController.ts`. | None at module load. | Stable; pure data + folded-effect helper. |
| `src/game/data/enemies.json` | Source-of-truth enemy catalog. | — | `data/enemies.ts:9`, `data/data.test.ts:3`, `data/__tests__/jsonSchemaValidation.test.ts:21`. | Static asset. | Locked content registry. |
| `src/game/data/enemies.ts` | Pure JSON accessor (`getEnemy` / `getAllEnemies`). Single `as` cast at module load (`enemies.ts:12-13`). | `enemies.json`, `@/types/game`. | `data/integrityCheck.ts:56`, `phaser/entities/Enemy.ts`, `phaser/systems/WaveManager.ts`. | JSON parse via `import` only. | Stable accessor (the canonical "no Zod at load" pattern). |
| `src/game/data/integrityCheck.ts` | Cross-reference drift gate (`runDataIntegrityCheck` + `buildLiveIntegrityData`). 351 LOC; commented as the most-imported boot path (`integrityCheck.ts:144-150`). | All sibling accessors (`enemies`, `solarSystems`, `weapons`, `augments`, `lootPools`, `waves`, `missionWeaponRewards`, `story`); `@/types/game`. | `data/missions.ts:14-17` (live invocation at module bottom), `data/integrityCheck.test.ts`. | None at module load (function is invoked from missions.ts; see "Side effects" below). | Stable. |
| `src/game/data/integrityCheck.test.ts` | 472 LOC test of every cross-ref failure path (typo suggester, self-ref, parent-system mismatch, etc.). | vitest, `data/integrityCheck`, types. | — | Test-only. | Test surface. |
| `src/game/data/lootPools.ts` | `LootPool` type + per-system POOLS Map (`lootPools.ts:30-51`) + `getLootPool` / `getAllLootPools`. | `@/types/game` (`AugmentId`, `SolarSystemId`, `WeaponId`). | `data/integrityCheck.ts:60`, `data/lootPools.test.ts`, `state/rewards.ts:15`, `lib/saveValidation.ts`. | None. | Stable; pure data. |
| `src/game/data/lootPools.test.ts` | Coverage for accessor + lookup. | vitest, `lootPools`, `augments`, `solarSystems`, `weapons`. | — | Test-only. | Test surface. |
| `src/game/data/missionWeaponRewards.ts` | Per-mission weapon-unlock map (`MISSION_WEAPON_REWARDS`) + `getBuyableWeaponIds` / `getMissionForWeapon`. | `data/weapons`, `@/types/game`. | `data/integrityCheck.ts:62`, `data/missionWeaponRewards.test.ts`, `lib/saveValidation.ts` (transitively via integrity), `components/ShopUI.tsx` (likely). | None. | Stable. |
| `src/game/data/missionWeaponRewards.test.ts` | Totality-of-mapping test (every mission ↔ exactly one weapon). | vitest, types. | — | Test-only. | Test surface. |
| `src/game/data/missions.json` | Source-of-truth mission/planet catalog (combat, shop, scenery). | — | `data/missions.ts:12`, `data/data.test.ts`, `data/__tests__/jsonSchemaValidation.test.ts:22`. | Static asset. | Locked content registry. |
| `src/game/data/missions.ts` | Accessor (`getAllMissions` / `getMission` / `getCombatMissions`). **Invokes `runDataIntegrityCheck(buildLiveIntegrityData(ALL_MISSIONS))` at module bottom (`missions.ts:52`).** | `missions.json`, `@/types/game`, `data/integrityCheck`. | 12+ call sites across data, state, three, components, hooks, leaderboard page (file's own header comment, `missions.ts:46-49`); explicitly `state/stateCore.ts:1`, `three/GalaxyScene.ts:2`, `three/LandingScene.ts:2`, `data/storyTriggers.ts:3`. | **Live integrity check throws on dangling cross-refs at boot** — universal-import side effect. | Stable; intentional `runDataIntegrityCheck` at module load is the drift gate documented in CLAUDE.md §11. |
| `src/game/data/obstacles.json` | Source-of-truth obstacle catalog. | — | `data/obstacles.ts:9`, `data/data.test.ts:4`, `data/__tests__/jsonSchemaValidation.test.ts:23`. | Static asset. | Locked content registry. |
| `src/game/data/obstacles.ts` | Accessor mirror of enemies.ts. | `obstacles.json`, `@/types/game`. | `phaser/entities/Obstacle.ts`. | None. | Stable accessor. |
| `src/game/data/perks.ts` | `PerkDef` + `PERKS` record + `randomPerkId`. | — (no `@/types/game` import — `PerkId` is local). | `phaser/scenes/combat/PerkController.ts`, `audio/itemSfx.ts:3`, `components/galaxy/VictoryModal.tsx`. | None. | Stable. |
| `src/game/data/perks.test.ts` | Coverage of perks. | vitest. | — | Test-only. | Test surface. |
| `src/game/data/solarSystems.json` | Source-of-truth solar-system catalog (sun color, music bed paths, etc.). | — | `data/solarSystems.ts:9`, `data/__tests__/jsonSchemaValidation.test.ts:24`. | Static asset. | Locked content registry. |
| `src/game/data/solarSystems.ts` | Accessor + Map index. | `solarSystems.json`, `@/types/game`. | `data/integrityCheck.ts:57`, `state/persistence.ts:1`, `three/GalaxyScene.ts:3`, `three/LandingScene.ts:3`, leaderboard page. | None. | Stable accessor. |
| `src/game/data/story.ts` | `StoryEntry` schema, the literal `STORY_ENTRIES` array (`story.ts:99-258`), `StoryAutoTrigger` discriminated union (`story.ts:59-85`), `getStoryEntry` / `isKnownStoryId`. 270 LOC. | `@/types/game`. | `data/integrityCheck.ts:63`, `data/storyTriggers.ts:2`, `state/stateCore.ts:7`, `state/persistence.ts:2`, `state/seenStoriesLocal.ts:1`, `components/story/*`, `components/hooks/useStoryTriggers.ts`. | None. | Stable; literal content registry. |
| `src/game/data/story.test.ts` | Coverage of story id helpers. | vitest. | — | Test-only. | Test surface. |
| `src/game/data/storyTriggers.ts` | Pure trigger-selector helpers (`selectFirstTimeEntry` / `selectOnSystemEnterEntry` / `selectOnMissionSelectEntry` / `selectReadyClearedIdleEntries` / `selectReadyAllClearedIdleEntries`). | `data/story`, `data/missions`, `@/types/game`. | `data/storyTriggers.test.ts`, `components/hooks/useStoryTriggers.ts`. | None. | Stable; documented as the place to test "should this entry fire?" without React. |
| `src/game/data/storyTriggers.test.ts` | 211 LOC unit coverage. | vitest. | — | Test-only. | Test surface. |
| `src/game/data/waves.json` | Source-of-truth wave catalog. | — | `data/waves.ts:9`, `data/__tests__/jsonSchemaValidation.test.ts:25`. | Static asset. | Locked content registry. |
| `src/game/data/waves.ts` | Accessor (`getWavesForMission` / `getAllMissionWaves`). | `waves.json`, `@/types/game`. | `data/integrityCheck.ts:61`, `phaser/systems/WaveManager.ts`. | None. | Stable. |
| `src/game/data/weapons.json` | Source-of-truth weapon catalog. | — | `data/weapons.ts:9`, `data/__tests__/jsonSchemaValidation.test.ts:26`. | Static asset. | Locked content registry. |
| `src/game/data/weapons.ts` | Accessor + `WEAPON_IDS` const tuple (lockstep with `WeaponId` enum in `lib/schemas/save.ts`) + `weaponDps` / `weaponRps` derivations. | `weapons.json`, `@/types/game`. | `data/integrityCheck.ts:58`, `data/missionWeaponRewards.ts:15`, `state/rewards.ts:16`, `state/shipMutators.ts:19`, `state/persistence/helpers.ts:2`, `state/persistence/salvageRemovedWeapons.ts:17`, `phaser/systems/WeaponSystem.ts`, `lib/saveValidation.ts`, multiple components. | None. | Stable. |
| `src/game/data/weapons.test.ts` | Coverage. | vitest. | — | Test-only. | Test surface. |
| `src/game/data/__tests__/jsonSchemaValidation.test.ts` | **The drift gate.** Once-per-`npm test` Zod parse of every JSON against its `lib/schemas/*` parser (`jsonSchemaValidation.test.ts:34-57`). | vitest, all six JSONs, all six schemas from `lib/schemas/*`. | — | Test-only. | Test surface; gate documented in CLAUDE.md §11. |
| `src/game/data/data.test.ts` | 357-LOC integration check (formation kinds, behaviors, mission types). | vitest, all JSONs + accessors. | — | Test-only. | Test surface. |
| `src/game/data/README.md` | Content-author guide. | — | — | None. | Doc surface. |

### Sub-zone: state — `src/game/state/`

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|---|---|---|---|---|---|
| `src/game/state/GameState.ts` | **Barrel** — re-exports `stateCore` / `shipMutators` / `persistence` / `pricing` (`GameState.ts:6-9`). 9 LOC. | `./stateCore`, `./shipMutators`, `./persistence`, `./pricing`. | `phaser/scenes/CombatScene.ts:10` (namespace import), `phaser/scenes/combat/DropController.ts:3`, `components/loadout/WeaponCard.tsx`, `components/loadout/useLoadoutSelection.ts`, `components/LoadoutMenu.tsx`, `components/ShopUI.tsx`, `components/hooks/useStoryTriggers.ts:16` (`markStorySeen`), `components/GameCanvas.tsx:24` (`setSolarSystem`). | None. | Stable barrel — keep stable to preserve `import * as GameState`. |
| `src/game/state/GameState.test.ts` | 880 LOC integration test of the public state surface. | vitest, all state slices. | — | Test-only (mutates the singleton; uses `resetForTests()`). | Test surface. |
| `src/game/state/ShipConfig.ts` | `ShipConfig`/`WeaponInstance`/`WeaponSlots`/`ReactorConfig`/`WeaponPosition` types, `DEFAULT_SHIP`, `MAX_LEVEL`, `MAX_WEAPON_SLOTS`, all upgrade-cost curves (`shieldUpgradeCost` / `armorUpgradeCost` / `reactorCapacityCost` / `reactorRechargeCost` / `slotPurchaseCost` / `weaponDamageMultiplier` / `weaponUpgradeCost`), pure helpers (`firstEmptySlot` / `ownsAnyOfType` / `getInstanceAt`). 161 LOC. | `@/types/game`. | `state/shipMutators.ts:2-18`, `state/persistence.ts:9`, `state/persistence/helpers.ts:5-8`, `state/persistence/legacyShared.ts:2-5`, `state/persistence/migrateNewShape.ts:1-5`, `state/persistence/safetyNet.ts:1`, `state/persistence/salvageRemovedWeapons.ts:15-16`, `state/stateCore.ts:8`, `lib/schemas/save.ts:24-25`, `phaser/entities/Player.ts:6`, `phaser/entities/player/{PlayerCombatant,PlayerFireController,PodController,SlotModResolver}.ts`, `components/loadout/{selectors,WeaponList,WeaponCard,SlotPicker,SlotGrid,AugmentPicker,WeaponDetailsModal}.tsx`, `components/{LoadoutMenu,ShopUI,WeaponStats}.tsx`. | None. | Stable; central content/economy contract. |
| `src/game/state/ShipConfig.test.ts` | 280 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence.ts` | `StateSnapshot` interface (`persistence.ts:31-41`) — wire format. `toSnapshot()` / `hydrate()` / `migrateShip()` orchestrator. Dispatches by shape to the per-shape migrators in `persistence/`; runs salvage BEFORE migration (`persistence.ts:111-117`). 219 LOC. | `data/solarSystems`, `data/story`, `@/types/game`, `./ShipConfig`, `./stateCore`, `./persistence/{helpers,types,migrateNewShape,migrateLegacyIdArray,migrateNamedSlots,migratePrimaryWeapon,safetyNet,salvageRemovedWeapons}`. | `state/GameState.ts:8` (barrel), `state/GameState.test.ts`, `state/sync.ts:14`, `lib/saveValidation.ts` (transitively), tests. | None at load. | Stable orchestrator; load-bearing for save shape. |
| `src/game/state/persistence/helpers.ts` | `LegacyWeaponInstanceLike`, `KNOWN_AUGMENT_IDS` Set, `isKnownAugment` / `isKnownWeapon` / `clampLevel` / `clampUpgradeLevel` / `sanitizeAugmentList` / `looksLikeInstance` / `buildInstance`. | `data/weapons`, `data/augments`, `state/ShipConfig`, `@/types/game`. | `state/persistence.ts`, every per-shape migrator. | None. | Stable. |
| `src/game/state/persistence/legacyShared.ts` | `assignSlotsFromPool` — shared resolver used by 3 of the 4 per-shape migrators. | `data/weapons` (no — uses helpers), `state/ShipConfig`, `./helpers`, `./types`. | `migrateLegacyIdArray.ts`, `migrateNamedSlots.ts`, `migratePrimaryWeapon.ts`. | None. | Stable. |
| `src/game/state/persistence/migrateLegacyIdArray.ts` | Per-shape migrator for the legacy id-string slots + unlockedWeapons + weaponLevels + weaponAugments shape. | `state/ShipConfig`, `./legacyShared`, `./types`. | `state/persistence.ts:24`. | None. | Stable. |
| `src/game/state/persistence/migrateLegacyIdArray.test.ts` | 148 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/migrateNamedSlots.ts` | Per-shape migrator for the four-named-slot object. | `./legacyShared`, `./types`. | `state/persistence.ts:25`. | None. | Stable. |
| `src/game/state/persistence/migrateNamedSlots.test.ts` | 95 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/migrateNewShape.ts` | Detector (`looksLikeNewShape`) + per-shape migrator for the canonical `WeaponInstance[]` shape. | `state/ShipConfig`, `./helpers`, `./types`. | `state/persistence.ts:23`. | None. | Stable. |
| `src/game/state/persistence/migrateNewShape.test.ts` | 280 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/migratePrimaryWeapon.ts` | Per-shape migrator for the pre-loadout `primaryWeapon` shape. | `./legacyShared`, `./types`. | `state/persistence.ts:26`. | None. | Stable. |
| `src/game/state/persistence/migratePrimaryWeapon.test.ts` | 81 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/safetyNet.ts` | `seedStarterIfEmpty` — fall-through to starter weapon. | `state/ShipConfig`, `./types`. | `state/persistence.ts:27`. | None. | Stable. |
| `src/game/state/persistence/safetyNet.test.ts` | 57 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/salvageRemovedWeapons.ts` | `REMOVED_WEAPON_BASE_COSTS` map (`salvageRemovedWeapons.ts:31-38`) + `calculateLegacyRefund` (pre-migration scanner) + `salvageRemovedWeapons` (post-migration cleaner). 205 LOC. | `state/ShipConfig`, `data/weapons`, `data/augments`, `@/types/game`, `./types`, `./helpers`. | `state/persistence.ts:28`. | None. | Stable; refund table is forward-compatible. |
| `src/game/state/persistence/salvageRemovedWeapons.test.ts` | 82 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/salvageInvariants.test.ts` | 80 LOC. Cross-checks `REMOVED_WEAPON_BASE_COSTS` against TODO.md backlog. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/persistence/types.ts` | `LegacyShipSnapshot` / `LegacyNamedSlots` / `SlotsAndInventory` types (the loose-shape boundary). 46 LOC. | `state/ShipConfig`, `./helpers`, `@/types/game`. | All 4 per-shape migrators + `salvageRemovedWeapons.ts` + `legacyShared.ts` + `persistence.ts`. | None. | Stable type surface. |
| `src/game/state/pricing.ts` | `getSellPrice(weapon)` — half-price sell-back. 9 LOC. | `@/types/game`. | `state/GameState.ts:9` (barrel), `state/shipMutators.ts:21`. | None. | Stable. |
| `src/game/state/pricing.test.ts` | 81 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/rewards.ts` | `MissionReward` discriminated union, `rollMissionReward`, `applyMissionReward`, `describeMissionReward`. Reads loot pool, picks candidate set, falls back to credits. 136 LOC. | `data/augments`, `data/lootPools`, `data/weapons`, `@/types/game`, `./stateCore`, `./ShipConfig`, `./shipMutators`. | `state/rewards.test.ts`, `phaser/scenes/CombatScene.ts:16`, `phaser/config.ts:2` (type only), `components/galaxy/VictoryModal.tsx:6`. | None. | Stable. |
| `src/game/state/rewards.test.ts` | 194 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/saveQueue.ts` | `STORAGE_KEY="spacepotatis:pendingSave:v2"` (`saveQueue.ts:59`), `LEGACY_STORAGE_KEY="spacepotatis:pendingSave:v1"` (`saveQueue.ts:60`), `MAX_ATTEMPTS=50`, `MAX_AGE_MS=30 days`, `SAVE_QUEUED_MESSAGE` constant, `PendingSave` interface, `markSavePending` / `flushPendingSave` / `clearSaveQueue` / `readPendingSaveForTest`, `FlushResult`/`SavePostFn` types. 346 LOC. | — (none from this codebase). | `state/sync.ts:23-28`, `state/saveQueue.test.ts`, `components/SignInButton.tsx:8` (`clearSaveQueue`). | **Reads/writes localStorage at fn invocation** (`saveQueue.ts:128, 141, 156, 181, 192`); legacy `:v1` blob purged on every read (`purgeLegacyBlob` `:125-134`). Module-level `inflightFlush` slot. | Stable durability surface. |
| `src/game/state/saveQueue.test.ts` | 482 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/scoreQueue.ts` | `STORAGE_KEY="spacepotatis:scoreQueue:v1"` (`scoreQueue.ts:46`), `MAX_ATTEMPTS=50`, `MAX_AGE_MS=30 days`, `QUEUED_MESSAGE` constant, `enqueueScore` / `drainScoreQueue` / `clearScoreQueue` / `readScoreQueueForTest`, `DrainResult`/`ScorePostFn`/`QueuedScore`/`ScorePostInput` types. 355 LOC. | `@/types/game` (MissionId only). | `state/sync.ts:17-20`, `components/GameCanvas.tsx:29` (`enqueueScore`, `QUEUED_MESSAGE`). | localStorage I/O on every fn invocation (`scoreQueue.ts:124, 158, 172`); module-level `inflightDrain` slot. | Stable durability surface. |
| `src/game/state/scoreQueue.test.ts` | 337 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/seenStoriesLocal.ts` | `SEEN_STORIES_LOCAL_KEY="spacepotatis:seenStoryEntries"` + `readSeenStoriesLocal()` / `writeSeenStoriesLocal()`. 34 LOC. | `data/story`. | `state/stateCore.ts:11-12`, `state/persistence.ts:16` (re-exported from stateCore). | **Reads localStorage at fn invocation** (`seenStoriesLocal.ts:13`) AND is invoked by `INITIAL_STATE` construction in `stateCore.ts:58` — meaning a localStorage read happens at module load via stateCore. | Stable. |
| `src/game/state/seenStoriesLocal.test.ts` | 143 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/shipMutators.ts` | All ship-state mutators: `equipWeapon` / `grantWeapon` / `sellWeapon` / `buyWeapon` / `buyWeaponSlot` / `buyWeaponUpgrade` / `buyAugment` / `grantAugment` / `installAugment` / `buyShieldUpgrade` (+ `grantShieldUpgrade`) / `buyArmorUpgrade` (+ grant) / `buyReactorCapacityUpgrade` (+ grant) / `buyReactorRechargeUpgrade` (+ grant). Shared `applyLevelUpgrade` engine for the 4 stat upgrades. 366 LOC. | `@/types/game`, `state/ShipConfig`, `data/weapons`, `data/augments`, `state/pricing`, `state/stateCore`. | `state/GameState.ts:7` (barrel), `state/shipMutators.test.ts`, `state/rewards.ts:19-26` (calls grant variants). | Mutates module-level singleton in stateCore via `commit`. | Stable; god-file boundary (366 LOC, see below). |
| `src/game/state/shipMutators.test.ts` | 142 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/stateCore.ts` | The module-level singleton (`let state: GameStateShape`), `INITIAL_STATE`, `GameStateShape` interface, `SYSTEM_UNLOCK_GATES` map, `getState` / `subscribe` / `commit`, plus credit/playtime/mission/system/story mutators (`addCredits` / `spendCredits` / `addPlayedTime` / `completeMission` / `setSolarSystem` / `markStorySeen` / `isMissionCompleted` / `isPlanetUnlocked` / `resetForTests`). Re-exports `readSeenStoriesLocal` for `persistence.ts`. 148 LOC. | `data/missions` (`getAllMissions` at module load — see Side effects), `@/types/game`, `data/story`, `state/ShipConfig`, `state/seenStoriesLocal`. | `state/GameState.ts:6` (barrel), `state/shipMutators.ts:22`, `state/rewards.ts:17`, `state/persistence.ts:11-17`, `lib/saveValidation.ts:13` (`SYSTEM_UNLOCK_GATES`). | **`getAllMissions()` runs at module load** (`stateCore.ts:33`), which transitively triggers `runDataIntegrityCheck`. **Also reads localStorage** via `readSeenStoriesLocal()` inside the literal `INITIAL_STATE` (`stateCore.ts:58`). | Stable singleton. |
| `src/game/state/sync.ts` | `loadSave()` / `saveNow()` / `flushSaveQueue()` / `drainScoreQueue()` + `LoadResult` discriminated union (`sync.ts:84-92`) + `LoadResultKind` / `LoadFailureReason` / `SyncResult` types. Owns the dynamic-import of `RemoteSaveSchema` (`sync.ts:236`) so Zod stays out of pages that don't see a 200 response. 516 LOC. | `state/GameState` (barrel), `lib/routes`, `state/scoreQueue`, `state/saveQueue`, `state/syncCache`, dynamic `lib/schemas/save`. | `components/GameCanvas.tsx:28`, `components/hooks/useCloudSaveSync.ts:4`, `components/hooks/useCloudSaveSyncLogic.ts:12` (types only), `components/SaveLoadErrorOverlay.tsx:18` (types only), `components/ShopUI.tsx:13`, `components/hooks/useStoryTriggers.ts:17`, `lib/useOptimisticAuth.ts:10`. | Network fetches against `ROUTES.api.save` and `ROUTES.api.leaderboard`; module-level `inflightFlush` via saveQueue. | Stable; god-file watch (516 LOC). |
| `src/game/state/sync.test.ts` | 871 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/syncCache.ts` | Module-level cache slots: `cached: boolean \| null`, `inflight: Promise<unknown>`, `lastLoadResult: unknown`, `hydrationCompleted: boolean`, `currentPlayerEmail: string \| null`. Public surface: `clearLoadSaveCache` / `isHydrationCompleted` / `markHydrationCompleted` / `resetHydrationCompleted` / `isSaveCached` / `getSaveCache` / `setSaveCache` / `getInflightLoad` / `setInflightLoad` / `getCurrentPlayerEmail` / `setCurrentPlayerEmail` / `getLastLoadResultValue` / `setLastLoadResult`. 142 LOC. Header (`syncCache.ts:5-31`) explains the Zod-isolation rationale (~98 kB savings on landing). | — (no project imports). | `state/sync.ts:30-39`, `state/sync.ts:46-49` (re-exports), `components/GameCanvas.tsx:19`, `components/hooks/useCloudSaveSync.ts:8`, `components/SignInButton.tsx:7`, `lib/useOptimisticAuth.ts:11`. | Holds session-level mutable module state. No network or storage I/O. | Stable cache surface. |
| `src/game/state/syncCache.test.ts` | 175 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/state/useGameState.ts` | `useGameState<T>(selector)` — 12-LOC `useSyncExternalStore` adapter. | react, `./GameState` (barrel). | `components/{GameCanvas,LoadoutMenu,MenuMusic,ShopUI,WeaponStats}.tsx`, `components/galaxy/{HudFrame,QuestPanel}.tsx`, `components/loadout/*`, `components/ui/ShopCreditsTicker.tsx`. | None. | Stable React adapter. |

### Sub-zone: three — `src/game/three/`

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|---|---|---|---|---|---|
| `src/game/three/CameraController.ts` | PerspectiveCamera + drag/wheel/pinch input controller. 193 LOC. | three. | `three/GalaxyScene.ts:6`. | Adds DOM event listeners on construct; `dispose()` removes them. | Stable. |
| `src/game/three/CelestialBody.ts` | Pure interface: `{ object, update, setHovered, getMissionId, getDefinition, getMesh, setStatusLabel, dispose }`. 24 LOC. | three (type), `@/types/game`. | `three/GalaxyScene.ts:5`, `three/LandingScene.ts:3`, `three/Planet.ts:3`, `three/SceneRig.ts:3`, `three/Station.ts:3`. | None. | Stable interface. |
| `src/game/three/GalaxyScene.ts` | Galaxy view orchestrator: builds `SceneRig` for one solar system, owns `CameraController`, raycaster + pointer/click input, `applyStatuses`, RAF loop. 214 LOC. | three, `data/missions`, `data/solarSystems`, `@/types/game`, `./CelestialBody`, `./CameraController`, `./SceneRig`. | `components/hooks/useGalaxyScene.ts`. | Adds DOM event listeners (`canvas`, `window`); RAF loop (`start()`/`dispose()`). | Stable. |
| `src/game/three/LandingScene.ts` | Cinematic landing-page galaxy backdrop: builds SceneRig with all-systems planets, auto-orbit camera, off-axis projection, hides labels. Visibility-paused. 173 LOC. | three, `data/missions`, `data/solarSystems`, `./CelestialBody`, `./SceneRig`. | (likely `components/LandingHeroBackdrop.tsx` or similar — outside zone). | DOM listeners (`window`, `document.visibilitychange`); RAF loop. | Stable. |
| `src/game/three/Planet.ts` | Procedural planet body: ring textures, surface map + bump map via `planetTexture`, label sprite, orbit math. 341 LOC. Exposes the `MISSION_COLOR_OVERRIDE` per-mission palette overrides table (`Planet.ts:24-29`). | three, `@/types/game`, `./CelestialBody`, `./labelTexture`, `./planetTexture`. | `three/SceneRig.ts:4`. | Allocates Canvas2D textures on construct (`createRingTexture` for ringed bodies). | Stable; god-file watch (341 LOC). |
| `src/game/three/SceneRig.ts` | Shared scaffold factory: `createSceneRig(canvas, opts) → { renderer, scene, starfield, sun, planets, planetsById, ambient, rimLight, dispose }`. Centralizes WebGLRenderer + fog + lights + planet add-loop so GalaxyScene/LandingScene don't drift. 105 LOC. | three, `@/types/game`, `./CelestialBody`, `./Planet`, `./Station`, `./Starfield`, `./Sun`. | `three/GalaxyScene.ts:7`, `three/LandingScene.ts:5`. | Construct creates renderer + adds bodies. `dispose` releases all GPU resources. | Stable factory; cited in CLAUDE.md §11. |
| `src/game/three/Starfield.ts` | 2000-point star sphere with cached gradient sprite at module scope. 97 LOC. | three. | `three/SceneRig.ts:6`. | Module-level `cachedStarSprite` lazily allocated on first `createStarSprite()` call. | Stable. |
| `src/game/three/Station.ts` | Mechanical "shop" body — torus hub + spine + solar panel wings + antenna nav-light + invisible bounding-sphere hitbox. 241 LOC. | three, `@/types/game`, `./CelestialBody`, `./labelTexture`. | `three/SceneRig.ts:5`. | Allocates geometries/materials on construct. | Stable. |
| `src/game/three/Sun.ts` | Sun group: core sphere + halo sprite + flare sprite + PointLight; tinted from `solarSystems.json`'s `sunColor`. 127 LOC. | three. | `three/SceneRig.ts:7`. | Creates 256×256 radial-gradient textures on construct. | Stable. |
| `src/game/three/TransitionManager.ts` | `fade(element, toOpacity, durationSec)` GSAP wrapper. 24 LOC. | gsap. | (likely `components/galaxy/*` for galaxy↔combat fades — outside zone). | None at module load; `fade()` runs a tween on call. | Stable. |
| `src/game/three/labelTexture.ts` | `createLabelTexture(name, status, statusColor)` → `{ texture, aspect }`. 65 LOC. | three. | `three/Planet.ts:4`, `three/Station.ts:4`. | Allocates a fresh canvas + `THREE.CanvasTexture` per call. | Stable. |
| `src/game/three/planetTexture.ts` | `generatePlanetSurface(missionId, baseColor)` → `{ map, bumpMap }` + per-mission `styleFor(id)` table. 405 LOC. fbm3 noise + crater stamper. | three, `@/types/game` (MissionId only). | `three/Planet.ts:5`. | Per-call canvas + texture allocation; pure CPU work otherwise. | Stable; god-file watch (405 LOC). |

### Sub-zone: audio — `src/game/audio/`

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|---|---|---|---|---|---|
| `src/game/audio/AudioBus.ts` | The mute hub. `audioBus` singleton (`AudioBus.ts:142`), `register(category, engine)` (`:65`), `setMasterMuted` / `setCategoryMuted` (`:83-97`), `subscribe` (`:106`), `getState`. Categories: `"music" \| "voice" \| "sfx"` (`:34`). 142 LOC. | — (no project imports). | `audio/itemSfx.ts:4`, `audio/leaderboardAudio.ts:3`, `audio/menuBriefingAudio.ts:3`, `audio/music.ts:3`, `audio/sfx.ts:3`, `audio/story.ts:3`, `audio/storyLogAudio.ts:3`, `components/MuteToggle.tsx:4`. | Module-level singleton holds mute state and engine sets. | Stable hub. |
| `src/game/audio/AudioBus.test.ts` | 233 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/itemSfx.ts` | Per-category drop/shop voice cues (`weapon` / `augment` / `upgrade` / `money` / `shield` / `perk(id)`). Spawn-and-release Audio per fire (no template cache, iOS budget defense `itemSfx.ts:14-21`). Money throttle 1.8 s (`:42`). Registers under `"voice"` (`:48`). 111 LOC. | `data/perks` (PerkId), `./AudioBus`. | `phaser/scenes/combat/DropController.ts:5`, `components/galaxy/VictoryModal.tsx:5`, `components/ShopUI.tsx:15`. | Construct calls `audioBus.register("voice", this)`. Each play instantiates `new Audio(src)` and releases on `ended`/`error`/play-rejection. | Stable. |
| `src/game/audio/itemSfx.test.ts` | 110 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/leaderboardAudio.ts` | One-shot voice cue for `/leaderboard`. `play(delayMs)` / `stop()`. Registers under `"voice"` (`:22`). 72 LOC. | `./AudioBus`. | `components/LeaderboardBriefing.tsx:4`. | Construct registers; `play()` schedules a `setTimeout` then constructs Audio. | Stable. |
| `src/game/audio/leaderboardAudio.test.ts` | 76 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/menuBriefingAudio.ts` | Voice queue for the landing nudges + system briefing. `playSequence(items)` / `arm()` / `stop()` / `setMuted`. Registers under `"voice"` (`:36`). 125 LOC. | `./AudioBus`. | `components/MenuBriefing.tsx:4`, `components/PlayButton.tsx:7`. | Constructs Audio elements per queue item; uses `setTimeout` for inter-item gap. | Stable. |
| `src/game/audio/menuBriefingAudio.test.ts` | 105 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/music.ts` | `MusicEngine` class + three exported singletons: `menuMusic` (native loop, `keepAlive`, src=`menu-theme.ogg`), `combatMusic` (manual loop, src set per-mission via `loadTrack`), `shopMusic` (native loop, src set per-shop via `loadTrack`). All register under `"music"` (`music.ts:107`). Self-healing watchdog (`:271-278`), retry-on-rejection (`:263-269`), visibility listener (`:280-285`), `pause`-event handler (`:242`). 441 LOC. | `./AudioBus`. | `phaser/scenes/CombatScene.ts:14`, `components/GameCanvas.tsx:8`, `components/MenuMusic.tsx:4`, `components/ShopUI.tsx:16`, `components/story/StoryModal.tsx:6`. | Three singletons born at module load. Each registers with the bus and (in `init()`) attaches DOM event listeners + a 2 s `setInterval` watchdog. | Stable; god-file watch (441 LOC). |
| `src/game/audio/music.test.ts` | 215 LOC. | vitest, `./__tests__/fakeAudio`. | — | Test-only. | Test surface. |
| `src/game/audio/sfx.ts` | Procedural Web-Audio combat SFX (`laser` / `explosion` / `hit` / `pickup`). Owns `masterGain → ctx.destination` chain; per-call subchains terminate at `this.sink`; `autoDispose(stopper, ...rest)` GC discipline (`sfx.ts:26-31`). Registers under `"sfx"` (`:54`). 185 LOC. | `./AudioBus`. | `phaser/scenes/CombatScene.ts:13`, `phaser/scenes/combat/{DropController,PerkController}.ts`, `phaser/entities/player/{PlayerCombatant,PlayerFireController}.ts`. | Construct registers with bus; AudioContext lazily allocated on first sound (`ensureCtx` `:61`). | Stable. |
| `src/game/audio/sfx.test.ts` | 177 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/story.ts` | StoryModal cinematics (music bed + delayed voice). `play({musicSrc, voiceSrc, voiceDelayMs})` / `stop()`. Registers under `"music"` (`:44`) — TODO comment about future voice-category split (`:36-43`). 198 LOC. | `./AudioBus`. | `components/story/StoryModal.tsx:5`, `components/loadout/{WeaponDetailsModal,AugmentDetailsModal}.tsx`, `components/ShopUI.tsx:17`, `components/hooks/useStoryTriggers.ts:14`. | Lazily constructs Audio elements on `play()`. | Stable. |
| `src/game/audio/story.test.ts` | 143 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/storyLogAudio.ts` | Story-log music bed singleton. `play()` (no-op if already playing) / `stop()`. Registers under `"music"` (`:23`). 91 LOC. | `./AudioBus`. | `components/hooks/useStoryTriggers.ts:15`. | Constructs Audio on `play()`. | Stable. |
| `src/game/audio/storyLogAudio.test.ts` | 68 LOC. | vitest. | — | Test-only. | Test surface. |
| `src/game/audio/__tests__/fakeAudio.ts` | 384 LOC hand-rolled fakes for HTMLAudioElement / AudioContext / window/document — used by every audio engine's tests. | vitest. | (consumed via vi.mock in audio test files). | Test-only; replaces globals on install. | Test infrastructure. |

---

## Zone-level observations

### Sub-zone: data

**Catalog accessor pattern.** Every JSON-backed accessor follows the same
shape (`enemies.ts`, `obstacles.ts`, `weapons.ts`, `missions.ts`,
`solarSystems.ts`, `waves.ts`):

```ts
import data from "./<name>.json";
const ALL: readonly XDefinition[] = (data as { ... }).<key>;
const BY_ID: ReadonlyMap<XId, XDefinition> = new Map(ALL.map(...));
export function getX(id): XDefinition { ... }
export function getAllX(): readonly XDefinition[] { return ALL; }
```

Each file does **exactly one** `as` cast at module load (no Zod) — see
`enemies.ts:12`, `weapons.ts:12`, `obstacles.ts:12`, `missions.ts:19`,
`solarSystems.ts:12`, `waves.ts:12`. This is the documented "no Zod in
client bundle" pattern (CLAUDE.md §5 game-code rules + §11).

**Where the runtime Zod parse is** — `src/game/data/__tests__/jsonSchemaValidation.test.ts`
runs `lib/schemas/<name>FileSchema.parse(<name>Data)` once per `npm test`
(`jsonSchemaValidation.test.ts:35-57`). CI is the drift gate; tests in
`data.test.ts` add structural sanity (formation kinds, behaviors, unique
ids) on top.

**Where `runDataIntegrityCheck` is wired in.** Live invocation at the
bottom of `data/missions.ts:52` —
`runDataIntegrityCheck(buildLiveIntegrityData(ALL_MISSIONS))`. Because
`missions.ts` is the most universally-imported data accessor (12+ call
sites per its own header comment), every consumer of mission data
implicitly trips the check at boot. Tests at `data/integrityCheck.test.ts`
(472 LOC) inject synthetic data via the parameterized `IntegrityData`
shape (`integrityCheck.ts:76-86`) to exercise failure paths without
breaking live data.

**Locked content invariants.**
- Every JSON file has a sibling Zod schema in `lib/schemas/` (out of
  zone) and a sibling `it(...)` row in
  `data/__tests__/jsonSchemaValidation.test.ts`.
- Every `*Id` field that crosses collection boundaries is checked by
  `integrityCheck.ts` (15 cross-refs enumerated `integrityCheck.ts:18-32`;
  the comment block explicitly lists what's NOT covered, `:44-54`).
- `missionWeaponRewards.ts:18-28` — total bidirectional mapping
  (every mission-kind mission has exactly one weapon; every weapon has
  exactly one source mission), enforced by
  `missionWeaponRewards.test.ts`.
- `WEAPON_IDS` (`weapons.ts:20-27`) is `as const` and lockstep-enforced
  with `lib/schemas/save.ts`'s `z.enum` over the same ids — the comment
  says the save-schema test enforces structural equality.
- `STORY_ENTRIES` is a literal readonly array (`story.ts:99-258`) that
  also feeds the integrity check (`integrityCheck.ts:294-332`).

### Sub-zone: state

**GameState barrel re-exports + slices.** `state/GameState.ts` is 9 LOC;
re-exports `stateCore` / `shipMutators` / `persistence` / `pricing`
verbatim. Phaser scenes use `import * as GameState from "@/game/state/GameState"`
(`phaser/scenes/CombatScene.ts:10`); React UI uses named imports off the
same barrel. Don't break the barrel — it's load-bearing for
backwards compatibility, per its own comment (`GameState.ts:1-4`).

**Save round-trip components.**
- `state/persistence.ts` (orchestrator: `toSnapshot` / `hydrate` / `migrateShip`).
- `state/persistence/{helpers,legacyShared,types}.ts` (shared invariants).
- `state/persistence/{migrateNewShape,migrateLegacyIdArray,migrateNamedSlots,migratePrimaryWeapon}.ts` (per-shape migrators).
- `state/persistence/safetyNet.ts` (empty-ship → starter weapon).
- `state/persistence/salvageRemovedWeapons.ts` (refund path for catalog drops; `REMOVED_WEAPON_BASE_COSTS` table).
- `state/sync.ts` (network: `loadSave`/`saveNow`/`flushSaveQueue`/`drainScoreQueue`).
- `state/syncCache.ts` (module-level cache: `cached`, `inflight`, `lastLoadResult`, `hydrationCompleted`, `currentPlayerEmail`).
- `state/saveQueue.ts` (localStorage durability: `markSavePending`/`flushPendingSave`).
- `state/scoreQueue.ts` (localStorage durability for leaderboard).

**What is INTENTIONALLY not persisted.**
- `unlockedSolarSystems` is in `GameStateShape` (`stateCore.ts:29`) and IS
  serialized in `StateSnapshot` (`persistence.ts:39`), but `hydrate`
  retroactively backfills it from `completedMissions` × `SYSTEM_UNLOCK_GATES`
  every load (`persistence.ts:78-86`). The comment makes the rationale
  explicit: an old save predating the gate code can still catch up
  without a one-shot migration.
- `INITIAL_STATE.unlockedPlanets` is computed once at module load from
  `MISSIONS.filter(m => m.requires.length === 0)` (`stateCore.ts:35-37`),
  so the initial unlock set tracks the catalog automatically.
- The seen-story set merges localStorage + server (`persistence.ts:96-104`,
  `INITIAL_STATE` seed at `stateCore.ts:58`) — neither alone is
  authoritative.
- Mute state is not persisted at all (CLAUDE.md §4 rule; `AudioBus` carries
  no localStorage I/O).

**`useGameState` hook surface.** `state/useGameState.ts:6` —
`useSyncExternalStore(subscribe, () => selector(getState()), () => selector(getState()))`.
12 LOC, pure adapter. 9 component-side callers across `components/` and
`components/loadout/` and `components/galaxy/`.

### Sub-zone: three

`SceneRig.ts` (105 LOC, factory) is the centerpiece — both `GalaxyScene`
and `LandingScene` build through it. The split is deliberate: `GalaxyScene`
adds `CameraController` + raycaster + click handlers; `LandingScene`
substitutes an inline auto-orbit camera with off-axis projection
(`LandingScene.ts:146-153`) to keep the sun out of the central UI column.

**Planet rendering.** `Planet.ts` builds: `geometry` (SphereGeometry 64×48
at `radius`), `material` (MeshStandardMaterial with diffuse + bump from
`generatePlanetSurface`), `outlineGeometry` (back-side mesh for hover
glow), optional `ring` (RingGeometry 192-segment + procedural canvas
texture from `createRingTexture`, `Planet.ts:34-118`), `label` (Sprite via
`createLabelTexture`). Per-mission palette overrides at
`Planet.ts:24-29` (`MISSION_COLOR_OVERRIDE`).

**Sun tinting.** `Sun.ts:31-37` — `sunColor` from `solarSystems.json` →
`coreColor` (mesh tint) → `haloColor` (×0.85) → `lightColor` (lerp toward
white) so planet shading reads as a believable key light regardless of
star tint. `BASE_SUN_RADIUS = 1.6` × `opts.sizeScale`.

**Planet texture generators.** `planetTexture.ts:35-147` —
`styleFor(missionId)` is a hard-coded per-mission style table covering
every shipped mission (`tutorial`, `combat-1`, `boss-1`, `shop`, `market`,
`tubernovae-outpost`, `pirate-beacon`, `ember-run`, `burnt-spud`).
**The switch is not exhaustive** — a new mission id will fall through to
`undefined` and crash `paintDiffuse` with `Cannot read properties of undefined`
because `style.noiseScale` etc. are dereferenced unconditionally. Cited
as a coupling concern below.

### Sub-zone: audio

**AudioBus + per-engine pattern.** `AudioBus.ts:142` exports the
`audioBus` singleton. Each engine constructor calls
`audioBus.register("music" | "voice" | "sfx", this)` on construct; the
bus calls back `engine.setMuted(isMuted(category))` synchronously on
register and on every state change. Categories today:

| Engine | Path | Category |
|---|---|---|
| `menuMusic` / `combatMusic` / `shopMusic` | `audio/music.ts:418-440` | `music` |
| `storyAudio` | `audio/story.ts:198` | `music` (TODO at `:36-43`: split bed vs voice when category sliders ship) |
| `storyLogAudio` | `audio/storyLogAudio.ts:91` | `music` |
| `menuBriefingAudio` | `audio/menuBriefingAudio.ts:125` | `voice` |
| `leaderboardAudio` | `audio/leaderboardAudio.ts:72` | `voice` |
| `itemSfx` | `audio/itemSfx.ts:111` | `voice` |
| `sfx` | `audio/sfx.ts:185` | `sfx` |

**Mute fan-out.** UI flips state via `audioBus.setMasterMuted(boolean)`
(`MuteToggle.tsx:4` is the single producer). The bus's
`applyDiff(before)` (`AudioBus.ts:125-131`) computes per-category
effective-mute deltas and calls `engine.setMuted(after)` on every engine
in changed categories. `setAllMuted`-style fan-out hubs are explicitly
forbidden (CLAUDE.md §4 audio entry).

**Per-engine call-site couplings (out of zone).** `music.ts` is fired
from React (`MenuMusic.tsx`, `GameCanvas.tsx`, `ShopUI.tsx`,
`StoryModal.tsx`) AND Phaser (`CombatScene.ts:14`). `sfx.ts` is fired
from Phaser only (`CombatScene.ts:13`,
`PlayerCombatant.ts:10`, `PlayerFireController.ts:3`,
`DropController.ts:4`, `PerkController.ts:2`). `itemSfx.ts` is fired
from both (`DropController.ts:5`, `VictoryModal.tsx:5`, `ShopUI.tsx:15`).
`story.ts` is fired from both (loadout modals + Phaser-adjacent
`useStoryTriggers`).

### Cross-zone couplings (out of zone C)

**Into `src/lib/schemas/*` (Zod parsers).**
- `src/game/data/__tests__/jsonSchemaValidation.test.ts:27-32` — pulls
  `EnemiesFileSchema`, `MissionsFileSchema`, `ObstaclesFileSchema`,
  `SolarSystemsFileSchema`, `WavesFileSchema`, `WeaponsFileSchema`. Test-only.
- `src/game/state/sync.ts:236` — **dynamic** `import("@/lib/schemas/save")`
  for `RemoteSaveSchema`. The dynamic import is intentional (Zod isolation;
  bundle savings ~98 kB on landing per `syncCache.ts:5-31`).

**No state code statically imports a Zod schema** — verified by the
grep above. `saveQueue.ts:75-81` justifies the hand-rolled
`isPendingSave` validator on the same grounds.

**Into `src/lib/db.ts`.** None. State code talks to `/api/save` and
`/api/leaderboard` over fetch (`sync.ts:176`, `sync.ts:353`,
`sync.ts:459`); Kysely never appears in zone C.

**Into `src/types/game.ts`.** Heavy. 47 zone files import from
`@/types/game` per the grep. Type-only — `Type` annotations on
function signatures, no runtime imports.

**Into `src/components/` (audio engines fired from React effects).**
Verified call sites:
- `components/GameCanvas.tsx:8` — `combatMusic, menuMusic` from `music`.
- `components/MenuMusic.tsx:4` — `menuMusic` from `music`.
- `components/ShopUI.tsx:15-17` — `itemSfx`, `menuMusic`, `shopMusic`, `storyAudio`.
- `components/story/StoryModal.tsx:5-6` — `storyAudio`, `menuMusic`.
- `components/MuteToggle.tsx:4` — `audioBus`.
- `components/LeaderboardBriefing.tsx:4` — `leaderboardAudio`.
- `components/PlayButton.tsx:7` — `menuBriefingAudio`.
- `components/MenuBriefing.tsx:4` — `menuBriefingAudio`.
- `components/loadout/{AugmentDetailsModal,WeaponDetailsModal}.tsx` — `storyAudio`.
- `components/galaxy/VictoryModal.tsx:5` — `itemSfx`.
- `components/hooks/useStoryTriggers.ts:14-15` — `storyAudio`, `storyLogAudio`.

**Into `src/game/phaser/` (state mutators called from Phaser scenes).**
- `phaser/scenes/CombatScene.ts:10` — namespace import `* as GameState`
  (uses every barrel-re-exported function).
- `phaser/scenes/CombatScene.ts:16` — `applyMissionReward, rollMissionReward` from `state/rewards`.
- `phaser/scenes/combat/DropController.ts:3,19` — `* as GameState`, `ownsAnyOfType`.
- `phaser/entities/Player.ts:6` — `ShipConfig`, `WeaponInstance` types.
- `phaser/entities/player/{PlayerCombatant,PlayerFireController,PodController,SlotModResolver}.ts` — `ShipConfig` types + helpers.
- `phaser/config.ts:2` — `MissionReward` type.

**Audio engines fired from Phaser scenes (for completeness).**
- `phaser/scenes/CombatScene.ts:13-14` — `sfx`, `combatMusic`.
- `phaser/scenes/combat/DropController.ts:4-5` — `sfx`, `itemSfx`.
- `phaser/scenes/combat/PerkController.ts:2` — `sfx`.
- `phaser/entities/player/PlayerCombatant.ts:10` — `sfx`.
- `phaser/entities/player/PlayerFireController.ts:3` — `sfx`.

### God-files (>300 LOC)

- `src/game/data/integrityCheck.ts` — 351 LOC. Justified: 15 distinct
  cross-ref walks + Levenshtein typo suggester; splitting along
  collection axes would force every walk to re-import the same Set/Map
  helpers. Worth flagging in Phase 2 anyway: per-collection split
  (`checks/missions.ts`, `checks/lootPools.ts`, etc.) might cleanly
  separate failure-path tests.
- `src/game/state/shipMutators.ts` — 366 LOC. 13 exported mutators + a
  shared `applyLevelUpgrade` engine. Loose coupling between weapon-CRUD
  (8 functions) and stat-upgrade-CRUD (5 functions); a split along that
  seam is plausible.
- `src/game/state/saveQueue.ts` — 346 LOC. Single-slot durability is one
  concern; the file's heft is documentation + per-error-code branching.
- `src/game/state/scoreQueue.ts` — 355 LOC. Multi-entry queue; concerns
  comparable to `saveQueue.ts`.
- `src/game/state/sync.ts` — 516 LOC. Owns `loadSave`, `saveNow`,
  `flushSaveQueue`, `drainScoreQueue`, error humanization, retry policy,
  AND the `LoadResult`/`LoadResultKind`/`LoadFailureReason`/`SyncResult`
  type unions. Plausible split: `loadSave` + types into one file,
  `saveNow` + queue glue into a second, error humanization into a third.
- `src/game/audio/music.ts` — 441 LOC. Single `MusicEngine` class with
  watchdog + retry + visibility scaffolding. The class itself is
  cohesive; the 3 exported singletons are configuration. A split along
  "engine vs configuration" feels artificial — flag for Phase 2 review.
- `src/game/three/Planet.ts` — 341 LOC. Procedural ring texture
  (`createRingTexture` `:34-118`) + UV remap (`remapRingUVs` `:125-143`)
  could move out to `ringTexture.ts` mirror of `planetTexture.ts` and
  `labelTexture.ts`.
- `src/game/three/planetTexture.ts` — 405 LOC. Self-contained noise +
  diffuse + bump generator with hard-coded per-mission `styleFor` table.

Tests over 300 LOC are not flagged as god-files (they're allowed to grow
with the surface they cover). Notable: `state/sync.test.ts` 871 LOC,
`state/GameState.test.ts` 880 LOC, `state/saveQueue.test.ts` 482 LOC,
`audio/AudioBus.test.ts` 233 LOC, `audio/__tests__/fakeAudio.ts` 384 LOC.

### Suspected accidental coupling

1. **`stateCore.ts:33` runs `getAllMissions()` at module load**, which
   triggers `runDataIntegrityCheck` via `data/missions.ts:52`. So
   importing `state/stateCore` (or transitively `GameState` /
   `useGameState`) — anywhere — runs the data drift check. This is the
   intended design (`integrityCheck.ts:144-150` documents "every consumer
   of any mission/wave/loot data triggers it before they read"), but it's
   an implicit dependency that's easy to miss.

2. **`stateCore.ts:58` calls `readSeenStoriesLocal()` at module load**
   (inside the `INITIAL_STATE` literal). This is a localStorage read
   side-effect at module load — surprising for a "pure types + state"
   module, and one of two places that touches storage on cold start.

3. **`Sun.ts` and `solarSystems.json` are coupled by the tint pipeline.**
   `Sun.ts:31-37` reads `opts.coreColor`/`opts.sizeScale`; `SceneRig.ts:70`
   wires `sunColor`/`sunSize` from `getSolarSystem(opts.activeSystemId)`.
   Adding a new solar system without `sunColor` would default to
   `DEFAULT_CORE_COLOR` (`Sun.ts:5`); this is undocumented in the schema
   side. Not a bug today (Zod schema enforces presence) but a subtle
   drift surface.

4. **`planetTexture.ts:35-147` `styleFor` switch is not exhaustive.** New
   mission ids in `missions.json` will not get a style entry, and the
   downstream `paintDiffuse` will deref `style.noiseScale` on `undefined`
   and crash. The integrity check doesn't cover this — sprite generation
   is explicitly listed as out-of-scope (`integrityCheck.ts:50-53`).

5. **Audio engines are called from BOTH React and Phaser.** `music.ts`,
   `itemSfx.ts`, `sfx.ts`, `story.ts` all have call sites in both
   `components/` and `phaser/scenes/`. The bus + module-level singletons
   make this work, but it ties two render paths to the same global
   playback state. A future audio-context teardown (e.g. for a settings
   panel) would have to coordinate across both consumers.

6. **`saveQueue.ts` and `scoreQueue.ts` duplicate a near-identical retry
   policy** (MAX_ATTEMPTS=50, MAX_AGE_MS=30 days, `inflightFlush`/
   `inflightDrain` slot, schema-mismatch removeItem, transient-vs-permanent
   `isPermanent` switch). Convergence is plausible but each has one
   irreducible specialization (single-slot vs multi-entry; account stamp
   vs no-stamp) so the duplication is partially intentional.

7. **`state/sync.ts:264` casts the parsed Zod payload through `as unknown as`**
   into `StateSnapshot["ship"]`. The Zod schema accepts both new and
   legacy ship shapes via union; `hydrate()` → `migrateShip` does the
   runtime narrowing. The double-cast is justified (and commented) but
   it's the "trust runtime validation" pattern that needs a sibling
   regression test if the union ever drifts from the migrators.

### Cycles inside the zone

**data ↔ data:**

- `data/missions.ts` → `data/integrityCheck.ts` →
  (`data/enemies` + `data/solarSystems` + `data/weapons` + `data/augments` +
  `data/lootPools` + `data/waves` + `data/missionWeaponRewards` +
  `data/story`) — this is a fan-out from missions to every other
  collection, but **no edge points back to `data/missions`** at the
  module-load layer. Cycle is broken by passing `ALL_MISSIONS` as a
  parameter (`integrityCheck.ts:144-149` documents the rationale).
  No actual cycles.

- `data/missionWeaponRewards.ts:15` imports `data/weapons` →
  `data/weapons` does not import `data/missionWeaponRewards`. No cycle.

- `data/storyTriggers.ts:3` imports `data/missions` → `data/missions`
  does not import `data/storyTriggers`. No cycle.

**state ↔ state:**

- `stateCore.ts` ↔ `seenStoriesLocal.ts`: stateCore re-exports
  `readSeenStoriesLocal` (`stateCore.ts:11-15`) and calls it inside
  `INITIAL_STATE` (`:58`). seenStoriesLocal does not import stateCore.
  No cycle.

- `state/persistence.ts` ↔ `state/persistence/*`: persistence.ts imports
  the migrators; the migrators import only `helpers`/`types`/`legacyShared`
  and `ShipConfig`. No cycle.

- `state/shipMutators.ts` ↔ `state/stateCore.ts`: shipMutators imports
  `commit`/`getState`/`spendCredits` from stateCore (`shipMutators.ts:22`);
  stateCore does not import shipMutators. No cycle.

- `state/rewards.ts` ↔ `state/shipMutators.ts`: rewards imports the grant
  functions (`rewards.ts:19-26`); shipMutators does not import rewards.
  No cycle.

- `state/sync.ts` ↔ `state/syncCache.ts`: sync imports cache surface;
  cache does not import sync (typed as `unknown` to keep Zod out).
  Documented as the entire reason for the split (`syncCache.ts:5-31`).
  No cycle.

- `state/GameState.ts` (barrel) — re-exports only; nothing reaches back.

**state ↔ data:**

- state files import data freely: `stateCore.ts:1` → `data/missions`,
  `stateCore.ts:7` → `data/story`, `state/persistence.ts:1-2` →
  `data/solarSystems`+`data/story`, `shipMutators.ts:19-20` →
  `data/weapons`+`data/augments`, `rewards.ts:14-16` →
  `data/augments`+`data/lootPools`+`data/weapons`,
  `persistence/helpers.ts:2,7` → `data/weapons`+`data/augments`,
  `persistence/salvageRemovedWeapons.ts:17-18` →
  `data/weapons`+`data/augments`, `persistence/legacyShared.ts` (no — uses helpers instead).

- **No data file imports a state file.** Verified by the grep
  (`from "@/game/state/"` shows zero matches under `src/game/data/`).
  The data layer is strictly upstream of state. No cycles.

### Side effects

**Module-load JSON parses (via JSON `import` only).** Every file in
`src/game/data/` that imports a `.json` does it at module top —
`enemies.ts:9`, `obstacles.ts:9`, `weapons.ts:9`, `missions.ts:12`,
`solarSystems.ts:12`, `waves.ts:12`. These are bundler-resolved, not
network reads.

**Module-load function calls.** Two:
- `state/stateCore.ts:33` — `getAllMissions()` triggers
  `runDataIntegrityCheck` via `data/missions.ts:52`.
- `state/stateCore.ts:58` — `readSeenStoriesLocal()` reads localStorage.

**localStorage I/O at fn invocation.**
- `state/seenStoriesLocal.ts:13,28` — `read*`/`write*`.
- `state/saveQueue.ts:128, 141, 156, 181, 192` —
  `LEGACY_STORAGE_KEY`/`STORAGE_KEY` read/write/remove.
- `state/scoreQueue.ts:124, 158, 172` — `STORAGE_KEY` read/write/remove.

**Network fetches.** `state/sync.ts:176` (`/api/save` GET),
`sync.ts:353` (`/api/save` POST), `sync.ts:459` (`/api/leaderboard` POST).

**Audio init.** Every audio engine constructor calls
`audioBus.register(...)` at module load (the `export const X = new XEngine()`
pattern in each file). The bus itself is a module-level singleton at
`AudioBus.ts:142`. AudioContext is lazy — `sfx.ts:67` constructs it on
first sound only. HTMLAudioElement instances are lazy in every engine
EXCEPT `music.ts`'s `menuMusic`, which becomes persistent via `init()`
+ `keepAlive: true` (the comment at `music.ts:415-422` documents this
as the only persistent element to stay under iOS's ~6-element budget).

**Three.js renderer setup.** `three/SceneRig.ts:54-87` constructs
`WebGLRenderer`, `Scene`, `FogExp2`, `Starfield`, `Sun`, ambient +
directional lights, and adds Planet/Station instances on construct.
`GalaxyScene` and `LandingScene` add DOM event listeners and an RAF
loop on `start()`. Module-level `cachedStarSprite` in
`Starfield.ts:76` is allocated lazily on first `Starfield`
construction.

**No setTimeout/setInterval at module load** anywhere in the zone —
every timer fires inside a method (`menuBriefingAudio.ts`'s
`setTimeout`, `music.ts:274`'s watchdog `setInterval`, etc.).

### Save round-trip surface — files that participate

Walking the 8-layer skill mental model (snapshot interface → toSnapshot →
POST schema → POST handler → DB column → migration → GET handler →
RemoteSaveSchema → loadSave → hydrate), the zone-C side of that pipeline
is:

- `src/game/state/persistence.ts` — `StateSnapshot` interface
  (`persistence.ts:31-41`) — wire format.
- `src/game/state/persistence.ts` — `toSnapshot()` — serializer.
- `src/game/state/persistence.ts` — `hydrate()` — deserializer +
  retroactive `unlockedSolarSystems` backfill + seen-story merge.
- `src/game/state/persistence.ts` — `migrateShip()` — dispatch by shape.
- `src/game/state/persistence/types.ts` — `LegacyShipSnapshot` —
  permissive boundary type for migrate input.
- `src/game/state/persistence/migrateNewShape.ts` — current-shape migrator.
- `src/game/state/persistence/migrateLegacyIdArray.ts` — legacy id-array migrator.
- `src/game/state/persistence/migrateNamedSlots.ts` — four-named-slot migrator.
- `src/game/state/persistence/migratePrimaryWeapon.ts` — pre-loadout migrator.
- `src/game/state/persistence/safetyNet.ts` — empty-ship guard.
- `src/game/state/persistence/salvageRemovedWeapons.ts` — pre-migration
  refund (`calculateLegacyRefund`) + post-migration cleanup
  (`salvageRemovedWeapons`); `REMOVED_WEAPON_BASE_COSTS` table.
- `src/game/state/persistence/helpers.ts` — `clampLevel` /
  `clampUpgradeLevel` / `sanitizeAugmentList` / `isKnownWeapon` /
  `isKnownAugment` / `buildInstance` / `looksLikeInstance`.
- `src/game/state/persistence/legacyShared.ts` — `assignSlotsFromPool`
  shared by 3 of the 4 migrators.
- `src/game/state/stateCore.ts` — `INITIAL_STATE` (the hydrate
  fall-through baseline), `commit()`, `GameStateShape`,
  `SYSTEM_UNLOCK_GATES` map (consumed by hydrate's backfill).
- `src/game/state/seenStoriesLocal.ts` — local backup of seen-story IDs;
  read by hydrate (`persistence.ts:103`) and by `INITIAL_STATE`
  (`stateCore.ts:58`).
- `src/game/state/sync.ts` — `loadSave` / `saveNow` / `flushSaveQueue`
  / `drainScoreQueue`; the `LoadResult` discriminated union; the
  dynamic Zod import at `:236` for `RemoteSaveSchema`.
- `src/game/state/syncCache.ts` — `cached` / `inflight` /
  `lastLoadResult` / `hydrationCompleted` / `currentPlayerEmail` slots
  + getters/setters; `markHydrationCompleted` gates `saveNow`.
- `src/game/state/saveQueue.ts` — single-slot localStorage durability
  (`spacepotatis:pendingSave:v2`), `markSavePending` /
  `flushPendingSave` / `clearSaveQueue` / `readPendingSaveForTest` /
  `SAVE_QUEUED_MESSAGE` / `PendingSave` shape with `playerEmail` stamp;
  legacy `:v1` purge.
- `src/game/state/scoreQueue.ts` — multi-entry localStorage durability
  (`spacepotatis:scoreQueue:v1`) for leaderboard; `enqueueScore` /
  `drainScoreQueue` / `clearScoreQueue` / `QUEUED_MESSAGE`.
- `src/game/data/storyTriggers.ts` — pure helpers driving the
  seen-story update path (used by `useStoryTriggers` to decide what
  to mark seen via `markStorySeen` → commit → POST).
- Tests of every layer: `state/persistence/{migrate*,salvage*,safetyNet}.test.ts`,
  `state/persistence/salvageInvariants.test.ts`,
  `state/{sync,saveQueue,scoreQueue,syncCache}.test.ts`,
  `state/GameState.test.ts`, `state/seenStoriesLocal.test.ts`.

Out of zone (referenced for completeness): `src/lib/schemas/save.ts`
(POST/GET schemas), `src/app/api/save/route.ts` (the handler,
`writeSaveAudit`), `src/lib/saveValidation.ts` (cheat guards +
`validateNoRegression`), `src/lib/db.ts` (Database interface +
`save_audit` table), `src/components/SaveLoadErrorOverlay.tsx`,
`src/components/hooks/useCloudSaveSync*.ts`, the
`db/migrations/*.sql` files for `seen_story_entries` /
`current_solar_system_id` / `unlocked_solar_systems` / `save_audit`.

---

# Zone D — infrastructure (lib + db + scripts + configs) (verbatim)

# Phase 1 — Zone D: infrastructure (lib + db + scripts + configs)

Read-only inventory. Cites `path:line`. No proposals — those are Phase 2.

## File-by-file inventory

### Sub-zone: src/lib/ (auth + db client + leaderboard + handle + cheat guards)

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|------|---------|---------|-------------|--------------|-------------------|
| `src/lib/db.ts` (104 LOC) | Kysely client; `Database` interface = canonical schema mirror; `getDb()` lazy singleton over Neon `Pool`. | `kysely`, `@neondatabase/serverless` | `src/app/api/save/route.ts:4`, `src/app/api/leaderboard/route.ts:4`, `src/app/api/handle/route.ts:4`, `src/lib/players.ts:1`, `src/lib/leaderboard.ts:3`, `src/types/database.ts:3` | Lazy module-scope `_db` singleton (`db.ts:83`). Throws if `DATABASE_URL` unset (`db.ts:89`). | Public: `getDb`, `Database`, `PlayersTable`, `SaveGamesTable`, `LeaderboardTable`, `SaveAuditTable`. |
| `src/lib/db.test.ts` (200 LOC) | Compiles Kysely query shapes against the `spacepotatis.*` schema using a fake pool — `.compile()` only, no DB roundtrip. Asserts the SQL strings + parameter arrays for every important query in `app/api`. | `vitest`, `kysely`, `./db` | (test) | None. | n/a |
| `src/lib/auth.ts` (32 LOC) | NextAuth v5 / Auth.js bootstrap: Google provider, JWT session, `jwt`/`session` callbacks copy `profile.email` through. | `next-auth`, `next-auth/providers/google` | `src/app/api/auth/[...nextauth]/route.ts:1`, `src/app/api/save/route.ts:3`, `src/app/api/leaderboard/route.ts:3`, `src/app/api/handle/route.ts:3` | Module-load: instantiates NextAuth (`auth.ts:11`); reads `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` env at import time. | Public: `handlers`, `auth`, `signIn`, `signOut`. |
| `src/lib/auth.test.ts` (123 LOC) | Mocks `next-auth` + `next-auth/providers/google`, asserts the captured config: providers, JWT strategy, jwt + session callback wiring. | `vitest` | (test) | None. | n/a |
| `src/lib/authCache.ts` (63 LOC) | localStorage snapshot of last auth state (status / handle / hasSave) for optimistic-render on page reload. SSR-guarded by `typeof window === "undefined"`. | (none) | `src/lib/useReliableSession.ts:5`, `src/lib/useOptimisticAuth.ts:4-7`, `src/components/SignInButton.tsx:4` | Touches `window.localStorage` via key `spacepotatis:auth` (`authCache.ts:9`). | Public: `readAuthCache`, `writeAuthCache`, `clearAuthCache`, type `AuthSnapshot`. |
| `src/lib/authCache.test.ts` (106 LOC) | Stubs a `MemoryStorage` on `globalThis.window`; round-trip + schema-version + malformed-input + SSR-safety. | `vitest`, `./authCache` | (test) | Mutates `globalThis.window`. | n/a |
| `src/lib/handle.ts` (24 LOC) | Pure validator for the public-facing handle (length 3-16, regex `[a-zA-Z0-9_-]`). Standalone so client form + API + Zod schema share one rule. | (none) | `src/lib/schemas/handle.ts:9-13`, `src/components/HandlePrompt.tsx:8` | None. | Public: `validateHandle`, `HANDLE_MIN_LENGTH`, `HANDLE_MAX_LENGTH`, `HANDLE_PATTERN`, type `HandleValidation`. |
| `src/lib/handle.test.ts` (48 LOC) | Pure-function tests of `validateHandle`. | `vitest`, `./handle` | (test) | None. | n/a |
| `src/lib/leaderboard.ts` (127 LOC) | Two `unstable_cache`-wrapped queries: per-mission leaderboard + composite "Top Pilots" join across players + save_games + leaderboard. Single tag `LEADERBOARD_CACHE_TAG = "leaderboard"` (`leaderboard.ts:10`). | `next/cache`, `kysely`, `@/lib/db`, `@/types/game`, `./leaderboardMapper` | `src/app/api/leaderboard/route.ts:5`, `src/components/Leaderboard.tsx:2`, `src/components/TopPilots.tsx:1` | Wraps queries in `unstable_cache` at module load (`leaderboard.ts:57-61`, `123-127`). | Public: `LEADERBOARD_CACHE_TAG`, `getCachedLeaderboard`, `getCachedTopPilots`, types `LeaderboardEntry`, `PilotEntry`. |
| `src/lib/leaderboard.test.ts` (300 LOC) | Mocks `next/cache.unstable_cache` + the Kysely chain via Proxy fakes; asserts cache TTL/tags/keys + the query chain produced by both fetchers. | `vitest` | (test) | None at runtime; mocks `next/cache`. | n/a |
| `src/lib/leaderboardMapper.ts` (25 LOC) | Pure row → `PilotEntry` mapper. Coerces `bigint`/string Postgres returns through `Number()`. Handle null → `"Pilot"` fallback. | `./leaderboard` (type-only) | `src/lib/leaderboard.ts:5` | None. | Public: `mapRowToPilot`, type `TopPilotsRow`. |
| `src/lib/leaderboardMapper.test.ts` (99 LOC) | Pure-function row mapping including bigint + null handle cases. | `vitest`, `./leaderboardMapper` | (test) | None. | n/a |
| `src/lib/players.ts` (20 LOC) | `upsertPlayerId(email, name)` — read-then-insert helper. | `./db` | `src/app/api/save/route.ts:5`, `src/app/api/leaderboard/route.ts:6`, `src/app/api/handle/route.ts:5` | Issues `SELECT` + conditional `INSERT` on `spacepotatis.players`. | Public: `upsertPlayerId`. |
| `src/lib/players.test.ts` (90 LOC) | Mocks `./db` via Proxy chain; asserts both branches (existing email returns id, new email inserts). | `vitest` | (test) | None at runtime; mocks `./db`. | n/a |
| `src/lib/routes.ts` (19 LOC) | Frozen `ROUTES` constant: `api.save`, `api.handle`, `api.leaderboard`, `page.{home,play,shop,leaderboard}`. | (none) | `src/lib/useHandle.ts:4`, `src/components/PlayButton.tsx:8`, `src/components/HandlePrompt.tsx:9`, `src/components/SaveLoadErrorOverlay.tsx:17`, `src/components/GameCanvas.tsx:31`, `src/game/state/sync.ts:15` | None. | Public: `ROUTES`. |
| `src/lib/saveValidation.ts` (440 LOC) | Server-side cheat guards: `validateMissionGraph`, `validateCreditsDelta`, `validatePlaytimeDelta`, `validateNoRegression`, plus per-player progression-aware credit caps (`computeCreditCapsForSystems`, `getReachableSolarSystems`, `computeCreditCapsForPlayer`). Constants `CREDITS_DELTA_SLACK`, `PLAYTIME_DELTA_SLACK_SECONDS`, `KILL_CADENCE_CEILING`, `PER_SECOND_SAFETY_FACTOR`, `PER_CLEAR_SAFETY_FACTOR`. Module-load `GLOBAL_CREDIT_CAPS` aggregate + dev-only `console.log` of tutorial floor caps. | `@/game/data/enemies`, `@/game/data/lootPools`, `@/game/data/missions`, `@/game/data/waves`, `@/game/state/stateCore` (`SYSTEM_UNLOCK_GATES`), `@/types/game` | `src/app/api/save/route.ts:7-13` | Module-load: walks `getAllLootPools()` to compute `GLOBAL_CREDIT_CAPS` (`saveValidation.ts:170`); dev-only `console.log` (`saveValidation.ts:156-164`). | Public: `validateMissionGraph`, `validateCreditsDelta`, `validatePlaytimeDelta`, `validateNoRegression`, `computeCreditCapsFor{Player,Systems}`, `getReachableSolarSystems`, plus the constants and types `CreditCaps`, `ValidationResult`, `MissionGraphInput`, `CreditsDeltaSide`, `CreditsDeltaInput`, `PlaytimeDeltaInput`, `RegressionGuardInput`. |
| `src/lib/saveValidation.test.ts` (656 LOC — **god-file**) | Exhaustive coverage of all four validators + cap math. | `vitest`, `./saveValidation` | (test) | None. | n/a |
| `src/lib/saveValidation.dataDrift.test.ts` (60 LOC) | Mocks `@/game/data/waves` to inject an unknown enemy id; asserts the `try/catch` swallow path in `computeCreditCapsForSystems` keeps caps finite. | `vitest`, mocks `@/game/data/waves` | (test) | None at runtime; mocks game/data. | n/a |
| `src/lib/skills.test.ts` (69 LOC) | Pre-commit guard: greps every `.claude/skills/*/SKILL.md` for `src/...` paths and verifies they resolve in the working tree. | `vitest`, `node:fs`, `node:path` | (test) | Reads `.claude/skills/`. | n/a |
| `src/lib/useHandle.ts` (116 LOC) | React hook: fetches `GET /api/handle` once per session via module-level cache + inflight de-dup. Exports `clearHandleCache` for sign-out. | `react`, `@/lib/routes`, `./useReliableSession` | `src/lib/useOptimisticAuth.ts:12`, `src/components/SignInButton.tsx:6` | Module-level mutable `cached` + `inflight` slots (`useHandle.ts:34-35`). | Public: `useHandle`, `clearHandleCache`, types `HandleStatus`, `UseHandleResult`. |
| `src/lib/useOptimisticAuth.ts` (135 LOC) | Composes `useReliableSession` + `useHandle` + `loadSave` into a single `OptimisticAuthResult`. Exports pure decision helper `isAuthVerified`. Reconciles to `authCache` after first verification. | `react`, `./authCache`, `@/game/state/sync`, `@/game/state/syncCache`, `./useHandle`, `./useReliableSession` | `src/components/LandingShell.tsx:7`, `src/components/SignInButton.tsx:5`, `src/components/MenuBriefing.tsx:5`, `src/components/UserMenu.tsx:5`, `src/components/PlayButton.tsx:9`, `src/components/GameCanvas.tsx:32` | None at module load; uses `useEffect` write-back to `authCache` (`useOptimisticAuth.ts:92-103`). | Public: `useOptimisticAuth`, `isAuthVerified`, types `OptimisticAuthStatus`, `OptimisticAuthResult`. |
| `src/lib/useOptimisticAuth.test.ts` (36 LOC) | Pure-function tests of `isAuthVerified` only — the hook itself is uncovered (no jsdom). | `vitest`, `./useOptimisticAuth` | (test) | None. | n/a |
| `src/lib/useReliableSession.ts` (60 LOC) | Wraps `next-auth/react`'s `useSession` with a one-shot retry on `(cache=auth) ∧ (probe=unauth)`. Module-level `retriedThisSession` flag de-dups across consumers. Exports `resetReliableSessionRetry` for tests. | `react`, `next-auth/react`, `./authCache` | `src/lib/useHandle.ts:5`, `src/lib/useOptimisticAuth.ts:13`, `src/components/hooks/useCloudSaveSync.ts:9` | Module-level mutable `retriedThisSession` (`useReliableSession.ts:29`). | Public: `useReliableSession`, `resetReliableSessionRetry`. |

### Sub-zone: src/lib/schemas/ (Zod boundaries)

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|------|---------|---------|-------------|--------------|-------------------|
| `src/lib/schemas/save.ts` (265 LOC) | API-boundary Zod for the save round-trip + leaderboard write. Defines `WeaponInstanceSchema`, `WeaponSlotsSchema`, `WeaponInventorySchema`, `ReactorConfigSchema`, `ShipConfigSchema`, `LegacyShipSchema`, `LegacyOrShipConfigSchema`, `SavePayloadSchema`, `RemoteSaveSchema`, `ScorePayloadSchema`. Mirrors literal unions: `AUGMENT_IDS`, `MISSION_IDS`, `SOLAR_SYSTEM_IDS` + their `z.enum` schemas; re-exports `WEAPON_IDS`. Compile-time drift guards via `_xCheck` casts at end of file. | `zod`, `@/types/game`, `@/game/state/ShipConfig`, `@/game/data/weapons` (`WEAPON_IDS`) | `src/app/api/save/route.ts:6`, `src/app/api/leaderboard/route.ts:7`, `src/lib/schemas/missions.ts:25`, `src/lib/schemas/solarSystems.ts:14`, `src/lib/schemas/waves.ts:22`, `src/lib/schemas/weapons.ts:14` | None at runtime. | Public: all named schemas + the readonly id tuples + types `SavePayload`, `RemoteSave`, `ScorePayload`. |
| `src/lib/schemas/save.test.ts` (585 LOC — **god-file**) | Round-trip every schema with valid + boundary cases; asserts the literal-union tuples equal the TS unions. | `vitest`, `./save`, `@/types/game` | (test) | None. | n/a |
| `src/lib/schemas/handle.ts` (46 LOC) | Zod for `POST /api/handle` body. Trims-then-pipes into length + regex checks. Drift guard at file end pins parsed output to `HandleValidation`'s success branch. | `zod`, `@/lib/handle` | `src/app/api/handle/route.ts:6` | None. | Public: `HandlePayloadSchema`, type `HandlePayload`. |
| `src/lib/schemas/handle.test.ts` (114 LOC) | Round-trip valid + every invalid path (length, regex, missing). | `vitest`, `./handle`, `@/lib/handle` | (test) | None. | n/a |
| `src/lib/schemas/enemies.ts` (82 LOC) | JSON drift gate for `src/game/data/enemies.json`. Source-of-truth `ENEMY_IDS` tuple + `EnemyIdSchema`, `EnemyDefinitionSchema`, `EnemiesFileSchema`. | `zod`, `@/types/game` | `src/game/data/__tests__/jsonSchemaValidation.test.ts:27`, `src/lib/schemas/waves.ts:20` | None. | Public: `ENEMY_IDS`, `EnemyIdSchema`, `EnemyDefinitionSchema`, `EnemiesFileSchema`. |
| `src/lib/schemas/enemies.test.ts` (88 LOC) | Schema unit tests. | `vitest`, `./enemies` | (test) | None. | n/a |
| `src/lib/schemas/missions.ts` (80 LOC) | Drift gate for `src/game/data/missions.json`. Defines `PlanetKindSchema`, `PlanetRingSchema`, `MissionDefinitionSchema`, `MissionsFileSchema`. **Re-exports `MissionIdSchema` + `SolarSystemIdSchema` from `./save`** (cross-schema dependency). | `zod`, `@/types/game`, `./save` | `src/game/data/__tests__/jsonSchemaValidation.test.ts:28` | None. | Public: `MissionDefinitionSchema`, `MissionsFileSchema`. |
| `src/lib/schemas/missions.test.ts` (99 LOC) | Schema unit tests. | `vitest`, `./missions` | (test) | None. | n/a |
| `src/lib/schemas/obstacles.ts` (50 LOC) | Drift gate for `src/game/data/obstacles.json`. `OBSTACLE_IDS` + `ObstacleIdSchema` + `ObstacleDefinitionSchema` + `ObstaclesFileSchema`. | `zod`, `@/types/game` | `src/game/data/__tests__/jsonSchemaValidation.test.ts:29`, `src/lib/schemas/waves.ts:21` | None. | Public: `OBSTACLE_IDS`, `ObstacleIdSchema`, `ObstacleDefinitionSchema`, `ObstaclesFileSchema`. |
| `src/lib/schemas/solarSystems.ts` (44 LOC) | Drift gate for `src/game/data/solarSystems.json`. Pulls `SolarSystemIdSchema` from `./save`. | `zod`, `@/types/game`, `./save` | `src/game/data/__tests__/jsonSchemaValidation.test.ts:30` | None. | Public: `SolarSystemDefinitionSchema`, `SolarSystemsFileSchema`. |
| `src/lib/schemas/solarSystems.test.ts` (72 LOC) | Schema unit tests. | `vitest`, `./solarSystems` | (test) | None. | n/a |
| `src/lib/schemas/waves.ts` (81 LOC) | Drift gate for `src/game/data/waves.json`. Cross-imports `EnemyIdSchema` from `./enemies`, `ObstacleIdSchema` from `./obstacles`, `MissionIdSchema` from `./save`. | `zod`, `@/types/game`, `./enemies`, `./obstacles`, `./save` | `src/game/data/__tests__/jsonSchemaValidation.test.ts:31` | None. | Public: `WaveSpawnSchema`, `ObstacleSpawnSchema`, `WaveDefinitionSchema`, `MissionWavesSchema`, `WavesFileSchema`. |
| `src/lib/schemas/waves.test.ts` (109 LOC) | Schema unit tests. | `vitest`, `./waves` | (test) | None. | n/a |
| `src/lib/schemas/weapons.ts` (67 LOC) | Drift gate for `src/game/data/weapons.json`. Pulls `WeaponIdSchema` from `./save`. | `zod`, `@/types/game`, `./save` | `src/game/data/__tests__/jsonSchemaValidation.test.ts:32` | None. | Public: `WeaponDefinitionSchema`, `WeaponsFileSchema`. |
| `src/lib/schemas/weapons.test.ts` (115 LOC) | Schema unit tests. | `vitest`, `./weapons` | (test) | None. | n/a |

### Sub-zone: src/types/

| Path | Purpose | Imports | Imported by | Side effects | Public API status |
|------|---------|---------|-------------|--------------|-------------------|
| `src/types/game.ts` (235 LOC) | Cross-engine types: `WeaponId`, `AugmentId`, `WeaponFamily`, `WeaponTier`, `WeaponDefinition`, `EnemyId`, `EnemyBehavior`, `EnemyDefinition`, `ObstacleId`, `ObstacleBehavior`, `ObstacleDefinition`, `WaveSpawn`, `ObstacleSpawn`, `WaveDefinition`, `MissionWaves`, `MissionId`, `SolarSystemId`, `SolarSystemDefinition`, `PlanetKind`, `PlanetRing`, `MissionDefinition`. Comment block on line 233-235 explicitly delegates `ShipConfig`/`WeaponSlots`/`ReactorConfig` to `src/game/state/ShipConfig.ts`. | (none) | 50+ files across `src/lib`, `src/lib/schemas`, `src/components`, `src/game/data`, `src/game/state`, `src/game/three`, `src/game/phaser`, `src/app/api` | None. | Public: every literal union + `*Definition` interface listed above. |
| `src/types/database.ts` (3 LOC) | Re-export-only barrel of `Database`, `PlayersTable`, `SaveGamesTable`, `LeaderboardTable` from `@/lib/db`. **`SaveAuditTable` is NOT re-exported here** despite being added in PR #98 — minor drift. | `@/lib/db` (type-only) | (zero hits found in repo grep) | None. | Public: 4 of the 5 db tables. |

### Sub-zone: middleware

There is **no `src/middleware.ts` / `middleware.ts`** in this worktree. The CLAUDE.md §13 forbids unsigned-off middleware; consistent with that, none has shipped.

### Sub-zone: db/migrations/ (timeline)

| File | LOC | Adds | Notes |
|------|-----|------|-------|
| `db/migrations/20260424120000_initial_schema.sql` | 48 | `CREATE SCHEMA spacepotatis`; `pgcrypto`; tables `players`, `save_games`, `leaderboard`; index `leaderboard_mission_score_idx`. | Forward-only; `migrate:down` block included for dbmate compatibility but never used in CI. |
| `db/migrations/20260427000000_add_player_handle.sql` | 20 | Column `players.handle TEXT`; partial unique `players_handle_lower_idx ON LOWER(handle) WHERE handle IS NOT NULL`. | Nullable column → no backfill needed. |
| `db/migrations/20260429000000_add_seen_story_entries.sql` | 11 | Column `save_games.seen_story_entries TEXT[] NOT NULL DEFAULT '{}'`. | This was the migration cited in CLAUDE.md §7a as the 3-day-unapplied incident (PR #89). |
| `db/migrations/20260503000000_add_save_audit.sql` | 41 | Table `save_audit (id BIGSERIAL, player_id UUID FK, slot SMALLINT, request_payload JSONB, response_status SMALLINT, response_error TEXT, prev_snapshot JSONB, request_ip TEXT, user_agent TEXT, created_at TIMESTAMPTZ)`; index `save_audit_player_created_idx`. | Mentioned in `db.ts:25,70-81` as `"spacepotatis.save_audit"` with `SaveAuditTable`. |
| `db/migrations/20260503010000_persist_current_solar_system.sql` | 13 | Column `save_games.current_solar_system_id TEXT` (nullable). | Most recent (2026-05-03 01:00:00 UTC). Mirrored in `db.ts:53`. |

Total: **5 migrations**; most recent `20260503010000_persist_current_solar_system.sql`.

dbmate config: `dbmate.toml` — schema_file `db/schema.sql`, migrations table `public.spacepotatis_schema_migrations` (configured via `migrations_table_name` because the database is shared with other services).

Node-based runner: `scripts/migrate.mjs` (104 LOC, see below). Idempotent — uses `public.spacepotatis_schema_migrations` as a tracker and applies each `migrate:up` block in a `BEGIN / COMMIT` transaction (`migrate.mjs:62-77`).

### Sub-zone: scripts/

| Path | LOC | Purpose | Invocation conditions |
|------|-----|---------|------------------------|
| `scripts/migrate.mjs` | 104 | Tiny dbmate-compatible Node runner. Applies all unapplied `migrate:up` blocks from `db/migrations/*.sql` in transactional order; tracks applied versions in `public.spacepotatis_schema_migrations`. Reads `DATABASE_URL_UNPOOLED` (preferred) or `DATABASE_URL`. | Manual: `node --env-file=.env.local scripts/migrate.mjs`. Wired as `npm run db:migrate:node` (package.json:16). The default `npm run db:migrate` still calls `dbmate up` (package.json:15). |
| `scripts/check-schema.mjs` | 32 | Read-only — lists `public.spacepotatis_schema_migrations` rows + columns of `spacepotatis.save_games`. Used to diagnose 500s on `/api/save` after a migration. | Manual: `node --env-file=.env.local scripts/check-schema.mjs`. |
| `scripts/check-player.mjs` | 65 | Read-only — print one player's row + leaderboard entries. Diagnostic for "won but score not on the board". | Manual: `node --env-file=.env.local scripts/check-player.mjs <email>`. |
| `scripts/restore-player.mjs` | 478 | **Production write.** Recovery tool for `spacepotatis.save_games`. Default mode is dry-run; `--apply` requires `--player-email=<email>` matching argv; monotonic-shrink guard on completed_missions / unlocked_planets count (override only via `--force-overwrite-i-know-this-destroys-progress`); credits + playtime are `max(before, baseline)` so they cannot regress; `BEGIN ... COMMIT` with `SELECT ... FOR UPDATE`; calls `writeBackup()` before the UPDATE; rollback if `writeBackup` throws. Constants `RESTORE_CREDITS = 10000`, `RESTORE_PLAYTIME = 1800`, `RESTORE_COMPLETED`, `RESTORE_UNLOCKED` frozen at 2026-05-02. Header docs the ten safeguards (`restore-player.mjs:22-52`). Exports `parseArgs`, `computeDiff`, `buildTarget` for the test file. | Operator-only (`--apply --player-email=<email>` mandatory). Subprocess smoke tests in `restore-player.test.mjs`. |
| `scripts/restore-player.test.mjs` | 232 | Pins `parseArgs`, `computeDiff`, monotonic-shrink detection, plus subprocess smoke tests with `DATABASE_URL` stripped from env (proves the script can't reach a DB on bare args / `--apply` without `--player-email` / mismatched `--player-email`). | `npm test` (vitest picks up `scripts/**/*.test.mjs` per `vitest.config.ts:15`). |
| `scripts/improve-restore.mjs` | 127 | **Production write.** Second-pass recovery — fills `ship_config` gap left by the first restore (credits 10000 → 15000; default ship → mid-tier loadout). Calls `writeBackup()` before UPDATE; bails on backup failure. Single positional `<email>` arg; **no dry-run, no --confirm gate** — predates `parseFlags` helper. | Operator-only: `node --env-file=.env.local scripts/improve-restore.mjs <email>`. |
| `scripts/_lib/dbWriteSafety.mjs` | 138 | Shared safety helper. Exports `parseFlags(argv)` (dry-run-by-default, `--confirm`, `--backup-dir`, `--help`), `writeBackup({ prevRow, scriptName, flags })` (writes timestamped JSON to `flags.backupDir`, e.g. `db-backups/`), `requireConfirm(flags)` (exits 0 in dry-run, exits 1 without `--confirm`). | Imported by `scripts/restore-player.mjs:80` and `scripts/improve-restore.mjs:23` (only `writeBackup` is used today; `parseFlags` + `requireConfirm` are awaiting first adopter). |
| `scripts/writeBackup-wiring.test.mjs` | 201 | Pins three contracts: (1) `writeBackup`'s JSON envelope shape with the prevRow + email + scriptName; (2) source-grep that both restore scripts call `writeBackup` BEFORE the UPDATE and ROLLBACK on backup failure; (3) both scripts resolve `BACKUP_DIR` via `import.meta.dirname` (not `process.cwd()`). | `npm test`. |
| `scripts/check-audit-readiness.mjs` | 182 | Pure-helper exports `evaluateReadiness(row, thresholds)` + `formatReport(row, evaluation)`; runs a SQL aggregate against `spacepotatis.save_audit`. Exit codes: 0 = READY, 1 = NOT YET, 2 = ENV ERROR. Default thresholds: 100 rows / 2 distinct players / 3 days. | Daily cron via `.github/workflows/audit-readiness-check.yml` (07:00 UTC) + `workflow_dispatch`. Direct invocation guarded by `isInvokedDirectly()` so importing the helpers in the test file does not open a Pool (`check-audit-readiness.mjs:170-181`). |
| `scripts/check-audit-readiness.test.mjs` | 221 | Pure-function tests of `evaluateReadiness` + `formatReport` + a subprocess smoke that asserts exit 2 with no `DATABASE_URL`. | `npm test`. |
| `scripts/vercel-ignore.sh` | 28 | Vercel `ignoreCommand` — exits 0 (skip) when the diff vs `VERCEL_GIT_PREVIOUS_SHA` is entirely under `*.md`, `**/*.md`, `.github/**`, `.claude/**`, or this script itself. First-time builds (no previous SHA) always proceed. | Vercel deploy: `vercel.json` → `bash scripts/vercel-ignore.sh`. |

### Sub-zone: configs (root)

| Path | Purpose | CI-relevance |
|------|---------|--------------|
| `package.json` (57 LOC) | Scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `coverage`, `db:migrate*`, `db:rollback`, `db:new`, `db:status`, `prepare`); deps pinned; `engines.node >= 20`; `lint-staged` map (`*.{ts,tsx,mjs,js,cjs}: eslint --fix`). | Drives every CI step (`ci.yml:30-50`). |
| `tsconfig.json` (39 LOC) | Strict mode + `noUncheckedIndexedAccess` + `noImplicitOverride`; module `esnext`, resolution `bundler`; path aliases `@/*`, `@/game/*`, `@/components/*`, `@/lib/*`, `@/types/*`. | `npm run typecheck` is `tsc --noEmit`. |
| `next.config.mjs` (37 LOC) | `reactStrictMode: true`, `productionBrowserSourceMaps: false`, `optimizePackageImports: ["three", "gsap"]`. Wraps in `@next/bundle-analyzer` (enabled by `ANALYZE=true`, `openAnalyzer: false`). No `output: "export"` (per CLAUDE.md §9). | Used by `npm run build`. |
| `eslint.config.mjs` (47 LOC) | Flat config. Extends `next/core-web-vitals` + `next/typescript`. Custom rules: `@typescript-eslint/no-explicit-any: error`, `no-unused-vars` with `_` prefix exempt, `prefer-const: error`, `no-console: warn` allowing `warn`/`error` only. Override files: `src/game/**` allows console; `scripts/**` allows console. Ignores `.next`, `out`, `build`, `next-env.d.ts`, `node_modules`, `coverage`, `.claude`. | `npm run lint` is `eslint .`. |
| `vitest.config.ts` (52 LOC) | Alias `@/*` → `src/$1`. Test include: `src/**/*.test.ts` + `scripts/**/*.test.mjs`. Coverage exclusions: all `*.test.ts`, all `*.tsx`, `src/game/three/**`, `src/game/phaser/scenes/**`, `src/game/phaser/entities/**`, `src/game/phaser/{registry,events,config}.ts`, `src/components/hooks/**`, `src/lib/useHandle.ts`, `src/game/state/useGameState.ts`, two pure presentational helpers. | `npm test`, `npm run coverage`. |
| `tailwind.config.ts` (28 LOC) | Custom theme: brand colours (`space-bg`, `space-panel`, `space-border`, `hud-{green,red,amber}`, `laser-cyan`); fontFamily `mono` (JetBrains Mono) + `display` (Orbitron); `pulse-slow` animation. | Compiled by Next at build. |
| `postcss.config.mjs` (8 LOC) | Plugins: `tailwindcss`, `autoprefixer`. | Build step. |
| `dbmate.toml` (14 LOC) | `migrations_dir = "db/migrations"`, `schema_file = "db/schema.sql"`, `migrations_table_name = "spacepotatis_schema_migrations"` (lives in `public` schema), `wait = true`, `wait_timeout = "60s"`. | Used by `npm run db:migrate` (dbmate up). The Node runner ignores `wait` etc. |
| `vercel.json` (5 LOC) | Sole field: `"ignoreCommand": "bash scripts/vercel-ignore.sh"`. | Deploy gate. |
| `.github/workflows/ci.yml` (56 LOC) | Triggers: `push` to `master` and `pull_request`, both with `paths-ignore: ['**/*.md', '.claude/**', 'scripts/vercel-ignore.sh']`. Concurrency group `ci-${{ github.ref }}`, cancel-in-progress. Steps: `setup-node@v4` (Node 20, npm cache) → `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run build` (tee'd to `build.log`) → "First-load JS per route" awk extract into `$GITHUB_STEP_SUMMARY` → `npm run coverage` → `actions/upload-artifact@v4` for the coverage dir (14-day retention). | The CI gate. |
| `.github/workflows/audit-readiness-check.yml` (118 LOC) | Schedule: cron `"0 7 * * *"` + workflow_dispatch. Concurrency `audit-readiness-check`, NO cancel-in-progress. Permissions `contents: read`, `issues: write`. Node **22** (vs ci.yml's 20 — note in YAML cites native global WebSocket required by `@neondatabase/serverless`). Branches on the script's exit code: 0 → `gh issue create` with label `save-architecture-ready` (skipping if one is already open), 1 → log notice, 2 → fail loudly. Uses `secrets.DATABASE_URL`. | Independent of `ci.yml` — only fires on cron / dispatch. |
| `.husky/pre-commit` (3 LOC) | `npx lint-staged` then `npm run typecheck`. | Local-only; per CLAUDE.md §6, total overhead ~5s. |
| `.gitignore` | Standard Next + node + IDE + env; **`/db-backups/`** (line 47) excluded — operational backups containing real player save data. `.claude/worktrees/` and `.claude/settings.local.json` excluded; the rest of `.claude/` (skills) IS tracked. | n/a |
| `.prettierrc.json` (143 bytes) | (read-only mention; not opened — out of audit narrative scope, lives at repo root). | n/a |

## Zone-level observations

### Sub-zone: lib

Centralizes the server-side surface area. Three groups:

1. **DB + auth** — `db.ts` is the canonical schema (`Database` interface) backing every Kysely query. `auth.ts` is the NextAuth bootstrap; both `auth.ts` and `db.ts` are imported by all four API routes (`src/app/api/{save,leaderboard,handle,auth}/route.ts`).
2. **Per-domain helpers** — `players.ts` (upsert), `leaderboard.ts` (cached reads), `handle.ts` (validator), `routes.ts` (route constants). Each is small (≤127 LOC) and single-concern.
3. **Cheat guard + auth hooks** — `saveValidation.ts` (the largest non-test file, 440 LOC), and three React hooks `useHandle.ts`, `useReliableSession.ts`, `useOptimisticAuth.ts` plus the SSR-safe `authCache.ts`. The hooks live here (not under `src/components/hooks/`) because they wrap NextAuth's React-only `useSession` and the `authCache` snapshot, which the rest of `src/lib` does not use. `useOptimisticAuth.ts` reaches **across zones** into `@/game/state/sync` + `@/game/state/syncCache` (see "Cross-zone couplings").

### Sub-zone: lib/schemas

Two flavours of Zod under one roof:

- **API-boundary schemas** — `save.ts` (save round-trip + leaderboard write) and `handle.ts`. These are imported by `src/app/api/*/route.ts` and parse the request body / output of GET handlers.
- **JSON drift gates** — `enemies.ts`, `missions.ts`, `obstacles.ts`, `solarSystems.ts`, `waves.ts`, `weapons.ts`. None of these are imported by app routes or game runtime code; the **only** importer is `src/game/data/__tests__/jsonSchemaValidation.test.ts` (one `it(...)` per JSON). Per CLAUDE.md §11, that file is the CI drift gate — keeping Zod out of the runtime bundle saved ~98 kB on first-load JS.

JSON registry coverage:
- `weapons.json` — schema present (`weapons.ts`).
- `enemies.json` — schema present (`enemies.ts`).
- `obstacles.json` — schema present (`obstacles.ts`).
- `missions.json` — schema present (`missions.ts`).
- `waves.json` — schema present (`waves.ts`).
- `solarSystems.json` — schema present (`solarSystems.ts`).
- **JSONs WITHOUT a schema in this dir**: any `lootPools.ts`-derived data (it's a `.ts` file, not JSON), `augments.ts` (TS), `story.ts` (TS), `storyTriggers.ts` (TS), `missionWeaponRewards.ts` (TS), `perks.ts` (likely TS). The drift gate convention assumes a JSON file; TS-defined catalogs are checked at compile time only.

Cross-schema dependency: every non-`save` schema that needs a `MissionId` / `WeaponId` / `SolarSystemId` enum imports it from `./save` (`missions.ts:25`, `solarSystems.ts:14`, `waves.ts:22`, `weapons.ts:14`). This makes `save.ts` the schema **hub** — see "Cycles" below.

### Sub-zone: types

`game.ts` (235 LOC) is the cross-engine type god-file. Single source of truth for every literal union (`MissionId`, `WeaponId`, `EnemyId`, `ObstacleId`, `AugmentId`, `SolarSystemId`, `WeaponFamily`, `WeaponTier`, `EnemyBehavior`, `ObstacleBehavior`, `PlanetKind`) and every `*Definition` interface used by both engines. `ShipConfig`/`WeaponSlots`/`ReactorConfig` deliberately live elsewhere (`src/game/state/ShipConfig.ts`, called out in the file's tail comment line 233-235).

`database.ts` (3 LOC) is a pass-through re-export of four Kysely table types from `@/lib/db`. **Drift**: the new `SaveAuditTable` (PR #98, present in `db.ts:25,70`) is NOT re-exported here. Repo grep finds zero importers of `@/types/database` — the file is dead-code as of this audit (every db-table type consumer imports from `@/lib/db` directly).

### Sub-zone: middleware

No file. `src/middleware.ts` does not exist. CLAUDE.md §3 + §13 forbid middleware on game routes; the absent file is the desired state.

### Sub-zone: db/migrations

Five migrations covering ~10 days (2026-04-24 → 2026-05-03). All forward-only; `migrate:down` blocks present for dbmate compatibility but never invoked in CI. dbmate's tracker table lives in `public.spacepotatis_schema_migrations` (configured in `dbmate.toml:10` because the database is shared with other Vercel/Neon services). The Node runner (`scripts/migrate.mjs`) reads + writes the same tracker so dbmate-proper and the Node runner agree on applied state.

Schema namespace invariant (CLAUDE.md): every table is created as `spacepotatis.<name>` and every Kysely query references it as `"spacepotatis.<table>"`. The `Database` interface in `db.ts:21-26` enforces this in TypeScript.

### Sub-zone: scripts

Two functional groups:

1. **Diagnostic / read-only**: `migrate.mjs` (transactional, idempotent), `check-schema.mjs`, `check-player.mjs`, `check-audit-readiness.mjs`. None of these mutate save_games / leaderboard data.
2. **Production-write recovery**: `restore-player.mjs` (478 LOC, ten documented safeguards) and `improve-restore.mjs` (127 LOC, predates the full safety helper but does call `writeBackup` per CLAUDE.md §15). Both write directly to `spacepotatis.save_games`, bypassing the API and the regression guard.

The shared helper `_lib/dbWriteSafety.mjs` exports `parseFlags` + `requireConfirm` + `writeBackup` (CLAUDE.md §11 calls out that only `writeBackup` is wired today). Source-grep tests in `writeBackup-wiring.test.mjs` enforce that both restore scripts call `writeBackup` BEFORE the UPDATE and ROLLBACK on backup failure (`writeBackup-wiring.test.mjs:122-152`).

`vercel-ignore.sh` is the deploy-skip gate. Its excluded paths must stay in sync with `ci.yml`'s `paths-ignore` (CLAUDE.md §13); both lists currently agree on `**/*.md`, `.claude/**`, and `scripts/vercel-ignore.sh` itself.

### Sub-zone: configs

CI-relevant configs (used by `.github/workflows/ci.yml`): `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`. The build step also tees stdout into `build.log` and awk-extracts the "First-load JS per route" table into `$GITHUB_STEP_SUMMARY` — this is the drift detector for the ~98 kB Zod-in-bundle regression CLAUDE.md §11 warns about.

`audit-readiness-check.yml` runs **out of band** from `ci.yml` — separate cron, separate concurrency group, separate Node version (22 vs 20), and the only consumer of the `DATABASE_URL` repo secret. It is the only workflow that opens a Neon WebSocket connection.

Anomalies:
- **Node version skew between workflows.** `ci.yml:28-29` pins Node 20 (because vitest doesn't open Neon). `audit-readiness-check.yml:40-41` pins Node 22 (native global WebSocket). The reason is documented inline; flagging only as future-trip hazard if a third workflow drifts.
- **`db:migrate` script ambiguity** in `package.json:15-16`: `db:migrate` calls `dbmate up` (requires the Go binary), `db:migrate:node` calls the in-tree Node runner. The README + CLAUDE.md §6 both tell new contributors to run `npm run db:migrate`, which fails with "command not found" if dbmate isn't installed locally.
- **`tailwind.config.ts` / `postcss.config.mjs` / `tailwindcss` dependency** all coexist; Tailwind v3 — no v4 migration started.
- `.husky/pre-commit` runs `npx lint-staged` then `npm run typecheck` but **does not** run tests; CLAUDE.md §6 documents this intent ("Tests are intentionally NOT in the hook — they still gate on push via CI").

### Cross-zone couplings (out of zone D)

- **`src/game/state/` ←→ `src/lib/`** —
  - `src/game/state/sync.ts:15` imports `ROUTES` from `@/lib/routes`.
  - `src/lib/useOptimisticAuth.ts:10-11` imports `loadSave` from `@/game/state/sync` and `getSaveCache` from `@/game/state/syncCache`. **This is a backward edge from `src/lib/` into `src/game/state/`** — `lib` calling into `game` violates the typical layering. (CLAUDE.md §11 explicitly maps `loadSave` + `LoadResult` ownership to `src/game/state/sync.ts`, so the import is intentional, but it crosses the lib/game boundary.)
  - `src/lib/saveValidation.ts:9-13` imports `getEnemy`, `getAllLootPools`, `getAllMissions`, `getMission`, `getWavesForMission` from `@/game/data/*` AND `SYSTEM_UNLOCK_GATES` from `@/game/state/stateCore`. The cheat guard derives caps from game data — necessary for the "10× balance change scales caps 10×" property (CLAUDE.md §9).
  - `src/lib/schemas/save.ts:24-26` imports `ShipConfig`, `WeaponInstance`, `WeaponInventory`, `WeaponSlots`, `MAX_LEVEL`, `MAX_WEAPON_SLOTS`, `ReactorConfig` from `@/game/state/ShipConfig` AND `WEAPON_IDS` from `@/game/data/weapons`. The schema mirrors the canonical TS types living under `game/`.
- **`src/game/data/__tests__/jsonSchemaValidation.test.ts` ← `src/lib/schemas/*`** — game/data tests pull every drift-gate schema. The schemas themselves never run inside game runtime code.
- **`src/components/` ← `src/lib/`** — auth hooks (`useOptimisticAuth`, `useReliableSession`), the `ROUTES` constant, `useHandle`, and the leaderboard cached readers (`getCachedLeaderboard`, `getCachedTopPilots`) are imported by `src/components/{LandingShell,SignInButton,UserMenu,PlayButton,GameCanvas,MenuBriefing,HandlePrompt,SaveLoadErrorOverlay,Leaderboard,TopPilots}.tsx` and `src/components/hooks/useCloudSaveSync.ts:9`.
- **`src/app/api/` ← `src/lib/` + `src/lib/schemas/` + `src/types/`** — every API route imports from this zone. Specifically:
  - `api/save/route.ts:3-13` → `auth`, `db`, `players.upsertPlayerId`, `schemas/save.SavePayloadSchema`, every export in `saveValidation.ts`.
  - `api/leaderboard/route.ts:3-7` → `auth`, `db`, `leaderboard.{LEADERBOARD_CACHE_TAG, getCachedLeaderboard}`, `players.upsertPlayerId`, `schemas/save.ScorePayloadSchema`.
  - `api/handle/route.ts:3-6` → `auth`, `db`, `players.upsertPlayerId`, `schemas/handle.HandlePayloadSchema`.
  - `api/auth/[...nextauth]/route.ts:1` → `auth.handlers`.

### God-files (>300 LOC)

In zone source code (excluding tests, JSON, configs):
- `src/lib/saveValidation.ts` — **440 LOC**. Mixes (a) per-player progression cap derivation (`computeCreditCapsForSystems`, `getReachableSolarSystems`, `computeCreditCapsForPlayer`), (b) four pure validators (`validateMissionGraph`, `validateCreditsDelta`, `validatePlaytimeDelta`, `validateNoRegression`), (c) constants block (`KILL_CADENCE_CEILING`, `PER_SECOND_SAFETY_FACTOR`, `PER_CLEAR_SAFETY_FACTOR`, `CREDITS_DELTA_SLACK`, `PLAYTIME_DELTA_SLACK_SECONDS`), and (d) a module-load `console.log` of tutorial-floor caps (line 156-164). Single file because the cap derivation feeds the credit validator.
- `scripts/restore-player.mjs` — **478 LOC**. Mostly a single `main()`; the `parseArgs` / `computeDiff` / `buildTarget` exports are each tight (~30 LOC). Most of the file is the documented safeguard logic + flag handling.

In tests (informational — tests are excluded from the §5 size limit by convention):
- `src/lib/saveValidation.test.ts` — 656 LOC.
- `src/lib/schemas/save.test.ts` — 585 LOC.
- `src/lib/leaderboard.test.ts` — 300 LOC (right at the limit).

### Suspected accidental coupling

- **`src/lib/useOptimisticAuth.ts` reaches into `src/game/state/`** (`useOptimisticAuth.ts:10-11`). This is the only backward edge from `src/lib/` into `src/game/`. A landing-page auth hook depending on game-state internals (`loadSave`, `getSaveCache`) means any change to the load result shape ripples into the auth-display layer.
- **`src/types/database.ts` is dead code** (zero importers) AND missing `SaveAuditTable`. If it's meant to be the canonical re-export for db types (per CLAUDE.md §5 "Re-export types from `src/types/`"), the convention has been ignored — every consumer of `Database` / `PlayersTable` / etc. imports from `@/lib/db` directly.
- **`src/lib/auth.ts:14-17`** reads `process.env.AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` at module-load. If either is undefined the Google provider still constructs (NextAuth handles the missing-secret case lazily on request) — but the pattern means the module can't be unit-tested without the `vi.mock` dance shown in `auth.test.ts`.
- **`src/lib/saveValidation.ts:170`** runs `getAllLootPools()` at module load to compute `GLOBAL_CREDIT_CAPS`. This pulls every loot-pool definition into the build of any module importing saveValidation — and saveValidation is imported by `/api/save`, which is Edge runtime. Cold-start cost.
- **Module-level mutable singletons** in `src/lib/useHandle.ts:34-35` (`cached`, `inflight`), `src/lib/useReliableSession.ts:29` (`retriedThisSession`), `src/lib/db.ts:83` (`_db`). All reset only via explicit clear functions or process exit. `resetReliableSessionRetry()` exists for tests; the others rely on `vi.resetModules()`.

### Cycles inside the zone (lib ↔ lib/schemas)

**No file-level cycles** exist within zone D. Imports inside `src/lib/schemas/`:

- `save.ts` → no schemas/ imports
- `handle.ts` → `@/lib/handle` (zone D, but in `lib/` not `lib/schemas/`)
- `enemies.ts` → no schemas/ imports
- `obstacles.ts` → no schemas/ imports
- `missions.ts` → `./save` (one-way)
- `solarSystems.ts` → `./save` (one-way)
- `weapons.ts` → `./save` (one-way)
- `waves.ts` → `./save`, `./enemies`, `./obstacles` (one-way each)

`save.ts` is the **schema hub** (zero schemas/ imports of its own; five other schemas depend on it). The DAG is acyclic.

`src/lib/` itself has no cycles either. Notable directed edges (only):
- `useHandle.ts` → `useReliableSession.ts` → `authCache.ts` (linear)
- `useOptimisticAuth.ts` → `useHandle.ts`, `useReliableSession.ts`, `authCache.ts` (linear)
- `players.ts` → `db.ts`
- `leaderboard.ts` → `db.ts`, `leaderboardMapper.ts`; `leaderboardMapper.ts` only type-imports `./leaderboard` (no runtime back-edge).
- `saveValidation.ts` → cross-zone (`@/game/data/*`, `@/game/state/stateCore`).

### Side effects (DB connection setup, NextAuth init, middleware registration)

- **DB connection setup** — `src/lib/db.ts:85-103` lazy-instantiates a singleton `Kysely<Database>` over a Neon `Pool` (`max: 5`, `idleTimeoutMillis: 10_000`). First call to `getDb()` creates it; subsequent calls return the cached instance. Throws if `DATABASE_URL` is unset.
- **NextAuth init** — `src/lib/auth.ts:11` calls `NextAuth({ ... })` at module-load with `trustHost: true`, `Google` provider reading `process.env.AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET`, JWT session strategy. Side effect happens once per cold start of any route that imports `auth`.
- **Cached leaderboard wrappers** — `src/lib/leaderboard.ts:57-61` and `:123-127` register two `unstable_cache` wrappers at module load with TTL 60s and shared tag `"leaderboard"`.
- **`saveValidation.ts` module-load work** — `:170` walks every loot pool to compute `GLOBAL_CREDIT_CAPS`. Dev-only `console.log` at `:156-164`.
- **`scripts/migrate.mjs`** — Top-level await: `await pool.query(CREATE TABLE IF NOT EXISTS …)` registers the tracker on first run, then iterates pending migrations. Always runs, never imported.
- **`scripts/restore-player.mjs` / `improve-restore.mjs`** — Top-level Pool construction (`improve-restore.mjs:41`), guarded `main()` invocation behind `isEntryPoint` check (`restore-player.mjs:470-478`) so test-mode imports don't hit the DB.
- **`scripts/check-audit-readiness.mjs`** — Same `isInvokedDirectly()` guard at `:170-181` so test imports don't trigger the SQL aggregate.
- **Middleware** — none.

### CI / hook surface (what runs on every push, PR, commit)

Every commit (local, husky-managed):
- `.husky/pre-commit:1-2` runs `npx lint-staged` (ESLint with `--fix` on staged `.ts/.tsx/.mjs/.js/.cjs` per `package.json:55`) then `npm run typecheck`.

Every push to `master` and every PR (CI):
- `.github/workflows/ci.yml` — Node 20 → `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` (vitest, includes `src/**/*.test.ts` + `scripts/**/*.test.mjs`) → `npm run build` (with first-load JS summary tee'd into `$GITHUB_STEP_SUMMARY`) → `npm run coverage` → upload `coverage/` artifact (14-day retention).
- `paths-ignore`: `**/*.md`, `.claude/**`, `scripts/vercel-ignore.sh`.

Daily 07:00 UTC + manual dispatch:
- `.github/workflows/audit-readiness-check.yml` — Node 22, runs `scripts/check-audit-readiness.mjs` against `secrets.DATABASE_URL`, branches by exit code: 0 → `gh issue create` with label `save-architecture-ready` (deduped), 1 → notice, 2 → fail loudly.

Vercel deploy:
- `vercel.json` → `bash scripts/vercel-ignore.sh` decides whether to skip the build based on the diff vs `VERCEL_GIT_PREVIOUS_SHA`.

No other GitHub workflows exist in this worktree.

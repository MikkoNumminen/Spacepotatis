# ui

## Purpose

Every React component — the entire client-rendered DOM. Owns layout, interactions, animations, and the wiring between user input and state mutators. Components are presentational; game state flows in via props (and via the `useGameState` selector hook). This is a **SINK module**: there's no `index.ts`. Apps consume specific components; the contract is each component's prop interface.

The UI module sits at the top of the dependency graph (highest fan-in across all 10 modules) — it depends on `state`, `content`, `audio`, and `infra` (auth + routes), and is consumed only by `app/` (pages mount components).

## Top-level components

The components directly under `src/components/` (not in a subfolder) are the entry points pages mount:

| File | Mounted by | Purpose |
|---|---|---|
| [`GameCanvas.tsx`](./GameCanvas.tsx) | `/play` page | **GOD-FILE (452 LOC, 11 responsibilities)** — the main orchestrator. Mode machine (galaxy ↔ combat), fade overlay, save-queue triggers, victory state machine, story-trigger wiring. Split scheduled as a follow-up PR. |
| [`ShopUI.tsx`](./ShopUI.tsx) | `/shop` page | **GOD-FILE (408 LOC)** — the shop. 6 mutator wirings + 2 audio side-effect lifecycles + 3 catalog sections (BUY WEAPONS, AUGMENTS, HULL & SHIELD/REACTOR). Split scheduled. |
| [`Splash.tsx`](./Splash.tsx) | `/play` page | First-paint splash with sequenced step list. |
| [`SplashGate.tsx`](./SplashGate.tsx) | `/play` page | Wraps the splash + GameCanvas; gates render on cloud-save load. |
| [`LandingShell.tsx`](./LandingShell.tsx) | `/` page | The landing page. PlayButton + SignInButton + leaderboard chip. |
| [`MenuBriefing.tsx`](./MenuBriefing.tsx) | `/` page | Menu-briefing voice-queue UI on the landing page. |
| [`Leaderboard.tsx`](./Leaderboard.tsx) | `/leaderboard` page | Async server component; ISR-cached read. |
| [`PlayButton.tsx`](./PlayButton.tsx), [`SignInButton.tsx`](./SignInButton.tsx), [`UserMenu.tsx`](./UserMenu.tsx) | landing page | Auth + entry-point buttons. |
| [`HandlePrompt.tsx`](./HandlePrompt.tsx) | leaderboard / settings flows | Public handle setup modal. |
| [`SaveLoadErrorOverlay.tsx`](./SaveLoadErrorOverlay.tsx) | gated by `useCloudSaveSync` | Full-screen overlay on `load-failed` `LoadResult`. Pairs with the 8-layer save defense. |
| [`MenuMusic.tsx`](./MenuMusic.tsx) | landing page | Mounts the menu music engine; handles per-system bed swap on entry. |

## Subfolders

- **[`galaxy/`](./galaxy/)** — galaxy-view chrome. `HudFrame.tsx`, `WarpPicker.tsx`, `LoadoutModal.tsx`, `QuestPanel.tsx` (**GOD-FILE 387 LOC**), `VictoryModal.tsx`, the `questBuckets.ts` helper. Mounted by `GameCanvas`.
- **[`loadout/`](./loadout/)** — LoadoutMenu sub-components. `SlotGrid.tsx`, `WeaponCard.tsx` (**GOD-FILE 210 LOC**), `WeaponDetailsModal.tsx`, `AugmentDetailsModal.tsx`, picker modals, `dots.tsx`. Used in galaxy + shop.
- **[`story/`](./story/)** — `StoryModal.tsx` (cinematic popup), `StoryListModal.tsx` (the Story log).
- **[`hooks/`](./hooks/)** — client-side React hooks: `useGalaxyScene.ts`, `usePhaserGame.ts`, `useCloudSaveSync.ts`, `useCloudSaveSyncLogic.ts` (pure decision helpers tested separately), `useStoryTriggers.ts` (281 LOC, borderline god-file), `useNextMissionAutoSelect.ts`. The single concern per file rule (CLAUDE.md §5) lives here — these exist exactly so `GameCanvas` doesn't have to.
- **[`ui/`](./ui/)** — shared UI primitives: `buttonClasses.ts` (the locked button-class constants — see `feedback_back_button_position` auto-memory), `ShopCreditsTicker.tsx`. New shared primitives go here.

## Internal

- Subfolder components are NOT meant to be imported across the boundary. `loadout/X.tsx` importing `loadout/Y.tsx` is fine; `loadout/X.tsx` importing `galaxy/Z.tsx` is a smell.
- The previous cross-folder reach `loadout/WeaponDetailsModal.tsx` → `components/WeaponStats.tsx` was resolved during Phase 3 Tier 5 — `WeaponStats.tsx` now lives at `loadout/WeaponStats.tsx` next to its sole consumer.
- Test fixtures and per-component test setups (`*.test.tsx`).

## Dependencies

| Dependency | Used by | Why |
|---|---|---|
| `@/game/state/*` (GameState barrel + useGameState) | nearly every interactive component | Selector subscriptions + mutator calls. |
| `@/game/data/*` | shop + loadout + galaxy panels | Catalog reads (weapons, augments, missions, etc.). |
| `@/game/audio/*` | hooks (`useStoryTriggers`, `MenuMusic`) + Shop / GameCanvas effects | Audio engines fired from React effects. The engines themselves live in `audio/`. |
| `@/lib/routes`, `@/lib/useHandle`, `@/lib/useReliableSession`, `@/lib/useOptimisticAuth` | landing + nav components | Auth + route constants. |
| `@/types/game` | many | Shared types. |
| `next-auth/react` | landing + UserMenu | `useSession` + `signIn` / `signOut`. |
| `phaser`, `three` (transitively via `@/game/phaser`, `@/game/three`) | dynamic imports inside hooks | Loaded via `next/dynamic({ ssr: false })`. |
| `gsap` | transitions | Galaxy ↔ combat fade-outs. |

NEVER reaches the database directly. NEVER reaches schemas directly. All server-side data flows through `state/sync.ts` + `infra/lib/leaderboard.ts` (server component).

## Invariants

- **Server Components by default.** `"use client"` only when state, effects, or browser APIs are needed. Adding `"use client"` to a previously-server component flips its bundle to client-side and breaks SSG for whatever pages mount it. CLAUDE.md §5.
- **Phaser and Three.js imports are client-only.** They live inside `"use client"` files, dynamically imported via `next/dynamic({ ssr: false })`. CLAUDE.md §5 + §9.
- **No `useEffect` for deriving state from props.** Compute during render. CLAUDE.md §5.
- **Components are presentational.** State flows in via props or `useGameState` selectors; mutators flow out via callbacks. No context gymnastics. CLAUDE.md §5.
- **Audio engines are FIRED from React effects, never INSTANTIATED.** The engines live as singletons in `audio/`; UI only triggers `engine.play()` / `engine.stop()`.
- **`useGameState(selector)` is the canonical state-subscription pattern.** Don't re-implement subscriptions; don't bypass it with raw `getState()` reads in render.
- **Back-button position is LOCKED** in [`feedback_back_button_position` auto-memory note]: modals → `absolute left-3 top-3` inside the panel; pages → inside the header row inline with the title. Confirmed 4 times; do not raise it again.

## Common pitfalls

- **The four god-files** — `GameCanvas` 452, `ShopUI` 408, `QuestPanel` 387, `WeaponCard` 210. Splits are scheduled as follow-up PRs after Phase 4b. **Don't split inside an unrelated PR** — each is a focused refactor in itself.
- **Forgetting `next/dynamic({ ssr: false })` on a Phaser/Three import** — kills SSG. Symptoms: `next build` errors out with `ReferenceError: window is not defined`.
- **Calling state mutators from inside a render function.** Move to event handlers or effects.
- **Importing `@/game/phaser` or `@/game/three` directly into a top-level component.** Always go through the dynamic-import boundary.
- **Adding context providers** to share state. Use `useGameState(selector)` instead — the existing subscription is faster and avoids prop-drill via context.
- **Re-implementing audio playback.** Use the existing engines from `audio/`. The mute fan-out + iOS-budget handling are non-trivial.
- **Adding raw `fetch("/api/...")` calls** anywhere in this module. Go through `state/sync.ts` (which uses `ROUTES` constants) so the cheat-guard / regression / queue paths can wrap the call.

## How to test changes

```bash
# Whole module
npm test src/components

# Specific top-level
npm test src/components/GameCanvas.test.tsx
npm test src/components/ShopUI.test.tsx
npm test src/components/SaveLoadErrorOverlay.test.tsx

# Hooks (pure logic helpers are easiest to unit-test)
npm test src/components/hooks/useCloudSaveSyncLogic.test.ts
npm test src/components/hooks/useNextMissionAutoSelect.test.ts

# Loadout components
npm test src/components/loadout

# Build is the gate for "client/server boundary right?"
npm run build

# Type-only
npm run typecheck

# Manual smoke (the actual UX)
npm run dev
# Then exercise: landing → sign in → galaxy → mission → shop → loadout → story log.
```

## See also

- ADR 0007 — the modular-architecture audit (this module is the highest-fan-in zone).
- CLAUDE.md §5 — the React conventions every invariant in this README points back to.
- `src/game/state/README.md` — the state surface this module subscribes to.
- `src/game/data/README.md` — the catalogs this module reads.
- `src/game/audio/README.md` — the engines this module fires.
- `src/lib/README.md` — the auth + routes + leaderboard helpers this module consumes.
- `04-found-bugs.md` (in `docs/audit/`) — the cross-folder-reach entry.

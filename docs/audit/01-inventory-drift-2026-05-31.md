# Phase 1 — Inventory Drift Delta (2026-05-31)

Re-run of Phase 1 to catch architectural drift since the Phase 5 verification. Baseline = `docs/audit/01-inventory.md` + `docs/audit/05-final-report.md`. This is a delta, not a re-inventory; the original `01-inventory.md` is untouched.

## 1. Method + scope

- **Range diffed:** `9af858a..HEAD`. `9af858a` is the commit the Phase 5 report verified against (`refactor(ui): relocate WeaponStats to loadout/ as WeaponStatsView (#253)`). HEAD = `7a40f1a` (#273).
- 22 PRs in range (#254–#273): the four god-file split PRs, the auth-barrel/MAX_LEVEL relocation, the planet-style-into-JSON fix, the SYSTEM_UNLOCK_GATES relocation, save-route hardening, and a cluster of white-flash / leaderboard-warm-window / WebGL-context fixes.
- **Changed-file set determined by** `git diff --name-status --find-renames 9af858a..HEAD -- src/`. 60 source files touched; **12 added, 0 deleted, 0 renamed**. Every added file read; every added `from "@/..."` import line grepped and each new cross-module edge traced to its consumer.
- LOC figures from `wc -l` at HEAD and `git show <rev>:path | wc -l` for baselines.

Note: the LOC numbers in baseline `01-inventory.md` (GameCanvas 452, ShopUI 408, music 441, saveValidation 440) predate the audit pause. At the Phase 5 commit `9af858a` these files were already larger (508 / 523 / 545 / 662). Diff is against the `9af858a` reality, not the stale inventory numbers.

## 2. New files

12 new source files. All belong to existing modules; none introduce a new module.

| New file | Module (§17) | Cross-module imports | Edge OK? |
|---|---|---|---|
| `src/components/hooks/useShopAudio.ts` | ui | `@/game/state` (barrel), `@/game/data` (barrel), `@/game/audio` (barrel) | yes — `ui → state/content/audio`, all via barrel |
| `src/components/hooks/retryWithBackoff.ts` | ui | none (pure) | yes — leaf helper |
| `src/components/hooks/retryWithBackoff.test.ts` | ui (test) | `./retryWithBackoff` | yes |
| `src/components/hooks/useGameMode.ts` | ui | `@/types`, `@/game/audio` (barrel) | yes |
| `src/components/hooks/useTransitionOverlay.ts` | ui | none (react only) | yes |
| `src/components/hooks/useVictoryFlow.ts` | ui | `@/game/phaser` (barrel, type), `@/types`, `@/game/audio` (barrel), `@/game/state` (barrel), `@/components/galaxy/VictoryModal` (intra-ui, type) | yes |
| `src/components/loadout/WeaponCardAugmentSection.tsx` | ui | `@/game/data` (barrel), `@/types`, `@/game/state` (barrel, type), `./dots`, `./AugmentDetailsModal` | yes |
| `src/components/shop/ShopAugmentsSection.tsx` | ui | `@/game/state` (type), `@/types`, `@/game/data` (type), `@/components/loadout/dots` (intra-ui) | yes |
| `src/components/shop/ShopUpgradesSection.tsx` | ui | `@/game/state` (barrel), `@/game/data` (type) | yes |
| `src/components/shop/ShopWeaponsSection.tsx` | ui | `@/game/state` (type), `@/types`, `@/components/loadout/dots` (intra-ui) | yes |
| `src/components/galaxy/QuestPanelRows.tsx` | ui | `@/types` only | yes |
| `src/game/data/systemUnlocks.ts` | content | `@/types` (type only) | yes — `content → types` |

New `src/components/shop/` subfolder (3 files) — ShopUI's extracted catalog sections, consumed by `ShopUI.tsx`. New `useGameMode`/`useTransitionOverlay`/`useVictoryFlow` are GameCanvas's extracted hooks (#258). `useShopAudio` was lifted to `ShopTabs.tsx:33` (ShopTabs pre-existed at baseline; it is Modified, not new).

All new files import cross-module dependencies through the module barrel or via type-only deep imports of state/data types — consistent with the §17 graph. No new file introduces a back-edge.

## 3. Moved / relocated symbols

| Symbol | From | To | Consistent with §17? |
|---|---|---|---|
| `SYSTEM_UNLOCK_GATES` | `src/game/state/stateCore.ts` | `src/game/data/systemUnlocks.ts` (content) | YES — static data, content is the right home. Closes part of the `infra → state` back-edge (#261). |
| `MAX_LEVEL`, `MAX_WEAPON_SLOTS` | `src/game/state/ShipConfig.ts` | `src/types/game.ts` (types) | YES — pure constants; types is tier-0 (#259). |
| planet surface style | hardcoded `styleFor()` switch in `three/planetTexture.ts` | `planetStyle` field in `missions.json` + `PlanetStyle` type in `types/game.ts:466` + Zod in `schemas/missions.ts` (#260) | YES — resolves the non-exhaustive-switch latent crash; data-driven per §5. |

Relocation wiring verified consistent:
- `stateCore.ts:43-44` now imports `SYSTEM_UNLOCK_GATES` from `@/game/data` and **re-exports** it (`state → content` forward edge, fine). `persistence.ts:12` consumes via the state surface.
- `saveValidation.ts:18-19` imports `SYSTEM_UNLOCK_GATES` from `@/game/data` (allowed `infra → content`).
- `ShipConfig.ts:7` re-exports `MAX_LEVEL`/`MAX_WEAPON_SLOTS` from `@/types` for intra-state callers (no behavior change).

## 4. New cross-module import edges

No new edge violates the acyclic graph. Edges introduced or re-routed in range:

| Edge | Site | Verdict |
|---|---|---|
| `ui → audio` | `useGameMode.ts:5`, `useVictoryFlow.ts:6`, `useShopAudio.ts:10` (all `@/game/audio` barrel) | Allowed, via barrel. GameCanvas/ShopUI audio orchestration moved into hooks — net audio coupling unchanged, just relocated. |
| `ui → state` | new shop sections + hooks, all `@/game/state` barrel (or type-only) | Allowed, via barrel. |
| `phaser → audio` | `CombatScene.ts:13` adds `resolveCombatTrack` to the existing `@/game/audio` import | Allowed (`phaser → audio` is in the graph). |
| `infra → content` | `saveValidation.ts:18-19` (`SYSTEM_UNLOCK_GATES` from `@/game/data`) | Allowed; replaced the prior `infra → state` import of the same symbol. Net improvement. |
| `app → content` (deep-path) | `save/route.ts:18-19` imports `STORY_IDS` + `StoryId` from `@/game/data/story` | **Allowed direction, but a barrel-bypass.** `STORY_IDS` IS re-exported from the content barrel (`index.ts:24 export * from "./story"`), so the deep path is avoidable. Acyclic, low severity — boundary-hygiene nit, not a graph violation. (#264.) |

`useVictoryFlow.ts:14` imports `VictorySyncStatus` from `@/components/galaxy/VictoryModal` — intra-ui (ui→ui), not a module boundary crossing.

## 5. New cycles or back-edges

- **No new cycles.** The graph remains acyclic.
- **`infra → state` (`weaponUpgradeCost`)** — still open, unchanged. `saveValidation.ts:28` still imports `weaponUpgradeCost` from `@/game/state/ShipConfig`. Known-deferred from `04-found-bugs.md` (partial resolution #259/#261): `MAX_LEVEL` and `SYSTEM_UNLOCK_GATES` two-thirds closed in range; only `weaponUpgradeCost` (runtime function tied to the upgrade ladder) remains. Not new.
- **`schemas → state` (type-only)** — still open, unchanged. `schemas/save.ts:37-43` still imports the ship-shape TYPES from `@/game/state/ShipConfig`. The constant half (`MAX_LEVEL`/`MAX_WEAPON_SLOTS`) moved to `@/types` in range (`save.ts:29`); file now carries an AI-NOTE (`save.ts:30-36`) documenting the remaining type-only back-edge as accepted. Constant half resolved.
- **`useOptimisticAuth` lib→game back-edge** — confirmed still resolved (file lives at `src/game/state/`); untouched in range.

No previously-clean edge reversed in range. Both remaining back-edges are logged and both shrank.

## 6. Module-size drift

| File | Baseline `9af858a` | HEAD | Δ | Over ~300 cap? | Note |
|---|---|---|---|---|---|
| `src/components/GameCanvas.tsx` | 508 | **423** | −85 net | YES | Split to 338 in #258, then **grew back +85** via white-flash / leaderboard-nav fixes (#262, #267, #272, #273). Still a god-file; trend is regrowth. |
| `src/components/ShopUI.tsx` | 523 | **219** | −304 | no | Split (#257), now a thin orchestrator. |
| `src/components/galaxy/QuestPanel.tsx` | (387) | **197** | — | no | Split (#256) → `QuestPanelRows.tsx` (205). |
| `src/components/loadout/WeaponCard.tsx` | (306) | **247** | — | no | Split (#255) → `WeaponCardAugmentSection.tsx` (71). |
| `src/components/hooks/useStoryTriggers.ts` | ~281 | **294** | +13 | borderline | Crept up, still under cap. |
| `src/game/audio/music.ts` | 545 | **571** | +26 | YES (already) | God-file at baseline; grew via `DEFAULT_COMBAT_MUSIC` + `resolveCombatTrack` + shop-music additions. Not newly flagged. |
| `src/lib/saveValidation.ts` | 662 | **667** | +5 | YES (already) | God-file at baseline; STORY_IDS-filter / audit-cap work (#264). |
| `src/game/three/planetTexture.ts` | (405) | **308** | — | borderline | Shrank — `styleFor` switch removed, style now data-driven (#260). |
| New: `useVictoryFlow.ts` | — | 234 | — | no | |
| New: `ShopUpgradesSection.tsx` | — | 160 | — | no | |

**Headline size drift:** the four `ui` god-file splits landed (ShopUI/QuestPanel/WeaponCard now under cap). GameCanvas is the regression-risk: correctly split but **bug-fix churn re-inflated it to 423 LOC**, still over the §5 cap and the only god-file in the set actively trending the wrong way. `music.ts` (571) and `saveValidation.ts` (667) remain over cap as at baseline.

## 7. CLAUDE.md §17 / §4 accuracy after drift

- **§3 (line 41) is now STALE / contradicted.** "Cache aggressively. Leaderboard reads: ISR with `revalidate: 60`." — `src/app/leaderboard/page.tsx:22` is now `export const dynamic = "force-dynamic"` (#269), with an in-file comment explaining ISR was burning users in the post-deploy warm window. The §3 directive now misdescribes reality. (§13 line 290's general ISR guidance is still fine as guidance.)
- **§4 file-ownership table is incomplete.** The `src/components/hooks/` row lists only `useGalaxyScene, usePhaserGame, useCloudSaveSync, useNextMissionAutoSelect` — omits the new `useShopAudio`, `useGameMode`, `useTransitionOverlay`, `useVictoryFlow`, `retryWithBackoff`. No row for the new `src/components/shop/` subfolder (sibling to `loadout/`).
- **§17 content row** — broadly still accurate; `systemUnlocks.ts` / `SYSTEM_UNLOCK_GATES` now lives here but "catalog" covers it. The `infra → state` boundary-rules bullet in §17 still describes `weaponUpgradeCost` and SYSTEM_UNLOCK_GATES generically; the SYSTEM_UNLOCK_GATES half is now resolved (`infra → content`), so the prose slightly overstates the remaining back-edge.
- **`src/game/state/README.md:88`** is now STALE: says saveValidation imports `MAX_LEVEL, weaponUpgradeCost, SYSTEM_UNLOCK_GATES` "from this module." Two of three moved out; only `weaponUpgradeCost` is still sourced from state.

(Doc fixes are out of scope for Phase 1 — flagged as evidence only.)

## 8. Verdict

**Minor drift (additive, within boundaries).**

- 12 new files, 0 deletions, 0 renames. Every new file sits in an existing module and every new cross-module edge respects the acyclic §17 graph and (with one exception) routes through a barrel.
- 3 symbol relocations all move in the *correct* direction and net-**reduce** coupling — closed two-thirds of the `infra → state` back-edge and the `schemas → state` constant half, and removed the `planetTexture` latent crash.
- No new cycles. The two pre-existing back-edges both shrank and remain logged/known-deferred; neither is new.
- No structural boundary violation requiring Phase 2 attention.

**Boundary nits (low severity, not violations):**
1. `src/app/api/save/route.ts:18-19` — `STORY_IDS`/`StoryId` imported via deep path `@/game/data/story` instead of the `@/game/data` barrel (barrel-bypass; correct direction).

**Size watch (not a boundary issue):**
2. `GameCanvas.tsx` re-inflated 338 → **423 LOC** via white-flash/leaderboard bug-fix churn after its #258 split — the one god-file trending back over the cap.

## Open questions for the orchestrator
- Normalize the `STORY_IDS` deep-path import in `save/route.ts:18` to the `@/game/data` barrel, or accept the deep path for app-tier API routes? (Low severity either way.)
- GameCanvas regrew past the cap post-split. Schedule "re-split / extract the nav-flash + leaderboard-nav logic into a hook," or accept churn until the white-flash work settles?
- The §3 leaderboard-ISR line, §4 hooks list, and `state/README.md:88` are stale after the force-dynamic rework and hook extractions. Schedule a CLAUDE.md/README doc-sync pass, or fold into the next docs PR?

## Next phase (do not start)
This is an inventory drift pass, not a numbered audit phase. The boundary nit (#1) and the GameCanvas regrowth (#2) read as hygiene/size follow-ups, not new boundaries. No Phase 2 re-run is warranted by this delta. No proposal or refactor begun.

# Phase 3 progress log

Append-only log of what's been done and what's next in Phase 3 (mechanical extraction). The orchestrator (`/modular-architecture-audit`) reads this on resume to know where to pick up.

## 2026-05-28 — Resume after 3-week pause; orchestrator decisions

Status entering this session:
- Phases 0, 1, 2 complete (artifacts in `00-agent-setup.md`, `01-inventory.md`, `02-target-architecture.md`).
- Phase 4 PARTIAL — `content`, `audio`, `types`, `schemas` got READMEs + TSDoc; CLAUDE.md §17 + ARCHITECTURE.md §11 + 7 ADRs added; the other 6 modules still undocumented.
- Phase 3 NOT STARTED — no `index.ts` barrels exist, files still at their original paths.
- Latent bugs from `04-found-bugs.md`: 4 already resolved organically between pause and resume (database.ts deleted, BossScene.ts deleted, db:migrate fixed, Node-version "mismatch" is intentional + documented). 6 remain — most will be fixed inline during their owning module's extraction.

### Decisions on Phase 2 open questions

The five open questions at the end of `02-target-architecture.md` are answered as follows:

**Q1 — Module path renames.** **KEEP CURRENT PATHS.** Add `index.ts` barrels at the existing folder locations. Zero file moves.

Rationale: file moves multiply blast radius (every importer changes) and the post-audit docs (CLAUDE.md §17, ARCHITECTURE.md §11, the 4 module READMEs already shipped) reference current paths. Module boundaries are enforced by the `index.ts` barrel + the import discipline, not by the folder layout. A cosmetic consolidation to `src/{types,schemas,...}/` can ship as a separate follow-up if ever desired.

| Module | Barrel path |
|---|---|
| types | `src/types/index.ts` |
| schemas | `src/lib/schemas/index.ts` |
| audio | `src/game/audio/index.ts` |
| content | `src/game/data/index.ts` |
| infra | `src/lib/index.ts` (re-exports everything except schemas, which has its own barrel) |
| state | `src/game/state/index.ts` |
| three | `src/game/three/index.ts` |
| phaser | `src/game/phaser/index.ts` |
| app | (SINK — no barrel, Next.js routes are the public API) |
| ui | (SINK — no barrel, component prop interfaces are the public API) |

**Q2 — Hot-fix policy.** Done. Of the four flagged items, three resolved themselves between pause and resume, and the fourth (Node-version mismatch) turned out to be intentional and now carries an in-file comment. Nothing remains to hot-fix before Phase 3.

**Q3 — `saveValidation.ts` lazy-init.** **Inline during `infra` extraction.** It closes the only `infra → content` ambiguity in the dependency graph and is a small, contained change. Doing it later as a follow-up creates an extra round-trip for no benefit.

**Q4 — `ui` god-file splits** (`GameCanvas` 452, `ShopUI` 408, `QuestPanel` 387, `WeaponCard` 210). **Follow-up PRs after the `ui` boundary lands.** Splitting all four during the `ui` extraction would balloon the PR — each split is a small refactor in itself, and bundling them defeats the audit's reviewability goal. The `ui` extraction will add the barrel + update importers; per-file splits ship after.

**Q5 — `BootScene.ts` 1819 LOC.** **Defer post-audit** per the Phase 2 doc. Placeholder pending real art.

### Migration tier order (unchanged from Phase 2)

| Tier | Modules | Parallelism | Risk |
|---|---|---|---|
| 1 | types, schemas, audio | parallel (file-disjoint leaves) | low |
| 2 | content, infra | parallel after Tier 1 | low-medium |
| 3 | state | serial — save-roundtrip-audit gate required | HIGH |
| 4 | three, phaser, app | parallel after Tier 3 | low-medium |
| 5 | ui | serial last | medium-high |

### PR-flow contract for each extractor

Per user memory: "every push goes through feature branch + gh PR; STOP after creating, don't auto-merge". Each `module-extractor` invocation:

1. Operates in an isolated worktree (`isolation: "worktree"` on the Agent call).
2. Adds the `index.ts` barrel at the current module path. No file moves.
3. Updates every importer across the codebase to consume the barrel (`@/types`, `@/lib/schemas`, etc.) instead of deep paths.
4. Runs `npm run typecheck && npm test && npm run build`. All green or STOP.
5. Commits with a conventional message (no `Co-Authored-By` trailer per project rule).
6. Creates a feature branch from master, pushes, opens a PR via `gh pr create`, and STOPS.
7. Appends a "Phase 3 — module: <name>" block to this file.

The user reviews and merges. Subsequent extractors rebase on the new master if they conflict.

### Conflict-aware dispatch plan

Tier 1 modules are file-disjoint (`src/types/*`, `src/lib/schemas/*`, `src/game/audio/*`) so the extractors can run in parallel worktrees safely. The risk surface is the **import-update step** — many files import from multiple of these modules. When PR #1 of Tier 1 merges, PRs #2 and #3 will need a mechanical rebase that touches the same import statements.

Plan: dispatch all three Tier 1 extractors in parallel worktrees now. User reviews and merges in any order; later PRs rebase mechanically.

---

(Phase 3 extractor entries land below this line.)

## Phase 3 — module: three

- Commit: 1c53182
- PR: #251 (refactor/three-module-barrel → master)
- Files moved: 0 (barrel-only approach per orchestrator decision Q1)
- Barrel created: `src/game/three/index.ts` (12 source files re-exported via `export *`)
- Importers updated: 4
  - `src/components/hooks/useGalaxyScene.ts` — static type import + dynamic GalaxyScene import
  - `src/components/GameCanvas.tsx` — dynamic TransitionManager import
  - `src/components/LandingBackground.tsx` — dynamic LandingScene import
- Deviations from spec:
  - Spec listed `Orbit.ts` as a file — does not exist in the actual directory; skipped (no deviation, just stale spec).
  - Dynamic imports (`await import(...)`) updated to point at the barrel `@/game/three`; they remain dynamic (not converted to static) to preserve Next.js code-splitting.
- Tests / typecheck / build: green at 02:00

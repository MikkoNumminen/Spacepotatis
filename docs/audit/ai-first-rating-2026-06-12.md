# AI-first rating — 2026-06-12

> **Score: 8.7 / 10** (previous informal baseline ~7.8 — see "What changed" below).
>
> "AI-first" = how safely and cheaply a fresh AI agent (or new human) can make
> a typical change using only the repo's own documentation and guardrails.
> This doc defines the rubric, records the measured state, and is the
> trackable artifact for the score. Re-measure by re-running the commands in
> each section; append a new dated row to the History table rather than
> editing scores in place.

## Rubric

Six dimensions, each 0–10, equally weighted. Every dimension has a
deterministic measurement so two auditors get the same number.

| # | Dimension | Score | One-line basis |
|---|---|---|---|
| 1 | Module boundary integrity | 10 | 0 runtime back-edges (audio→content closed 2026-06-13) AND now lint-enforced; 2 accepted type-only edges |
| 2 | Documentation coverage & freshness | 9 | 10/10 module READMEs, drift found this pass fixed; dated phase artifacts can mislead |
| 3 | Automated guardrails | 9 | 4 blocking CI gates + 1416 tests + security suite + per-zone module-boundary lint; no mutation/coverage gate |
| 4 | File-size discipline | 8 | 17 files >300 LOC; all four audit-named ui god-files now under cap (GameCanvas 286); the rest are BootScene placeholder + justified save-pipeline files |
| 5 | Skills coverage | 10 | 16 skill dirs (15 active + new-weapon redirect stub) cover every content task + audits; freshness-audited 2026-06 |
| 6 | Fresh-agent navigability | 9 | All Phase 5 PARTIAL causes fixed; needs a fresh spot-check run to confirm PASS×3 |
| | **Overall (mean)** | **9.2** | |

> **Update 2026-06-13:** boundary integrity 9→10, guardrails 8→9, file-size
> discipline 7→8. The §17 graph is now mechanically ESLint-enforced, the
> `audio→content` back-edge was closed, and GameCanvas (the last over-cap
> ui god-file) was split 353→286 via four cohesive hooks. See "What changed
> in the 2026-06-13 pass" below.

## 1. Module boundary integrity — 10/10

Measure:

```bash
# deep-path imports into a module from outside it (repeat per module)
grep -rn 'from "@/game/state/' src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." | grep -v "src/game/state/"
```

Measured 2026-06-13:

- **0 runtime back-edges, and now mechanically enforced.** The `infra →
  state` edge (`weaponUpgradeCost`) closed 2026-06-12; the `audio → content`
  VALUE edge (`clearedStateCue.ts` calling `getAllMissions()`) — which the
  earlier "0 back-edges" claim had missed — closed 2026-06-13 by moving the
  roster math to a content selector ([`clearedState.ts`](../../src/game/data/clearedState.ts)).
  The §17 graph is enforced by per-zone `no-restricted-imports` in
  [eslint.config.mjs](../../eslint.config.mjs); a new illegal edge fails CI.
- **2 accepted type-only edges** (erased at compile time, allowed via
  `allowTypeImports`): `schemas/save.ts → state/ShipConfig` (ship-shape types)
  and `audio/itemSfx.ts → content` (`type PerkId`). Both documented in
  [04-found-bugs.md](04-found-bugs.md).
- Barrel routing: `types` 100%, `schemas`/`audio`/`content`/`phaser` 100%,
  `state` 100% non-test (6 justified test-file exceptions),
  `three` intentional dynamic deep paths (code-splitting).
- **Caveat (does not cost a point now that the graph is enforced):** the
  `infra` barrel is nominal-only — 0 consumers route through `@/lib`
  (auth.ts side-effect carve-out, 04-found-bugs 2026-05-29). Deep paths ARE
  the documented contract for infra; the lint enforces the *direction* of
  every infra import regardless of barrel-vs-deep-path, so integrity holds.

## 2. Documentation coverage & freshness — 9/10

Measure: every module dir has a README (`for d in <10 module paths>; do
test -f $d/README.md; done`); spot-grep READMEs for claims vs code.

- 10/10 module READMEs exist (the Phase 5 report said 6 — undercounted
  by the time of writing this doc).
- Drift found AND fixed this pass: infra README claimed 3 constants
  imported from `@/game/state` (stale since PRs #259/#261), claimed the
  wrong cheat-guard order (`validateCreditsDelta` second; actual order is
  `validateMissionGraph → validateNoRegression → validatePlaytimeDelta →
  validateCreditsDelta`), ARCHITECTURE.md §"Where things live" described a
  pre-refactor ShipConfig shape (named slots / `unlockedWeapons`).
- CLAUDE.md §17's dependency table is now exactly true (infra depends on
  schemas/types/content only).
- **Gap (−1):** dated phase artifacts snapshot a superseded state and
  don't say so. A fresh agent reading the final report would chase already-
  resolved follow-ups (4 of its 7 outstanding items were resolved by the
  time of this doc); and four phase docs
  ([05-final-report.md](05-final-report.md):107,227,
  [01-inventory.md](01-inventory.md):675,
  [01-inventory-drift-2026-05-31.md](01-inventory-drift-2026-05-31.md):67,95,
  and [02-target-architecture.md](02-target-architecture.md):177 — the last
  patched with a dated note this pass since CLAUDE.md §17 cites it as
  canonical) still place the cost curves at `state/ShipConfig`. Mitigation:
  this rating doc + the ledger in [04-found-bugs.md](04-found-bugs.md) are
  the living sources; the phase reports are history. See "Next +points" item
  4 for the superseded-banner follow-up.

## 3. Automated guardrails — 9/10

Measure: `.github/workflows/ci.yml` gates; `npm test` count;
`ls tests/security/`; grep for typed-bus usage violations.

- 4 blocking CI gates (typecheck / lint / test / build) on every push + PR.
- 1416 tests across 114 files, including `tests/security/` (executable
  invariants), the JSON↔schema drift gate, save round-trip coverage, and
  per-migrator persistence tests.
- Typed Phaser event bus + registry (no string keys), Zod at every network
  edge, boot-time content integrity check, husky pre-commit
  (lint-staged + typecheck).
- **Module boundaries are now lint-enforced** (2026-06-13): per-zone
  `@typescript-eslint/no-restricted-imports` in
  [eslint.config.mjs](../../eslint.config.mjs) fails the build on any illegal
  cross-module import — `ui` deep-importing `@/game/state/stateCore`, a new
  `infra → state` back-edge, an `audio → content` value edge all error at
  `npm run lint`. Verified by deliberate-violation probes. This was the
  prior pass's "highest-leverage next improvement"; it is now shipped.
- `upgradeCurves.test.ts` + `clearedState.test.ts` pin the balance curves
  and the cleared-boundary selector (boundary tests for new content API).
- **Gap (−1):** no mutation testing or coverage-threshold gate, so a test
  can assert weakly without CI noticing. The boundary/security/round-trip
  invariants are all executable now, which is the load-bearing part; a
  coverage gate is the remaining nice-to-have.

## 4. File-size discipline — 8/10

Measure:

```bash
find src -name "*.ts" -o -name "*.tsx" | grep -v "\.test\." \
  | grep -v __tests__ | xargs wc -l | awk '$1 > 300 && $2 != "total"'
```

- 17 files over the ~300-LOC soft cap (was 18). Most carry documented
  justifications (BootScene 1829 = placeholder sprite generators pending
  real art; `api/save/route.ts` 831 = the transaction + audit-trail
  handler whose linearity is a security property; `sync.ts`,
  `saveValidation.ts`, `schemas/save.ts` = save-pipeline surfaces where
  splitting increases round-trip risk).
- **All four** of the modular audit's named ui god-files are now under cap:
  ShopUI 223, QuestPanel 197, WeaponCard 247, and **GameCanvas 286**
  (split 2026-06-13 from 353 — was 452 at audit time — by extracting
  `usePlanetFocus`, `useWarpControls`, `useSaveLoadErrorGate`, and
  `useCombatLaunch`, each a cohesive concern; behavior preserved verbatim).
- **Gap (−2):** the remaining 17 are mostly justified, but a handful lack an
  explicit in-file justification comment, and BootScene's 1829 LOC (placeholder
  art generators) skews the metric until real assets land and it splits into
  per-family `boot/` files.

## 5. Skills coverage — 10/10

Measure: `ls .claude/skills/` vs the content-task table in CLAUDE.md §10.

- 16 skill directories (15 active + `new-weapon`, a redirect stub to
  `/equipment`); every recurring content task (missions, enemies,
  equipment, perks, systems, story, migrations, voice assets) and every
  audit loop (balance, content, save round-trip, smell, deps) has one.
- Skills were drift-audited and finetuned 2026-06 (PRs #286, #288 — #288
  added `deps-triage` and `voice-asset`, taking the count 14 → 16).

## 6. Fresh-agent navigability — 9/10

Measure: the Phase 5 "fresh-agent test" protocol
([05-final-report.md §3](05-final-report.md)) — README + barrel +
CLAUDE.md §17 only; can the agent make a typical change safely?

- Phase 5 scored state PASS, infra PARTIAL, ui PARTIAL. Every named cause
  of both PARTIALs is now resolved: infra README documents the barrel
  limitation, the closed back-edge (with a "don't re-open" rule), and the
  corrected guard order; ui README has the `WeaponStatsView` import
  example; state README points curve-seekers to `@/game/data`.
- **Gap (−1):** the spot-check hasn't been formally re-run post-fixes;
  next audit pass should re-execute the protocol and record PASS/PARTIAL
  per module here.

## What changed in the 2026-06-12 pass

1. **Closed the last runtime back-edge** — moved the 7 pure cost/damage
   curves from `state/ShipConfig.ts` to `src/game/data/upgradeCurves.ts`
   (balance data belongs in content; `saveValidation.ts` now imports
   nothing from `@/game/state`). 12 importers updated; boundary test added.
2. **types barrel to 100%** — fixed the last deep import
   (`tests/security/creditCapCircular.test.ts`).
3. **Killed three doc-drift instances** — infra README (stale back-edge
   claims ×2, wrong guard order), state README (moved curves), content
   README + `upgrades.ts` header (new file pointers), ARCHITECTURE.md
   (stale ShipConfig shape, "No back-edges" claim now true and precise).
4. **Ledger updated** — resolution lines appended to both 2026-05-29
   back-edge entries in 04-found-bugs.md.
5. **This rubric** — the score is now defined, measured, and trackable.

## What changed in the 2026-06-13 pass

1. **Shipped ESLint module-boundary enforcement** (was the prior pass's #1
   Next +point). Per-zone `no-restricted-imports` in
   [eslint.config.mjs](../../eslint.config.mjs) encodes the §17 acyclic DAG;
   illegal cross-module imports fail `npm run lint`. Test files exempt;
   dynamic `import()` unaffected; `allowTypeImports` covers the two accepted
   type-only edges. Verified with deliberate-violation probes (every
   forbidden direction errors, every allowed edge passes). → guardrails 8→9.
2. **Closed the `audio → content` value edge** surfaced while writing the
   lint (the audit's "0 back-edges" had missed it). `clearedStateCue.ts`'s
   `getAllMissions()` call moved to a pure content selector
   `evaluateClearedBoundaries` ([clearedState.ts](../../src/game/data/clearedState.ts));
   the audio engine now consumes booleans and is genuinely types-only.
   Behavior identical; tests split accordingly. → boundary integrity 9→10.
3. **Documented two accepted type-only edges** (`schemas → state`,
   `audio → content` PerkId) and two benign value edges (`schemas → content`
   WEAPON_IDS, `schemas → @/lib/handle` constants) in 04-found-bugs.md.
4. **Docs synced** — CLAUDE.md §17 + ARCHITECTURE.md §11 now state the
   graph is lint-enforced; the §17 `audio` rule updated for the type-only
   nuance.
5. **Split GameCanvas 353→286** (was the prior pass's #1 file-discipline
   Next +point). Extracted four cohesive hooks — `usePlanetFocus` (3D-click→
   QuestPanel focus bridge), `useWarpControls` (warp state + next-system jump),
   `useSaveLoadErrorGate` (load-error overlay state machine), and
   `useCombatLaunch` (galaxy↔combat entry/exit). All four audit-named ui
   god-files are now under cap. → file-size discipline 7→8.

## Score history

| Date | Score | Notes |
|---|---|---|
| 2026-06-12 | 8.7 | First measured rating (this doc). Baseline ~7.8 reconstructed from the same rubric applied to the pre-pass state (open runtime back-edge, 3 doc-drift instances, types barrel 99%). |
| 2026-06-13 | 9.0 | Boundary integrity 9→10 (audio→content closed + graph lint-enforced); guardrails 8→9 (per-zone no-restricted-imports CI gate). |
| 2026-06-13 | 9.2 | File-size discipline 7→8 — GameCanvas split 353→286; all four audit-named ui god-files now under the 300 cap. |

## Next +points, in leverage order

1. **Re-run the fresh-agent spot-check** (+1 to navigability if PASS×3).
2. **Mark superseded phase artifacts**: one-line "superseded by
   04-found-bugs.md ledger + ai-first-rating" header on 05-final-report.md.
3. **Coverage / mutation gate** (+1 to guardrails): the last guardrails
   point — a coverage threshold so weak assertions can't slip through.
4. **BootScene `boot/` split** (file discipline → 9): when real art lands,
   split the 1829-LOC placeholder generator into per-family files.

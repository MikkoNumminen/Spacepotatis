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
| 2 | Documentation coverage & freshness | 9 | 10/10 module READMEs; a 5-module spot-check found + fixed 5 blocker-class drift instances (2026-06-13); dated phase artifacts can still mislead |
| 3 | Automated guardrails | 10 | 4 blocking CI gates + 1416 tests + security suite + per-zone module-boundary lint + a coverage ratchet gate (vitest thresholds ~5 pts below baseline) |
| 4 | File-size discipline | 8 | 17 files >300 LOC; all four audit-named ui god-files now under cap (GameCanvas 286); the rest are BootScene placeholder + justified save-pipeline files |
| 5 | Skills coverage | 10 | 16 skill dirs (15 active + new-weapon redirect stub) cover every content task + audits; freshness-audited 2026-06 |
| 6 | Fresh-agent navigability | 10 | MEASURED 2026-06-13: **5 PASS / 0 PARTIAL / 0 FAIL** across 5 modules (0 PASS / 1 FAIL / 5 blockers → 3 PASS after the README fixes → 5 PASS after `/equipment` gained the new-upgrade-kind + new-ship-stat procedures) |
| | **Overall (mean)** | **9.5** | |

> **Update 2026-06-13:** boundary integrity 9→10, guardrails 8→**10**, file-size
> discipline 7→8, navigability 9→**10**. The §17 graph is mechanically
> ESLint-enforced; the `audio→content` back-edge closed; GameCanvas split
> 353→286; a coverage ratchet gate fails CI on a drop; and the `/equipment`
> skill was extended to own the new-purchasable-upgrade + new-ship-stat flows,
> flipping the last 2 navigability PARTIALs to PASS. See "What changed in the
> 2026-06-13 pass" below.

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

## 3. Automated guardrails — 10/10

Measure: `.github/workflows/ci.yml` gates; `npm run coverage` totals + the
`thresholds` in `vitest.config.ts`; `ls tests/security/`; grep for typed-bus
usage violations.

- 4 blocking CI gates (typecheck / lint / test+coverage / build) on every push + PR.
- 1416 tests across 114 files, including `tests/security/` (executable
  invariants), the JSON↔schema drift gate, save round-trip coverage, and
  per-migrator persistence tests.
- Typed Phaser event bus + registry (no string keys), Zod at every network
  edge, boot-time content integrity check, husky pre-commit
  (lint-staged + typecheck).
- **Module boundaries are lint-enforced** (2026-06-13): per-zone
  `@typescript-eslint/no-restricted-imports` in
  [eslint.config.mjs](../../eslint.config.mjs) fails the build on any illegal
  cross-module import. Verified by deliberate-violation probes.
- **Coverage is a ratchet gate** (2026-06-13): the CI test step runs
  `npm run coverage` (one pass, v8 provider — no separate run) and the
  thresholds in [vitest.config.ts](../../vitest.config.ts)
  (`statements 84 / branches 76 / functions 83 / lines 87`, ~5 pts below the
  measured baseline of 89.2 / 81.9 / 88.1 / 92.9) fail CI if coverage drops.
  Verified the gate fires: forcing `lines=99` errors `Coverage for lines
  (92.86%) does not meet global threshold`. Floors ratchet UP as coverage
  rises; the legitimately-untestable-from-node surfaces (WebGL/Phaser/
  React-hook) are handled by `coverage.exclude`, not by lowering floors.
- `upgradeCurves.test.ts` + `clearedState.test.ts` pin the balance curves
  and the cleared-boundary selector (boundary tests for new content API).

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

## 6. Fresh-agent navigability — 10/10

Measure: the Phase 5 "fresh-agent test" protocol
([05-final-report.md §3](05-final-report.md)) — README + barrel +
CLAUDE.md §17 only; can the agent make a typical change safely?

- **Re-run 2026-06-13 (5 modules: state, infra, ui, content, audio), each
  with a realistic "typical change":**
  - FIRST run (before README fixes): **0 PASS / 4 PARTIAL / 1 FAIL, 5
    blockers.** The blockers were real, source-verified omissions — the
    state README never mentioned `guestCache.ts` (a whole-`StateSnapshot`
    localStorage surface); the content README's Public API had drifted out
    of sync with the barrel (omitted `upgrades.ts`/`stats.ts`/
    `clearedState.ts`/`systemUnlocks.ts`) and didn't name the `UpgradeId`
    union edit; the audio README still said "nine engines" and never
    documented `uiCues.ts` (`playUiCue`) — the exact file a UI-cue change
    needs; the infra README contradicted `index.ts` on the barrel/auth
    carve-out. This honestly showed the dimension had been OVER-rated at 9.
  - SECOND run (after the README fixes): **3 PASS / 2 PARTIAL / 0 FAIL, 0
    blockers.** state/infra/audio now PASS; ui and content remained PARTIAL
    on cross-module-wiring guidance (a new stat row / purchasable is a
    multi-module change with no single-module home).
  - THIRD run (after the `/equipment` skill extension): **5 PASS / 0 PARTIAL
    / 0 FAIL.** Rather than bloat single-module READMEs with cross-module
    flows, the `/equipment` skill gained two procedures — "a new hull/reactor
    upgrade kind" (the full id-union → registry → curve → ShipConfig field →
    mutator → ShopUI → SAVE round-trip sequence, incl. the `migrateShip`
    read-from-`raw` trap) and "a new displayed ship stat" (the StatId +
    presentation + value-source + render-site + which-modal routing) — and
    the ui/content READMEs now route these tasks to it per CLAUDE.md §10.
    Verified via the §10 skill-first path; both flipped to PASS.
- The skill extension itself was verify-don't-assert: the mapping pass
  over-claimed "two compile-invisible silent drops (schema + cloneShip)";
  reading the source showed both are actually tsc-FORCED for a required
  field (the `_shipCheck` guard + the `: ShipConfig`-typed return literals),
  and the ONE genuine silent trap is the `migrateShip` read-from-`raw`. The
  skill was corrected before commit.

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
6. **Ran the fresh-agent navigability spot-check (the prior pass's #1
   Next +point) and acted on it.** A 5-module run found navigability had
   been OVER-rated at 9 — 0 PASS / 1 FAIL / 5 blockers, the blockers being
   real source-verified doc omissions (undocumented `guestCache.ts`
   wipe-surface, content Public-API drift vs the barrel, the audio README's
   stale "nine engines" surface that hid `uiCues.ts`, the infra barrel/auth
   contradiction). Fixed all five module READMEs (doc-only) and RE-RAN the
   check: **3 PASS / 2 PARTIAL / 0 blockers.** Dimension 6's 9 is now
   MEASURED, not asserted. The honest read: this didn't raise the number,
   it *earned* it — and surfaced+fixed five drift instances that strengthen
   dimension 2 (doc freshness) too.
7. **Marked the dated audit artifacts as historical** — one-line banners on
   01-inventory.md / 01-inventory-drift / 02-target-architecture.md /
   05-final-report.md pointing at the living sources, so a fresh agent
   grepping `docs/audit/` lands on "this is history" instead of chasing a
   resolved follow-up. (Tightens dimension 2.)
8. **Added the coverage ratchet gate** (the last guardrails point). Baseline
   measured (stmts 89.2 / branch 81.9 / funcs 88.1 / lines 92.9); thresholds
   set ~5 pts below (84 / 76 / 83 / 87) in `vitest.config.ts`; CI consolidated
   so the test step runs `npm run coverage` once (no separate vitest run) and
   enforces them; the artifact uploads even on a breach. Gate-fires verified
   (forcing `lines=99` errors out). → guardrails 9→10, overall 9.2→9.3.

## Score history

| Date | Score | Notes |
|---|---|---|
| 2026-06-12 | 8.7 | First measured rating (this doc). Baseline ~7.8 reconstructed from the same rubric applied to the pre-pass state (open runtime back-edge, 3 doc-drift instances, types barrel 99%). |
| 2026-06-13 | 9.0 | Boundary integrity 9→10 (audio→content closed + graph lint-enforced); guardrails 8→9 (per-zone no-restricted-imports CI gate). |
| 2026-06-13 | 9.2 | File-size discipline 7→8 — GameCanvas split 353→286; all four audit-named ui god-files now under the 300 cap. |
| 2026-06-13 | 9.2 | Navigability spot-check run + acted on (0 PASS/5 blockers → 3 PASS/0 blockers via README fixes). Dimension 6's 9 is now measured, not asserted; overall unchanged but better-evidenced. |
| 2026-06-13 | 9.3 | Guardrails 9→10 — coverage ratchet gate (vitest thresholds ~5 pts below baseline, enforced in the consolidated CI test step; @vitest/coverage-v8 was already installed). Gate-fires verified. |
| 2026-06-13 | 9.5 | Navigability 9→10 — `/equipment` skill extended with the new-hull/reactor-upgrade-kind + new-ship-stat procedures (+ ui/content README routing); the last 2 spot-check PARTIALs flipped to PASS (5 PASS / 0 PARTIAL, verified via the §10 skill-first path). |

## Next +points, in leverage order

The high-value levers are done (overall 9.5; only dimension 4 is below 9, and
that's the documented BootScene placeholder). What remains is genuinely
low-priority or blocked:

1. **BootScene `boot/` split** (file discipline 8→9): blocked on real sprite
   art landing — the 1829-LOC file is a documented placeholder generator.
2. **Dimension 2 → 10** (doc freshness): would need the dated phase artifacts
   either archived or rewritten, not just banner-marked. Marginal.
3. **Mutation testing** (beyond the coverage gate): catches assertions that
   execute lines without checking behavior. A larger CI-time investment;
   weigh against the §13 budget.

> **Done 2026-06-13:** "mark superseded phase artifacts" — added a HISTORICAL
> banner to 01-inventory.md, 01-inventory-drift-2026-05-31.md,
> 02-target-architecture.md, and 05-final-report.md pointing at the living
> sources (04-found-bugs.md ledger + this rating doc), so a fresh agent
> grepping the audit dir lands on a "this is history" notice instead of
> chasing a resolved follow-up.

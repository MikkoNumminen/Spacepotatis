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
| 1 | Module boundary integrity | 9 | 0 runtime back-edges; 1 accepted type-only exception; infra barrel nominal-only |
| 2 | Documentation coverage & freshness | 9 | 10/10 module READMEs, drift found this pass fixed; dated phase artifacts can mislead |
| 3 | Automated guardrails | 8 | 4 blocking CI gates + 1411 tests + security suite; no lint-level boundary enforcement |
| 4 | File-size discipline | 7 | 18 files >300 LOC; most justified, GameCanvas (353) still over from the audit's named four |
| 5 | Skills coverage | 10 | 16 skill dirs (15 active + new-weapon redirect stub) cover every content task + audits; freshness-audited 2026-06 |
| 6 | Fresh-agent navigability | 9 | All Phase 5 PARTIAL causes fixed; needs a fresh spot-check run to confirm PASS×3 |
| | **Overall (mean)** | **8.7** | |

## 1. Module boundary integrity — 9/10

Measure:

```bash
# deep-path imports into a module from outside it (repeat per module)
grep -rn 'from "@/game/state/' src --include="*.ts" --include="*.tsx" \
  | grep -v "\.test\." | grep -v "src/game/state/"
```

Measured 2026-06-12:

- **0 runtime back-edges.** The last one (`infra → state` via
  `saveValidation.ts` importing `weaponUpgradeCost`) closed this session —
  the full cost-curve family moved to
  [`src/game/data/upgradeCurves.ts`](../../src/game/data/upgradeCurves.ts).
- **1 accepted type-only exception:** `schemas/save.ts:43 → state/ShipConfig`
  (ship-shape TYPES; erased at compile time; documented in
  [04-found-bugs.md](04-found-bugs.md) 2026-05-29 + AI-NOTE in file).
- Barrel routing: `types` 100% (last deep path fixed this session),
  `schemas`/`audio`/`content`/`phaser` 100%, `state` 100% non-test
  (6 test-file exceptions, all justified — down from 7),
  `three` intentional dynamic deep paths (code-splitting).
- **Gap (−1):** the `infra` barrel is nominal-only — 0 consumers route
  through `@/lib` (auth.ts side-effect carve-out, 04-found-bugs 2026-05-29).
  Deep paths ARE the documented contract for infra; structural, accepted.

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

## 3. Automated guardrails — 8/10

Measure: `.github/workflows/ci.yml` gates; `npm test` count;
`ls tests/security/`; grep for typed-bus usage violations.

- 4 blocking CI gates (typecheck / lint / test / build) on every push + PR.
- 1411 tests across 113 files, including `tests/security/` (executable
  invariants), the JSON↔schema drift gate, save round-trip coverage, and
  per-migrator persistence tests.
- Typed Phaser event bus + registry (no string keys), Zod at every network
  edge, boot-time content integrity check, husky pre-commit
  (lint-staged + typecheck).
- New since this pass: [`upgradeCurves.test.ts`](../../src/game/data/upgradeCurves.test.ts)
  pins every balance curve (boundary test for the new content API).
- **Gap (−2):** module boundaries are enforced by review + docs only.
  Nothing mechanical stops `ui` from deep-importing `@/game/state/stateCore`.
  An ESLint `no-restricted-imports` (or `import/no-internal-modules`)
  config encoding §17 would convert the boundary rules from prose to CI.
  This is the highest-leverage next improvement.

## 4. File-size discipline — 7/10

Measure:

```bash
find src -name "*.ts" -o -name "*.tsx" | grep -v "\.test\." \
  | grep -v __tests__ | xargs wc -l | awk '$1 > 300 && $2 != "total"'
```

- 18 files over the ~300-LOC soft cap. Most carry documented
  justifications (BootScene 1829 = placeholder sprite generators pending
  real art; `api/save/route.ts` 831 = the transaction + audit-trail
  handler whose linearity is a security property; `sync.ts`,
  `saveValidation.ts`, `schemas/save.ts` = save-pipeline surfaces where
  splitting increases round-trip risk).
- Of the modular audit's four named ui god-files, three are now under cap
  (ShopUI 223, QuestPanel 197, WeaponCard 247); **GameCanvas at 353**
  remains over despite the PR-split to hooks (was 452).
- **Gap (−3):** GameCanvas still over cap; a handful of the 18 lack an
  explicit in-file justification comment.

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

## Score history

| Date | Score | Notes |
|---|---|---|
| 2026-06-12 | 8.7 | First measured rating (this doc). Baseline ~7.8 reconstructed from the same rubric applied to the pre-pass state (open runtime back-edge, 3 doc-drift instances, types barrel 99%). |

## Next +points, in leverage order

1. **ESLint boundary enforcement** (+1 to guardrails, →~8.9): encode §17
   in `no-restricted-imports` so cross-module deep paths fail CI.
2. **GameCanvas under 300** (+1–2 to file discipline): one more hook
   extraction (story-trigger wiring or the planet-click bridge).
3. **Re-run the fresh-agent spot-check** (+1 to navigability if PASS×3).
4. **Mark superseded phase artifacts**: one-line "superseded by
   04-found-bugs.md ledger + ai-first-rating" header on 05-final-report.md.

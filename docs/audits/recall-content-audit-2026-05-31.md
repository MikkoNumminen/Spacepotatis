# Recall-mode calibration — content-audit (2026-05-31)

First live run of the recall harness (`calibration/`) against the `content-audit`
skill, on **Opus 4.8** — the model the project now runs. Answers the question the
2026-05-27 skills registry left open: is content-audit's **−25% "token save"** on
Opus a sign the skill is worthless, or is the token metric blind to what an audit
skill is for?

## TL;DR

**The −25% is metric-blindness, not bloat — but the skill's value on Opus is
*reproducibility*, not recall.** Measured by defect recall against 9 seeded,
tsc-clean content defects:

| | Cold (generic prompt, n=3) | Skill (SKILL.md, n=3) |
|---|---|---|
| Recall (mean) | **92.6%** (25/27) | **100%** (27/27) |
| Reproducibility (Jaccard) | **0.85** (min 0.78) — unstable | **1.00** — deterministic |
| Precision | 100% | 100% |

A cold Opus audit already finds ~93% of defects — but **not the same set every
run**. One of three cold runs silently dropped the DAG cycle (hard) and the
tier-gating leak (medium). The skill catches the same complete set every time.
For a pre-commit gate, "catches everything 2 runs out of 3" is a coin-flip, not a
gate; deterministic completeness is the whole point. That determinism is the
keep-justification — the token "save %" was measuring the wrong axis entirely.

## What changed vs the registry's −25%

The registry measured *tokens*. A thorough audit legitimately spends more tokens
than a cold pass, so token-scoring reports it negative exactly when it does its
job. Recall-scoring shows the skill is net-positive (it never *loses* recall, and
it stabilizes a flaky cold pass). The registry entry for content-audit should
read **"+7pp recall, 0.85→1.00 reproducibility"**, not "−25% save."

## Two bounds on the result (both narrow the skill's marginal value, honestly)

**1. CI already covers 3 of the 9 defects.** `runDataIntegrityCheck`
([src/game/data/integrityCheck.ts](../../src/game/data/integrityCheck.ts)) +
`data.test.ts` already gate the orphan enemy / mission-solarSystem /
story-trigger cross-refs — they throw at boot and fail CI regardless of any
audit. content-audit's **unique territory is the other 6 defects**, which
`integrityCheck.ts` explicitly puts out of scope: sprite-key coverage (×2), audio
file existence on disk (×1), **DAG cycles** (it guards self-ref only, not cycles)
(×1), family/tier gating (×1), and credit-range sanity (×1). On those 6, cold =
**16/18 (89%)**, skill = **18/18 (100%)** — and both cold misses (the DAG cycle
and the family leak) live here. So the skill's real incremental value over
(CI + cold Opus) is small but real, and concentrated exactly where reasoning
(not pattern-matching) is required.

**2. Arm C (CLAUDE.md stripped) was not run.** The cold arm still received the
~600-line `CLAUDE.md`, which documents the integrity surface — so the cold arm
wasn't truly cold (the documented "cold arm isn't cold" bias). On a repo with a
thinner CLAUDE.md the recall lift would be larger. Running arm C is the next step
to isolate skill value from CLAUDE.md duplication.

## A finding the *cold* arm caught and the *skill* arm missed

One cold run flagged a **real, unseeded bug**: the `$schema` pointers in the
content JSON (`"$schema": "./schema/<name>.schema.json"`) reference
`src/game/data/schema/`, which **does not exist**. Cosmetic (editor IntelliSense
only; Zod validation is separate), but a mis-reference shipped in content. The
skill arm missed it — it's not on the checklist. **Lesson: a rigid checklist
guarantees its own checks but blinds the auditor to off-checklist issues.**
content-audit should not be treated as a substitute for the occasional
open-ended cold pass; and the checklist could add a `$schema`-pointer check.

## Method

- 9 seeded defects ([calibration/fixtures/content-audit/defects.json](../../calibration/fixtures/content-audit/defects.json)),
  each a tsc/lint/schema-clean content-invariant violation. Applied into an
  isolated worktree pinned to the harness commit via the drift-guarded
  `apply-defects.mjs`.
- 3 cold Opus agents (generic "is this content safe to commit?" prompt, **no
  defect taxonomy**) + 3 skill Opus agents (read + follow the SKILL.md). All
  audited the same seeded worktree and returned findings on the structured
  contract. Graded by the deterministic `grade-recall.mjs` (anchor-match against
  ground truth; no model grades itself).
- Tokens: ~115k/agent (cold) and ~115k/agent (skill) — comparable; the token
  axis does not separate them, which is the point.

### Discarded first run

An initial run is **not** reported above: its prompt enumerated the defect
classes to *both* arms, leaking the content-audit checklist into the cold arm —
which then scored 100% (= skill). That is the "cold arm isn't cold" error in its
purest form, committed by the experimenter. The clean run (above) gave the cold
arm only the natural trigger phrase with no taxonomy. The episode is itself a
data point: **calibration design is where these measurements go wrong**, exactly
as the registry's own methodology notes warn.

## Caveats

- N=3 per arm; single defect corpus; defects derived from the content-audit
  checklist (which biases *toward* the skill — yet cold still nearly matched it).
- Reproducibility is the load-bearing number here and it has the firmest signal
  (cold demonstrably unstable, skill demonstrably stable across 3 runs each).
- Recall percentages are single-corpus point estimates; trust the *direction*
  (skill ≥ cold, skill deterministic) over the exact pp.

## Verdict

**Keep content-audit.** Reframe its value: it is a *deterministic gate* for the
~6 content invariants CI does not cover, where an unguided Opus audit is
good-but-flaky. Do not cut it on the −25% token number — that number never
measured what the skill is for. Follow-ups: run arm C; add a `$schema`-pointer
check; consider dropping/annotating the 3 CI-redundant checks so the skill
focuses on its unique territory.

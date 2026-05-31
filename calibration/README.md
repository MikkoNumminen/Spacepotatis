# calibration — recall-mode measurement for audit skills

Dev-only tooling. Not shipped, not in the typecheck graph, ignored by ESLint
(see `eslint.config.mjs`). Nothing here runs in CI or at build time.

## Why this exists

The portfolio's token-only A/B calibration (`mikko-skill-calibration`) measures
whether a skill reaches the same answer with *fewer tokens*. That's the right
question for **scaffolding** skills (`new-enemy`, `equipment`): both arms must
produce the same correct artifact, so fewer tokens = a real win.

It is the **wrong instrument for audit skills**. An audit's output is a
*findings set* — its value is recall and consistency, not token compression. A
cold arm that does a cheap, shallow, *wrong* audit scores *better* on tokens
than a thorough one. So a negative "save %" on `content-audit` (−25% on Opus in
the 2026-05-27 registry) tells you nothing about whether the skill is good — the
metric's sign can be *inverted* relative to value.

This harness measures the thing that actually matters for an audit skill:
**defect recall**, with token cost demoted to a secondary "cost per defect"
axis. The reference run below makes the inversion concrete.

## The reference run (validated)

```
node calibration/grade-recall.mjs \
  --defects calibration/fixtures/content-audit/defects.json \
  --arm A=...examples/armA-findings.json \
  --arm B=...examples/armB-findings.json \
  --tokens A=71000 --tokens B=88000
```

| Arm | Recall | Tokens (total) | Tokens/defect | Token-only verdict | Recall verdict |
|---|---|---|---|---|---|
| A (cold) | 22% (2/9) | 71k | 35.5k | baseline | — |
| B (skill) | 100% (9/9) | 88k | 9.8k | **−24% "save" → worst** | **+78pp recall → earns its keep** |

Arm B costs *more total tokens* and catches *4.5× more defects*. Token-only
scoring buries it; recall scoring vindicates it. That gap is the whole reason
this directory exists.

## Pieces

| File | Role |
|---|---|
| `apply-defects.mjs` | Seeds known defects into a throwaway worktree. **Dry-run by default — pass `--apply` to write** (mirrors the dbWriteSafety convention). Drift-guarded: aborts (writes nothing) if any anchor no longer matches the source. |
| `grade-recall.mjs` | Deterministic grader. Recall (bucketed by difficulty), precision, reproducibility (Jaccard across repeated runs), tokens/defect. Read-only; never lets a model grade itself. |
| `fixtures/<skill>/defects.json` | The seeded-defect corpus for one audit skill, grounded against current master. |
| `fixtures/<skill>/examples/` | Synthetic findings files used to validate the grader without a live A/B. |
| `RECALL-MODE.md` | The drop-in `--mode=recall` section for `claude-skills/skills/skill-calibration/SKILL.md`. |

## How a real recall calibration runs (3 arms)

The token A/B uses 2 arms. Recall mode uses **3**, because in this repo the
"cold" arm isn't actually cold — it still receives the ~600-line `CLAUDE.md`,
which duplicates much of what an audit SKILL.md would say:

- **Arm A** — `CLAUDE.md`, no SKILL.md (today's "cold").
- **Arm B** — `CLAUDE.md` + SKILL.md (today's "skill").
- **Arm C** — SKILL.md, `CLAUDE.md` stripped/stubbed (skill in isolation).

`recall(B) − recall(A)` is the marginal value *on top of CLAUDE.md*.
`recall(C) − recall(A)` isolates the skill's standalone contribution. If
`recall(B) ≈ recall(A)` but `recall(C) ≫ recall(A)`, the skill works fine — your
fat `CLAUDE.md` just fed the cold arm the answers, and the fix is to report
this-repo skills separately, not to cut the skill.

Each arm runs in a fresh worktree; `apply-defects.mjs` seeds the same defects
into each; the arm writes its findings to the contract path
(`.calib/findings.json`); `grade-recall.mjs` scores them. See `RECALL-MODE.md`
for the full arm prompts and the keep/cut criterion.

## Status

- `content-audit`: 9 verified defects + 2 stubs. Anchors validated against
  master 2026-05-31.
- Other audit skills (`balance-review`, `save-roundtrip-audit`): TODO — add a
  `fixtures/<skill>/defects.json`. `balance-review` needs a different fixture
  shape (seeded *balance regressions* with ground-truth math, not orphan refs).

## Promotion to claude-skills

`apply-defects.mjs` and `grade-recall.mjs` are skill-agnostic and belong next to
`skill-calibration` in the `claude-skills` library once that skill lands on
`master` (it is currently mid-flight on the `chore/skills-token-estimates`
branch). Fixtures stay here — they patch Spacepotatis content and must version
with it. `RECALL-MODE.md` is the section to paste into the skill at that time.

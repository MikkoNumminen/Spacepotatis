<!--
DROP-IN SECTION for claude-skills/skills/skill-calibration/SKILL.md.

Paste this as a new `## Recall mode (--mode=recall)` section once skill-calibration
lands on master. It extends the existing token-only A/B; it does not replace it.
The generic scripts it references (apply-defects.mjs, grade-recall.mjs) should be
copied into skills/skill-calibration/scripts/ at the same time. The per-skill
fixtures stay in the probed repo (e.g. Spacepotatis/calibration/fixtures/).
-->

## Recall mode (`--mode=recall`)

The default A/B measures **tokens**. For an **audit** skill that is the wrong
objective function — the skill's value is *defect recall*, and a thorough audit
legitimately spends more tokens than a cold pass. Token-only scoring then reports
the skill as negative ("costs more") exactly when it is doing its job. The
`ai-codegen-smell-audit` row in the registry is the canonical trap: 48% "save" in
arm B that actually reflected arm B finding 1 issue vs arm A's 11.

Recall mode answers the right question: **does the skill catch more seeded
defects than the cold arm?** Token cost is demoted to a secondary "cost per
defect" axis and never decides keep-vs-cut.

Invoke with `--mode=recall --skill <audit-skill>`. Requires a fixture at
`<probed-repo>/calibration/fixtures/<skill>/defects.json`.

### Arms (three, not two)

The default mode's "cold" arm is not cold on a repo with a rich `CLAUDE.md` — it
receives that file, which often duplicates an audit SKILL.md's checklist. So
recall mode runs three arms to separate the skill's value from CLAUDE.md leakage:

| Arm | Context | Measures |
|---|---|---|
| A | `CLAUDE.md`, no SKILL.md | today's "cold" baseline |
| B | `CLAUDE.md` + SKILL.md | marginal value *on top of* CLAUDE.md |
| C | SKILL.md, `CLAUDE.md` stripped | the skill's standalone value |

`recall(B) − recall(A)` = marginal lift in this repo. `recall(C) − recall(A)`
isolates the skill. **`recall(B) ≈ recall(A)` with `recall(C) ≫ recall(A)` is the
signature of CLAUDE.md duplication** — the skill is fine; the cold arm just had
the answers handed to it. Fix by reporting this-repo skills separately, not by
cutting the skill.

### Procedure

1. **Resolve the fixture.** Read `calibration/fixtures/<skill>/defects.json`.
   Bail if absent (recall mode needs a seeded corpus; there is nothing to grade
   without one).
2. **Three worktrees**, branched from master: `calib-recall-A/B/C-<skill>`. For
   arm C, blank or stub `CLAUDE.md` in that worktree before the agent runs.
3. **Seed defects** into each worktree:
   `node scripts/apply-defects.mjs --defects <fixture> --worktree <wt>`.
   The applier is drift-guarded — if it aborts, the fixture is stale; refresh it
   before continuing (a stale fixture silently measures nothing).
4. **Dispatch one sub-agent per arm** with the prompts below. Each writes its
   findings to `.calib/findings.json` in its worktree.
5. **Reproducibility:** dispatch arm B **three times** (same prompt, fresh
   worktrees) — recall mode's headline trust signal is whether the skill reports
   the *same* defects run-to-run.
6. **Grade** (deterministic, never the model):
   ```
   node scripts/grade-recall.mjs --defects <fixture> \
     --arm A=<wtA>/.calib/findings.json \
     --arm B=<wtB>/.calib/findings.json \
     --arm C=<wtC>/.calib/findings.json \
     --repro B=<wtB1>,<wtB2>,<wtB3> \
     --tokens A=<n> --tokens B=<n> --tokens C=<n> \
     --out docs/audits/recall-<skill>-<YYYY-MM-DD>.md
   ```
7. **Verdict.** Apply the keep criterion below. Surface it; do not auto-edit the
   registry.

### Arm prompt templates

**Arm A (cold, CLAUDE.md present):**
```
You are the BASELINE arm of a recall calibration. No skill awareness.
Worktree: <WT>. Repo: <REPO>.
Task: Audit this repo's game content for integrity problems (orphan references,
  missing sprites/assets, broken prereq graphs, invalid loot pools, broken story
  triggers). Report every problem you find.
Constraints:
- DO NOT read .claude/skills/ or any SKILL.md. You are the no-skill arm.
- Write your findings to <WT>/.calib/findings.json in this shape:
  { "findings": [ { "file": "...", "line": 42, "kind": "...", "claim": "<names the specific bad id/path>" } ] }
- The `claim` MUST name the specific offending value (the bad id, the missing path).
- DO NOT commit. Final message: one line, count of findings.
```

**Arm B (skill, CLAUDE.md present)** — same as A, but replace the first
constraint with:
```
- Read <WT>/.claude/skills/<SKILL>/SKILL.md first and follow its checklist exactly.
```

**Arm C (skill, CLAUDE.md stripped)** — same as B; the harness has already
blanked CLAUDE.md in this worktree.

### Findings contract

`.calib/findings.json`: `{ "findings": [ { "file, "line"?, "kind"?, "claim" } ] }`.
The grader matches a finding to a seeded defect when the file path-matches AND
every `groundTruth.anchor` substring appears in `claim`. `kind` is recorded for
context but not required to match (arms use inconsistent vocab). This is why the
prompt demands the `claim` name the specific bad value — the anchor is the bad
value.

### Keep / cut criterion (replaces "save %")

An audit skill **earns its keep** iff, on the medium+hard buckets:
```
recall(B) − recall(A) ≥ +0.20        (meaningful lift; needs N ≥ 8 defects to clear noise)
AND precision(B) ≥ precision(A)       (didn't buy recall with false positives)
AND reproducibility(B) ≥ 0.80 Jaccard (trustworthy enough to gate)
```
Token cost is irrelevant to this decision; it only ranks two skills that both
pass. If `recall(B) ≈ recall(A)` AND `recall(C) ≈ recall(A)` → genuine bloat,
trim or retire. If `recall(B) ≈ recall(A)` but `recall(C) ≫ recall(A)` →
CLAUDE.md duplication, keep and report this-repo separately.

### Registry presentation

Audit skills get a **different verdict column** from scaffolding skills — do not
put them in the same "save %" column; that column is the source of the
misleading negative number. Report audit skills as
**"recall lift (med+hard), reproducibility, tokens/defect"**. The negative token
delta, if shown at all, lives only in the tokens/defect column, correctly framed
as cost — never as value.

### Limitations (recall mode specific)

- Recall is only as good as the seeded corpus. A defect class not in
  `defects.json` is invisible — `grade-recall.mjs` logs the applicable count so a
  thin corpus is obvious. Grow the corpus alongside the skill's checklist.
- Unmatched findings are flagged for **human adjudication**, not auto-scored:
  an arm can surface a real, unseeded bug (counts for it) or a false positive
  (counts against precision). The grader cannot tell these apart; a human decides
  once per fixture revision.
- Seeded defects must be tsc/lint/schema-clean, or the compiler catches them and
  the test measures the toolchain, not the skill.

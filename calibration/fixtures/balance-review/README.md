# balance-review defect fixture

Seeded regressions for recall-mode calibration of the `balance-review` skill.

**Why the shape differs from content-audit.** `balance-review` is a *diff* tool: it
compares the dirty working tree against `HEAD` and reports DPS / TTK / energy-per-DPS
/ credit deltas, plus a "Flagged issues" list. The recall harness already produces
exactly that input — `apply-defects --apply` mutates the worktree **without
committing**, so the seeded regressions show up as uncommitted edits vs `HEAD`, which
is what `balance-review` reads (`git status` + `git show HEAD:<path>`). No special
mode needed; the same seeder + grader work.

What's gradeable here is two kinds of output:
- **Delta reporting** (balance-review's core) — did the arm compute and report the
  metric shift for a changed entity? Graded by anchoring on `entity-id + metric`.
- **Flagged issues** (binary) — did the arm flag a known balance hazard?

## Verified defects (3)

| id | kind | difficulty | What it plants | Ground-truth math / flag |
|---|---|---|---|---|
| `bal-weapon-dps-buff` | delta | medium | `rapid-fire` damage `6 -> 60` | DPS = `damage·projectileCount·(1000/fireRateMs)` = `6·1·8.33 = 50` → `500` (+900%). Must report the DPS delta (and ideally cascade to TTK vs every enemy). |
| `bal-credits-inverted` | flag | easy | tutorial-tier pool `credits {min:500,max:1000}` → `{min:1000,max:500}` | balance-review flags `credits.min >= max`. |
| `bal-family-leak` | flag | medium | adds `corsair-missile` (pirate/tier-2) to the potato-only tutorial pool | balance-review's cross-system gating flags a family-gated weapon in the wrong pool. |

Two of these (`credits`, `family-leak`) overlap the content-audit fixture by design —
they're legitimately on *both* skills' checklists. The discriminating, balance-unique
defect is `bal-weapon-dps-buff`: a cold arm asked "what did this change do to balance?"
must actually *compute* the DPS shift, which is where the skill's formula knowledge
earns its keep.

## Grading note

balance-review's natural output is a markdown table (`id | metric | before | after | Δ%`).
The arm must still emit the structured `.calib/findings.json` contract; each finding's
`claim` should name the entity id and the metric (e.g. "rapid-fire DPS 50 → 500
(+900%)"), which is what the anchors match against.

## Extending

Add TTK-vs-enemy regressions (bump an `enemies.json` hp), energy-per-DPS (move a
weapon's `energyCost`), augment effective-DPS (tweak a `*Mul` in `augments.ts`), or
the `homing-up turnRateMul` "no homing weapon affected" flag. Each is one anchored
op + a ground-truth anchor of `entity-id + metric`. Validate with
`node ../../apply-defects.mjs --defects defects.json --worktree <repo-root>` (dry-run
is the default — it writes nothing).

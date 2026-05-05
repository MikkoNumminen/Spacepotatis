# Security audit — progress checkpoint

This file is the resume-protocol checkpoint for `/security-audit`. The orchestrator skill (`.claude/skills/security-audit/SKILL.md`) reads it on resume to figure out the next phase / next finding to dispatch.

**Convention:** every phase or fix appends to this file. **Never rewrite history** — append-only. If a finding turns out to need a redo, append a new entry referencing the prior one rather than editing it.

## Format per entry

For phase-level checkpoints:

```
## Phase N — <name> (status: <pending | in-progress | complete>)
- Started: <date>
- Completed: <date or "—">
- Artifact: <docs/security/NN-name.md>
- PR: <#NNN or "no PR — doc-only">
- Notes: <one-line callout>
```

For Phase 3 finding-level checkpoints (one per `security-fixer` run):

```
## Phase 3 — finding: SEC-XXX <title>
- Worktree: <path or "main">
- Branch: <feat/security-sec-XXX-name>
- Commit: <sha or "staged">
- Files changed: <list>
- Test added: <path:test-name>
- Save-roundtrip-audit run? (Y/N — N only if not save-touching)
- Migration required? (Y/N — Y only if schema-touching; if Y, applied-to-prod date)
- Deviations from plan: <list, each with reason>
- Tests / typecheck / build / lint: green at <hh:mm>
- PR: <#NNN>
```

## Audit log

### Phase 0a — Skill reconciliation (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/00-skill-reconciliation.md](00-skill-reconciliation.md)
- PR: #158 (bundled with all Phase 0–2b artifacts)
- Notes: net-add — no prior security skill existed to merge.

### Phase 0b — Agent setup (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/00-agent-setup.md](00-agent-setup.md)
- PR: #158
- Notes: 3 agent contract specs added (`.claude/agents/security-{auditor,fixer,doc-writer}.md`). Custom agents are inline-able specs, NOT registered subagent_types.

### Phase 1 — Attack-surface map (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/01-attack-surface.md](01-attack-surface.md)
- PR: #158
- Notes: 0 critical, 0 high. 11 sub-areas covered with file:line evidence. The cheat guards in `src/lib/saveValidation.ts` and the `playerEmail` stamp on `src/game/state/saveQueue.ts` are doing the work CLAUDE.md describes. No real secret in git history. `npm audit` advisories don't apply to current code paths.

### Phase 2 — Findings + plan (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/02-findings-and-plan.md](02-findings-and-plan.md)
- PR: #158
- Notes: 10 SEC-XXX findings, 5 A/B option pairs, 1 architectural finding (A-001 rate-limit infra).

### Phase 2b — Maximum-attack pen-test battery (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-05
- Artifact: [docs/security/02b-attack-cells.md](02b-attack-cells.md)
- PR: #158
- Notes: 10 parallel adversarial cells; 22 net-new findings; final tally 0 critical / 0 high / 9 medium / 15 low / 8 informational (3 risk-accept). Highest-impact addition: SEC-011 (audit-table size-cap DoS amplifier).

### Phase 3 — Remediation (status: in-progress)

PR #158 merged at `cd3d0f2` (2026-05-05). Wave 1 dispatches 8 medium findings (SEC-001, 003, 007+021, 011, 012, 013, 014, 015) in parallel worktree branches off master.

#### Wave 1 kickoff — decisions log (2026-05-05)

**SEC-007+021 approach** — three options considered:
- (A) Adopt `fix/restore-script-safety` local branch (deletes `scripts/improve-restore.mjs` entirely). Cleaner final state but requires coordinated updates to CLAUDE.md §11 + §15, INCIDENT_RUNBOOK.md, removal of 2 `writeBackup-wiring.test.mjs` describe blocks, and removal of operator capability for future second-pass restoration. **Logged, not chosen.**
- (B) **Retrofit `parseFlags` + `requireConfirm` + transaction wrapper onto `improve-restore.mjs`. Smaller blast radius (script + 1 test). Preserves operator capability. CLAUDE.md §15 stays accurate (just removes "predates the helper" language). CHOSEN.**
- (C) Skip — leave `improve-restore.mjs` as-is. Footgun stays. **Logged, not chosen.**

**Wave 1 parallel-worktree dispatch order** — launching 4 truly-disjoint fixes first (SEC-001 next.config.mjs, SEC-007+021 improve-restore.mjs, SEC-012 auth.ts comment, SEC-015 workflow SHA pins). The 4 file-overlapping fixes (SEC-003+014 share `src/lib/schemas/save.ts` + leaderboard route; SEC-011+013 share save route + schema) come next, sequentially. Alternative considered: launch all 8 simultaneously, accept rebase pain on the second-to-merge of each overlapping pair. **Logged, deferred** — staggered approach is cheaper for review.

**`refactor/zod-content-accessors` CLAUDE.md violation flag.** Local-only WIP branch adds runtime `Schema.parse(jsonData)` at module load — directly contradicts CLAUDE.md §5's hard rule (~98 kB first-load JS regression). Logged in `docs/security/04-other-findings.md` so it doesn't accidentally land. Not a Wave 1 concern.

### Phase 3 — finding: SEC-015 actions SHA pinning
- Worktree: main (feat/security-sec-015-actions-sha-pin)
- Branch: feat/security-sec-015-actions-sha-pin
- Commit: staged
- Files changed: .github/workflows/ci.yml, .github/workflows/audit-readiness-check.yml, src/__tests__/actionsShaPinning.test.ts, docs/security/02b-attack-cells.md, docs/security/_progress.md
- Test added: src/__tests__/actionsShaPinning.test.ts: "SEC-015 — GitHub Actions are pinned to commit SHAs, not mutable tags"
- Save-roundtrip-audit run? N — not save-touching
- Migration required? N
- Deviations from plan: none
- Pinned SHAs: actions/checkout → 34e114876b0b11c390a56381ad16ebd13914f8d5 (v4.3.1); actions/setup-node → 49933ea5288caeca8642d1e84afbd3f7d6820020 (v4.4.0); actions/upload-artifact → ea165f8d65b6e75b540449e92b4886f43607fa02 (v4.6.2)
- Tests / typecheck / build / lint: green (1161 tests, 82 files)
- PR: pending

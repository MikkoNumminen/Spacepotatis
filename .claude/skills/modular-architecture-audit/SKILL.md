---
name: modular-architecture-audit
description: Orchestrates the multi-phase modular-architecture audit + refactor — file inventory, module-boundary proposal, mechanical extraction (parallelizable across worktrees), AI-first docs, verification. Each phase writes an artifact under docs/audit/ and STOPS at a gate for user approval. Never auto-advances.
---

# When to use

- The user invokes `/modular-architecture-audit` to start or resume the modular-refactor audit.
- The user asks "let's refactor toward proper modules" or "let's audit the architecture for AI-friendliness".
- The user references `docs/audit/_progress.md` and asks to continue.

This skill is **the orchestrator**. It does NOT do the agents' work itself — it dispatches the right specialized agent for each phase, gates on artifacts, and waits for explicit user approval before advancing.

# The phases

Each phase produces exactly one artifact and STOPS. Do not start the next phase without the user typing "approved" (or equivalent).

| Phase | Agent | Artifact | Gate |
|-------|-------|----------|------|
| 0 — Agent setup | (orchestrator) | `docs/audit/00-agent-setup.md` | User confirms agents are correctly defined |
| 1 — Inventory | `refactor-architect` | `docs/audit/01-inventory.md` | User confirms inventory is accurate |
| 2 — Proposed boundaries | `refactor-architect` | `docs/audit/02-target-architecture.md` | User approves module boundaries |
| 3 — Refactor (per module) | `module-extractor` × N | per-module commits + `docs/audit/_progress.md` updates | User approves at module-list end |
| 4 — Documentation | `doc-writer` | per-module READMEs/TSDoc + `docs/audit/03-documentation-summary.md` | User approves docs |
| 5 — Verification | `refactor-architect` | `docs/audit/05-final-report.md` | Audit complete |

Artifact numbers form one fixed 00–05 sequence and do not mirror phase numbers (Phase 3 has no numbered artifact; Phase 4 writes `03-documentation-summary.md`). `docs/audit/04-found-bugs.md` is the always-on bug log: any phase's agent appends bugs it is forbidden from fixing (the shipped entries came from the Phase 1 inventory walk).

# Orchestration rules

1. **One phase per turn.** Never run Phase 1 and Phase 2 in the same dispatch.
2. **Re-read the prior artifact before dispatch.** If Phase 2's plan is the input to Phase 3, the Phase 3 dispatch reads it and quotes the relevant module spec into the agent's prompt — do NOT make the agent search for it.
3. **One module per `module-extractor` invocation.** Phase 3 fires the extractor N times, in the migration order from Phase 2. They can run in parallel via `isolation: "worktree"` if the modules have no overlap. If two proposed modules touch the same file, serialize them.
4. **Gate explicitly.** After every phase, present the artifact's path and a short summary, and ask the user "Phase N complete — review and reply 'approved' to continue, or 'redo' with changes." Do not advance on a non-explicit nod.
5. **Behavior preservation is non-negotiable.** Each phase's artifact must affirm "no behavior changes" or list the exceptions explicitly with rationale.
6. **Save data gets extra scrutiny.** Any module touching `src/game/state/persistence`, `src/lib/db.ts`, `src/lib/schemas/save.ts`, `src/app/api/save/route.ts`, or `src/lib/saveValidation.ts` triggers `/save-roundtrip-audit` BEFORE that module's commit lands.
7. **Checkpointing.** If a phase grows too large for one session, the agent appends to `docs/audit/_progress.md` with what's done and what's next, and the orchestrator (this skill) resumes from there next session.

# Resume protocol

When the skill is invoked and `docs/audit/_progress.md` already exists:

1. Read `_progress.md`.
2. Identify the next pending phase (or the next pending module within Phase 3). If `docs/audit/05-final-report.md` exists, the audit already ran to completion — treat the invocation as a drift re-check (pattern: `docs/audit/01-inventory-drift-2026-05-31.md`), not a resume; `_progress.md` under-logs the landed Phase 3 extractions.
3. Re-state the user-facing summary: "We're on Phase X. Last completed: <Y>. Next dispatch: <Z>."
4. Wait for "go" before dispatching.

# Anti-patterns

- **Don't merge phases.** Phase 1's "no proposals" rule is load-bearing — proposals from a still-incomplete inventory tend to lock in the wrong shape.
- **Don't dispatch a generalist agent.** Use the named agent for each phase. The whole reason these agents exist is single-responsibility scoping.
- **Don't push or open PRs on the agent's behalf.** The module-extractor commits locally by default (one commit per module; `--no-commit` in its prompt leaves a staged-clean tree instead) and never pushes or runs `gh pr create` unless the orchestrator's prompt explicitly allows it.

## Freshness check

Asserts the dispatched sub-agents, the save-roundtrip gate, a rule-6 trigger path, the contract phrasing, and markdown-link integrity still hold. Project scope: non-`skill_dir` paths resolve against the repo root.

```toml
[[check]]
kind = "path_exists"
path = ".claude/agents/refactor-architect.md"
root = "scope_root"

[[check]]
kind = "path_exists"
path = ".claude/agents/module-extractor.md"
root = "scope_root"

[[check]]
kind = "path_exists"
path = ".claude/agents/doc-writer.md"
root = "scope_root"

[[check]]
kind = "path_exists"
path = ".claude/skills/save-roundtrip-audit"
root = "scope_root"

[[check]]
kind = "path_exists"
path = "src/lib/schemas/save.ts"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "SKILL.md"
pattern = "produces exactly one artifact and STOPS"
root = "skill_dir"

[[check]]
kind = "no_broken_md_links"
```

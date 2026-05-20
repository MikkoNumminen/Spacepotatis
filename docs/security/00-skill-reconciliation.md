# Phase 0a — Skill reconciliation

**Date:** 2026-05-04
**Orchestrator:** main session (Opus)

## Summary

The codebase had **no prior security-audit skill**. This document records what was found, what was created, and what was preserved from adjacent skills.

## What existed before this pass

The following audit-shaped skills were already in `.claude/skills/`:

| Skill | Scope | Security overlap |
|-------|-------|------------------|
| `audit` | Multi-phase modular-architecture refactor (file structure, module boundaries) | None. Orthogonal axis. |
| `content-audit` | Pre-commit content invariants (orphan refs, sprite keys, story trigger graph) | None. Game-data integrity, not security. |
| `save-roundtrip-audit` | Save-pipeline integrity (8-layer field walk) | Adjacent — protects against silent save drops, not security exploits. Will be invoked from Phase 3 when fixes touch save layers. |
| `new-migration` | Schema-change workflow enforcing CLAUDE.md §7a HARD RULE | Adjacent — required workflow if a security fix needs a schema change. |
| `security-review` (Claude Code built-in) | Per-branch / per-PR security review of pending changes | Adjacent. Narrow per-change scope, not a comprehensive audit. The new `/security-audit` skill does NOT replace it; the two complement each other (built-in for PR gates, project skill for whole-codebase passes). |

There were three existing agents under `.claude/agents/`:
- `refactor-architect` (Phases 1/2/5 of `audit`, read-only, Opus)
- `module-extractor` (Phase 3 of `audit`, mechanical edits)
- `doc-writer` (Phase 4 of `audit`, documentation)

None of these are security-specific. They are scoped to the modular-architecture audit and reference `docs/audit/` artifacts. They will NOT be reused for the security audit — Phase 0b creates dedicated `security-auditor`, `security-fixer`, and `security-doc-writer` agents.

## What was created

1. **`.claude/skills/security-audit/SKILL.md`** — new orchestrator skill. Phases:
   - 0a — skill reconciliation (this document)
   - 0b — agent setup
   - 1 — attack-surface map
   - 2 — findings + remediation plan
   - 3 — remediation, one finding at a time
   - 4 — AI-first security documentation
   - 5 — verification

2. **`docs/security/`** — new top-level directory for all artifacts. Mirrors `docs/audit/` conventions.

## Conflicts resolved

**None.** Because no prior security skill existed, there is nothing to merge or override. The reconciliation work was net-add only.

## What was preserved from adjacent skills

The orchestration **pattern** of the existing `audit` skill was the model:

- One artifact per phase, written to `docs/<topic>/`.
- One agent per phase (or per phase-step), single-responsibility scoped.
- Explicit gates between every phase — no auto-advance.
- Resume protocol via `_progress.md` checkpoint.
- Read-only agents for analysis phases; edit-capable agents for remediation; doc agents for documentation.
- Anti-patterns codified in the skill so dispatched agents inherit the boundaries.

The new skill cites `/modular-architecture-audit`, `/save-roundtrip-audit`, `/content-audit`, and `/new-migration` as adjacent in its "Adjacent skills" section so future invocations route to the right tool.

## What was archived

**Nothing.** No prior security skill existed to archive. The `_archive/` directory referenced in the orchestrator prompt was therefore not created in this pass; if a security skill is replaced in the future, the new pass should create `docs/security/_archive/` then.

## What was NOT changed

- **`.claude/skills/modular-architecture-audit/SKILL.md`** — untouched. Modular-architecture audit is a separate, ongoing concern.
- **`.claude/skills/content-audit/SKILL.md`** — untouched.
- **`.claude/skills/save-roundtrip-audit/SKILL.md`** — untouched. Will be invoked BY the security audit during Phase 3 when save-layer fixes are scheduled, but its definition is unchanged.
- **`.claude/skills/new-migration/SKILL.md`** — untouched. Will be invoked BY the security audit during Phase 3 when schema changes are needed.
- **`.claude/agents/{refactor-architect,module-extractor,doc-writer}.md`** — untouched. Scoped to the modular-architecture audit.
- **`CLAUDE.md`** — untouched in this phase. Phase 4 will add a security section pointing at `docs/security/threat-model.md` and `docs/security/invariants.md`.

## Diff summary (orchestrator prompt → final skill)

The orchestrator prompt's structure is preserved verbatim in the new skill. Adaptations made:

| Prompt section | Adaptation in skill |
|----------------|---------------------|
| Phase 0a (reconcile + replace) | Skill captures the workflow; the actual reconciliation is THIS document. |
| Phase 0b (agent setup) | Skill defines the table of agents; agent files are created in Phase 0b proper. |
| Phase 1 (attack surface) | Skill compresses the 11 sub-areas into one paragraph; the agent's invocation prompt for Phase 1 will quote the full list back from the prompt. |
| Phase 2 (severity defs) | Skill embeds the severity definitions verbatim — they're load-bearing for Phase 3 prioritization. |
| Phase 3 (one finding at a time) | Skill captures the parallelization rule, the auth/crypto escalation, and the "no expanding scope" rule. |
| Phase 4 (AI-first docs) | Skill names the artifacts; the agent's invocation prompt for Phase 4 will spell out the doc-block format and code-marker conventions. |
| Phase 5 (verification) | Skill names the artifact and the verification steps. |
| Cross-cutting rules | Mapped onto the "Orchestration rules" section of the skill. The `Co-Authored-By` ban is added per `MEMORY.md`; the `/save-roundtrip-audit` and `/new-migration` invocation triggers are added per repo convention. |

## Next gate

Phase 0a is complete. The orchestrator will not proceed to Phase 0b (agent setup) without the user replying "approved" or equivalent.

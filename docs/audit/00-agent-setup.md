# Phase 0 — Agent setup

Status: **complete, awaiting approval**. No source code touched.

## What existed before

Inspection of `.claude/`:

- `.claude/skills/` — 11 domain skills (balance-review, content-audit, equipment, new-enemy, new-migration, new-mission, new-perk, new-solar-system, new-story, new-weapon, save-roundtrip-audit). All produce reports or wire data; none orchestrate multi-phase refactors.
- `.claude/skills/<name>/SKILL.md` — frontmatter format is `name` + `description` + Markdown body. This is the convention I followed for the new orchestration skill.
- `.claude/worktrees/` — one active agent worktree (`agent-aaaccc47b98b8c829`). Will be ignored by this audit.
- `.claude/settings.local.json` — local permission allow-list. Not touched.
- **No `.claude/agents/` directory.** None of the three required agents existed in any form.
- **No `.claude/commands/`, no `.claude/output-styles/`.** No `/team`-style command exists.

Conclusion: all three agents and the orchestration command had to be created from scratch. No existing definitions were modified.

## What was added

### Agents (`.claude/agents/`)

| File | Role | Phases | Tools | Model | Forbidden actions |
|---|---|---|---|---|---|
| [refactor-architect.md](../../.claude/agents/refactor-architect.md) | Read-only architect: maps, proposes, verifies | 1, 2, 5 | `Read, Glob, Grep, Bash, WebFetch, WebSearch` | Opus | Edit/Write source; commit/push; behavior changes; on-the-fly boundary redesign |
| [module-extractor.md](../../.claude/agents/module-extractor.md) | Mechanical: moves files, redirects imports, runs tests | 3 | `Read, Edit, Write, Glob, Grep, Bash` | Sonnet | Behavior changes; renames; deletions of "unused" code; bundling multiple modules; `--no-verify` |
| [doc-writer.md](../../.claude/agents/doc-writer.md) | Adds READMEs, TSDoc, code-level markers, ADRs | 4 | `Read, Edit, Write, Glob, Grep, Bash` | Opus | Logic changes; renames; removing comments; filler docs; `@stable` for non-public-API exports |

Each agent file follows the same shape:

1. YAML frontmatter (`name`, `description`, `tools`, `model`).
2. **Single-responsibility scope** — one paragraph defining what the agent does and only does.
3. **Hard rules — MUST NOT** — explicit, bulleted forbidden actions. The MUST NOT list is treated as the contract.
4. **When you stop** — exact stop conditions.
5. **Output format** — every agent's deliverable shape is pinned (artifact path, structure of headings, comment-marker conventions, etc.).
6. **Anti-patterns to refuse** — three or four common temptations, named so the agent recognizes them.
7. **Model** — and a one-sentence rationale for the choice.

### Orchestration skill (`.claude/skills/audit/SKILL.md`)

Created [.claude/skills/audit/SKILL.md](../../.claude/skills/audit/SKILL.md). The user invokes `/audit` to start or resume; the skill is the **orchestrator** — it dispatches the right named agent per phase, gates on artifacts, and never auto-advances.

Key rules baked in:

- One phase per turn. No bundling.
- Re-read the prior artifact before dispatch (so the agent doesn't re-search).
- One module per `module-extractor` invocation. Parallelizable via `isolation: "worktree"` only when modules have no shared files.
- Save-data modules trigger `/save-roundtrip-audit` BEFORE commit (per CLAUDE.md §7a / `docs/INCIDENT_RUNBOOK.md`).
- Checkpoint via `docs/audit/_progress.md` when a phase overflows a session.

### Folder created

- `docs/audit/` — new. Will hold every phase's named artifact (`01-inventory.md`, `02-target-architecture.md`, …) plus the continuous `_progress.md` and `04-found-bugs.md` logs.

## What was NOT changed

- No existing skill was modified. The 11 domain skills (`balance-review`, `content-audit`, `new-*`, `save-roundtrip-audit`, etc.) are intact.
- No source file under `src/`, `public/`, `db/`, or `scripts/` was touched.
- No commit was made. All new files are unstaged on the working tree.
- `CLAUDE.md`, `ARCHITECTURE.md`, `README.md`, `TODO.md` not touched. Phase 4 will revisit these.

## How to verify the setup

1. `ls .claude/agents/` should show the three new agent files.
2. `ls .claude/skills/audit/` should show the new orchestration skill.
3. Spot-check that each agent file has a clear "MUST NOT" list and a "When you stop" section. The hard rules are the load-bearing part.
4. Confirm the model assignments match the task spec: Opus for architect + doc-writer, Sonnet for module-extractor.
5. (Optional) Sanity-check by spawning each agent with a one-line dry-run prompt ("describe what you would do for Phase X") and confirming they refuse to start without the orchestrator's full prompt. Skip if you trust the file definitions.

## Open questions for the orchestrator

- **Commit policy in Phase 3.** Default I baked in: `module-extractor` commits per module unless the orchestrator passes `--no-commit`. Confirm this matches your preference, or flip the default to "always staged-clean, never auto-commit" before Phase 3 starts.
- **Worktree parallelism in Phase 3.** I left this as a runtime decision: the orchestrator decides whether two modules can run in parallel based on Phase 2's file lists. If you want a hard rule like "never parallelize", say so before Phase 3.
- **`/save-roundtrip-audit` invocation.** Right now it's a project skill the orchestrator invokes manually before any save-touching commit. If you'd rather the `module-extractor` invoke it directly, I can add that to its agent contract — but I left it with the orchestrator on the principle that the extractor's contract should be narrow.
- **Documentation of THIS audit.** Phase 4 will doc each module. Should it also write an ADR (`docs/decisions/`) describing why this audit was undertaken and what shape it took? I think yes — it's the kind of context a future agent will absolutely want — but flag if you'd rather skip.

## Next phase (do not start)

Phase 1 — full inventory by `refactor-architect`, producing `docs/audit/01-inventory.md`. No proposals, no edits. The walk covers every meaningful source file under `src/`, `db/`, `scripts/`, and the configs at the repo root, with grep-derived dependents and explicit cross-cutting-concern + god-file + cycle lists. Wait for "approved" before dispatching.

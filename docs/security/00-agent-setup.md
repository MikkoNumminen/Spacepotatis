# Phase 0b — Agent setup

**Date:** 2026-05-04
**Orchestrator:** main session (Opus)

## Summary

Created three security-specific agent definitions under `.claude/agents/`. They are scoped narrowly so each phase has a single-responsibility executor, and they bake in the project's load-bearing invariants (CLAUDE.md HARD RULEs, save-pipeline scrutiny, no `Co-Authored-By` trailer, the cheat-guard immutability rule).

Pre-existing agents (`refactor-architect`, `module-extractor`, `doc-writer`) were **not** modified or removed — they belong to the `audit` (modular-architecture) skill and remain orthogonal.

## How invocation works (important)

Custom agent files under `.claude/agents/` are **contract specs**, not registered `subagent_types`. In this Claude Code setup the only first-class subagent types available to the `Agent` tool are the built-ins (`general-purpose`, `Plan`, `Explore`, `claude-code-guide`, `statusline-setup`). Calling `Agent({ subagent_type: "security-auditor" })` returns `Agent type 'security-auditor' not found`.

The orchestrator therefore invokes:

```ts
Agent({
  subagent_type: "general-purpose",
  model: "opus",            // or "sonnet" for security-fixer routine work
  description: "Phase N — <phase name>",
  prompt: "<the agent contract from .claude/agents/<name>.md, inlined verbatim, plus the per-phase brief>"
})
```

This is the same pattern the parallel `/modular-architecture-audit` skill uses for `refactor-architect`, `module-extractor`, `doc-writer`. The contract files exist so a human (or a future Claude Code release that auto-registers `.claude/agents/`) can read the boundaries without re-deriving them; the orchestrator's job is to keep the inlined prompt faithful to the contract.

## Agents created

### `.claude/agents/security-auditor.md`

- **Phases:** 1, 2, 5
- **Model:** Opus
- **Tools:** `Read, Glob, Grep, Bash, WebFetch, WebSearch` — read-only
- **Single responsibility:** produce written security analysis as a Markdown artifact under `docs/security/`. Maps the attack surface (Phase 1), turns it into a prioritized findings list with the SEC-XXX template (Phase 2), and verifies fixes after Phase 3/4 (Phase 5).
- **Hard rules baked in:**
  - No source-file modifications outside `docs/security/`.
  - No `npm install`, `git commit`, `git push`, `gh pr create`, or other state-changing commands.
  - No live exploitation — static analysis only; runtime confirmation requires user sign-off.
  - No exploit details outside `docs/security/`.
  - No invented findings during Phase 5; drift goes to `docs/security/04-other-findings.md`.
  - No downgrading of `src/lib/saveValidation.ts` cheat guards (those guards ARE security).
- **Critical-finding escalation:** if any phase uncovers a critical, the agent stops mid-artifact and surfaces immediately to the orchestrator. Bar for "critical" is explicit (anonymous internet exploit / live secret leak / mass-data exposure / account takeover).
- **Save-data scrutiny:** any finding touching the save pipeline is flagged in the spec so Phase 3 will run `/save-roundtrip-audit` before fixing.

### `.claude/agents/security-fixer.md`

- **Phase:** 3
- **Model:** Sonnet by default; **Opus required** for auth, crypto, secrets, or save-pipeline findings (orchestrator overrides per-invocation)
- **Tools:** `Read, Edit, Write, Glob, Grep, Bash`
- **Single responsibility:** apply ONE approved finding per invocation, add the regression test (failing without fix, passing with fix), run the full suite, update the plan doc with status, and stop.
- **Hard rules baked in:**
  - One finding per invocation. No bundling.
  - No scope expansion / "while I'm here" refactors.
  - No `--no-verify` on commits; pre-commit hook enforced.
  - No `git push` / `gh pr create` without explicit orchestrator instruction.
  - No exploit details in commit messages — defender's language only.
  - No `Co-Authored-By` trailer (CLAUDE.md §8 + `MEMORY.md`).
  - No weakening of cheat guards or `validateNoRegression`.
  - No deletion of save-data, leaderboard, or audit-log rows without user sign-off (CLAUDE.md §15).
- **Auth/crypto/secrets/save-pipeline escalation:** if the agent arrives on Sonnet for one of those surfaces, it hands back asking for an Opus re-invocation rather than risking a subtle regression.
- **Save-data extra scrutiny:** must run `/save-roundtrip-audit` BEFORE handing back if the fix touches save layers.
- **Schema-change extra scrutiny:** must follow `/new-migration` skill, including the prod-application step (CLAUDE.md §7a HARD RULE).
- **Test-first protocol:** writes the regression test FIRST, confirms it fails for the right reason, then applies the fix. This locks the contract before the implementation moves.
- **Non-security bugs spotted along the way** are appended to `docs/security/04-other-findings.md` and **not fixed in the security commit**. Atomicity of the security regression test is the point.

### `.claude/agents/security-doc-writer.md`

- **Phase:** 4
- **Model:** Opus
- **Tools:** `Read, Edit, Write, Glob, Grep, Bash`
- **Single responsibility:** add documentation at four levels — root (`SECURITY.md`, threat model, invariants, CLAUDE.md security section), per-module SECURITY notes, code-level markers, and tests-as-documentation — so a future AI agent cannot weaken security without realizing it.
- **Hard rules baked in:**
  - No logic changes; doc edits only.
  - No renames, no deletions of "redundant" code/comments.
  - No marker-spraying — density rule of thumb: >5 markers in a file means the doc belongs in a sibling SECURITY.md.
  - No filler markers; every marker explains the *why* in one sentence.
  - No exploit details outside `docs/security/`.
  - No `@stable` on a security-relevant export with a known still-open finding.
- **AI-readability bar:** for each documented module, the agent self-tests by reading ONLY `CLAUDE.md` + threat model + invariants + module SECURITY.md + code-with-markers, and asks "could a fresh agent change this safely?" Failures surface in the Phase 4 summary as gaps to close.
- **Save-data extra scrutiny:** the save-pipeline modules get especially detailed SECURITY notes — specific enough that "simplify saveValidation.ts" cannot recreate the 2026-05-02 wipe.
- **CI / lint additions are allowed** (adding a `tests/security/` job, a banned-pattern lint rule) but **non-security CI steps must not change**.

## Orchestration command

The new `/security-audit` skill (`.claude/skills/security-audit/SKILL.md`) dispatches:

| Phase | Agent | Default model |
|-------|-------|---------------|
| 0a, 0b | (orchestrator) | Opus (current session) |
| 1 | `security-auditor` | Opus |
| 2 | `security-auditor` | Opus |
| 3 | `security-fixer` × N | Sonnet (Opus for auth/crypto/secrets/save) |
| 4 | `security-doc-writer` | Opus |
| 5 | `security-auditor` | Opus |

Phase 3 is parallelizable across worktrees for independent low/medium fixes (the orchestrator launches multiple `security-fixer` agents with `isolation: "worktree"`). Critical and high fixes run sequentially.

## What was NOT changed

- `.claude/agents/{refactor-architect,module-extractor,doc-writer}.md` — untouched.
- `.claude/skills/{audit,content-audit,save-roundtrip-audit,new-migration,...}/SKILL.md` — untouched.
- `.claude/settings.local.json` — untouched.
- `CLAUDE.md` — untouched in this phase. Phase 4 will add a security section.

## Diff summary

| File | Status | Lines |
|------|--------|-------|
| `.claude/agents/security-auditor.md` | new | ~110 |
| `.claude/agents/security-fixer.md` | new | ~115 |
| `.claude/agents/security-doc-writer.md` | new | ~130 |
| `.claude/skills/security-audit/SKILL.md` | new (Phase 0a) | ~110 |
| `docs/security/00-skill-reconciliation.md` | new (Phase 0a) | ~80 |
| `docs/security/00-agent-setup.md` | new (this file) | ~110 |

## Next gate

Phase 0b is complete. The orchestrator will not proceed to Phase 1 (attack-surface mapping) without the user replying "approved" or equivalent. Phase 1 dispatches `security-auditor` on Opus to walk the entire codebase across the 11 sub-areas listed in the skill, producing `docs/security/01-attack-surface.md`. Read-only. Estimated context cost: substantial — this is the most expensive phase in tokens because the agent reads broadly. Critical findings will surface immediately rather than waiting for the gate.

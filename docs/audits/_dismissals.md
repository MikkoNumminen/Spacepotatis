# AI-codegen smell audit — dismissals sidecar

Sticky false-positive list for `/ai-codegen-smell-audit`. Every run reads this file and drops findings whose `file:line:check` key appears in the table. This is the single source of truth for what's known-false across the codebase — the per-day report files (`docs/audits/ai-smell-YYYY-MM-DD.md`) do NOT carry dismissal state.

To dismiss a finding: append a row to the table below. To revive a dismissal: delete its row. The sidecar is committed to the repo; dismissals are a team contract.

Template + anti-patterns: [`.claude/skills/ai-codegen-smell-audit/false-positive-log.template.md`](../../.claude/skills/ai-codegen-smell-audit/false-positive-log.template.md).

## Dismissals

| Dismissed at | File:line | Check | Reason |
|--------------|-----------|-------|--------|

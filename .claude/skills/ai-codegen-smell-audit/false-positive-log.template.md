# False-positive log template

Append rows to `docs/audits/.dismissals.md` (single sidecar file, committed). The next run of `/ai-codegen-smell-audit` reads this sidecar and skips findings whose `file:line:check` key appears in the table. The per-day report files (`docs/audits/ai-smell-YYYY-MM-DD.md`) do NOT carry dismissal state — only the sidecar does.

Dismissals are sticky across runs — only delete a row when the underlying code has changed enough that the dismissal no longer applies (e.g. a refactor moved the line; a new author added a similar pattern at a different location and YOU want to re-evaluate). The sidecar is committed to the repo: dismissals are a team contract.

```markdown
## Dismissals

| Dismissed at | File:line | Check | Reason |
|--------------|-----------|-------|--------|
| YYYY-MM-DD | path/to/file.ts:42 | check-name | One-line reason this is fine — be specific so future-you remembers |
```

## Example entries

```markdown
| 2026-05-17 | src/lib/auth.ts:31 | defensive-checks-for-impossible-cases | OAuth callback — trust boundary, defensive check is required even though TS types are non-null |
| 2026-05-17 | src/game/audio/userActivation.ts:29 | defensive-checks-for-impossible-cases | queue.shift() returns T \| undefined at runtime; the guard is correct |
| 2026-05-17 | src/components/loadout/WeaponCard.tsx:115 | generic-names-in-domain-context | `data` is the standard name for the API response object in this hook |
```

## Anti-patterns (don't do these)

- **Bulk-dismissing a check across the codebase** by adding `| * | check-name |` — the wildcard isn't honored. Dismiss individual file:line pairs so the next AI-pair-programming session that introduces the same pattern at a NEW location still gets flagged.
- **Dismissing without a reason** — leaving the reason cell blank or writing "false positive" is not useful. Be specific. Future-you (or a different reviewer) needs to know *why* this looked like a smell but isn't.
- **Dismissing major-severity findings without team agreement** — major-class smells (swallowed-errors, duplicated-helpers) should be discussed in code review before being dismissed. The sidecar captures the outcome, not a unilateral override.
- **Adding dismissals to the per-day report** instead of the sidecar — they'll be ignored on the next run. Only the sidecar is read.

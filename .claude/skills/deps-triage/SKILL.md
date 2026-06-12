---
name: deps-triage
description: Triage and land a dependabot PR — grouped minor-and-patch vs individual major, CI gates, local repro, the known-upstream-blocks ledger, squash-merge or close-with-rationale. Use for ANY dependency-bump PR, npm peer-dep / ERESOLVE error, or "why is this deps PR hanging?".
---

# When to use

Invoke on `/deps-triage`, "handle the dependabot PR(s)", "why is this deps PR red/hanging", "bump <package>", or any npm `ERESOLVE` / peer-dependency error. Dependabot files weekly (Monday 09:00 Helsinki, [.github/dependabot.yml](.github/dependabot.yml)): minor + patch bumps arrive as ONE grouped `minor-and-patch` PR; each major bump arrives as its own PR. Limit 5 open, label `dependencies`.

## Boundary — STOP and flag

- **Adding `overrides` / `resolutions` to force a blocked peer dep**, vendoring a patched copy, or forking a dependency. Park the bump instead (see "Blocked bumps" below).
- **Bumps that change runtime architecture** (Next.js major, React major, Phaser major, `@neondatabase/serverless` major). Read the upstream migration guide first and surface a plan — these are feature work, not triage.
- **Security advisories on a prod dependency** — triage immediately, but the fix may need `/security-audit` context; mention it.

# Triage decision tree

1. `gh pr list --state open` → for each deps PR, classify:
   - **Grouped `minor-and-patch`** → usually safe. CI green → squash-merge. CI red → treat as a major (investigate locally).
   - **Individual major** → never merge on green CI alone. Read the upstream changelog/release notes for breaking changes, then reproduce locally (below).
2. **Check CI.** `gh pr checks <n>`; if `gh` returns 401 on `checks`/`merge` subcommands (token-scope quirk), fall back to the REST API:
   ```bash
   gh api repos/MikkoNumminen/Spacepotatis/commits/<head-sha>/check-runs --jq '.check_runs[] | {name, conclusion}'
   gh api -X PUT repos/MikkoNumminen/Spacepotatis/pulls/<n>/merge -f merge_method=squash
   ```
   The blocking CI job is "Typecheck, lint, test" (plus security regression tests + build — see [.github/workflows/ci.yml](.github/workflows/ci.yml)).
3. **Local repro (majors and red CI).**
   - If the dependabot branch predates a related merge to master, do NOT hand-resolve `package-lock.json` conflicts — either comment `@dependabot rebase` on the PR, or recreate from master: checkout master, bump the one dep in `package.json`, `npm install`.
   - `npm install` surfaces `ERESOLVE` peer-dep conflicts — read WHICH transitive dep imposes the cap (`npm view <dep> peerDependencies`, `npm ls <dep>`).
   - Run the gates: `npm run typecheck && npm run lint && npm test && npm run build`. Lint/test can pass while a plugin crashes at runtime — actually run them, don't trust green install.
4. **Land or park.**
   - Green → `gh pr merge <n> --squash --delete-branch` (or the REST fallback). Then fast-forward local master; discard any leftover experiment with `git checkout -- package-lock.json`.
   - Blocked upstream → close the PR WITH a comment explaining the exact block (failing package, peer-dep cap, error signature, unblock condition), and record it in the ledger below. Dependabot re-files automatically when a NEW version of the bumped package releases; it will not reopen the same version. Use `@dependabot ignore <dep> major version` only when the user wants to stop seeing the bump entirely.

# Known upstream blocks (living ledger — update on every park/unpark)

| Bump | Status | Block | Unblock condition |
|---|---|---|---|
| `eslint` 9 → 10 | **PARKED** (PR #284 closed 2026-06-11) | `eslint-plugin-react` 7.37.5 (transitive via `eslint-config-next`) caps peer at `eslint ^9.7` and calls `context.getFilename()`, removed in ESLint 10 → `TypeError: contextOrFilename.getFilename is not a function` at lint time. eslint-config-next v16 itself accepts `eslint >=9.0.0`. | `eslint-plugin-react` ships an ESLint-10-compatible release (watch its releases; dependabot re-files on the next eslint version anyway). |

Lessons already paid for (don't re-derive):

- **eslint-config-next 15 → 16** (PR #285, merged): v16 ships native flat-config exports; `FlatCompat.extends("next/core-web-vitals", ...)` throws `Converting circular structure to JSON`. Fix = import the configs directly in [eslint.config.mjs](eslint.config.mjs). Three react-hooks/react rules from v16 are deferred with inline justification there — re-enable rule-by-rule in a React-19 migration PR, don't delete the comments.
- A grouped PR that includes a dep ALSO touched by a parked major can conflict; recreate from master rather than untangling the lockfile.

# Invariants

- Never merge a deps PR with red CI "because it's only types/lint".
- Never bypass the gates with `--no-verify` or `npm install --force`.
- Every parked bump has BOTH a close-comment on the PR and a ledger row above. The ledger is the repo's memory — next quarter's agent must not re-investigate eslint v10 from scratch.
- One bump-class per PR (dependabot's split is the unit of review). Don't fold unrelated code fixes into a deps PR; if a bump requires code changes (config migration), they ship in the SAME PR as the bump that forced them.

## Freshness check

```toml
[[check]]
kind = "path_exists"
path = ".github/dependabot.yml"
root = "scope_root"

[[check]]
kind = "file_contains"
path = ".github/dependabot.yml"
pattern = "minor-and-patch"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "SKILL.md"
pattern = "## Known upstream blocks"
root = "skill_dir"

[[check]]
kind = "command_exists"
command = "gh"

[[check]]
kind = "command_exists"
command = "npm"
```

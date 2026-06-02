---
name: ai-codegen-smell-audit
description: Read-only audit for 10 concrete failure modes that recur in AI-generated code — defensive checks on non-nullable types, swallowed errors, mirror tests, phantom TODOs, and 6 others (full list in the body). Produces a markdown report under docs/audits/. Does not modify code. Designed for PR review and on-demand scans, not for use during initial generation.
---

# When to use

Invoke on `/ai-codegen-smell-audit`, `/smell-audit`, "audit this for AI-codegen smells", or before merging a PR with substantial AI-generated diff. Also useful when a directory has absorbed several AI-pair-programming sessions and you want one pass that flags patterns that drift in without a human catching them.

**Not** invoked during initial code generation — that's chasing your own tail. Run AFTER the code is written, before merge.

Scope is configurable per invocation: a single file, a directory, a PR diff, or the whole `src/` tree. Default scope when invoked with no args is `git diff --name-only master..HEAD` filtered to source files (`*.ts`, `*.tsx`, `*.js`, `*.mjs`), **excluding tests** (`*.test.ts`, `*.spec.ts`, anything under `__tests__/`). `.md` files are not in the default scope but ARE valid explicit-path targets — most checks (code-targeted) become N/A on prose, but phantom-todos (#8) fires on docs and is the practical reason to scan markdown.

Check #7 (mirror-tests) only fires on test files, so it is dormant under the default scope. To run it, opt in with `/ai-codegen-smell-audit --include-tests` (applies the same scope but includes test files) or pass an explicit path like `/ai-codegen-smell-audit src/game/phaser/systems/weaponMath.test.ts`.

The default branch is `master` in this repo — on a fork that uses `main`, the invoker should pass an explicit scope.

# What this skill does NOT do

- **Does not detect "AI-written code" in a tribal sense.** Every finding is a concrete pattern with a smell example and a legitimate-counterpart example. No witch hunt.
- **Does not modify code.** Read-only. No `--fix` mode. The auditor reports; the human decides what's a real issue.
- **Does not run as part of CI by default.** Findings need human judgment; auto-failing builds would either underreport (raise the bar to silence false positives) or block PRs on nits.

# Steps (the audit checklist)

For each check below: scan the configured scope, apply the calibration rules (below) to filter false positives BEFORE writing the report, then list surviving hits with `file:line + 1-line snippet + severity + suggested action`. The goal is signal, not exhaustiveness.

## 1. defensive-checks-for-impossible-cases

- **Pattern:** `if (x === undefined)`, `if (!x) return`, `if (x == null)`, optional-chaining `x?.y` where `x` is typed non-nullable at the guard site.
- **Why it matters:** Visual noise that signals "I don't trust the types." When the type contract changes, these guards lie about what's reachable, and they bypass exhaustiveness checks (TS won't tell you the unreachable branch is dead).
- **How to verify the guard is on an impossible case:** "Non-nullable at the guard site" is NOT the same as "the declared parameter is non-nullable." Before flagging, scan ~10 lines above the guard for an assignment to the same identifier from a maybe-undefined source. Treat the guard as LEGITIMATE (do not flag) if the value came from any of: `.shift()` / `.pop()` (returns `T | undefined`), `.find()` / `.findLast()` (returns `T | undefined`), `Map.get()` / `WeakMap.get()`, an optional-chain expression (`a?.b`), `JSON.parse(...)`, an indexed read on a possibly-empty array or under `noUncheckedIndexedAccess`, a `??` / `||` fallback whose RHS is `undefined`, an `await` of a function returning `Promise<T | undefined>`, or any `unknown` / `any` source. Flag only when (a) the function's parameter is declared non-nullable AND (b) no narrowing-eligible assignment appears between the parameter and the guard. **When uncertain, do NOT flag** — 100% accuracy requires a TypeScript LSP query; the regex-and-eyeball audit errs on the side of silence.
- **Smell:**
  ```ts
  function area(rect: { w: number; h: number }): number {
    if (!rect) return 0;          // rect can't be null per the signature
    if (rect.w == null) return 0; // same
    return rect.w * rect.h;
  }
  ```
- **Legitimate:**
  ```ts
  function drain(queue: string[]): void {
    while (queue.length) {
      const cb = queue.shift();   // T | undefined despite queue.length check
      if (!cb) continue;          // guard is real — narrowing the shift result
      cb();
    }
  }
  ```
- **Severity default:** minor.
- **Skip:** trust boundaries (user input, network responses, FS, third-party APIs, `JSON.parse` outputs, `unknown` inputs); guards whose subject came from any narrowing-eligible source above.

## 2. stylistic-drift-within-file

- **Pattern:** the same file mixes single + double quotes, `function foo()` + `const foo = () =>`, `i++` + `i += 1`, 2-space + 4-space indent, or `===` + `==`. Compare to the dominant style in the file's first 50 LOC and flag late deviations.
- **Why it matters:** Drift signals "this section was added without reading the surrounding code." Linters catch most of this; new-file additions or `continue-on-error` configs let it slip through.
- **Smell:** a file that's 100% single-quoted with a function added at line 200 using double quotes and arrow syntax when every other function in the file is a `function` declaration.
- **Legitimate:** a file with an explicit `// LEGACY: pre-2025 style retained until rewrite` marker on the divergent section.
- **Severity default:** nit (minor if the file is < 100 LOC — small file with drift = no excuse).
- **Skip:** files with `// LEGACY:` markers; files under `node_modules/`, `dist/`, generated code.

## 3. paraphrase-comments

- **Pattern:** comment on line N that restates line N+1 in English without adding intent. `// increment counter` above `counter++`. `// set the user's name` above `user.name = newName`.
- **Why it matters:** Pure noise. Adds lines to read without adding context. Lies the moment the code below it changes and the comment isn't updated.
- **Smell:**
  ```ts
  // increment the counter
  counter++;

  // loop through each item
  for (const item of items) { ... }
  ```
- **Legitimate:** comments that explain the *why* — a non-obvious constraint, a workaround, a hidden invariant. `// SECURITY-CRITICAL:`, `// INVARIANT:`, `// AI-NOTE:`, `// HACK because <browser> does X` are all fine.
- **Severity default:** nit.
- **Skip:** comments containing any of `because|so that|prevents|workaround|TODO|FIXME|SECURITY|INVARIANT|AI-NOTE|HACK`; JSDoc/TSDoc blocks (`/** */`) which document API surface; type-narrowing assertions where the comment explains the narrowing.

## 4. single-use-helpers

- **Pattern:** function exported (or module-private) and called exactly once across the codebase, where inlining shortens the call site's file by 3+ lines and doesn't introduce naming pressure.
- **Why it matters:** Over-extraction. Every helper has a name to remember, an import line, and a jump-to-definition cost. Called once = the abstraction isn't earning its keep.
- **Smell:**
  ```ts
  // foo.ts
  export function addTwo(a: number, b: number): number { return a + b; }

  // bar.ts (the only caller)
  import { addTwo } from "./foo";
  const sum = addTwo(x, y);
  ```
- **Legitimate:** helpers whose name documents intent (`assertNever`, `unreachable`, `panic`, `invariant`, `defaultTo`, `pluralize`); helpers extracted for test isolation (the test calls it directly); helpers long enough that inlining would obscure the caller; helpers used in JSX/templates where inline expressions are awkward.
- **Severity default:** nit.
- **Skip:** intent-named helpers (see above); helpers in utility-namespace directories (any folder named `utils/`, `helpers/`, `test-helpers/`, or sitting under `__tests__/` — utility namespaces are *meant* to grow); helpers exported from a public API surface (call-count from inside the repo is not the right metric).
- **Scope:** call-count spans the **whole codebase**, not just the scoped diff. A helper exported in the diff but called once from a file outside the diff is still single-use. Grep the full repo for callers before flagging.

## 5. generic-names-in-domain-context

- **Pattern:** variable or parameter named `data`, `result`, `processed`, `handle`, `temp`, `value`, `item`, `info`, `obj`, `thing` inside a function whose surrounding code has a clear domain vocabulary (e.g. a function in `Bullet.ts` operating on bullets, an `Enemy` method handling enemies).
- **Why it matters:** Generic names force the reader to scan up to find the type. A function with `bullet` instead of `item` is self-documenting at the call site too.
- **Smell:**
  ```ts
  function dealDamage(target: Enemy): void {
    const data = computeHitResult(target);     // domain has 'hit', 'damage'
    const result = applyArmor(data);            // domain has 'damaged', 'damageAfterArmor'
    target.hp -= result;
  }
  ```
- **Legitimate:** generic names in generic code (utility libraries, type-level helpers, `forEach`/`map` one-liners where `item` is genuinely just "the thing"); pixel-buffer code using `data` (the standard name for `ImageData.data`); queue/stack operations using `item`.
- **Severity default:** nit.
- **Skip:** files under utility-namespace directories (any folder named `utils/` or `helpers/`), `src/lib/schemas/`, type-only modules under `src/types/`; one-line lambda bodies where renaming costs clarity rather than adding it.

## 6. swallowed-errors

- **Pattern:** `catch {}`, `catch (e) {}`, `catch (e) { /* nothing */ }` with no logging, no rethrow, and no comment explaining why the error is safe to ignore.
- **Why it matters:** Silent failures are the worst kind of failure. They look like success in metrics, in tests, in dashboards — until the user reports something broken with no breadcrumbs.
- **Smell:**
  ```ts
  try {
    await loadConfig();
  } catch {}                       // and now what?

  try {
    return JSON.parse(raw);
  } catch (e) { /* eat */ }        // returns undefined; caller has no idea
  ```
- **Legitimate:**
  ```ts
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupt cache is recoverable — cloud-save merges on next hydrate.
    return null;
  }
  ```
  …or any catch that logs (`console.warn`, structured logger), rethrows, or has a comment naming the safe-to-ignore condition.
- **Severity default:** **major**. Empty catches hide real bugs.
- **Skip:** catches that log, rethrow, or comment the safe-to-ignore condition. The Legitimate example above is the canonical shape; deviations get flagged.

## 7. mirror-tests

- **Pattern:** test assertions that structurally restate the implementation rather than asserting its behavior. Impl returns `arr.map(x => x * 2)`, test asserts `expect(result).toEqual(input.map(x => x * 2))`. Impl computes `damage * count * (1000 / cooldown)`, test asserts `expect(dps).toBe(Math.round(w.damage * w.count * (1000 / w.cooldown)))`.
- **Why it matters:** A mirror test passes iff the implementation does what it does — including being wrong in the same way. Catches typos, not logic errors. A behavioral test (`expect(dps(rapidFire)).toBe(50)`) catches both.
- **Smell:**
  ```ts
  test("dealDamage halves armored hits", () => {
    const result = dealDamage({ dmg: 10, armored: true });
    expect(result).toBe(Math.floor(10 * 0.5)); // restates the impl formula
  });
  ```
- **Legitimate:** the same test anchored to a hard expected value: `expect(result).toBe(5)`. Better with two cases: `expect(result).toBe(5); expect(dealDamage({ dmg: 10, armored: false })).toBe(10);`. **Half-mirror tests** (one formula assertion sitting beside one hard-value assertion) are partially-defended — report only the formula line, not the whole test.
- **Severity default:** minor (major in code that has had production bugs in this area).
- **Skip:** property-based tests (`fast-check`, `jsverify`) where the property IS the formula; tests of pure math functions where the expected value comes from the same math (verify the test author intended the round-trip).
- **Scope:** test-only — does not fire under the default invocation, which excludes test files. Opt in via `--include-tests` or an explicit test-file path (see "When to use").

## 8. phantom-todos

- **Pattern:** `TODO`, `FIXME`, `XXX`, `HACK` comments with no referenced issue (`#123`, `JIRA-456`), no owner name, and no condition specifying when they can be removed (`remove after X`, `until Vercel supports Y`).
- **Why it matters:** Untagged TODOs accumulate forever. Nobody knows whose problem they are, when they expire, or whether they're already resolved.
- **Smell:** `// TODO: refactor this someday` — no ticket, no owner, no condition.
- **Legitimate:** `// TODO (#1234, @mikko): remove the polyfill once Safari 17 < 5% usage`. Ticket, owner, AND condition.
- **Severity default:** nit (one phantom TODO is fine; ten in one file is a smell about the team's habit, not the file).
- **Skip:** TODOs in docs (README, ARCHITECTURE.md) documenting open design questions; TODOs in `TODO.md` itself.

## 9. duplicated-helpers

- **Pattern:** two or more functions in the same module/package that are near-duplicates by ALL three heuristics below (apply by eye / grep; no AST tooling required):
  1. **Same parameter shape** — identical parameter count AND types match position-for-position. (A `string` differing from a `number` in the same slot disqualifies; two `string`s differing only in name does not.)
  2. **Same body skeleton** — when each body is collapsed to its control-flow tokens in order (`if`, `for`, `while`, `switch`, `return`, `throw`, `try`, `await`, plus call expressions stripped of arguments), the two collapsed sequences are identical.
  3. **Body length within ±20%** after stripping blank lines and comments, AND the textual diff between bodies reduces to ≤2 literal substitutions (string/number/regex) plus at most one renamed identifier used consistently throughout.
- **Why it matters:** Drift. The two copies will get fixed separately, one will lag behind the other, and a bug will live in one for months.
- **Smell:**
  ```ts
  function escapeForHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeForXml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  ```
- **Legitimate:**
  ```ts
  function escapeForHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeForHtmlAttribute(s: string): string {
    return escapeForHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // Same shape family, different contract — the attribute version also escapes quotes.
  ```
- **Severity default:** major.
- **Skip:** functions whose names encode different domains (`formatMissionTime` vs `formatPlaytime` — same shape, different units); deliberate specializations of a shared shape (one calls the other, or both delegate to a private core); functions where the differing literal IS the contract (`clampToScreen` vs `clampToWorld` differing only in bounds — surface separately as a constants-extraction nit, not major).
- **Tooling note:** the 1+2+3 heuristic is approximate. A token-level AST tool (`ts-morph`, `jscodeshift`, `simian`, `jscpd`) would catch more and produce numeric similarity scores; this skill is designed to run from a Claude session reading the spec, so the heuristic is calibrated for eyeball + grep. Two invocations applying the rule strictly will converge; an invocation that picks its own metric will not.

## 10. over-typed-primitives

- **Pattern:** `as const`, branded types (`type UserId = string & { __brand: "UserId" }`), or `satisfies` annotations on values where plain primitives carry the same safety in the file's actual usage context.
- **Why it matters:** Type ceremony with no payoff costs reader time and locks in friction (`x as UserId` propagates to every assignment, every test fixture). Use when type-safety is actually needed (preventing a `UserId` from being passed where a `MissionId` is expected); skip when it isn't.
- **Smell:**
  ```ts
  const VOLUME = 0.5 as const;                       // never compared, never narrowed
  type Counter = number & { __brand: "Counter" };    // only ever used as a number
  ```
- **Legitimate:**
  ```ts
  const WEAPON_IDS = ["rapid-fire", "spread-shot"] as const satisfies readonly WeaponId[];
  // ^ pins the literal types AND verifies they're all WeaponIds; both halves earn it.
  ```
- **Severity default:** nit.
- **Skip:** type-level helper modules; runtime-validated narrowing pairs (Zod schemas, branded IDs from auth where the brand prevents a real bug class — confusing UserId and PlayerId).

# Output format

Markdown report written to `docs/audits/ai-smell-{YYYY-MM-DD}.md`. Same-day re-runs APPEND to the same file under a `## Run {N} ({HH:MM} UTC)` divider, where `{N}` is `(count of existing "## Run " headers in the file) + 1` (first run is "Run 1" and gets the divider too — so a same-day diff against Run 1 is mechanical). UTC is fixed regardless of the operator's timezone so cross-timezone reviewers reading the report agree on ordering. Each run section repeats the full structure below; nothing from a prior run is rewritten or deleted. Structure:

```markdown
# AI-codegen smell audit — {YYYY-MM-DD}

## Run 1 (HH:MM UTC)

**Scope:** {files / directory / PR diff string}
**Checks run:** 10
**Total findings:** {N} ({maj} major, {min} minor, {nit} nit)

### Findings

| Check | Severity | File:line | Snippet | Suggested action |
|-------|----------|-----------|---------|------------------|
| swallowed-errors | major | path/foo.ts:42 | `catch {}` | Add log line or comment naming the safe-to-ignore condition |
| paraphrase-comments | nit | path/bar.ts:88 | `// increment` above `i++` | Delete the comment |
| ... | ... | ... | ... | ... |

### Grouped by severity

One bullet per finding. Omit a severity section entirely if it has zero findings.

**Major findings:**
- [swallowed-errors] path/foo.ts:42 — `catch {}` with no logging or rethrow. Suggest: add log or document why safe.

**Minor findings:**
- ...

**Nit findings:**
- ...

### Suppressed by sidecar

This run consulted `docs/audits/_dismissals.md` and skipped {K} findings whose `file:line:check` key is dismissed there. See that file to inspect or revoke a dismissal. Do NOT add dismissals to this report — they live in the sidecar.
```

The final report ends with `**Summary: clean**` (0 findings), `**Summary: N nits**` (only nits), or `**Summary: FAIL ({maj}m {min}m {nit}n)**` (any major/minor). The PR reviewer decides whether `FAIL` blocks merge; the tool doesn't enforce.

# Calibration rules (when NOT to flag)

These rules apply at scan time — a finding that matches a skip rule does not appear in the report.

- **Trust boundaries** — user input, network responses, FS reads, third-party API responses, browser APIs that can throw on hostile DOM state — defensive checks here are required.
- **Intent-naming helpers** — `assertNever`, `unreachable`, `panic`, `invariant`, `defaultTo`, `pluralize`, `assert*` — these document a contract; "single-use" doesn't apply.
- **Generic code on purpose** — utility libraries, type-level helpers, any folder named `utils/` or `helpers/` — `data`/`result`/`value` here is the correct vocabulary.
- **Explicit legacy markers** — files or sections marked `// LEGACY:` are excluded from style-drift checks.
- **Documented why-comments** — comments containing `because|so that|prevents|workaround|SECURITY|INVARIANT|AI-NOTE|HACK` are not paraphrase-comments.
- **Project conventions in CLAUDE.md** — if the repo declares a convention, that convention is the baseline; intra-file consistency is measured against project style.
- **Sidecar dismissals** — past dismissals listed in `docs/audits/_dismissals.md` are honored on every run. The sidecar is the single source of truth for what's known-false; it is NOT a section of any per-day report. The next run reads the sidecar before scanning and drops any finding whose `file:line:check` key appears there. To dismiss a new finding, append a row to the sidecar (template at `.claude/skills/ai-codegen-smell-audit/false-positive-log.template.md`). To revive a dismissal, delete its row. The sidecar is committed to the repo — dismissals are a team contract.

# Calibration against this repo (validation pass — 2026-05-17)

The 10 checks were dry-run against `d:/koodaamista/Spacepotatis/src/` before publishing this skill.

Line numbers below are as-of the dated pass; re-run the audit for current locations. The cited files all still exist; only the `:NN` suffixes drift. Re-verify each verdict against current code before relying on it.

Four verdict labels:
- **Real smells found** — un-suppressed findings in this repo.
- **Pattern hits, skip rule passes** — the check matches candidates; every match is correctly suppressed by the skip rule. The check is working, but the codebase has no actual smell of this kind.
- **No matches** — nothing in the codebase trips the initial pattern. The check is grounded by design; this codebase doesn't exercise it.
- **Noise-prone** — the pattern matches frequently and the legit/smell distinction is hard; risk of false positives without aggressive skip-rule use.

| Check | Verdict | Notes |
|-------|---------|-------|
| 1. defensive-checks-for-impossible-cases | **Pattern hits, skip rule passes** | `src/game/audio/userActivation.ts:29` — `if (!cb) continue` after `queue.shift()`. The "How to verify" sub-bullet correctly classifies this as LEGITIMATE (narrowing-eligible source: `.shift()`). No un-suppressed finding. |
| 2. stylistic-drift-within-file | **No matches** | Codebase is Prettier-formatted and ESLint-enforced. Would fire on a fork in worse shape. |
| 3. paraphrase-comments | **No matches** | Comments explain *why* consistently (CLAUDE.md §5 enforces this). Check grounded; fires elsewhere. |
| 4. single-use-helpers | **No matches** | Exports are domain-anchored or multi-call. Check grounded; fires in greenfield repos. |
| 5. generic-names-in-domain-context | **Noise-prone** | Domain vocab is rich; `item` / `data` survive only at justified spots (queue accessor, image buffer). High false-positive risk without aggressive skip rules. |
| 6. swallowed-errors | **Pattern hits, skip rule passes** | `src/game/state/seenStoriesLocal.ts:18` matches the catch pattern but is the legitimate version (returns `[]` with documented why). Skip rule (documented-why comment) correctly suppresses it. No un-suppressed finding. |
| 7. mirror-tests | **Real smells found (opt-in only)** | Dormant under default scope (tests excluded). With `--include-tests`, `src/game/phaser/systems/weaponMath.test.ts:30` and `src/game/state/ShipConfig.test.ts:70` would be reported — both restate impl formulas. Half-mirror — anchored values sit alongside; per the updated skip rule, report only the formula assertion lines, not the whole tests. |
| 8. phantom-todos | **Real smells found** | `src/game/audio/story.ts:51` is a phantom TODO (no ticket, no owner, no condition). |
| 9. duplicated-helpers | **No matches** | Codebase favors single source per math/string operation. Check grounded; fires on copy-paste-heavy code. |
| 10. over-typed-primitives | **No matches** | `as const satisfies` usage in `src/lib/schemas/*` is the legitimate version (pins literals AND verifies WeaponId membership). |

**Real smells found** on this repo: mirror-tests (opt-in, half-mirror formula assertions), phantom-todos (`story.ts:51`).
**Pattern hits, skip rule passes** on this repo: defensive-checks-for-impossible-cases, swallowed-errors — the checks match candidates but the skip rules correctly classify every match as legitimate. These prove the skip rules work; they are not findings.
**Noise-prone** on this repo: generic-names-in-domain-context.
**No matches** on this repo: stylistic-drift, paraphrase-comments, single-use-helpers, duplicated-helpers, over-typed-primitives. The codebase is well-disciplined; these remain useful for less-curated code.

# Failure modes of the skill itself

Be honest with the user when these apply:

- **Will under-detect in heavily abstracted codebases.** Generic Result/Option/Either monads, builder patterns, DI containers obscure the "domain vocabulary" signal several checks rely on. May report "no smells" when a domain expert would see plenty.
- **Will over-flag in test fixtures.** Test files often have legitimate `data`, `result`, `item` names because the test IS testing generic shapes. Default scope excludes `*.test.ts`.
- **Will miss cross-file duplication.** Check #9 is scoped within-module by default; cross-module duplication is often legitimate domain symmetry.
- **Will not catch semantic smells.** A function with perfect names, no comments, no unused helpers, and no swallowed errors can still be wrong about *what it does*. Shape-level only.
- **Severity defaults are starting points.** The auditor invoking the skill can upgrade or downgrade per-finding based on local context.

# Invariants this skill enforces

- Every finding has a `file:line` citation. No vague findings.
- Every check has a smell example AND a legitimate example. If a check can't pass that bar, it should be deleted, not weakened.
- The sidecar at `docs/audits/_dismissals.md` is honored on every run. Per-day reports are append-only artifacts; they never carry dismissal state.
- No execution of project code. Static inspection only.
- No network calls.

# Constraints

- Don't expand the check list beyond 10 without explicit user sign-off. Tool surface area is a feature.
- Don't add an `--apply` / `--fix` flag. Human decides what's a real issue.
- Don't run the audit on the whole `src/` by default. Default scope is the current branch's diff; broader scope is opt-in.

## Freshness check

These checks assert the skill's load-bearing pieces still hold: the companion sidecar template it ships, the Spacepotatis paths it writes to and reads from, the full 10-check surface and the same-day append format documented in the body, and the `git` binary the default scope's `git diff` depends on. All paths are relative to the skill dir unless `root` says otherwise (`scope_root` = repo root in project scope).

```toml
[[check]]
kind = "path_exists"
path = "false-positive-log.template.md"
root = "skill_dir"

[[check]]
kind = "path_exists"
path = "docs/audits"
root = "scope_root"

[[check]]
kind = "path_exists"
path = "docs/audits/_dismissals.md"
root = "scope_root"

[[check]]
kind = "file_contains"
path = "SKILL.md"
pattern = "## 10\\. over-typed-primitives"
root = "skill_dir"

[[check]]
kind = "file_contains"
path = "SKILL.md"
pattern = "## Run \\{N\\}"
root = "skill_dir"

[[check]]
kind = "command_exists"
command = "git"
```

---
name: ai-codegen-smell-audit
description: Read-only audit for 10 concrete failure modes that recur in AI-generated code (defensive checks on non-nullable types, paraphrase comments, single-use helpers, generic names in domain code, swallowed errors, mirror tests, phantom TODOs, duplicated helpers, over-typed primitives, intra-file style drift). Produces a markdown report under docs/audits/. Does not modify code. Designed for PR review and on-demand scans, not for use during initial generation.
---

# When to use

Invoke on `/ai-codegen-smell-audit`, `/smell-audit`, "audit this for AI-codegen smells", or before merging a PR that has substantial AI-generated diff. Also useful when a directory has accumulated several AI-pair-programming sessions and you want a single pass that flags the patterns that tend to drift in without a human catching them.

**Not** invoked during initial code generation — that's chasing your own tail. Run AFTER the code is written, before merge.

Scope is configurable per invocation: a single file, a directory, a PR diff, or the whole `src/` tree. Default scope when invoked with no args is `git diff --name-only main..HEAD` filtered to source files (skip tests for the first pass; tests have their own check, #7).

# What this skill does NOT do

- **It does not detect "AI-written code" in a tribal sense.** That framing produces a witch hunt and strips useful patterns (defensive programming at trust boundaries, justified type annotations, intentional helper extraction for readability). Every finding is a concrete pattern with an example of the smell and an example of the legitimate version.
- **It does not modify any code.** Read-only. The auditor reports; the human decides what's a real issue.
- **It does not flag defensive programming with a documented reason.** A `if (!x) return` next to a `// SECURITY-CRITICAL:` or `// INVARIANT:` marker, or at a documented trust boundary, is not a smell.
- **It does not flag stylistic choices the codebase has explicitly adopted.** If a CLAUDE.md or `.prettierrc` declares the convention, mixing within a file is the smell — but a project-wide choice is not.
- **It does not auto-fix.** No `--apply` mode. No "I'll just refactor this." Every finding requires human judgment.
- **It does not run on a schedule.** It's a tool, not a hook. The human decides when to call it.

# Steps (the audit checklist)

For each check below: scan the configured scope, report hits with `file:line + 1-line snippet + severity + suggested action`. Use the calibration rules (below) to filter false positives BEFORE writing the report. A finding that gets filtered does not appear in the report — the goal is signal, not exhaustiveness.

## 1. defensive-checks-for-impossible-cases

- **Pattern:** `if (x === undefined)`, `if (!x) return`, `if (x == null)`, optional-chaining `x?.y` where `x` is typed non-nullable by the TypeScript signature in scope.
- **Why it matters:** Adds visual noise and signals "I don't trust the types." When the type contract changes, these guards lie about what's reachable. They also bypass exhaustiveness checks (TS won't tell you the unreachable branch is dead).
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
  function area(raw: unknown): number {
    if (typeof raw !== "object" || raw === null) return 0; // trust boundary: raw is unknown
    // ...
  }
  ```
- **Severity default:** minor.
- **Skip:** trust boundaries (user input, network responses, FS, third-party APIs, `JSON.parse` outputs, `unknown` inputs).

## 2. stylistic-drift-within-file

- **Pattern:** the same file mixes single + double quotes, mixes `function foo()` + `const foo = () =>`, mixes `i++` + `i += 1`, mixes 2-space + 4-space indent, or mixes `===` + `==`. Compare to the dominant style in the file's first 50 LOC and flag late deviations.
- **Why it matters:** Drift signals "this section was added without reading the surrounding code." Linters catch most of this, but linters with `continue-on-error` or new-file additions slip through.
- **Smell:** a file that's 100% single-quoted with a function added at line 200 using double quotes and arrow syntax when every other function in the file is a `function` declaration.
- **Legitimate:** a file with an explicit `// LEGACY: pre-2025 style retained until rewrite` marker on the divergent section.
- **Severity default:** nit (unless the file is < 100 LOC, then minor — small file with drift = no excuse).
- **Skip:** files with `// LEGACY:` markers; files explicitly under `node_modules/`, `dist/`, generated code.

## 3. paraphrase-comments

- **Pattern:** comment on line N that restates line N+1 in English without adding intent. `// increment counter` above `counter++`. `// set the user's name` above `user.name = newName`.
- **Why it matters:** Pure noise. Adds lines to read without adding context. Worse: it lies the moment the code below it changes and the comment isn't updated.
- **Smell:**
  ```ts
  // increment the counter
  counter++;

  // loop through each item
  for (const item of items) { ... }
  ```
- **Legitimate:** comments that explain the *why* — a non-obvious constraint, a workaround, a hidden invariant. `// SECURITY-CRITICAL:`, `// INVARIANT:`, `// AI-NOTE:`, `// HACK because <browser> does X` are all fine.
- **Severity default:** nit.
- **Skip:** comments that name a *reason* (regex: `because|so that|prevents|workaround|because|TODO|FIXME|SECURITY|INVARIANT|AI-NOTE|HACK`); JSDoc/TSDoc blocks (`/** */`) which document API surface; type-narrowing assertions where the comment explains the narrowing.

## 4. single-use-helpers

- **Pattern:** function exported (or even module-private) and called exactly once across the codebase, where inlining would shorten the call site's file by 3+ lines and not introduce naming pressure.
- **Why it matters:** Over-extraction. Every helper has a name to remember, a line of import, and a jump-to-definition cost. If it's called once, the abstraction isn't earning its keep.
- **Smell:**
  ```ts
  // foo.ts
  export function addTwo(a: number, b: number): number { return a + b; }

  // bar.ts (the only caller)
  import { addTwo } from "./foo";
  const sum = addTwo(x, y);
  ```
- **Legitimate:** helpers whose name documents intent (`assertNever`, `unreachable`, `panic`, `invariant`, `defaultTo`, `pluralize`); helpers extracted for test isolation (the test calls it directly); helpers whose body is long enough that inlining would obscure the caller; helpers used in JSX/templates where inline expressions are awkward.
- **Severity default:** nit.
- **Skip:** helpers with intent-naming (see above); helpers under `src/lib/utils/` or `src/test-helpers/` (utility namespaces are *meant* to grow); helpers exported from a public API surface (call-count from inside the repo is not the right metric).

## 5. generic-names-in-domain-context

- **Pattern:** variable or parameter named `data`, `result`, `processed`, `handle`, `temp`, `value`, `item`, `info`, `obj`, `thing` inside a function whose surrounding code has a clear domain vocabulary (e.g. a function in `Bullet.ts` that operates on bullets, an `Enemy` method handling enemies).
- **Why it matters:** Generic names force the reader to scan up to find the type. A function with `bullet` instead of `item` is self-documenting at the call site too.
- **Smell:**
  ```ts
  function dealDamage(target: Enemy): void {
    const data = computeHitResult(target);     // domain has 'hit', 'damage'
    const result = applyArmor(data);            // domain has 'damaged', 'damageAfterArmor'
    target.hp -= result;
  }
  ```
- **Legitimate:** generic names in obviously generic code (utility libraries, type-level helpers, `forEach`/`map` one-liners where `item` is genuinely just "the thing"); pixel-buffer code using `data` (the standard name for an `ImageData.data`); queue/stack operations using `item` (standard).
- **Severity default:** nit.
- **Skip:** files under `src/lib/utils/`, `src/lib/schemas/`, type-only modules under `src/types/`; one-line lambda bodies where renaming costs clarity rather than adding it.

## 6. swallowed-errors

- **Pattern:** `catch {}`, `catch (e) {}`, `catch (e) { /* nothing */ }` with no logging, no rethrow, no `return null` for a documented "missing" semantics, and no comment explaining why the error is safe to ignore.
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
- **Severity default:** **major**. Empty catches are the single highest-cost AI smell because they hide real bugs.
- **Skip:** none — even at trust boundaries, a swallowed error needs justification.

## 7. mirror-tests

- **Pattern:** test assertions that structurally restate the implementation rather than its behavior. Impl returns `arr.map(x => x * 2)`, test asserts `expect(result).toEqual(input.map(x => x * 2))`. Impl computes `damage * count * (1000 / cooldown)`, test asserts `expect(dps).toBe(Math.round(w.damage * w.count * (1000 / w.cooldown)))`.
- **Why it matters:** A mirror test passes iff the implementation does what it does — including being wrong in the same way. It catches typos but not logic errors. A behavioral test (`expect(dps(rapidFire)).toBe(50)`) catches both.
- **Smell:**
  ```ts
  test("dealDamage halves armored hits", () => {
    const result = dealDamage({ dmg: 10, armored: true });
    expect(result).toBe(Math.floor(10 * 0.5)); // restates the impl formula
  });
  ```
- **Legitimate:** the same test anchored to a hard expected value: `expect(result).toBe(5)`. Even better with two cases: `expect(result).toBe(5); expect(dealDamage({ dmg: 10, armored: false })).toBe(10);`
- **Severity default:** minor (or major in code that has had production bugs in this area).
- **Skip:** property-based tests (`fast-check`, `jsverify`) where the property IS the formula; tests of pure math functions where the expected value comes from the same math (rare; verify the test author intended the round-trip).

## 8. phantom-todos

- **Pattern:** `TODO`, `FIXME`, `XXX`, `HACK` comments with no referenced issue (`#123`, `JIRA-456`), no owner name, and no condition specifying when it can be removed (`remove after X`, `until Vercel supports Y`).
- **Why it matters:** Untagged TODOs accumulate forever. Nobody knows whose problem they are, when they expire, or whether they're already resolved. The codebase grows a haunted house of past intentions.
- **Smell:** `// TODO: refactor this someday` — no ticket, no owner, no condition.
- **Legitimate:** `// TODO (#1234, @mikko): remove the polyfill once Safari 17 < 5% usage`. The ticket, owner, AND condition together make this a real planned action.
- **Severity default:** nit (one phantom TODO is fine; ten in one file is a smell about the team's habit, not the file).
- **Skip:** TODOs in docs (README, ARCHITECTURE.md) where they document open design questions for human discussion; TODOs in `TODO.md` itself.

## 9. duplicated-helpers

- **Pattern:** two or more functions in the same module/package with ≥80% structural similarity — same parameter shape, same body shape, differ only in 1–2 literals or one renamed identifier.
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
- **Legitimate:** two functions that *look* similar but encode different policies (`escapeForHtml` vs `escapeForAttribute` where the attribute version also escapes quotes). The shape is similar; the contract is different.
- **Severity default:** major (the bug-class cost is real).
- **Skip:** functions with the same shape but explicitly different domains (e.g. `formatMissionTime` vs `formatPlaytime` — same shape, different units).

## 10. over-typed-primitives

- **Pattern:** `as const`, branded types (`type UserId = string & { __brand: "UserId" }`), or `satisfies` annotations on values where plain primitives would carry the same safety in the file's actual usage context.
- **Why it matters:** Type ceremony with no payoff costs reader time and locks in friction (`x as UserId` propagates to every assignment, every test fixture). Use when the type-safety is actually needed (preventing a `UserId` from being passed where a `MissionId` is expected); skip when it isn't.
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

Markdown report written to `docs/audits/ai-smell-{YYYY-MM-DD}.md` (one per day; second run on the same day appends with a `## Run 2 (HH:MM)` divider). Structure:

```markdown
# AI-codegen smell audit — {YYYY-MM-DD}

**Scope:** {files / directory / PR diff string}
**Checks run:** 10
**Total findings:** {N} ({maj} major, {min} minor, {nit} nit)

## Findings

| Check | Severity | File:line | Snippet | Suggested action |
|-------|----------|-----------|---------|------------------|
| swallowed-errors | major | src/foo.ts:42 | `catch {}` | Add log line or comment naming the safe-to-ignore condition |
| paraphrase-comments | nit | src/bar.ts:88 | `// increment` above `i++` | Delete the comment |
| ... | ... | ... | ... | ... |

## Grouped by severity

### Major
- [swallowed-errors] src/foo.ts:42 — `catch {}` with no logging or rethrow. Suggest: add log or document why safe.
- ...

### Minor
- ...

### Nit
- ...

## False-positive log

The next run reads this section and skips findings whose `file:line:check` key appears here. Append new entries below as you dismiss findings; they persist across runs.

| Dismissed at | File:line | Check | Reason |
|--------------|-----------|-------|--------|
| 2026-05-08 | src/foo.ts:42 | swallowed-errors | Catch is at OAuth trust boundary; failure is expected |
```

The final report ends with `**Summary: clean**` (0 findings), `**Summary: N nits**` (only nits), or `**Summary: FAIL ({maj}m {min}m {nit}n)**` (any major/minor). The PR reviewer decides whether `FAIL` blocks merge; the tool doesn't enforce.

# Calibration rules (when NOT to flag)

These rules apply at scan time — a finding that matches a skip rule does not appear in the report. They are the difference between a useful tool and noise.

- **Trust boundaries** — user input, network responses, FS reads, third-party API responses, browser APIs that can throw on hostile DOM state — defensive checks here are required, not smells.
- **Intent-naming helpers** — `assertNever`, `unreachable`, `panic`, `invariant`, `defaultTo`, `pluralize`, `assert*` — these helpers document a contract; "single-use" doesn't apply.
- **Generic code on purpose** — utility libraries, type-level helpers, `src/lib/utils/*` — `data`/`result`/`value` here is the correct vocabulary.
- **Explicit legacy markers** — files or sections marked `// LEGACY:` are excluded from style-drift checks.
- **Documented why-comments** — comments containing `because|so that|prevents|workaround|SECURITY|INVARIANT|AI-NOTE|HACK` are not paraphrase-comments even if they sit above similar code.
- **Project conventions in CLAUDE.md** — if the repo's `CLAUDE.md` declares a convention (e.g. "no `any`", "prefer arrow functions"), that convention is the baseline; intra-file consistency is measured against project style.
- **False-positive log** — past dismissals (in the report's false-positive log section) are honored on the next run.

# Calibration against this repo (validation pass — 2026-05-08)

The 10 checks were dry-run against `d:/koodaamista/Spacepotatis/src/` before publishing this skill. Findings are honest about which checks earn their keep here and which are noise-prone.

| Check | Verdict on this repo | Notes |
|-------|----------------------|-------|
| 1. defensive-checks-for-impossible-cases | **Fires on real things** | `src/game/audio/userActivation.ts:29` — `if (!cb) continue` after `queue.shift()` is a real "guard on impossible case" hit (the type narrowing is in fact correct). One real call site. |
| 2. stylistic-drift-within-file | **No hits** | Codebase is Prettier-formatted and ESLint-enforced. Would fire on a fork in worse shape. |
| 3. paraphrase-comments | **No hits** | Comments in this repo explain *why* consistently (CLAUDE.md §5 enforces this). Check is grounded; will fire elsewhere. |
| 4. single-use-helpers | **No hits** | Exports are either domain-anchored or multi-call. Check is grounded; will fire in greenfield repos. |
| 5. generic-names-in-domain-context | **Noise-prone** | Domain vocab (`BulletEffect`, `spreadVectors`, `MenuItem`) is so rich that `item` / `data` survive only at justified spots (queue accessor, image buffer). Likely false-positive heavy without the calibration rules. |
| 6. swallowed-errors | **Fires on real things** | `src/game/state/seenStoriesLocal.ts:18` is the legitimate version (catch returns `[]` with documented why). A spec'd real hit; the check distinguishes legitimate vs phantom. |
| 7. mirror-tests | **Fires on real things** | `src/game/phaser/systems/weaponMath.test.ts:30` and `src/game/state/ShipConfig.test.ts:70` both restate the impl formula. Anchored-value tests sit alongside, which is fine — but the formula-mirror lines could be deleted with no loss. |
| 8. phantom-todos | **Fires on real things** | `src/game/audio/story.ts:51` is a phantom TODO (no ticket, no owner, no condition). One concrete hit. |
| 9. duplicated-helpers | **No hits** | Codebase favors single source per math/string operation. Check grounded; will fire on copy-paste-heavy codebases. |
| 10. over-typed-primitives | **No hits** | `as const satisfies` usage in `src/lib/schemas/*` is the *legitimate* version (pins literals AND verifies WeaponId membership — both halves earn it). Check grounded. |

**Most grounded** on this repo: swallowed-errors, phantom-todos, defensive-checks. These three fired on genuine hits with clear suggested actions.

**Noise-prone** on this repo: generic-names-in-domain-context. Strong domain vocabulary means the legitimate exceptions outnumber the smells; expect a high false-positive rate without aggressive use of the skip rules. Mirror-tests also borders on noise — formula-mirror lines that sit ALONGSIDE anchored expected values are arguably defensible.

**No hits but still grounded**: stylistic-drift, paraphrase-comments, single-use-helpers, duplicated-helpers, over-typed-primitives. The codebase is well-disciplined; these checks remain useful for less-maintained codebases or sections that have absorbed heavier AI-pair-programming.

**Failure modes discovered during calibration**:
1. Distinguishing "mirror test that restates formula" from "test that asserts a contractual formula" requires reading the test's neighbors. A test that asserts both `expect(dps(w)).toBe(50)` AND `expect(dps(w)).toBe(formula(w))` is half-mirror; report only the formula assertion, not the whole test.
2. The `if (!cb) continue` pattern in `userActivation.ts` is "defensive guard" by the regex but in fact required (`queue.shift()` returns `T | undefined`). The TypeScript type is non-nullable in *some* narrowed positions and nullable in others. Calibration requires looking at the actual type at the guard site, not the function's parameter declaration. Tool implementations should narrow on the actual expression type, not the declared variable type.

# Failure modes of the skill itself

Be honest with the user when these apply:

- **Will under-detect in heavily abstracted codebases.** Code that does everything through generic Result/Option/Either monads, builder patterns, or DI containers obscures the "domain vocabulary" signal that several checks rely on. The auditor may report "no smells" when a domain expert would see plenty.
- **Will over-flag in test fixtures.** Test files often have legitimate `data`, `result`, `item` names because the test IS testing generic shapes. Default scope excludes `*.test.ts`; expand only when asked.
- **Will miss cross-file duplication.** Check #9 is scoped to within-module by default. Two near-identical helpers in two different modules won't trip it. This is intentional (cross-module duplication is often legitimate domain symmetry) but worth knowing.
- **Will not catch semantic smells.** A function with perfect names, no comments, no unused helpers, and no swallowed errors can still be wrong about *what it does*. This skill is shape-level only.
- **Will not catch "the right code, wrong file."** A correctly-written function placed in the wrong module is invisible to every check here. That's a module-boundary audit, not a smell audit.
- **Calibration rules are heuristic.** "Trust boundary" detection relies on adjacent code patterns (`fetch(`, `JSON.parse(`, `localStorage.`, `process.env`); a custom trust boundary not matching these will be miscategorized either way. False-positive log catches the residue.
- **Severity defaults are starting points.** The auditor invoking the skill can upgrade or downgrade per-finding based on local context. Severity is a hint, not a rule.

# Invariants this skill enforces

- Read-only. Never edits, stages, or commits any file.
- Every finding has a `file:line` citation. No vague findings.
- Every check has a smell example AND a legitimate example in this SKILL.md. If a check can't pass that bar, it should be deleted, not weakened.
- The false-positive log in the report is honored by the next run. Dismissals persist.
- No execution of project code. Static inspection only.
- No network calls. No reading of `package.json` for online lookups.

# Constraints

- Don't expand the check list beyond 10 without explicit user sign-off. Tool surface area is a feature.
- Don't add an `--apply` / `--fix` flag. The human decides what's a real issue.
- Don't run the audit as part of CI by default. It produces findings that require human judgment; auto-failing builds on it would either underreport (raise the bar to silence false positives) or block PRs on nits. Reviewer invokes manually.
- Don't run the audit on the whole `src/` by default. Default scope is the current branch's diff; broader scope is opt-in via the invocation.

# Phase 3 — Other findings (non-security but observed during the audit)

This file is the bin for non-security issues that the security audit observed but is not authorized to fix. Per the `security-fixer` agent contract: "If you see something that's broken but isn't security-relevant, append it to `docs/security/04-other-findings.md` and KEEP MOVING." This file gets surfaced to the operator at Phase 5 verification.

## Format per entry

```
### NSC-XXX — <title>
- **Where spotted:** <file:line or branch ref>
- **What:** one paragraph
- **Why it isn't a security finding:** one sentence
- **Recommended action:** who fixes, in what PR, by when
- **Status:** open / resolved / risk-accepted (date)
```

## Entries

### NSC-001 — `refactor/zod-content-accessors` adds `Schema.parse(jsonData)` at module load — CLAUDE.md §5 hard-rule violation

- **Where spotted:** local branch `refactor/zod-content-accessors` (2 commits ahead of master, not on a PR as of 2026-05-05). Identified during Phase 3 Wave 1 in-flight branch scan.
- **What:** the branch adds runtime Zod `Schema.parse()` calls at module load for `src/game/data/{weapons,enemies,waves,solarSystems}.ts`. CLAUDE.md §5 explicitly forbids this pattern: *"Don't re-add `Schema.parse(jsonData)` at module load — that's exactly what cost us ~98 kB on every static page's first-load JS before this pattern landed. CI is the drift gate now."* The drift gate (`src/game/data/__tests__/jsonSchemaValidation.test.ts`) runs the matching `lib/schemas/*` parser against each JSON in CI, so production code does not need a runtime parse.
- **Why it isn't a security finding:** the parse-at-load pattern is a build-output / page-weight regression, not a vulnerability. The data being parsed is static JSON shipped with the repo — there's no untrusted input flowing through the parser. The harm is the bundle-size regression and the maintenance trap of having two equivalent validation paths (CI test + runtime parse).
- **Recommended action:** before this branch is merged, owner replaces the runtime `Schema.parse()` calls with the cast pattern documented in CLAUDE.md §5 (one `as readonly XDefinition[]` cast at module load, no runtime Zod), and confirms the CI drift gate (`jsonSchemaValidation.test.ts`) covers any newly-added accessors. If the branch is abandoned, no action needed. The audit does not own this decision — surfacing it for the human operator who scheduled the refactor.
- **Status:** open (logged 2026-05-05).

## Logged-not-fixed

## SEC-027 follow-up — derive unlocked solar systems server-side (logged 2026-05-07)

**Background**: SEC-027 (PR #193) added a server-side check that rejects `currentSolarSystemId` not in `body.unlockedSolarSystems`. The check uses the user-submitted `unlockedSolarSystems` list as the source of truth — same self-referential rake that SEC-017 (PR #186) closed for credit caps.

**Why it's not exploitable today**: `unlockedSolarSystems` is NOT persisted server-side; only `current_solar_system_id` is written to `save_games`. On load, the client recomputes `unlockedSolarSystems` from the server-trusted `unlockedPlanets` (via `persistence.ts:68-70`).

**Why it matters for the future**: if a future PR adds direct persistence of `unlocked_solar_systems` to the DB, this rake re-emerges as a progression-bypass surface. The principled fix is to derive the trusted unlock set server-side (mission→system mapping, like SEC-017's `deriveCapInputMissions`) and check against that — not against the user-submitted list.

**Proposed fix shape** (when needed): add `deriveUnlockedSolarSystems(prevCompletedMissions, submittedCompletedMissions)` to `src/lib/saveValidation.ts`, mirroring `deriveCapInputMissions`. Update SEC-027's check to compare `currentSolarSystemId` against the derived list.

**Severity**: informational while `unlocked_solar_systems` stays client-derived. Promote if the field gets persisted server-side.

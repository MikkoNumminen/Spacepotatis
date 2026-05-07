# Phase 5 — Final verification report

**Audit window:** 2026-05-04 → 2026-05-07
**Verification baseline:** master at `6428cd6`
**Method:** read-only static analysis + regression-test execution by three parallel `security-auditor` cells; report assembled by the orchestrator.

This is the closing artifact of the security audit started by `/security-audit` on 2026-05-04. It verifies that every fix from Phase 3 (PRs #173-#199) and the documentation pass from Phase 4 (PR #201) landed correctly on master. No new findings were introduced; the goal is verification, not exploration.

## Headline

- **22 SEC-XXX findings closed** (across 16 PRs).
- **3 SEC-XXX findings deferred or risk-accepted**:
  - SEC-002 (rate limiting) — blocked on user A-001 infra-choice gate (Vercel KV / Upstash Redis / in-memory + monitoring).
  - SEC-006 (`save_audit` 90-day retention) — deferred until the GH Actions cron opens the save-architecture-ready issue (memory: experiment-window protection).
  - SEC-030 / SEC-031 / SEC-032 — informational, risk-accepted at Phase 2.
- **0 NEW findings surfaced during Phase 5.** The re-walk produced only minor line-drift observations within the invariants doc's stated "line numbers drift; the citation is a hint, not a contract" tolerance.
- **Test surface:** `tests/security/` runs **98 tests across 20 files** as a dedicated CI step; full suite (`npm test`) totals 1280 tests across the codebase, all green.
- **Lint:** `npm run lint` green; the 3 new Phase-4 security ESLint rules each tie to a SEC-XXX finding and have zero existing matches.
- **Phase 4 documentation pass** verified intact: 25 invariants, 9 per-module SECURITY.md, 14 code-level markers across 8 files, root SECURITY.md, threat model, CLAUDE.md §18.

## Coverage matrix (all 27 actionable findings)

| Surface | Findings verified | Status |
|---|---|---|
| Auth + identity | SEC-008, SEC-012, SEC-018, SEC-019 | All confirmed fixed |
| Save pipeline | SEC-005, SEC-011, SEC-013, SEC-017, SEC-020, SEC-027 | All confirmed fixed |
| Leaderboard | SEC-003, SEC-014 | All confirmed fixed |
| Schema boundary | SEC-016, SEC-022 | All confirmed fixed |
| Client save / load | SEC-025, SEC-026 | All confirmed fixed |
| Production-write scripts | SEC-007 + SEC-021 (bundled), SEC-010 | All confirmed fixed |
| CI + supply chain | SEC-015, SEC-023, SEC-024, SEC-028, SEC-029 | All confirmed fixed |
| HTTP perimeter | SEC-001, SEC-004 | All confirmed fixed |
| Rate limiting | SEC-002 | Deferred (user A-001 decision) |
| Audit-log retention | SEC-006 | Deferred (experiment window) |
| Informational | SEC-030, SEC-031, SEC-032 | Risk-accepted |
| Architectural | A-001 (rate-limit infra) | Pending user decision |

## Cell A — Auth + Save Pipeline (10 findings)

All 10 confirmed fixed. Per-finding evidence:

| Finding | Fix location | Regression test | Invariant |
|---|---|---|---|
| SEC-008 | `package.json:27` (next-auth@5.0.0-beta.31) | `src/lib/auth.test.ts` (3 tests, hygiene class) | — |
| SEC-012 | `src/lib/auth.ts:13-25` (SECURITY-CRITICAL block) | `src/lib/authUrlPin.test.ts` | INV-AUTH-2 |
| SEC-018 | `src/lib/players.ts:13-24` (INSERT … ON CONFLICT) | `tests/security/upsertPlayerRace.test.ts` (3 tests) | INV-AUTH-3 |
| SEC-019 | `src/lib/auth.ts:34-41` + `src/lib/authEmailVerified.ts:26-28` | `tests/security/emailVerified.test.ts` (6 tests) | INV-AUTH-1 |
| SEC-005 | `src/app/api/save/route.ts:293-441` (5 rejection branches log playerId) | `tests/security/saveLoggingPii.test.ts` (4 tests) | INV-LOG-1 |
| SEC-011 | `src/lib/schemas/save.ts:417, 460` (cap) + `src/app/api/save/route.ts:74, 106-116` (audit truncation) | `tests/security/auditAmplification.test.ts` (7 tests) | INV-SAVE-6, INV-SCHEMA-2 |
| SEC-013 | `src/app/api/save/route.ts:250-494` (transaction) + `:266` (`.forUpdate()`) | `tests/security/saveRace.test.ts` (3 tests) | INV-SAVE-1, INV-SAVE-7 |
| SEC-017 | `src/lib/saveValidation.ts:226-247` (helper) + `src/app/api/save/route.ts:397-401` (call site) | `tests/security/creditCapCircular.test.ts` (10 tests) | INV-SAVE-4 |
| SEC-020 | `src/app/api/save/route.ts:526-527` (clientError derivation) + `src/game/state/saveQueue.ts` (TRANSIENT extension) | `tests/security/validatorOpaqueCode.test.ts` (8 tests) | INV-SAVE-8 |
| SEC-027 | `src/app/api/save/route.ts:427-450` (validator inside tx) | `tests/security/currentSolarSystemUnlock.test.ts` (5 tests) | INV-SAVE-5 |

**Tests run:** 88 tests across 17 files, 0 failures.

## Cell B — Leaderboard + Schema + Client (6 findings)

All 6 confirmed fixed. Per-finding evidence:

| Finding | Fix location | Regression test | Invariant |
|---|---|---|---|
| SEC-003 | `src/app/api/leaderboard/route.ts:23-27` (`MissionIdSchema.safeParse`) | `tests/security/leaderboardMissionIdValidate.test.ts` (5 tests) | INV-LB-3 |
| SEC-014 | `src/lib/schemas/save.ts:501-505` (Zod sanity cap) + `src/lib/saveValidation.ts:558` (`maxLegitScore`) + `src/app/api/leaderboard/route.ts:60-64` (per-mission cap) | `tests/security/leaderboardScoreCap.test.ts` (10 tests) | INV-LB-1 |
| SEC-016 | `src/lib/schemas/save.ts:319, 321-330, 335-344` (`unlockedWeapons.max(50)` + `weaponLevels`/`weaponAugments` superRefine 50-key cap) | `tests/security/legacyShipSchema.test.ts` (8 tests) | INV-SCHEMA-2 |
| SEC-022 | `src/lib/schemas/save.ts:195` (`WeaponInventorySchema.max(50)`) | `tests/security/weaponInventoryCap.test.ts` (4 tests) | INV-SCHEMA-2 |
| SEC-025 | `src/game/state/sync.ts:246-249` (raw payload removed from console) | `tests/security/saveLogPayload.test.ts` (5 tests) | INV-LOG-3 |
| SEC-026 | `src/components/GameCanvas.tsx:254, 276` (await saveNow → await drainScoreQueue) | `tests/security/saveScoreOrdering.test.ts` (3 tests) | INV-QUEUE-2 |

**Tests run:** 35 tests across 6 files, 0 failures.

## Cell C — Scripts + CI + Ops + Headers (11 findings + Phase 4 deliverable cross-check)

All 11 confirmed fixed. Per-finding evidence:

| Finding | Fix location | Regression test | Invariant |
|---|---|---|---|
| SEC-007 + SEC-021 | `scripts/improve-restore.mjs:38-225` (parseFlags + requireConfirm + BEGIN/COMMIT + writeBackup inside tx + cross-check) | `scripts/improveRestoreHarness.test.mjs` (11 tests) | INV-SCRIPT-1/2/3 |
| SEC-010 | `docs/RIGHT_TO_ERASURE.md` + `scripts/erase-player.mjs:60-365` (full harness + CASCADE-delete with full row backup) | `scripts/erase-player.test.mjs` (9 tests) | INV-SCRIPT-1/2/3 |
| SEC-015 | `.github/workflows/ci.yml:28-29,63` + `audit-readiness-check.yml:31,33` (40-char SHA pins) | code review only — see open concerns | INV-OPS-2 |
| SEC-023 | `.github/workflows/audit-readiness-check.yml:83-109` (heredoc + `--body-file`) | `tests/security/auditReadinessYml.test.ts` (3 tests) | INV-OPS-5 |
| SEC-024 | `.husky/pre-commit:2` (`npx --no lint-staged`) | `tests/security/preCommitHook.test.ts` (2 tests) | INV-OPS-4 |
| SEC-028 | `.github/dependabot.yml` (npm + weekly + grouped) | `tests/security/dependabotConfig.test.ts` (4 tests) | (supply-chain hygiene) |
| SEC-029 | `.github/workflows/ci.yml:16-17` (`permissions: contents: read`) | `tests/security/workflowPermissions.test.ts` (4 tests) | INV-OPS-3 |
| SEC-001 | `next.config.ts:36` calling `src/lib/securityHeaders.ts:19-61` (CSP + 4 other headers, applies to `/(.*)` ) | `tests/security/headers.test.ts` (1 test, 6 assertions) | INV-OPS-1 |
| SEC-004 | `src/app/api/save/route.ts:60-63` (GET) + `src/app/api/handle/route.ts:40-43, 104-107` (drop `err.message`) | `tests/security/errorReflection.test.ts` (3 tests) | INV-LOG-2 |

**Phase 4 deliverable cross-check:**

- **Security CI step**: `.github/workflows/ci.yml:44-45` runs `npx vitest run tests/security/` as `Security regression tests`. Suite: 20 files, 98 tests, 1.09s.
- **ESLint rules** (3): all 3 well-formed at `eslint.config.mjs:49-100` with `// reason: SEC-XXX` justifications. Verified zero existing matches for each (clean baseline).
- **Lint suite**: `npm run lint` green.

**Tests run:** scripts (20 tests across 2 files) + tests/security/ (98 tests across 20 files) + lint + dependabot YAML parse — all green.

## Open concerns (logged-not-fixed)

These are non-blocking observations that surfaced during Phase 5. None affect correctness; flagged for the next maintenance pass.

1. **Minor line-drift in `docs/security/invariants.md`.** Several entries cite line numbers that are off by 1–7 lines after intervening commits (e.g. INV-SAVE-8 cites `route.ts:510-525`; actual `clientError` lives at 526-527; INV-LB-1 / INV-LB-2 / INV-LB-3 each off by 1–3 lines). The doc's preamble explicitly warns "line numbers drift across refactors, so the line range is a hint to where to look, not a contract." All current drift is within that tolerance. Recommend a one-shot refresh pass on the next round of audit doc maintenance.

2. **No dedicated regression test for SEC-015 (Actions SHA pinning).** Coverage relies on PR review. Closing the gap is mechanical: a `tests/security/actionsShaPinning.test.ts` that greps `uses:` lines against a `^[a-f0-9]{40}$` regex would lock the contract automatically. Logged as a possible follow-up.

3. **No dedicated regression test for SEC-008 (next-auth bump).** This is by design (per the plan, hygiene class — verified by `npm audit` + existing auth tests). Not a gap, just an inventory anomaly noted for completeness.

4. **SEC-027 follow-up logged in `docs/security/04-other-findings.md`** during PR #199. The current SEC-027 check uses `body.unlockedSolarSystems` (user-submitted) as the source of truth; same self-referential rake that SEC-017 closed for credit caps. Not exploitable today (the `unlocked_solar_systems` column doesn't exist; client recomputes on load from server-trusted `unlockedPlanets`). Re-read the follow-up before persisting `unlockedSolarSystems` server-side.

## Phase 4 documentation status

Verified by both Cell A and Cell C:

- Root: `SECURITY.md` (vuln-report procedure), `docs/security/threat-model.md`, `docs/security/invariants.md` (25 invariants), `CLAUDE.md §18` (security-defaults section).
- Per-module: 9 SECURITY.md files (auth, saveValidation, save route, leaderboard, schemas, securityHeaders, dbWriteSafety, persistence, saveQueue).
- Code-level markers: 14 across 8 files (density-controlled, all explain *why*).
- AI-readability self-test (Phase 4 self-test): PASS on `src/lib/saveValidation.ts` + `src/app/api/save/route.ts`.

## Risk-accepted findings (Phase 2 decisions, re-confirmed)

- **SEC-030** — Leaderboard cache hit/miss timing fingerprints mission popularity. Mission popularity is not sensitive; the timing oracle reveals only what's already publicly inferable from sustained traffic.
- **SEC-031** — Leaderboard POST 422-vs-201 timing oracle for own mission completion. The authenticated user already knows their own mission state from `GameState`; the oracle adds no information.
- **SEC-032** — `timeSeconds = 0` accepted in leaderboard POST. Cosmetic display issue ("0:00 completion time"); not used for ranking. Risk-accept reasonable.

These remain risk-accepted. Re-evaluate on next audit if the threat model changes (e.g. multi-player adds inference attacks against other players' state).

## Deferred findings (not yet actioned)

- **SEC-002 — HTTP-layer rate limiting on all API routes.** Architectural finding A-001 (rate-limit infra: Vercel KV vs Upstash Redis vs in-memory + monitoring). Awaiting user decision before Phase-3-style remediation can dispatch. The interim mitigation is the per-payload caps that already landed (SEC-011 audit-table cap, SEC-016/022 schema caps, SEC-014 score cap) — these reduce the per-request damage even without rate limits. Once A-001 is decided, SEC-002 lands as a single PR with route-level token-bucket guards + a regression test.

- **SEC-006 — `save_audit` 90-day retention policy.** Doc-only proposal already exists (in `docs/security/02-findings-and-plan.md`); activation is gated on the GH Actions cron opening the save-architecture-ready issue (memory: experiment window). Until then, the audit table grows; cleanup runs as a single one-line cron change once activated.

## Audit close

The audit's posture as of 2026-05-07: **0 critical, 0 high, all medium and below remediated or explicitly deferred with rationale.** The cheat guards in `saveValidation.ts`, the FOR-UPDATE transaction wrapping `/api/save`, the `writeBackup` contract in `scripts/`, and the `playerEmail` stamp on the save queue continue to do the work CLAUDE.md describes — verified end-to-end in Phase 5.

The Phase 4 documentation pass means a future agent reading CLAUDE.md → §18 → threat model → invariants → per-module SECURITY.md should arrive at the same defaults this audit established without re-deriving them. The dedicated CI security regression suite means a regression in any of the 22 closed findings shows up as a clearly-named failed check rather than buried in 1300+ lines of vitest output.

**Phase 5 status: complete.** The security-audit skill has run its course for this audit cycle. Next invocation should kick off a fresh `/security-audit` against a moved baseline.

## Next phase (do not start)

There is no Phase 6. The remaining open work (SEC-002 dispatch, SEC-006 activation, three risk-accepted findings to revisit on next audit, the SEC-027 follow-up to revisit if `unlockedSolarSystems` gets persisted, and the optional invariants line-refresh + SEC-015 regression test) lives outside the closed audit cycle.

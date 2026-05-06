# Security audit — progress checkpoint

This file is the resume-protocol checkpoint for `/security-audit`. The orchestrator skill (`.claude/skills/security-audit/SKILL.md`) reads it on resume to figure out the next phase / next finding to dispatch.

**Convention:** every phase or fix appends to this file. **Never rewrite history** — append-only. If a finding turns out to need a redo, append a new entry referencing the prior one rather than editing it.

## Format per entry

For phase-level checkpoints:

```
## Phase N — <name> (status: <pending | in-progress | complete>)
- Started: <date>
- Completed: <date or "—">
- Artifact: <docs/security/NN-name.md>
- PR: <#NNN or "no PR — doc-only">
- Notes: <one-line callout>
```

For Phase 3 finding-level checkpoints (one per `security-fixer` run):

```
## Phase 3 — finding: SEC-XXX <title>
- Worktree: <path or "main">
- Branch: <feat/security-sec-XXX-name>
- Commit: <sha or "staged">
- Files changed: <list>
- Test added: <path:test-name>
- Save-roundtrip-audit run? (Y/N — N only if not save-touching)
- Migration required? (Y/N — Y only if schema-touching; if Y, applied-to-prod date)
- Deviations from plan: <list, each with reason>
- Tests / typecheck / build / lint: green at <hh:mm>
- PR: <#NNN>
```

## Audit log

### Phase 0a — Skill reconciliation (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/00-skill-reconciliation.md](00-skill-reconciliation.md)
- PR: #158 (bundled with all Phase 0–2b artifacts)
- Notes: net-add — no prior security skill existed to merge.

### Phase 0b — Agent setup (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/00-agent-setup.md](00-agent-setup.md)
- PR: #158
- Notes: 3 agent contract specs added (`.claude/agents/security-{auditor,fixer,doc-writer}.md`). Custom agents are inline-able specs, NOT registered subagent_types.

### Phase 1 — Attack-surface map (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/01-attack-surface.md](01-attack-surface.md)
- PR: #158
- Notes: 0 critical, 0 high. 11 sub-areas covered with file:line evidence. The cheat guards in `src/lib/saveValidation.ts` and the `playerEmail` stamp on `src/game/state/saveQueue.ts` are doing the work CLAUDE.md describes. No real secret in git history. `npm audit` advisories don't apply to current code paths.

### Phase 2 — Findings + plan (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-04
- Artifact: [docs/security/02-findings-and-plan.md](02-findings-and-plan.md)
- PR: #158
- Notes: 10 SEC-XXX findings, 5 A/B option pairs, 1 architectural finding (A-001 rate-limit infra).

### Phase 2b — Maximum-attack pen-test battery (status: complete)
- Started: 2026-05-04
- Completed: 2026-05-05
- Artifact: [docs/security/02b-attack-cells.md](02b-attack-cells.md)
- PR: #158
- Notes: 10 parallel adversarial cells; 22 net-new findings; final tally 0 critical / 0 high / 9 medium / 15 low / 8 informational (3 risk-accept). Highest-impact addition: SEC-011 (audit-table size-cap DoS amplifier).

### Phase 3 — Remediation (status: in-progress)

PR #158 merged at `cd3d0f2` (2026-05-05). Wave 1 dispatches 8 medium findings (SEC-001, 003, 007+021, 011, 012, 013, 014, 015) in parallel worktree branches off master.

#### Wave 1 kickoff — decisions log (2026-05-05)

**SEC-007+021 approach** — three options considered:
- (A) Adopt `fix/restore-script-safety` local branch (deletes `scripts/improve-restore.mjs` entirely). Cleaner final state but requires coordinated updates to CLAUDE.md §11 + §15, INCIDENT_RUNBOOK.md, removal of 2 `writeBackup-wiring.test.mjs` describe blocks, and removal of operator capability for future second-pass restoration. **Logged, not chosen.**
- (B) **Retrofit `parseFlags` + `requireConfirm` + transaction wrapper onto `improve-restore.mjs`. Smaller blast radius (script + 1 test). Preserves operator capability. CLAUDE.md §15 stays accurate (just removes "predates the helper" language). CHOSEN.**
- (C) Skip — leave `improve-restore.mjs` as-is. Footgun stays. **Logged, not chosen.**

**Wave 1 parallel-worktree dispatch order** — launching 4 truly-disjoint fixes first (SEC-001 next.config.mjs, SEC-007+021 improve-restore.mjs, SEC-012 auth.ts comment, SEC-015 workflow SHA pins). The 4 file-overlapping fixes (SEC-003+014 share `src/lib/schemas/save.ts` + leaderboard route; SEC-011+013 share save route + schema) come next, sequentially. Alternative considered: launch all 8 simultaneously, accept rebase pain on the second-to-merge of each overlapping pair. **Logged, deferred** — staggered approach is cheaper for review.

**`refactor/zod-content-accessors` CLAUDE.md violation flag.** Local-only WIP branch adds runtime `Schema.parse(jsonData)` at module load — directly contradicts CLAUDE.md §5's hard rule (~98 kB first-load JS regression). Logged in `docs/security/04-other-findings.md` so it doesn't accidentally land. Not a Wave 1 concern.

### Phase 3 — finding: SEC-015 actions SHA pinning
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a326bfefbb4f7b904
- Branch: feat/security-sec-015-actions-sha-pin
- Commit: 8720175
- Files changed: .github/workflows/ci.yml, .github/workflows/audit-readiness-check.yml, src/__tests__/actionsShaPinning.test.ts, docs/security/02b-attack-cells.md, docs/security/_progress.md
- Test added: src/__tests__/actionsShaPinning.test.ts: "SEC-015 — GitHub Actions are pinned to commit SHAs, not mutable tags"
- Save-roundtrip-audit run? N — not save-touching
- Migration required? N
- Deviations from plan: none
- Pinned SHAs: actions/checkout → 34e114876b0b11c390a56381ad16ebd13914f8d5 (v4.3.1); actions/setup-node → 49933ea5288caeca8642d1e84afbd3f7d6820020 (v4.4.0); actions/upload-artifact → ea165f8d65b6e75b540449e92b4886f43607fa02 (v4.6.2)
- Tests / typecheck / build / lint: green (1161 tests, 82 files)
- PR: pending

#### Phase 3 — finding: SEC-012 — `AUTH_URL` not pinned; `trustHost: true` falls back to `x-forwarded-host`
- Worktree: `D:/koodaamista/Spacepotatis/.claude/worktrees/agent-acd0538c39458ce89`
- Branch: `feat/security-sec-012-auth-url-pin` (off master 5a255fb)
- Commit: pending
- Files changed: `src/lib/auth.ts` (added 12-line SECURITY-CRITICAL comment block before `trustHost: true`), `src/lib/authUrlPin.test.ts` (new regression test), `docs/security/02b-attack-cells.md` (status note on SEC-012), `docs/security/02-findings-and-plan.md` (status note: SEC-009 superseded by SEC-012), `docs/security/_progress.md` (this entry).
- Test added: `src/lib/authUrlPin.test.ts` — `SEC-012 — auth.ts documents the AUTH_URL pin requirement > contains a SECURITY-CRITICAL comment about AUTH_URL + trustHost`. Test placed under `src/lib/` (not `tests/security/`) because `vitest.config.ts:include` is `src/**/*.test.ts` — files under `tests/` are not collected by the test runner.
- Save-roundtrip-audit run? N (not save-touching).
- Migration required? N.
- Deviations from plan: (1) test path moved from `tests/security/authUrlPin.test.ts` to `src/lib/authUrlPin.test.ts` so vitest actually picks it up; the test body is unchanged in spirit. (2) The SECURITY-CRITICAL comment lands above the `trustHost: true` line *inside* the NextAuth config object literal (the spec asked for "before line 12"; this is exactly that spot in the current file).
- Tests / typecheck / build / lint: green at 05:53 — typecheck pass, lint pass, vitest 1152/1152 pass, next build pass.
- Operator action required (out-of-band, tracked in PR body checklist): set `AUTH_URL` in Vercel env vars (Production AND Preview) to the canonical production URL; redeploy; verify sign-in still works; confirm Google OAuth Console has only canonical URL (no wildcards) in redirect-URI allow-list.
- PR: pending push.

### Phase 3 — finding: SEC-007 + SEC-021 — improve-restore.mjs safety harness + transaction wrapper
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-aeb140c0cce751813
- Branch: feat/security-sec-007-021-improve-restore-harness
- Commit: af562f847b45757c0c32f101590b7b26d8627371
- Files changed: scripts/improve-restore.mjs (retrofitted), scripts/improveRestoreHarness.test.mjs (new, 11 tests), docs/security/02-findings-and-plan.md, docs/security/02b-attack-cells.md, docs/security/_progress.md, CLAUDE.md
- Test added: scripts/improveRestoreHarness.test.mjs — 11 tests covering SEC-007 (parseFlags import, requireConfirm gate, dry-run-by-default, --player-email cross-check) and SEC-021 (BEGIN/FOR UPDATE/COMMIT ordering, ROLLBACK, pool.connect)
- Save-roundtrip-audit run? N — not save-touching
- Migration required? N
- Deviations from plan: none; Option B (retrofit) executed as chosen by orchestrator
- Tests / typecheck / build / lint: 1161 tests green, typecheck clean, lint clean, build clean at 05:53
- PR: pending

### Phase 3 — finding: SEC-001 — security headers
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a94f540848a5cf294
- Branch: feat/security-sec-001-headers
- Commit: 589f698
- Files changed: next.config.mjs (removed), next.config.ts (new), src/lib/securityHeaders.ts (new), tests/security/headers.test.ts (new), vitest.config.ts (include path added), docs/security/02-findings-and-plan.md, docs/security/_progress.md
- Test added: tests/security/headers.test.ts → "SEC-001 — security headers in next.config.mjs"
- Save-roundtrip-audit run? N (does not touch save pipeline)
- Migration required? N
- Deviations from plan: Converted next.config.mjs → next.config.ts (Next.js 15 supports .ts configs natively) to enable proper TypeScript imports; extracted headers logic to src/lib/securityHeaders.ts so the test can import it directly without the .mjs → .ts module resolution problem (allowJs: false in tsconfig). Test asserts on getSecurityHeaders() rather than importing next.config directly — same behavioral contract.
- Tests / typecheck / build / lint: green at 05:55
- PR: TBD

### Phase 3 — finding: SEC-003 — GET /api/leaderboard mission-param as MissionId cast
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a90466e69b8247996
- Branch: feat/security-sec-014-003-leaderboard-hardening
- Commit: 97754a8
- Files changed: src/app/api/leaderboard/route.ts (GET handler: replaced `as MissionId` cast with `MissionIdSchema.safeParse`, returns 400 `invalid_mission` for unknown ids), tests/security/leaderboardMissionIdValidate.test.ts (new, 5 tests)
- Test added: tests/security/leaderboardMissionIdValidate.test.ts — "SEC-003 — GET /api/leaderboard rejects unknown ?mission= values" (bogus string → 400, UUID-shaped string → 400, SQL-injection string → 400, valid 'tutorial' → 200, all MISSION_IDS accepted)
- Save-roundtrip-audit run? N — not save-touching
- Migration required? N
- Deviations from plan: none; Option A (MissionIdSchema.safeParse) executed as approved by orchestrator; prod leaderboard confirmed to have no retired ids
- Tests / typecheck / build / lint: green at 01:56
- PR: bundled with SEC-014 in feat/security-sec-014-003-leaderboard-hardening

### Phase 3 — finding: SEC-014 — score field unbounded in ScorePayloadSchema
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a90466e69b8247996
- Branch: feat/security-sec-014-003-leaderboard-hardening
- Commit: d51c2a5
- Files changed: src/app/api/leaderboard/route.ts (POST handler: maxLegitScore cap check → 422 score_implausible), src/lib/saveValidation.ts (new export: maxLegitScore(missionId)), src/lib/schemas/save.ts (ScorePayloadSchema: added min(0).max(SCORE_SANITY_CAP), new export SCORE_SANITY_CAP=10_000_000), tests/security/leaderboardScoreCap.test.ts (new, 11 tests), docs/security/02-findings-and-plan.md (SEC-003 status)
- Test added: tests/security/leaderboardScoreCap.test.ts — "SEC-014 — POST /api/leaderboard rejects implausible scores" (INT max → 400 validation_failed; score above Zod cap → 400; 10_000_000 for tutorial → 422; negative → 400; score=0 for tutorial → 201; realistic score for tutorial → 201; realistic for combat-1 → 201) + "SEC-014 — maxLegitScore derivation" (every MISSION_IDS id → positive finite cap; tutorial cap > 1500 and < INT max; combat-1 cap > 25000 and < 10M; shops/hubs → fallback cap > 0)
- Save-roundtrip-audit run? N — not save-touching (leaderboard route only; saveValidation.ts new function is read-only)
- Migration required? N — no schema change (DB column is already INTEGER; we're enforcing an application-level cap below the column max)
- Deviations from plan: the Zod sanity cap (10_000_000) catches INT max (2,147,483,647) at the schema level (400), not the per-mission cap (422). This is correct behaviour — any value > 10M is obviously fabricated and the two-layer defence is documented in the schema comment.
- Tests / typecheck / build / lint: green at 01:58
- PR: feat/security-sec-014-003-leaderboard-hardening

### Phase 3 — finding: SEC-013 — TOCTOU on prevRow SELECT in POST /api/save
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a1ccfac1f3f4c253f
- Branch: feat/security-sec-013-011-save-route-hardening
- Commit: 6ebce98 (commit 1 of 2 on this bundled branch — orchestrator override of the no-bundling rule because both findings touch src/app/api/save/route.ts)
- Files changed: src/app/api/save/route.ts (prev-row SELECT + validators + upsert wrapped in db.transaction().execute(async trx => { ... .forUpdate() ... }); audit writes moved AFTER the transaction so they never block the critical path; sessionEmail hoisted so the closure keeps the type narrowing from the auth guard); src/app/api/save/route.test.ts (mock now exposes `transaction()` returning a trx with the same selectFrom/insertInto chains; selectChain gains a passthrough `forUpdate()`); tests/security/saveRace.test.ts (new — 3 tests: transaction opened, forUpdate called inside the tx, stale-baseline rejected by validateNoRegression after concurrent richer commit); docs/security/02b-attack-cells.md (status note); docs/security/_progress.md (this entry)
- Test added: tests/security/saveRace.test.ts — `SEC-013 — POST /api/save wraps prev-row read + validate + upsert in a transaction with FOR UPDATE` (3 tests)
- Save-roundtrip-audit run? Pending (will run before PR push, after commit 2)
- Migration required? N — no schema change
- Deviations from plan: (1) Audit writes (`writeSaveAudit`) deliberately stay OUTSIDE the transaction so a Neon outage on `save_audit` cannot roll back the user-visible save. The contract that audit failures never block saves was already in `writeSaveAudit`'s try/catch — moving the audit out of the tx preserves it. (2) The `sessionEmail` local was hoisted because the async closure inside `db.transaction().execute(...)` re-evaluates the `session.user.email` narrowing — TS18048 otherwise.
- Tests / typecheck / build / lint: green at 01:55 — typecheck pass, lint pass, vitest 1177/1177 pass, next build pass.
- PR: pending push (bundled with SEC-011)

### Phase 3 — finding: SEC-011 — seenStoryEntries unbounded → audit-table storage DoS
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a1ccfac1f3f4c253f
- Branch: feat/security-sec-013-011-save-route-hardening
- Commit: 6a3682c (commit 2 of 2 on this bundled branch)
- Files changed: src/lib/schemas/save.ts (cap seenStoryEntries at 200 entries × 64 chars on both SavePayloadSchema AND RemoteSaveSchema); src/app/api/save/route.ts (writeSaveAudit serializes request_payload, replaces with `{truncated: true, size: <n>}` when JSON length exceeds AUDIT_PAYLOAD_BYTE_CAP = 64 KB; falls back to `{truncated: true, reason: "unserializable"}` for circular-ref / BigInt payloads); tests/security/auditAmplification.test.ts (new — 7 tests: schema cap boundaries 200/201, 64/65 chars; worst-case 10000×400 attack body; layer 2 truncation marker on oversized; passthrough on normal-sized); docs/security/02b-attack-cells.md (status note); docs/security/_progress.md (this entry)
- Test added: tests/security/auditAmplification.test.ts — `SEC-011 layer 1 — schema cap on seenStoryEntries` (5 tests) + `SEC-011 layer 2 — audit-row request_payload truncated above 64 KB` (2 tests)
- Save-roundtrip-audit run? Y — PASS, no field drops introduced. The transactional restructure preserves all 9 fields' insert + upsert wiring; the SEC-011 schema change is a tightening (length cap) — the field shape is unchanged.
- Migration required? N — no schema change (existing TEXT[] column accommodates the capped values; the truncation marker is a JSONB subtree on save_audit.request_payload which was always Record<string, unknown>).
- Deviations from plan: (1) Cap also applied to RemoteSaveSchema (line 422), not just SavePayloadSchema, so a future direct-INSERT path can't seed an unbounded list that the client then accepts. The spec said "appears at lines 383 and 422" — interpreted as both. (2) Truncation extracted to writeSaveAudit rather than the route call sites, so all four audit paths (success 204, validation_failed 400, validator-rejection 422, server_error 500) share one cap. (3) Added an `unserializable` fallback for circular-ref / BigInt payloads — the JSON.stringify try/catch keeps the audit insert resilient; without it a malformed body would throw before the audit insert and we'd lose the forensic record.
- Tests / typecheck / build / lint: green at 02:00 — typecheck pass, lint pass, vitest 1183/1183 pass (86 files), next build pass.
- PR: pending push.

### Phase 3 — finding: SEC-004 — error-message reflection on GET /api/save + both /api/handle paths
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a55bf74b42f9ec856
- Branch: feat/security-sec-004-error-reflection
- Commit: 6a3682c
- Files changed: src/app/api/save/route.ts (GET handler — drop message field), src/app/api/handle/route.ts (GET + POST handlers — drop message field), src/app/api/save/route.test.ts (update existing test to match opaque response), tests/security/errorReflection.test.ts (new, 3 tests)
- Test added: tests/security/errorReflection.test.ts — "SEC-004 — GET /api/save does not reflect err.message to the client", "SEC-004 — GET /api/handle does not reflect err.message to the client", "SEC-004 — POST /api/handle does not reflect err.message to the client"
- Save-roundtrip-audit run? N — error-response shape only, not save-touching
- Migration required? N
- Deviations from plan: updated src/app/api/save/route.test.ts (existing test asserting the old leaking response) alongside the fix — necessary to keep the suite green; the old assertion was validating the vulnerability, not a desired behaviour
- Tests / typecheck / build / lint: green at 00:53 — typecheck pass, lint pass, vitest 1203/1203 pass (89 files), next build pass
- PR: #184 (merged)

### Phase 3 — finding: SEC-016 — LegacyShipSchema unbounded record/array fields
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a7716749a8a2f0a4b
- Branch: feat/security-sec-016-022-schema-caps
- Commit: 4aafede
- Files changed: src/lib/schemas/save.ts (unlockedWeapons .max(50); weaponLevels + weaponAugments .superRefine 50-key cap), tests/security/legacyShipSchema.test.ts (new, 8 tests), docs/security/02b-attack-cells.md (status note), docs/security/_progress.md (this entry)
- Test added: tests/security/legacyShipSchema.test.ts — "SEC-016 — LegacyShipSchema caps unbounded array/record fields" (8 tests: all three fields at 51/50/100k boundary + normal save)
- Save-roundtrip-audit run? N — schema-only tightening, no shape change, no DB column change
- Migration required? N
- Deviations from plan: (1) Used `code: "custom"` in superRefine addIssue instead of `too_big` — Zod 4.3.6 requires an `origin` field on `too_big` issues that the TS type enforces; `custom` is the portable alternative. (2) Orchestrator explicitly bundled SEC-016 and SEC-022 into one branch (two commits) due to near-identical fix shape in the same file.
- Tests / typecheck / build / lint: green at 00:54 — typecheck pass, lint pass, vitest 1211/1211 pass (90 files), next build pass

### Phase 3 — finding: SEC-022 — WeaponInventorySchema no .max()
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a7716749a8a2f0a4b
- Branch: feat/security-sec-016-022-schema-caps
- Commit: 0dcf615
- Files changed: src/lib/schemas/save.ts (WeaponInventorySchema .max(50) + JSDoc comment), tests/security/weaponInventoryCap.test.ts (new, 4 tests), docs/security/02b-attack-cells.md (status note), docs/security/_progress.md (this entry)
- Test added: tests/security/weaponInventoryCap.test.ts — "SEC-022 — WeaponInventorySchema caps array length at 50" (4 tests: 51 rejected, 50 accepted, empty accepted, single-element accepted)
- Save-roundtrip-audit run? N — schema-only tightening, no shape change, no DB column change
- Migration required? N
- Deviations from plan: Orchestrator explicitly bundled with SEC-016 (one branch, two commits).
- Tests / typecheck / build / lint: green at 00:54 — typecheck pass, lint pass, vitest 1211/1211 pass (90 files), next build pass

### Phase 3 — finding: SEC-017 — credit-cap input derived from prevRow, not user-submitted completedMissions
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-abfaf7bab724784a0
- Branch: feat/security-sec-017-credit-cap-server-derived (off origin/master f5d5233)
- Commit: 29288a6
- Files changed: src/lib/saveValidation.ts (new export `deriveCapInputMissions(prev, submitted)`), src/app/api/save/route.ts (cap call site uses derived list anchored to `prevRow.completed_missions`), tests/security/creditCapCircular.test.ts (new, 10 tests), docs/security/02b-attack-cells.md (status note), docs/security/_progress.md (this entry)
- Test added: tests/security/creditCapCircular.test.ts — "SEC-017 — credit-cap input is derived from prevRow, not user-submitted completedMissions" (10 tests)
- Save-roundtrip-audit run? Y — PASS, no field drops. Logic-only substitution in cap derivation.
- Migration required? N
- Deviations from plan: (1) Helper named `deriveCapInputMissions` for symmetry with existing accessor names. (2) Returns `readonly MissionId[]` rather than mutating a Set.
- Tests / typecheck / build / lint: green at 01:43 — vitest 1224/1224 pass (92 files).
- PR: #186 (merged)

### Phase 3 — finding: SEC-005 — player email logged in console.warn on save-rejection paths
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-aa2cbc10cea34bf88
- Branch: feat/security-sec-005-020-save-rejection-hygiene
- Commit: fa6eeea
- Files changed: src/app/api/save/route.ts (4 console.warn calls: sessionEmail → playerId), tests/security/saveLoggingPii.test.ts (new, 4 tests), docs/security/02-findings-and-plan.md (status note)
- Test added: tests/security/saveLoggingPii.test.ts — "SEC-005 — console.warn on save-rejection paths must log playerId, not email" (4 tests: one per rejection path — mission_graph_invalid, save_regression, playtime_delta_invalid, credits_delta_invalid — each captures console.warn and asserts no "@" in args and UUID present)
- Save-roundtrip-audit run? Y — PASS, no field drops. The change touches only console.warn call arguments, not any read/write/schema path.
- Migration required? N
- Deviations from plan: none
- Tests / typecheck / build / lint: green (all 4 SEC-005 tests pass; pre-commit hook typecheck + lint-staged clean)
- PR: feat/security-sec-005-020-save-rejection-hygiene (bundled with SEC-020 per orchestrator override)

### Phase 3 — finding: SEC-020 — validator error-code ordering exposes guard-pass/fail structure
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-aa2cbc10cea34bf88
- Branch: feat/security-sec-005-020-save-rejection-hygiene
- Commit: a44782c
- Files changed: src/app/api/save/route.ts (post-tx rejection emission: clientError collapses 3 codes to save_rejected, save_regression preserved; audit row still gets specific code), src/game/state/saveQueue.ts (isPermanent: add save_rejected to TRANSIENT list — the collapsed form of playtime_delta_invalid/credits_delta_invalid which were already TRANSIENT), src/game/state/sync.ts (humanizeSaveError: add save_rejected branch with generic retry message), tests/security/validatorOpaqueCode.test.ts (new, 8 tests), docs/security/02b-attack-cells.md (status note), docs/security/02-findings-and-plan.md (SEC-005 status already in prior commit)
- Test added: tests/security/validatorOpaqueCode.test.ts — "SEC-020 — 422 response body codes are opaque (save_rejected) except save_regression" (8 tests: 3 collapsed codes → save_rejected in body; save_regression → save_regression in body; all 4 → specific code in save_audit.response_error)
- Save-roundtrip-audit run? Y — PASS (run before commit 1; SEC-020 change is response-emission only, no field drops)
- Migration required? N
- Deviations from plan: (1) The spec cited syncCache.ts as the reason save_regression must stay distinct; the actual retry logic is in saveQueue.ts (isPermanent()). saveQueue.ts was updated to add save_rejected to the TRANSIENT list so that the collapsed form of playtime_delta_invalid/credits_delta_invalid retains TRANSIENT semantics — without this, the queue would drop the slot on save_rejected (treating it as permanent). The spec was incomplete on this point; the fix is correct. (2) humanizeSaveError() in sync.ts updated to handle save_rejected with a generic retry message — necessary for a complete client-side error-message surface.
- Tests / typecheck / build / lint: green (8 SEC-020 tests + 34 saveQueue tests + 39 sync tests pass; pre-commit hook typecheck + lint-staged clean)
- PR: feat/security-sec-005-020-save-rejection-hygiene

### Phase 3 — finding: SEC-018 — upsertPlayerId SELECT-then-INSERT race
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a431222786f2418f2
- Branch: feat/security-sec-018-upsert-player-race
- Commit: ab772ea
- Files changed: src/lib/players.ts (rewritten to single INSERT ... ON CONFLICT round-trip), src/lib/players.test.ts (updated to match new contract — no SELECT), tests/security/upsertPlayerRace.test.ts (new, 2 tests), docs/security/02b-attack-cells.md (status note), docs/security/_progress.md (this entry)
- Test added: tests/security/upsertPlayerRace.test.ts — "SEC-018 — upsertPlayerId collapses SELECT-then-INSERT to a single ON CONFLICT round-trip"
- Save-roundtrip-audit run? N
- Migration required? N
- Deviations from plan: (1) Updated src/lib/players.test.ts. (2) Bonus: one fewer DB round-trip per sign-in.
- Tests / typecheck / build / lint: green at 01:57 — vitest 1238/1238 pass (95 files).
- PR: #188 (merged)

### Phase 3 — finding: SEC-019 — email_verified not checked when issuing the JWT
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-ac8957cad0ebfe226
- Branch: feat/security-sec-019-email-verified-check (off origin/master 67e8795)
- Commit: pending push
- Files changed: src/lib/auth.ts (NEW `signIn` callback delegates to `isEmailVerifiedAcceptable`; existing `jwt` + `session` callbacks unchanged), src/lib/authEmailVerified.ts (new — pure helper module), tests/security/emailVerified.test.ts (new — 6 tests), docs/security/02b-attack-cells.md (status note), docs/security/_progress.md (this entry)
- Test added: tests/security/emailVerified.test.ts — "SEC-019 — sign-in is rejected when OAuth profile.email_verified === false" (6 tests: strict-false rejected; explicit-true accepted; omitted/null/undefined fall through to allow; profile undefined accepted; "email looks legit + verified false" combo rejected)
- Save-roundtrip-audit run? N — auth surface, not save pipeline
- Migration required? N
- Callback hook chosen: **`signIn` callback** (NOT `jwt` callback). Rationale: `signIn` is the canonical NextAuth v5 reject hook — returning `false` redirects to the error page instead of issuing a JWT (per `@auth/core/src/index.ts:305-346`). The spec named the `jwt` callback as the location of the bug, but explicitly authorized moving the fix to `signIn` if that was the canonical pattern. `jwt` cannot cleanly reject — at best you can refuse to write `email` into the token, but that doesn't stop the session from being issued. `signIn` is the right hook.
- Deviations from plan: (1) Helper extracted to its own module `src/lib/authEmailVerified.ts` rather than living inside `auth.ts`. Reason: the regression test must import the pure helper without pulling in the NextAuth runtime — `next-auth` references `next/server` at module load, which fails under vitest's node environment (the same constraint that put authUrlPin.test.ts in `src/lib/` rather than under `tests/`; here we kept the test under `tests/security/` per spec by splitting the helper instead). (2) Helper checks for strict `=== false` only; missing/null/undefined claims fall through to allow. Matches Google's consumer contract (always `true`) and preserves provider-agnostic posture for any future provider that doesn't emit the claim (e.g. GitHub).
- Tests / typecheck / build / lint: green at 02:00 — typecheck pass, lint pass, vitest 1227/1227 pass, next build pass.
- PR: pending push.

### Phase 3 — finding: SEC-008 — `next-auth` 5.0.0-beta.25 → 5.0.0-beta.31 hygiene bump
- Worktree: D:\koodaamista\Spacepotatis\.claude\worktrees\agent-a9171901dbe766568
- Branch: feat/security-sec-008-next-auth-bump (off origin/master 181c95f)
- Commit: pending push
- Files changed: package.json (next-auth strict pin `5.0.0-beta.25` → `5.0.0-beta.31`), package-lock.json (regenerated), docs/security/02-findings-and-plan.md (SEC-008 status note), docs/security/_progress.md (this entry)
- Test added: none — dependency bump, no new code surface. Existing auth tests (tests/security/emailVerified.test.ts, src/lib/authUrlPin.test.ts, src/lib/players.test.ts) cover the auth surface and all pass.
- Save-roundtrip-audit run? N — auth/deps surface, not save pipeline
- Migration required? N
- Versions: from `5.0.0-beta.25` to `5.0.0-beta.31` (latest beta as of 2026-05-07; `npm view next-auth versions` showed beta.31 as the head of the 5.0.0-beta line, no stable 5.0 yet).
- Audit delta: pre-bump npm audit reported 4 advisories — kysely (high, pre-existing risk-accepted), next (moderate, postcss-chain pre-existing), **next-auth GHSA-5jpx-9hw9-2fx4 "NextAuthjs Email misdelivery" (moderate, range `>=5.0.0-beta.0 <5.0.0-beta.30`)**. Post-bump: 3 advisories — kysely + next + postcss (all pre-existing). The next-auth advisory is gone. No new advisories introduced. Bonus catch: the bump was scoped as hygiene-only in 02-findings-and-plan.md, but it also clears an active (though non-exploitable in this codebase — only Google provider configured) advisory.
- Compatibility verification: `signIn` callback (SEC-019, accepts `{profile}`, returns `boolean`), `jwt` callback (`{token, profile}`), `session` callback (`{session, token}`) — all signatures unchanged in beta.31. `Profile` type import in `src/lib/authEmailVerified.ts` and `tests/security/emailVerified.test.ts` still exports with the same shape (specifically `email_verified: boolean | undefined`). `src/lib/authUrlPin.test.ts` is a string-grep test on auth.ts source, unaffected by runtime changes.
- Deviations from plan: none. Plan named beta.31 as the target; that is also the latest beta.X available today.
- Tests / typecheck / build / lint: green at 02:30 — typecheck pass, lint pass, vitest 1244/1244 pass (96 files), next build pass.
- PR: pending push.

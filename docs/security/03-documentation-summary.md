# Phase 4 — Documentation summary

This file lists every artifact produced by the security-doc-writer pass (Phase
4 of the security audit). It is the manifest for what changed, where the docs
live, and any gaps that were intentionally left open.

## Branch

`feat/security-phase-4-documentation` (off `master` at the start of Phase 4).

## Hard constraints honored

- **Zero logic changes.** Every diff is documentation, comments, ESLint
  configuration, or CI workflow steps. No functions were renamed, no
  conditionals were changed, no validators were touched.
- **Zero existing-test changes.** No assertion modifications, no removed
  tests. The new CI step re-runs `tests/security/` as a separate failing-loud
  step; no existing test file was modified.
- **No exploit details outside `docs/security/`.** Root `SECURITY.md`
  describes the *report* procedure; CLAUDE.md §18 names invariants, not
  bypasses; per-module `SECURITY.md` files name the threat class but no
  exploit recipes.
- **No `Co-Authored-By: Claude` trailer** on commits.

## Artifacts added

### Root-level

| File | Contents |
|---|---|
| `SECURITY.md` | Vulnerability report procedure, scope (in/out), disclosure expectations. Operator email: numminen.mikko.petteri@gmail.com. |
| `docs/security/threat-model.md` | Six attacker categories (curious user, anonymous internet, leaderboard cheater, save tamperer, malicious mod, supply-chain compromise). Asset list. Defenses-by-layer. Out-of-scope list. |
| `docs/security/invariants.md` | 25 named invariants (INV-AUTH-*, INV-SAVE-*, INV-LB-*, INV-SCHEMA-*, INV-QUEUE-*, INV-SCRIPT-*, INV-OPS-*, INV-LOG-*, INV-DB-*) with file:line + impact + linked findings. |
| `docs/security/03-documentation-summary.md` | This file. |

### CLAUDE.md

A new section §18 "Security defaults" added after §17. Names the three most
load-bearing invariants in one paragraph each (cheat-guard chain, save POST
transaction, writeBackup contract). Cross-references the three sibling docs
via a "when to read which doc" table.

### Per-module SECURITY notes

| Module | File added |
|---|---|
| `src/app/api/save/` | `SECURITY.md` (route-level threats, invariants, must-not-change list) |
| `src/app/api/leaderboard/` | `SECURITY.md` |
| `src/lib/auth.ts` + `authEmailVerified.ts` | `src/lib/auth.SECURITY.md` (named with the `auth.` prefix because `src/lib/` is a flat directory; the file lives next to `auth.ts`) |
| `src/lib/saveValidation.ts` | `src/lib/saveValidation.SECURITY.md` |
| `src/lib/schemas/` | `src/lib/schemas/SECURITY.md` |
| `src/lib/securityHeaders.ts` | `src/lib/securityHeaders.SECURITY.md` |
| `scripts/_lib/dbWriteSafety.mjs` | `scripts/_lib/SECURITY.md` |
| `src/game/state/saveQueue.ts` | `src/game/state/saveQueue.SECURITY.md` |
| `src/game/state/persistence.ts` | `src/game/state/persistence.SECURITY.md` |

Each per-module doc follows the security-doc-writer template (Threat
mitigated → Invariants enforced → What MUST NOT change → Common mistakes →
How to test changes safely).

### Code-level markers

Markers added respecting the density rule (~5 max per file). Each is one
line, naming the SEC-XXX or INV-* it ties to.

| File | Marker(s) added |
|---|---|
| `src/lib/auth.ts` | (existing `// SECURITY-CRITICAL:` block from PR #176 verified — left in place, no change) |
| `src/app/api/save/route.ts` | `// SECURITY-CRITICAL: 64 KB cap …` (AUDIT_PAYLOAD_BYTE_CAP); `// TRUST-BOUNDARY: …` (SavePayloadSchema.safeParse); `// INVARIANT: prev-row read + validators + upsert in one tx with FOR UPDATE …` (transaction wrapper); `// DO NOT INLINE: deriveCapInputMissions …` (cap derivation site) |
| `src/lib/saveValidation.ts` | `// DO NOT INLINE: deriveCapInputMissions …` (function definition); `// INVARIANT: guards three monotonic fields …` (validateNoRegression); `// SECURITY-CRITICAL: per-mission cap …` (maxLegitScore) |
| `src/app/api/leaderboard/route.ts` | `// TRUST-BOUNDARY: ?mission= query param …` (MissionIdSchema.safeParse); `// SECURITY-CRITICAL: per-mission cap …` (maxLegitScore call) |
| `src/lib/schemas/save.ts` | `// SECURITY-CRITICAL: first-layer score cap …` (SCORE_SANITY_CAP) |
| `src/game/state/saveQueue.ts` | `// INVARIANT: every PendingSave carries a non-empty playerEmail stamp …` (PendingSave interface) |
| `scripts/restore-player.mjs`, `scripts/improve-restore.mjs`, `scripts/erase-player.mjs` | `// SECURITY-CRITICAL: writeBackup must run BEFORE the destructive op …` (each at the writeBackup call site) |

### CI workflow

`.github/workflows/ci.yml` extended with a dedicated `Security regression
tests` step that re-runs `tests/security/` via `npx vitest run
tests/security/`. The general `npm test` already covers these tests, but the
dedicated step surfaces a regression as a clearly-named failed PR check
("Security regression tests failed") instead of a needle in the 1300+ lines
of general vitest output.

### ESLint rules added

In `eslint.config.mjs`:

1. **`react/no-danger: "error"`** (applies to `src/**/*.{ts,tsx}`) — bans
   `dangerouslySetInnerHTML`. Reason: SEC-001 + every XSS-class regression.
   Verified zero existing matches before enabling.
2. **`no-restricted-syntax` for `process.env` in
   `src/components/**`, `src/game/**`** — server-only env vars must not be
   read from client-side code (those bundles ship to the browser). Reason:
   PII-hygiene (closes the future-rake of accidentally inlining
   `AUTH_SECRET` or `DATABASE_URL` into a client bundle). Verified zero
   existing matches before enabling.
3. **`no-restricted-syntax` for `as SavePayload|ScorePayload|RemoteSave` at
   `src/app/api/**/route.ts`** — bans the network-edge `as` cast that would
   bypass Zod. Reason: CLAUDE.md §5 + INV-SCHEMA-1. Narrowly scoped to route
   handlers because helper modules legitimately type-narrow on
   already-parsed values; the route handler is where untrusted bodies enter
   the system. Verified zero existing matches.

Each rule carries an inline `// reason: SEC-XXX ...` comment so a future
agent doesn't disable it without thinking.

## Gaps logged

### Lint rules considered but not enforced

- **Ban every `as` cast at the network edge generically.** The narrower
  rule above (`as SavePayload|ScorePayload|RemoteSave`) is the enforceable
  subset. A fully generic ban would hit dozens of legitimate
  post-validation casts (e.g. `as Record<string, unknown>` after a
  `typeof === "object"` typeguard) and require touching code that is not
  in scope for this doc-only pass. The narrower rule covers the documented
  bypass scenarios; broader enforcement is a follow-up `/modular-architecture-audit` task.
- **Ban `Kysely<any>`.** Currently has zero matches across `src/`
  (verified by Phase 1). A lint rule could prevent re-introduction, but
  the rule shape is non-trivial under typescript-eslint's parser
  (catching `Kysely<any>` requires a TSTypeReference selector with a
  typeArgument constraint). Logged as a future enforcement candidate;
  for now the typed `Database` interface in `src/lib/db.ts:93` is the
  documented invariant (INV-DB-2).
- **Ban `sql.lit(...)`.** Same situation as `Kysely<any>` — zero current
  matches; rule is non-trivial to express. INV-DB-2 documents the
  prohibition.

### Modules NOT given a per-module SECURITY.md

These modules have security-relevant aspects that are well-documented
inline (existing JSDoc, prior commit notes). The Phase 4 pass did not add
a separate `SECURITY.md` for them because the per-file blocks are already
adequate AI-readable docs:

- `src/lib/db.ts` — connection-string handling is one line; the
  surrounding comment is clear. Pointed at by INV-DB-* in invariants.md.
- `src/lib/leaderboard.ts` — the `unstable_cache` revalidate=60 + cache
  tag pattern is documented inline; security-relevant concerns are at
  the route layer (covered by `src/app/api/leaderboard/SECURITY.md`).
- `src/lib/players.ts` — `upsertPlayerId` is a one-statement
  `INSERT ... ON CONFLICT` round-trip after SEC-018; INV-AUTH-3 in
  invariants.md captures the rule.
- `src/lib/handle.ts` — character class regex is single-line; INV-* not
  needed.
- `src/game/state/sync.ts` — the `LoadResult` union and `humanizeSaveError`
  are documented inline; INV-LOG-3 captures the parse-failure logging
  rule.

If a future audit pass shows any of these warrant their own SECURITY.md,
that's a follow-up task.

### CLAUDE.md numbering preserved

The new "Security defaults" section is **§18**, appended after the
existing §17 ("Module boundaries"). Per the orchestrator's directive,
existing section numbering (§1 through §17) is unchanged.

## AI-readability self-test result

Per the security-doc-writer contract, picked two test subjects and
attempted to mentally change them while reading ONLY: CLAUDE.md §18 +
threat-model.md + invariants.md + the module's SECURITY notes + the code
with markers visible.

**Subject 1: `src/lib/saveValidation.ts`.** Hypothetical change: "merge
the four validators into one `validateSave(body)` for clarity."

- CLAUDE.md §18 names the cheat-guard chain as the #1 load-bearing
  invariant.
- `invariants.md` INV-SAVE-2 names the four validators by name + their
  call site + the impact of weakening any of them.
- `saveValidation.SECURITY.md` "What MUST NOT change" calls out
  combining the validators explicitly: "the call sites in the route
  handler need to react to specific rejection codes". Also names
  `deriveCapInputMissions` separately.
- Inline markers: `// DO NOT INLINE: deriveCapInputMissions ...` at the
  function definition; `// INVARIANT: guards three monotonic fields,
  intentionally NOT credits ...` at `validateNoRegression`.

A fresh agent reading these would refuse the merge. **PASS.**

**Subject 2: `src/app/api/save/route.ts`.** Hypothetical change: "hoist
the prev-row SELECT outside the transaction for caching, and replace
`writeSaveAudit` with an inline INSERT inside the transaction so the
audit row commits atomically with the save."

- CLAUDE.md §18 names the transaction-with-FOR-UPDATE as the #2
  load-bearing invariant.
- `invariants.md` INV-SAVE-1 names the rule, INV-SAVE-7 names the
  audit-outside-transaction rule.
- `src/app/api/save/SECURITY.md` "What MUST NOT change" lists both:
  "Removing the `db.transaction(...)` block, dropping `.forUpdate()`, or
  moving any validator outside the transaction re-opens SEC-013" AND
  "Moving [writeSaveAudit] inside means an audit-table outage rolls back
  legitimate saves".
- Inline markers: `// INVARIANT: prev-row read + validators + upsert in
  one tx with FOR UPDATE (SEC-013, INV-SAVE-1)` at the transaction
  wrapper.

A fresh agent reading these would refuse both halves of the proposed
change. **PASS.**

**Result:** documentation passes the self-test for both subjects. Both
subjects sit on the highest-risk surface in the codebase, so this is the
hardest test the docs face.

## Test plan

Verified locally before push:

- [x] `npm run typecheck` — pass.
- [x] `npm run lint` — pass.
- [x] `npm test` — pass (all existing + Phase-3 regression tests).
- [x] `npm run build` — pass.
- [x] `git diff --stat` shows only docs, comments, and config changes.
- [x] No `Co-Authored-By: Claude` trailer on any commit.

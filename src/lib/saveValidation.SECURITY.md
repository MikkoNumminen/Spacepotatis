# `src/lib/saveValidation.ts` — security notes

This module is the cheat-guard chain for `POST /api/save` and the score-cap
derivation for `POST /api/leaderboard`. It is the single most security-
sensitive module in the codebase outside the route handlers themselves —
the 2026-05-02 wipe scenario is exactly the regression class this module
defends against.

## Threat mitigated

- **Save tamperer — credit inflation** (threat-model A4): an
  authenticated attacker POSTs a body with inflated `credits`. The
  `validateCreditsDelta` cap, computed from the player's actual
  progression, rejects it.
- **Save tamperer — playtime inflation** (A4 sub-case): inflated
  `playedTimeSeconds` would loosen the credits cap.
  `validatePlaytimeDelta` ties the delta to wall-clock since the prev
  `updated_at`.
- **Save tamperer — mission-graph bypass** (A4 sub-case): an attacker
  marks a high-tier mission as completed without the prereq chain.
  `validateMissionGraph` walks the `requires` chain and rejects.
- **Save tamperer — wipe** (A4 worst case): a buggy or malicious POST
  ships INITIAL_STATE on top of a real save (credits=0,
  completedMissions=[], playtime=0). The cheat-delta guards only catch
  INFLATION; `validateNoRegression` catches the strictly-shrinking
  case.
- **Self-grounded credit-cap inflation** (SEC-017): an attacker submits
  a hypothetical `requires: []` mission as completed in the same POST
  that requests inflated credits. `deriveCapInputMissions` derives the
  cap input from the server-stored prev row; the unlock chain must be
  grounded in the previously-stored row, not bootstrapped inside the
  same request.
- **Leaderboard score takeover** (SEC-014): an attacker posts
  `Number.MAX_SAFE_INTEGER` as a score. `maxLegitScore(missionId)`
  bounds it to a per-mission cap derived from waves + enemies.

## Invariants enforced

- INV-SAVE-2 — the four validators (`validateMissionGraph`,
  `validateNoRegression`, `validatePlaytimeDelta`,
  `validateCreditsDelta`) are pure functions. No I/O. No module-level
  mutation of catalog data.
- INV-SAVE-3 — `validateNoRegression` guards three monotonic fields:
  `completedMissions`, `unlockedPlanets`, `playedTimeSeconds`. Credits
  are intentionally NOT guarded (market spend is a legitimate down-
  delta). The asymmetry is load-bearing.
- INV-SAVE-4 — `deriveCapInputMissions(prev, submitted)` starts from
  the server-stored trusted set and grows ONLY by submitted missions
  whose `requires` are entirely already-trusted.
- INV-LB-1 — `maxLegitScore(missionId)` walks `waves.json` +
  `enemies.json` to compute a per-mission score cap.

## What MUST NOT change without security review

- **`validateNoRegression`'s three-field set.** Removing any of
  `completedMissions`, `unlockedPlanets`, `playedTimeSeconds` re-opens
  the wipe pattern. Adding `credits` to the set 422s every legitimate
  shop purchase.
- **The `validateMissionGraph` → `validateNoRegression` →
  `validatePlaytimeDelta` → `validateCreditsDelta` order at the call
  site.** The order is enforced in `src/app/api/save/route.ts`. The
  playtime → credits dependency is load-bearing (the credits cap
  depends on `playedTimeSeconds`). Reordering subtly changes which
  422 fires first and could mask a regression.
- **`deriveCapInputMissions` as a separate exported function called
  before `computeCreditCapsForPlayer`.** Inlining it back into the
  route — or, worse, replacing the call with `computeCreditCapsFor
  Player(body.completedMissions)` — re-opens SEC-017.
- **The `KILL_CADENCE_CEILING * PER_SECOND_SAFETY_FACTOR` formula.**
  These constants are intentionally loose to avoid 422-ing legitimate
  high-skill runs. Tightening them without a telemetry pass is a
  user-visible regression risk.
- **`MAX_SINGLE_EQUIPMENT_REFUND` derivation from catalog data.**
  Replacing it with a hard-coded constant freezes the cheat-guard at
  today's balance and re-opens SEC-014's class of regression once
  loot pools or augment costs change. The derivation is documented
  inline at lines 87-104.
- **`maxLegitScore(missionId)` derivation from waves + enemies.**
  Same rationale: a hard-coded global score cap either locks out
  legitimate runs on long missions or stays generous enough that
  short missions take over the leaderboard.

## Common mistakes

- **"Combine all four validators into one `validateSave(body)` call
  for clarity"** — the call sites in the route handler need to react
  to specific rejection codes (the audit row stores the specific
  `response_error`; the saveQueue's TRANSIENT/PERMANENT triage in
  `isPermanent()` keys on the code). Combining them collapses that
  signal.
- **"Move the credit-cap derivation client-side so the UI knows
  what's allowed"** — clients can compute a hint locally, but the
  authoritative cap MUST stay server-side. A client-side cap is
  trivially bypassed by editing the bundle.
- **"Add `validateNoRegression` to a `credits` field check too —
  defense-in-depth"** — that 422s every shop purchase. Credits is
  intentionally outside the regression guard.
- **"Use the user-submitted `body.completedMissions` as the cap
  input — `validateMissionGraph` already approved it"** — that is
  exactly the rake `deriveCapInputMissions` closes (SEC-017).
  `validateMissionGraph` checks internal consistency; it does NOT
  require any entry to be in `prevRow.completed_missions`.
- **"Replace the derivation with a static `CREDITS_PER_HOUR` constant
  for simplicity"** — CLAUDE.md §9 explicitly calls this out: "Don't
  replace the derivation with hard-coded constants for simplicity —
  that's exactly the rake we already stepped on once."

## How to test changes safely

- `npm test -- src/lib/saveValidation.test.ts` — full validator
  suite (mission graph, no-regression, playtime, credits).
- `npm test -- tests/security/creditCapCircular.test.ts` — SEC-017
  cap derivation.
- `npm test -- tests/security/saveRace.test.ts` — SEC-013
  transaction wrapper at the call site.
- `npm test -- src/lib/saveValidation.dataDrift.test.ts` — catalog
  drift surface.
- `npm run save-roundtrip-audit` (the slash skill) before any
  commit that touches any validator.
- Manual smoke: sign in, complete a mission, reload — confirm the
  cleared mission persists. If `validateNoRegression` is misshapen
  it will 422 the first save after a load.

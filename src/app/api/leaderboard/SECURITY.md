# `src/app/api/leaderboard` — security notes

## Threat mitigated

- **Leaderboard cheater** (threat-model A3): an authenticated attacker
  posts implausible scores or scores for missions they have not
  completed.
- **Cache-key pollution / DoS** (SEC-003): an unauthenticated attacker
  spams `?mission=<random>` to force unbounded cache entries that all
  DB-miss.

## Invariants enforced

- INV-LB-1 — `score > maxLegitScore(missionId)` rejects with 422
  `score_implausible` (route.ts:59-62). The `ScorePayloadSchema`
  Zod cap (`SCORE_SANITY_CAP = 10_000_000`) is the first layer.
- INV-LB-2 — score POST rejects when `missionId` is not in the
  player's server-trusted `completed_missions` (route.ts:72-92).
- INV-LB-3 — GET `?mission=` parses through `MissionIdSchema.safeParse`
  (route.ts:23-26). Unknown ids 400 with `invalid_mission`. There is
  no `as MissionId` cast at this surface.
- INV-LOG-2 — 5xx responses return `{ error: "server_error" }` only;
  `err.message` is never reflected.
- INV-SCHEMA-1 — `ScorePayloadSchema.safeParse(raw)` runs BEFORE any
  DB I/O (route.ts:50).
- INV-QUEUE-2 — score POSTs are driven by `enqueueScore` →
  `drainScoreQueue` from `src/game/state/scoreQueue.ts`. Fire-and-
  forget POSTs lose scores when the network flakes.

## What MUST NOT change without security review

- **The `maxLegitScore(missionId)` derivation.** It walks
  `waves.json` + `enemies.json` to compute a per-mission cap. A
  hard-coded constant breaks per-mission balance and re-opens
  SEC-014. The derivation is in `src/lib/saveValidation.ts:555`.
- **The `MissionIdSchema.safeParse` on GET.** Reverting to `as
  MissionId` re-opens SEC-003 cache-key pollution.
- **The mission-completion guard reading `save_games.completed_
  missions`.** It is the trusted-from-DB source. Replacing it with
  `body.completedMissions` re-opens an authz bypass.

## Common mistakes

- **"Trust `body.missionId` and skip the `MissionIdSchema` parse —
  it's already in `ScorePayloadSchema`"** — that is true on POST
  (the ScorePayloadSchema includes `missionId: MissionIdSchema`)
  but NOT on GET, where the route reads the URL query parameter
  directly.
- **"Hard-code a global score cap (e.g. 1_000_000) instead of
  computing per-mission"** — global caps either lock out high-score
  legitimate runs on long missions, or stay generous enough to let
  short missions take over the leaderboard. The per-mission
  derivation is what makes the cap tight.
- **"Bypass the score queue for instant feedback after a run"** —
  the leaderboard contract is eventually-consistent. Fire-and-forget
  POSTs lose scores during flaky networks; the queue is the
  durability layer.

## How to test changes safely

- `npm test -- tests/security/leaderboardScoreCap.test.ts` —
  SEC-014 score cap.
- `npm test -- tests/security/leaderboardMissionIdValidate.test.ts`
  — SEC-003 GET mission-id validation.
- `npm test -- src/lib/saveValidation.test.ts` — confirms
  `maxLegitScore` derivation against a fixture mission.
- Manual smoke: sign in, complete tutorial, watch the score post —
  reload `/leaderboard` and confirm the entry appears within ~60s
  (the ISR `revalidate=60` window).

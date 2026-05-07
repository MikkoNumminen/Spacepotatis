# `src/lib/schemas` — security notes

This module is the network-edge boundary for every authenticated POST
route. The contract is: parse with Zod first; then everything downstream
can trust the shape.

## Threat mitigated

- **Malformed payload writing straight to Postgres jsonb** (baseline):
  without Zod, an attacker could ship `{credits: "Infinity"}`, a
  cyclic object, or an array of 100k entries straight into the
  `save_games.ship_config` jsonb column.
- **Audit-table storage DoS amplifier** (SEC-011): an unbounded
  `seenStoryEntries` list amplifies into the `save_audit.request_
  payload` row.
- **Legacy ship snapshot DoS** (SEC-016): `LegacyShipSchema` accepts
  historic shapes from production rows; without `.max()` on
  `unlockedWeapons` / `weaponLevels` / `weaponAugments`, an attacker
  could ship a 100k-key record.
- **Weapon-inventory DoS** (SEC-022): `WeaponInventorySchema` with no
  `.max()` accepts arbitrarily long arrays.
- **Cache-key pollution / DoS** (SEC-003): GET `/api/leaderboard`'s
  mission-id query parameter parses through `MissionIdSchema` so
  random strings 400 instead of becoming cache keys.
- **Implausible scores** (SEC-014): `ScorePayloadSchema.score.max(SCORE_
  SANITY_CAP)` is the first-layer 400 for obviously-fabricated
  values; `maxLegitScore` is the per-mission 422.

## Invariants enforced

- INV-SCHEMA-1 — every API POST body parses through a Zod schema
  BEFORE any DB I/O. No `as` casts at the network edge.
- INV-SCHEMA-2 — every array field carries a `.max()` cap.
  `seenStoryEntries` is bounded at 200×64 chars (line 417, line 460
  for RemoteSaveSchema). `WeaponInventorySchema` is `.max(50)` (line
  195). `LegacyShipSchema` caps `unlockedWeapons` at 50 (line 319),
  `weaponLevels` and `weaponAugments` at 50 keys via `superRefine`
  (lines 321-345).
- INV-SCHEMA-3 — `*_IDS` constants stay locked-in-lockstep with the
  matching TS literal unions via `as const satisfies readonly
  <Id>[]`. Removing the `satisfies` clause turns drift into a silent
  runtime bug (lines 71-111).
- INV-LB-1 — `SCORE_SANITY_CAP = 10_000_000` bounds `score` at the
  Zod parse layer (line 500, 504).
- INV-LB-3 — `MissionIdSchema` is the single source of truth for
  mission-id parsing — used by `SavePayloadSchema`,
  `RemoteSaveSchema`, `ScorePayloadSchema`, AND the GET
  `/api/leaderboard` query parser.

## What MUST NOT change without security review

- **The `.max()` cap on every array / record field.** Removing any
  of them re-opens a DoS surface. The caps are deliberately
  generous (50 / 200) to absorb legitimate growth; tightening is
  fine if a future audit shows headroom.
- **`LegacyShipSchema`'s permissive shape.** Every field is
  optional on purpose — the schema's job is to pass historic data
  through to `migrateShip()` for cleanup. Tightening to require
  specific fields rejects production rows whose `shipConfig` is a
  degenerate `{}` (an older POST bug stored that for some
  accounts), and the rejection cascades into the entire
  `RemoteSaveSchema` parse — losing the player's credits and
  completed missions even though those fields were fine. The AI-NOTE
  at line 290 carries the long-form warning. **Don't tighten this.**
- **`RemoteSaveSchema` and `SavePayloadSchema` cap symmetry.** The
  `seenStoryEntries` cap appears on BOTH schemas so a future
  direct-INSERT path can't seed an unbounded list that the client
  then accepts.
- **The compile-time guard rails at lines 238-252.** They have no
  runtime effect; their job is to fail tsc if a schema's inferred
  type stops being assignable to the canonical TS interface. Removing
  them lets a renamed / retyped field drift silently.
- **`MissionIdSchema` membership.** Adding a mission id here without
  also adding it to `MISSION_IDS` (and the matching TS union in
  `src/types/game.ts`) is a compile error today thanks to
  `satisfies readonly MissionId[]`. Skipping the satisfies clause
  to "fix" a typecheck error breaks INV-SCHEMA-3.

## Common mistakes

- **"Tighten LegacyShipSchema to require `slots`-or-`primaryWeapon`
  and `unlockedWeapons` again — the migration code is robust"** —
  this is exactly the bug PR #X-pre-LegacyShipSchema-permissive
  carried. Production rows with `shipConfig: {}` cascade-rejected
  the whole RemoteSaveSchema, losing credits + completedMissions.
  See the AI-NOTE at line 290.
- **"Replace the schema with `as SavePayload` cast in the route —
  it's faster"** — that re-opens the entire input-validation
  surface, plus CLAUDE.md §5 forbids `as` at the network edge.
- **"Drop `SCORE_SANITY_CAP` because `maxLegitScore` is the real
  cap anyway"** — the per-mission cap returns 422 (server logic);
  the Zod cap returns 400 (input validation). Two-layer defense
  by design — see the comment at line 497-499.
- **"Bump `seenStoryEntries.max(200)` to 1000 because a future
  story chapter has more entries"** — fine to bump, but DO NOT
  remove the cap entirely. The cap is the SEC-011 defense.

## How to test changes safely

- `npm test -- src/lib/schemas/save.test.ts` — full schema test
  suite (compile-time drift guards + runtime parse tests).
- `npm test -- tests/security/auditAmplification.test.ts` —
  SEC-011 schema cap.
- `npm test -- tests/security/legacyShipSchema.test.ts` — SEC-016
  legacy shape caps.
- `npm test -- tests/security/weaponInventoryCap.test.ts` —
  SEC-022 inventory cap.
- `npm test -- tests/security/leaderboardScoreCap.test.ts` —
  SEC-014 score cap.
- `npm test -- src/game/data/__tests__/jsonSchemaValidation.test.ts`
  — JSON ↔ schema drift gate; runs each `lib/schemas/*` parser
  against its `game/data/*.json` once per `npm test`.

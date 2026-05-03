---
name: save-roundtrip-audit
description: Pre-commit save-pipeline invariants check — walks every StateSnapshot field through the 8 layers of the save round-trip (snapshot interface → toSnapshot → POST schema → POST handler → DB column → migration → GET handler → RemoteSaveSchema → sync.loadSave → hydrate) and flags any layer that silently drops the field. Read-only.
---

# When to use
Invoke on `/save-roundtrip-audit`, "is the save pipeline intact?", or before a PR touching any of: `src/game/state/persistence.ts`, `src/game/state/stateCore.ts`, `src/game/state/sync.ts`, `src/lib/schemas/save.ts`, `src/app/api/save/route.ts`, `src/lib/db.ts`, or `db/migrations/`. Read-only — never modify any file.

This skill exists because the save round-trip has 8 layers and a field that lives in one but is silently dropped in another produces a class of bug that doesn't fail any test, doesn't 500, and doesn't surface until a player notices their state didn't survive a reload. We've shipped this bug twice in two days:

- **2026-05-02 — real save wipe.** `validateNoRegression` was missing on the POST path; a buggy client POSTed `INITIAL_STATE` over a real save and the server cheerfully wrote zeros. Caught the regression direction (server-side guard added) but not the silent-drop direction.
- **2026-05-03 — "Continue always lands at Sol Spudensis."** `currentSolarSystemId` was on `StateSnapshot` AND in `SavePayloadSchema`, so unit tests passed and the POST was accepted, but four downstream layers silently ignored it: the DB column didn't exist, the POST upsert never wrote it, the GET never selected it, and `RemoteSaveSchema` didn't model it. Nothing failed loud — the field just evaporated round-trip.

Both bugs share a shape: **a field lives in some layers and not others, and nothing yells.** This audit is the executable check.

# Adjacent skills
- `/content-audit` covers JSON-data invariants (orphan refs, sprite keys, story trigger graph) — orthogonal axis. Run both before a save-shape PR.
- `/balance-review` diffs combat numbers — orthogonal.
- `/new-migration` is the *forward* path (add a column end-to-end). This skill is the *backward* path (verify nothing got skipped).

# The 8 layers (in order)
The audit walks every `StateSnapshot` field through these layers. Each cell in the output table is one (field × layer) pair.

| # | Layer | File | What to verify |
|---|-------|------|----------------|
| 1 | Snapshot interface + emitter | `src/game/state/persistence.ts` | Field declared on `StateSnapshot` AND emitted by `toSnapshot()` |
| 2 | Wire schemas (in + out) | `src/lib/schemas/save.ts` | Field present on `SavePayloadSchema` (POST input) AND on `RemoteSaveSchema` (GET output) |
| 3 | POST handler | `src/app/api/save/route.ts` POST | Field READ from `body.X` (or `body.X ?? default`) AND written into BOTH the `.values({...})` insert AND the `onConflict.doUpdateSet({...})` block |
| 4 | GET handler | `src/app/api/save/route.ts` GET | Field returned in the JSON response as `X: row.X` (column→camelCase shape) |
| 5 | DB interface | `src/lib/db.ts` | Column declared on `SaveGamesTable` with the right TypeScript type (`Generated<T>` if it has a SQL default; nullable matching the column's NULL policy) |
| 6 | Migration | `db/migrations/*.sql` | The migration that adds the column actually exists (file is dated, present on disk, applied to prod per CLAUDE.md §7a) |
| 7 | Client load | `src/game/state/sync.ts` | `doLoadSave` threads `body.X` from the parsed `RemoteSave` into the `snapshot: Partial<StateSnapshot>` passed to `hydrate()` |
| 8 | Hydrate consumer | `src/game/state/persistence.ts` | `hydrate()` reads `snapshot.X` and writes it into the `commit({...})` payload — NOT just defaulted to `INITIAL_STATE.X` and discarded |

# Steps (the audit checklist)

1. **Build the field list.** Read `StateSnapshot` from `src/game/state/persistence.ts`. Today's fields: `credits`, `completedMissions`, `unlockedPlanets`, `playedTimeSeconds`, `ship`, `saveSlot`, `currentSolarSystemId`, `unlockedSolarSystems`, `seenStoryEntries`. **Diff against `git show HEAD:src/game/state/persistence.ts`** if the working tree has changed it — a field added in this PR is the most common audit target.

2. **Layer 1 — snapshot interface + `toSnapshot()`.** Grep `src/game/state/persistence.ts` for the field name. Both the `StateSnapshot` declaration AND a line under `toSnapshot()` must reference it. A field declared but not emitted is a silent drop at the source.

3. **Layer 2 — `src/lib/schemas/save.ts`.** Grep for the field name. Required:
   - On `SavePayloadSchema` (POST input — usually `.optional()` because the client may omit it on a partial save).
   - On `RemoteSaveSchema` (GET output — required or `.nullable().optional()` depending on the column's NULL policy).
   A field that's on `SavePayloadSchema` but NOT on `RemoteSaveSchema` is the exact 2026-05-03 bug.

4. **Layer 3 — POST handler in `src/app/api/save/route.ts`.** Three checks:
   - The handler READS the field (`body.X`, possibly with `??` default).
   - The field is written into the `.insertInto("spacepotatis.save_games").values({ ... })` block as `<column_name>: <value>`.
   - The field is ALSO written into the `.onConflict((oc) => oc.columns([...]).doUpdateSet({ <column_name>: sql\`EXCLUDED.<column_name>\`, ... }))` block. **The insert-only-no-conflict-update pattern is a silent drop on every save AFTER the first** — the row exists, the upsert hits the conflict path, and the new value is ignored.

5. **Layer 4 — GET handler in `src/app/api/save/route.ts`.** The `NextResponse.json({...})` shape must include the field, mapped from `row.<column_name>` to the camelCase wire name. Also confirm the `selectFrom("spacepotatis.save_games").selectAll()` (or explicit `.select([...])`) actually fetches the column. `selectAll()` covers everything by default; an explicit `.select([...])` that omits the column is a silent drop on read.

6. **Layer 5 — `src/lib/db.ts`.** Confirm the column appears on `SaveGamesTable` with:
   - The right TypeScript type (`number`, `string`, `string[]`, etc.).
   - `Generated<T>` ONLY if the SQL has `NOT NULL DEFAULT <something>` (otherwise the type forces inserts to provide a value).
   - `| null` matching the column's NULL policy in SQL.

7. **Layer 6 — `db/migrations/`.** Find the migration that added the column (`grep -l "<column_name>" db/migrations/`). Confirm:
   - The file exists on disk (sanity).
   - The file is dated and named per the project convention (`YYYYMMDDHHMMSS_short_description.sql`).
   - **Per CLAUDE.md §7a, the migration must already be applied to prod.** This skill cannot verify that — flag the migration filename and ask the operator to confirm via `node scripts/check-schema.mjs`.

8. **Layer 7 — `src/game/state/sync.ts` `doLoadSave`.** Inside the `parsed.success` branch where the `snapshot: Partial<StateSnapshot>` is built, confirm the field is threaded from `body.X` into the snapshot. Watch for:
   - Field on `RemoteSaveSchema` but NOT in the snapshot construction → the GET handler returned it, schema accepted it, sync.ts dropped it on the floor before hydrate.
   - `body.X ?? undefined` patterns are fine when `hydrate()` supplies a default.

9. **Layer 8 — `hydrate()` in `src/game/state/persistence.ts`.** Inside the `commit({...})` call, confirm:
   - The field is read from `snapshot.X` (with a fallback to `INITIAL_STATE.X` for the no-save / partial-snapshot case).
   - The field is NOT silently overridden by `INITIAL_STATE.X` in the absence of a check (that's how 2026-05-02's wipe walked through hydrate).
   - For derived fields (`unlockedSolarSystems`), there's an explicit re-derivation step (`SYSTEM_UNLOCK_GATES`) — note this as expected and document the exception in the table.

10. **Cross-check the saveQueue snapshot shape.** The pending-save localStorage path (`saveQueue.ts` / `markSavePending` / `flushPendingSave`) serializes `toSnapshot()` whole — it inherits whatever `StateSnapshot` declares — so adding a field here is a free win. But: bumping `StateSnapshot` ahead of `hydrate()` ON THE SAME DEPLOY is required (the sync.ts header explicitly warns about this — `hydrate` REPLACES, missing keys fall back to `INITIAL_STATE`). Confirm Layer 1 and Layer 8 are coherent in the same PR.

# Output format
Markdown report, this shape:

```markdown
# Save round-trip audit

## Coverage table

| Field | L1 snap+emit | L2 POST schema | L2 GET schema | L3 POST read | L3 POST insert | L3 POST upsert | L4 GET resp | L5 db.ts | L6 migration | L7 sync.ts | L8 hydrate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| credits | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| completedMissions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| unlockedPlanets | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| playedTimeSeconds | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ship | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| saveSlot | ✓ | ✓ | ✓ | N/A | N/A | N/A | ✓ | ✓ | ✓ | ✓ | ✓ |
| currentSolarSystemId | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| unlockedSolarSystems | ✓ | ✗ | ✗ | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ✓ (re-derived) |
| seenStoryEntries | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| <new-field>     | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

## Findings

- ✗ `<new-field>` — added to StateSnapshot but never wired through the round-trip.
  - L2 (`src/lib/schemas/save.ts`): missing on SavePayloadSchema. Add `<new-field>: <type>.optional()`.
  - L2 (`src/lib/schemas/save.ts`): missing on RemoteSaveSchema. Add `<new-field>: <type>.nullable().optional()` if the column is nullable.
  - L3 POST insert/upsert (`src/app/api/save/route.ts`): missing in both `.values({...})` and `.onConflict(...).doUpdateSet({...})`.
  - L4 GET response (`src/app/api/save/route.ts`): missing from the `NextResponse.json({...})` shape.
  - L5 (`src/lib/db.ts`): missing column on `SaveGamesTable`.
  - L6 (`db/migrations/`): no migration adds this column. Use `/new-migration`.
  - L7 (`src/game/state/sync.ts`): `doLoadSave` doesn't thread `body.<new-field>` into the snapshot.
  - L8 (`src/game/state/persistence.ts`): `hydrate()` doesn't read `snapshot.<new-field>` into the commit.

---

**Summary: PASS** _(or)_ **Summary: FAIL (N issues)**
```

`✓` carries through, `✗` drops silently, `N/A` does not apply at this layer (e.g. derived fields, the slot/saveSlot column-name mismatch). Cite file paths + line numbers when fact lives at a specific line. End with `**Summary: PASS**` or `**Summary: FAIL (N issues)**` (N counts only `✗` cells in fields where ✓ was expected; ✗ cells covered by an explicit "intentional gap" note in the Known-good baseline don't count).

# Invariants this skill enforces
- Every `StateSnapshot` field except `unlockedSolarSystems` (re-derived from `completedMissions`) is present in:
  - `toSnapshot()` emit list
  - `SavePayloadSchema` (POST input)
  - `RemoteSaveSchema` (GET output)
  - POST handler reads + insert + onConflict.doUpdateSet (all three)
  - GET handler response
  - `SaveGamesTable` interface in `src/lib/db.ts`
  - A `db/migrations/*.sql` file (most recent file that adds the matching column)
  - `doLoadSave` snapshot construction in `src/game/state/sync.ts`
  - `hydrate()` commit payload in `src/game/state/persistence.ts`
- POST upsert ALWAYS writes the same column set in both `.values({...})` and `onConflict.doUpdateSet({...})`. Insert-only is a silent drop on every save except the first.
- Migration file for any column referenced from app code is APPLIED to prod (CLAUDE.md §7a HARD RULE — verify out-of-band via `node scripts/check-schema.mjs`).
- `unlockedSolarSystems` is intentionally NOT persisted — `hydrate()` re-derives it from `completedMissions` via `SYSTEM_UNLOCK_GATES` so old saves catch up to gate map changes without a one-shot migration. Document this gap; do not "fix" it.
- The `saveSlot` field rides as `slot` on the wire (`RemoteSaveSchema.slot`) and as `slot` in the DB column. Layers 3, 4, 5, 6 use the column name `slot`; layers 1, 2, 7, 8 use `saveSlot`. Note this mismatch in the per-field walkthrough; it's not a bug.

# Known-good baseline (today)
Re-run this audit if a save-pipeline file changes; any deviation from this table requires explicit justification.

| Field | L1 | L2 POST | L2 GET | L3 read | L3 ins | L3 ups | L4 GET | L5 db | L6 mig | L7 sync | L8 hydrate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `credits` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ initial | ✓ | ✓ |
| `completedMissions` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ initial | ✓ | ✓ |
| `unlockedPlanets` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ initial | ✓ | ✓ |
| `playedTimeSeconds` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ initial | ✓ | ✓ |
| `ship` (`ship_config` col) | ✓ | ✓ (as `ship` AND `shipConfig`) | ✓ (as `shipConfig`) | ✓ (`body.shipConfig ?? body.ship`) | ✓ | ✓ | ✓ | ✓ | ✓ initial | ✓ | ✓ (via `migrateShip`) |
| `saveSlot` (wire/col `slot`) | ✓ | ✓ | ✓ | N/A (route hard-codes `slot: 1`) | ✓ (literal `1`) | N/A (in conflict columns, not doUpdateSet) | ✓ | ✓ | ✓ initial | ✓ (`body.slot`) | ✓ |
| `currentSolarSystemId` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `20260503010000_persist_current_solar_system.sql` | ✓ | ✓ |
| `unlockedSolarSystems` | ✓ | ✓ | ✗ INTENTIONAL | N/A | N/A | N/A | N/A | N/A — no column | N/A — no migration | N/A | ✓ (re-derived from completedMissions via `SYSTEM_UNLOCK_GATES`) |
| `seenStoryEntries` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ `20260429000000_add_seen_story_entries.sql` | ✓ | ✓ |

Notes:
- "initial" = column appeared in `20260424120000_initial_schema.sql`.
- The `ship` field is the only field with a wire-name mismatch on POST: `SavePayloadSchema` accepts BOTH `ship` (snapshot's native key) and `shipConfig` (legacy /api contract). The route coalesces with `body.shipConfig ?? body.ship`. Don't "simplify" by dropping one — the snapshot serializer sends `ship`, and pre-refactor clients still send `shipConfig`.
- `unlockedSolarSystems` is the one intentional gap. `hydrate()` re-derives the array from `completedMissions ∩ SYSTEM_UNLOCK_GATES`, plus a server-side filter against known system IDs. Persisting it would create a data-truth duplication where the SYSTEM_UNLOCK_GATES map and the persisted array could disagree. Do not add a column for this.
- `saveSlot` rides as `slot` end-to-end. The route hard-codes `slot: 1` today (single-slot game). Multi-slot would require lifting that constant.

# Read-only contract
- This skill NEVER modifies, stages, or commits any file.
- It does not run `npm install` or any network call.
- It MAY run `npm test` to confirm the existing baseline still passes (the round-trip is partially covered by `src/lib/schemas/save.test.ts`, `src/game/state/sync.test.ts`, and the migration suite under `src/game/state/persistence/`); a failed test there is a strong signal that the audit will find a real ✗.
- If the audit finds a ✗ in a field that the user is in the middle of adding (e.g. they ran `/new-migration` but haven't wired layer 7 yet), report the finding and the suggested fix — do not make the fix. The author is responsible for closing the loop.
- If the audit finds a ✗ in a field that ALREADY shipped (i.e. the silent drop is on master), surface it loudly: "this is a latent silent-drop bug, not a missing piece of in-progress work." File an issue or open a separate PR rather than bundling it into the current PR.

# Constraints
- Read-only. Never edit/stage/commit.
- No `npm install`, no network. File-system inspection plus optional `npm test` if runnable.
- Don't invent fields. If a field is on `StateSnapshot` but the schema lacks it, that's a ✗ — report it; don't speculate "maybe it's intentional."
- Don't mark `unlockedSolarSystems` as a failure — its intentional non-persistence is documented above. Flag it only if `hydrate()` stops re-deriving it.

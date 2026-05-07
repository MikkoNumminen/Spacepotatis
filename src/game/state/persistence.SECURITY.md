# `src/game/state/persistence.ts` — security notes

This module is one of the eight layers of the save round-trip
([ADR 0004](../../../docs/decisions/0004-save-round-trip-eight-layers.md)).
The save round-trip is the highest-risk perimeter in the codebase per
CLAUDE.md §17 — every save POST runs through every layer, and a silent
field-drop in any layer means lost player progress.

## Threat mitigated

- **Field-drop regression** (baseline): a future PR adds a field to
  `StateSnapshot` but forgets to thread it through `toSnapshot()` /
  `hydrate()` / one of the migrators. The field silently disappears
  on save → load round-trip — months of player progression vanish.
- **Schema drift on legacy snapshots** (baseline): production rows
  carry historic shapes (id-array slots, named slots, primaryWeapon).
  `migrateShip` is the cleanup path; bypassing it loses player
  weapons and credits.
- **Removed-from-catalog weapon refund loss** (baseline):
  `salvageRemovedWeapons` runs BEFORE `migrateShip` so a player
  whose weapon left the catalog gets a credit refund instead of
  silently losing the inventory entry.

## Invariants enforced

- The `StateSnapshot` interface at line 31-41 is the wire contract.
  Adding a field requires touching all eight save round-trip
  layers (`/save-roundtrip-audit` skill enumerates them).
- `hydrate()` always re-derives `unlockedSolarSystems` from
  `completedMissions` via `SYSTEM_UNLOCK_GATES` (lines 80-86).
  This is idempotent and lets old saves catch up to new gate
  mappings without a one-shot migration.
- `migrateShip` is the only path from legacy snapshot shape to the
  canonical `ShipConfig`. Every per-shape migrator
  (`migrateNewShape`, `migrateLegacyIdArray`, `migrateNamedSlots`,
  `migratePrimaryWeapon`) lives under
  `src/game/state/persistence/` and is dispatched here.
- The empty-ship safety net (`seedStarterIfEmpty`) runs after every
  migration so a player always has at least the starter weapon.

## What MUST NOT change without security review

- **The `StateSnapshot` interface shape without running
  `/save-roundtrip-audit`.** The skill walks every field through
  the eight layers and flags any layer that silently drops it.
  Adding a field without running the audit is the rake.
- **The `salvageRemovedWeapons` step running BEFORE `migrateShip`
  drops the unknown ids.** Reordering means the refund computation
  runs against the post-migration ship (which has already dropped
  the unknown ids) and computes zero refund.
- **`hydrate`'s union of `serverSeen + localSeen`.** The local copy
  is the safety net for a save POST that never landed; without
  the union, a story popup re-fires on the same device after the
  player already watched it.

## What this module does NOT enforce

- **Cheat guards.** Those run server-side in
  `src/lib/saveValidation.ts`. The client is not authoritative for
  any guard.
- **The `:v2` localStorage stamp.** That is in
  `src/game/state/saveQueue.ts`.
- **Schema parsing.** `RemoteSaveSchema.safeParse` runs in
  `src/game/state/sync.ts:loadSave` BEFORE `hydrate` is called.

## Common mistakes

- **"Drop the retroactive system-unlock backfill — saves should be
  immutable on load"** — old saves never recorded the new system
  unlocks because the gate code did not exist when they were
  written. Without the backfill, players who cleared the gating
  mission years ago cannot reach the gated system. The backfill is
  idempotent (Set dedupe) — it costs nothing.
- **"Skip `salvageRemovedWeapons` for performance — `migrateShip`
  drops unknown ids anyway"** — the dropped ids ARE the inventory
  loss. The salvage step computes the refund BEFORE the drop.
- **"Add a new StateSnapshot field and only thread it through
  toSnapshot — the client doesn't load it back"** — that means
  the field is write-only from the client's perspective; it lives
  in the DB but never returns. Run `/save-roundtrip-audit` to
  catch this.

## How to test changes safely

- `npm test -- src/game/state/persistence.test.ts` (and the
  per-shape migrator tests under `persistence/`) — round-trip
  test suite.
- `npm run save-roundtrip-audit` — the slash skill walks every
  field through the eight layers and flags drops.
- Manual smoke: sign in, complete a mission, reload — confirm the
  cleared mission persists. If a field was dropped, the next
  save's `validateNoRegression` will 422 because the local state
  shrunk.

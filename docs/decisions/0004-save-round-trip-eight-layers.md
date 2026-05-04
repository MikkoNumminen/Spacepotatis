# ADR 0004: The save round-trip has eight layers — by design

Date: 2026-05-04
Status: accepted

## Context

A "save" in Spacepotatis is the most failure-sensitive operation in the
codebase. It encodes a player's months of progression. In May 2026 we
shipped the wrong save shape and silently dropped a newly-added field
through the pipeline; the symptom was players' progression failing to
persist for ~3 days, with no obvious error. The recovery cost was hours
of forensics and the addition of a `save_audit` table to make the next
incident diagnosable.

The round-trip touches eight distinct layers, each of which can silently
drop a field if it isn't updated in lock-step. They are:

1. **`StateSnapshot` interface** (`src/game/state/persistence.ts`) — the
   in-memory shape of "what gets persisted".
2. **`toSnapshot()`** — serializes live state into the snapshot.
3. **`SavePayloadSchema`** (`src/lib/schemas/save.ts`) — Zod gate for
   POST body validation.
4. **`/api/save` POST handler** (`src/app/api/save/route.ts`) — the
   authenticated server route, which also writes a forensic audit row.
5. **DB column** — the matching `save_games` column.
6. **Migration** (`db/migrations/*.sql`) — the SQL that created the
   column. Must be applied to prod (CLAUDE.md §7a HARD RULE).
7. **`/api/save` GET handler** + **`RemoteSaveSchema`** — what the server
   returns and how the client validates it.
8. **`sync.loadSave` → `hydrate`** — the client-side path that turns a
   server payload back into in-memory state.

Each layer can independently shed a field. Skipping any one breaks the
contract silently — the field reads `undefined`, the player loses data,
and the catch block emits `error: "server_error"` which is easy to miss
in Vercel logs. We rebuilt much of the save durability stack
(saveQueue, syncCache, LoadResult union, save audit log) precisely to
make this class of bug detectable.

## Decision

The save round-trip stays at exactly these eight layers. No layer is
collapsed for "simplicity" — each one earns its keep. The
`/save-roundtrip-audit` skill walks every `StateSnapshot` field through
all eight layers and flags any that silently drops the field; it must
run before any commit that touches the persistence sub-cluster.

## Consequences

- Pro: any field added to `StateSnapshot` is visibly a multi-layer change
  — the skill makes the cost obvious before merge, not after.
- Pro: forensic recovery is now possible — `save_audit` rows give us the
  exact payload, prev row, and user agent for any incident.
- Pro: the saveQueue (`spacepotatis:pendingSave:v2` localStorage key)
  buffers a single-slot snapshot stamped with `playerEmail`, so a
  transient server failure doesn't lose the save.
- Con: adding a single boolean to the snapshot is an 8-file edit. The
  skill makes it mechanical, but it's still 8 files.
- Con: the layers each have their own test surface, so changes touch ~10
  test files in addition to the 8 source files.
- Hard rule: per CLAUDE.md §9 + §7a, schema-touching code does NOT merge
  until the migration is applied to prod. Phase 3 of the modular audit
  treats `state` as the highest-risk module precisely because of this
  surface.

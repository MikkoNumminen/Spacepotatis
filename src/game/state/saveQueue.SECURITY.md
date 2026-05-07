# `src/game/state/saveQueue.ts` — security notes

This module is the client-side durability layer for save POSTs. It is also
a multi-account-leak surface because the localStorage blob persists across
sign-out / sign-in.

## Threat mitigated

- **Cross-account snapshot leak** (PR #100, baseline): on a shared
  browser, account A's pending save snapshot would hydrate into
  account B's session and POST as account B without the
  `playerEmail` stamp.
- **Save loss on flaky network** (baseline): without the durability
  queue, a network blip during `saveNow` evaporates the snapshot
  silently — a player completes a mission, sees the modal, then
  reloads to find the clear gone.
- **Permanent rejection masking transient failures** (SEC-020): if
  the route ever returns `save_rejected` for a transient guard
  failure (`playtime_delta_invalid` / `credits_delta_invalid` /
  `save_regression`), the queue must keep the slot for retry, not
  drop it.

## Invariants enforced

- INV-QUEUE-1 — every entry is stamped with a non-empty
  `playerEmail` (line 92, the field on the interface; lines 198-213
  in `markSavePending`). Read paths gate on the stamp matching the
  current session's email (lines 165-175). `:v1` blobs (pre-stamp)
  are silently purged (lines 122-134).
- INV-QUEUE-2 — saves go through `markSavePending` →
  `flushPendingSave`. Fire-and-forget POSTs lose snapshots on
  network drops; the queue is the durability layer.
- INV-SAVE-8 (cross-link) — `isPermanent()` (lines 320-353) treats
  `save_regression`, `save_rejected`, `playtime_delta_invalid`, and
  `credits_delta_invalid` as TRANSIENT. A future change to the
  route handler that collapses `save_regression` into
  `save_rejected` for the wire would be silently fine here, but
  removing `save_rejected` from this TRANSIENT list re-opens the
  bug SEC-020 documented (the queue would drop snapshots that
  should retry).

## What MUST NOT change without security review

- **The `playerEmail` field on every PendingSave.** Removing it
  re-introduces the cross-account leak. Validation in
  `isPendingSave` enforces non-empty string (line 109).
- **`readPendingForPlayer`'s stamp comparison.** Loosening it to
  "ignore stamp if current session is anonymous" or "fall back to
  any stamp" re-opens the leak.
- **`purgeLegacyBlob` running on every read.** This is what closes
  the `:v1` → `:v2` migration window. Removing the purge means a
  user who upgrades and signs out / in to a different account
  inherits the prior account's pre-stamp snapshot.
- **The TRANSIENT list in `isPermanent()`.** Each entry is paired
  with a server-side rejection code. Removing one — particularly
  `save_regression` or `save_rejected` — drops queued snapshots
  that should retry. Adding a new permanent code there is fine;
  removing existing TRANSIENT codes is not.
- **The single-slot model.** Holding two pending saves and POSTing
  the older first re-writes old progression and could fail the
  cheat-guard delta check. Holding only the newest is the
  documented design (lines 31-35).

## Common mistakes

- **"Bump the storage key to `:v3` and skip the purgeLegacyBlob
  step on read for performance"** — every read must purge legacy
  blobs, otherwise a sign-out → sign-in by another account on the
  same browser inherits the prior session's queue.
- **"Make `playerEmail` optional and default to the current session
  on read"** — that is exactly the leak vector the stamp closes.
  The stamp must be set at write time and verified at read time.
- **"Drop the `firstSeenMs` identity check on flush — re-reads are
  cheap"** — without the identity check, a `markSavePending` that
  lands during the POST could be clobbered when the in-flight
  flush clears the slot. The check at lines 287-291 prevents that.
- **"Treat 422 as always-permanent for tighter queue semantics"** —
  the four TRANSIENT 422 codes can pass on retry once a fresher
  baseline lands. Treating them as permanent drops queued saves
  prematurely.

## How to test changes safely

- `npm test -- src/game/state/saveQueue.test.ts` — full queue
  test suite (markSave, flush, attempts cap, age cap,
  cross-account stamp, isPermanent triage).
- `npm test -- tests/security/validatorOpaqueCode.test.ts` —
  SEC-020 (verifies the TRANSIENT semantics for `save_rejected`).
- Manual smoke: sign in as account A, complete a mission to
  enqueue a save, sign out, sign in as account B, observe that
  account B does NOT see account A's queued snapshot in DevTools'
  localStorage and does NOT POST it on next save.

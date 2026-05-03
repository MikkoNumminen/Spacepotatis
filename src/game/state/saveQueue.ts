"use client";

// Persistent durability layer for the player save snapshot. Mirrors the
// design of scoreQueue.ts but holds at most ONE entry — the latest snapshot
// always wins (a save is a snapshot, not an event log; older versions are
// strictly stale).
//
// Why this exists:
//  - Before this layer, saveNow() POSTed once and on failure the snapshot
//    evaporated. A network blip, a 5xx, or a tab close mid-flight silently
//    lost progression. The leaderboard had a queue; saves did not. Result:
//    a player could complete a mission, see the modal, then reload and find
//    the clear gone.
//
// Lifecycle:
//  - markSavePending(snapshot) — called from saveNow before the POST. The
//    snapshot is now durable: tab close / refresh / network drop cannot lose
//    it. firstSeenMs marks the snapshot identity used by the diff-write at
//    the end of flush.
//  - flushPendingSave(submit) — POSTs the pending snapshot. On success
//    clears the slot; on transient (5xx / network) bumps attempts; on
//    permanent (400 / 422) drops with a console.warn; on 401 keeps the
//    slot untouched (no attempt burned — sign-in will fix it).
//  - Auto-trigger: GameCanvas drains on mount, on auth → authenticated, on
//    visibilitychange→visible, and on `online`. Same triggers as the score
//    queue so the user-facing guarantee is symmetric.
//
// Why a single slot, not a list:
//  - Each save IS the cumulative state. Holding two pending saves and POST-
//    ing the older one first would re-write old progression onto the server
//    and could fail the cheat-guard delta check; holding only the newest
//    avoids the problem entirely.
//
// Concurrency model:
//  - flush holds a module-level in-flight promise. Concurrent flushPendingSave
//    calls share it — no parallel POSTs that could land in odd ordering at
//    the server.
//  - The flush re-reads the slot at commit time. If markSavePending landed
//    a fresher snapshot during the POST, the firstSeenMs comparison protects
//    it: we never clear / mutate a snapshot we didn't try.
//
// Storage:
//  - localStorage key is versioned (`:v1`) so a future shape change can read
//    `:v1`, migrate, and write `:v2` without risk.
//  - Quota / private-mode failures are caught and ignored — the in-memory
//    GameState is still authoritative for THIS session. Acceptable
//    degradation; the next saveNow attempt will re-persist.
//  - A schema-mismatched blob is removed on read so a future deploy with a
//    schema change doesn't keep warning on the same poisoned blob.

const STORAGE_KEY = "spacepotatis:pendingSave:v1";
const MAX_ATTEMPTS = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Player-facing message. Surfaced in the VictoryModal when the save couldn't
// post immediately but the queue holds it. Centralized here so the modal
// copy and the place that sets the state agree.
export const SAVE_QUEUED_MESSAGE =
  "Save stored locally — will sync automatically as soon as the server is reachable.";

// The snapshot is opaque to the queue; the server owns its schema. We hold
// it as a plain JSON object so JSON.stringify round-trips losslessly.
//
// Hand-rolled validator instead of Zod: pulling Zod (~98 kB) into the client
// bundle just to validate three fields wasn't worth the cost. The validator
// is the only contract for what counts as a valid pending save — there is
// no sibling schema to keep in lockstep, and the snapshot's shape (the
// `snapshot` field's interior) is validated by the SERVER's
// `SavePayloadSchema` in src/lib/schemas/save.ts when the snapshot is POSTed
// to /api/save. Loosening this validator means a malformed local blob
// round-trips one rejection before being dropped from the queue — no
// integrity risk.
export interface PendingSave {
  readonly snapshot: Record<string, unknown>;
  readonly firstSeenMs: number;
  readonly attempts: number;
}

function isPendingSave(raw: unknown): raw is PendingSave {
  if (raw === null || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.snapshot !== "object" || obj.snapshot === null || Array.isArray(obj.snapshot)) {
    return false;
  }
  if (typeof obj.firstSeenMs !== "number" || !Number.isFinite(obj.firstSeenMs)) return false;
  if (
    typeof obj.attempts !== "number" ||
    !Number.isInteger(obj.attempts) ||
    obj.attempts < 0
  ) {
    return false;
  }
  return true;
}

export type SavePostFn = (snapshot: Record<string, unknown>) => Promise<{
  readonly ok: true;
} | {
  readonly ok: false;
  readonly status: number;
  readonly errorCode: string | null;
}>;

function readPending(): PendingSave | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPendingSave(parsed)) {
    console.warn("[saveQueue] dropped pending: schema mismatch", parsed);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
  return parsed;
}

function writePending(pending: PendingSave | null): void {
  if (typeof window === "undefined") return;
  try {
    if (pending === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    }
  } catch {
    // Quota / private mode — current session keeps the snapshot in memory.
  }
}

export function clearSaveQueue(): void {
  writePending(null);
}

export function markSavePending(
  snapshot: Record<string, unknown>,
  nowMs: number = Date.now()
): void {
  // Latest snapshot always wins. attempts resets to 0 because the new
  // snapshot is a fresh attempt — the prior one (if any) is stale and will
  // not be tried; even if it was mid-flight, the firstSeenMs identity check
  // at flush commit time guarantees the prior flush won't clear THIS slot.
  writePending({
    snapshot,
    firstSeenMs: nowMs,
    attempts: 0
  });
}

export function readPendingSaveForTest(): PendingSave | null {
  return readPending();
}

// Outcome of a single flush. `kind` mirrors the SyncResult shape exposed by
// sync.ts so callers don't need a separate translation step.
export type FlushResult =
  | { readonly kind: "noop" }                          // no pending save to flush
  | { readonly kind: "ok" }                            // POST succeeded; slot cleared
  | { readonly kind: "queued"; readonly status: number } // transient; slot retained, attempts++
  | { readonly kind: "anonymous" }                     // 401; slot retained, attempts NOT bumped
  | { readonly kind: "failed"; readonly status: number; readonly errorCode: string | null }; // permanent; slot cleared

let inflightFlush: Promise<FlushResult> | null = null;

// Drive the pending save through `submit`. Concurrent callers share the
// in-flight promise (no parallel POSTs). Re-reads the slot at commit time
// so a markSavePending mid-flight isn't clobbered.
export async function flushPendingSave(
  submit: SavePostFn,
  nowMs: number = Date.now()
): Promise<FlushResult> {
  if (inflightFlush) return inflightFlush;
  inflightFlush = doFlush(submit, nowMs).finally(() => {
    inflightFlush = null;
  });
  return inflightFlush;
}

async function doFlush(submit: SavePostFn, nowMs: number): Promise<FlushResult> {
  const initial = readPending();
  if (!initial) return { kind: "noop" };

  // Up-front purges. A pending save that's hit the attempt cap or aged out
  // is genuinely stuck — leaving it in burns cycles every drain trigger and
  // can never succeed. Drop and warn so a real regression surfaces.
  if (initial.attempts >= MAX_ATTEMPTS) {
    console.warn(
      "[saveQueue] dropping pending save after max attempts",
      initial.attempts
    );
    writePending(null);
    return { kind: "noop" };
  }
  if (nowMs - initial.firstSeenMs > MAX_AGE_MS) {
    console.warn("[saveQueue] dropping pending save after max age");
    writePending(null);
    return { kind: "noop" };
  }

  const result = await submit(initial.snapshot);

  // Re-read NOW so a markSavePending that landed during the POST is visible.
  // We compare `firstSeenMs` to the snapshot we tried — if the slot has been
  // overwritten with a fresher snapshot, we MUST NOT touch it.
  const current = readPending();
  const sameSlot = current !== null && current.firstSeenMs === initial.firstSeenMs;

  if (result.ok) {
    if (sameSlot) writePending(null);
    return { kind: "ok" };
  }

  if (result.status === 401) {
    // Anonymous. Don't burn an attempt; sign-in will fix it.
    return { kind: "anonymous" };
  }

  if (isPermanent(result.status, result.errorCode)) {
    console.warn(
      "[saveQueue] dropping pending save after permanent rejection",
      "status",
      result.status,
      "code",
      result.errorCode
    );
    if (sameSlot) writePending(null);
    return { kind: "failed", status: result.status, errorCode: result.errorCode };
  }

  // Transient — bump attempts on the same slot. If a fresher snapshot was
  // queued mid-flight, leave it untouched (its attempts=0 is correct).
  if (sameSlot && current !== null) {
    writePending({ ...current, attempts: current.attempts + 1 });
  }
  return { kind: "queued", status: result.status };
}

function isPermanent(status: number, errorCode: string | null): boolean {
  // 400 (schema rejection) — payload shape can't become valid by retrying.
  if (status === 400) return true;
  // 422 has sub-cases. Mirrors scoreQueue.ts mission_not_completed pattern.
  //  - playtime_delta_invalid / credits_delta_invalid → TRANSIENT. The
  //    server's comparison baseline is its last-saved row; if intervening
  //    saves never landed, our snapshot's delta looks too large from the
  //    server's stale viewpoint. A fresher baseline (next saveNow, or this
  //    snapshot landing after retries that re-anchor the row) might pass.
  //  - save_regression → TRANSIENT. The regression guard rejects when the
  //    server's stored snapshot is more advanced than the client's. The
  //    comparison baseline shifts as fresher saves land in the background;
  //    holding the slot lets a future saveNow with the freshest in-memory
  //    state pass, OR lets the snapshot age out via MAX_ATTEMPTS / MAX_AGE_MS
  //    if it really is stale. The defense must never delete queued data.
  //  - mission_graph_invalid / validation_failed / other → PERMANENT.
  //    The unlock chain or schema is wrong in the snapshot itself; replay
  //    can't fix it.
  if (status === 422) {
    return (
      errorCode !== "playtime_delta_invalid" &&
      errorCode !== "credits_delta_invalid" &&
      errorCode !== "save_regression"
    );
  }
  return false;
}

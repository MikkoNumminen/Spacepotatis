"use client";

// Save/load sync against /api/save and /api/leaderboard.
// Every call is best-effort — a missing auth session or failed fetch must not
// break gameplay. The game stays playable offline; persistence is a bonus.
//
// Save durability — see saveQueue.ts. Every saveNow() goes through the
// pending-save slot in localStorage so a network drop, 5xx, or tab close
// can't lose the snapshot. On boot (loadSave), we flush the slot before
// hitting the server so the server's GET reflects the freshest state, and
// fall back to hydrating from the local snapshot if the flush couldn't
// reach the network.

import { hydrate, toSnapshot, type StateSnapshot } from "./GameState";
import { ROUTES } from "@/lib/routes";
import {
  drainScoreQueue as drainQueueWith,
  type DrainResult,
  type ScorePostFn
} from "./scoreQueue";
import {
  flushPendingSave,
  markSavePending,
  readPendingSaveForTest,
  SAVE_QUEUED_MESSAGE,
  type FlushResult,
  type SavePostFn
} from "./saveQueue";
import {
  getCurrentPlayerEmail,
  getInflightLoad,
  isHydrationCompleted,
  markHydrationCompleted,
  setInflightLoad,
  setSaveCache,
  getSaveCache as getSaveCacheValue
} from "./syncCache";

// Re-export the cache surface for backwards compatibility with sites that
// already import it from sync.ts. New callers should import directly from
// syncCache.ts to avoid pulling Zod into their bundle (see syncCache.ts
// header for the perf rationale).
export {
  clearLoadSaveCache,
  isSaveCached,
  getSaveCache
} from "./syncCache";

// Re-export FlushResult so tests / future external callers can type-check
// against the narrow shape without reaching into saveQueue directly.
export type { FlushResult };

export async function loadSave(): Promise<boolean> {
  const cached = getSaveCacheValue();
  if (cached !== null) return cached;
  const existing = getInflightLoad();
  if (existing) return existing;
  const promise = (async () => {
    try {
      return await doLoadSave();
    } finally {
      setInflightLoad(null);
    }
  })();
  setInflightLoad(promise);
  const result = await promise;
  setSaveCache(result);
  return result;
}

async function doLoadSave(): Promise<boolean> {
  // Snapshot the player email at entry — every read/write to the save queue
  // in this load uses the SAME identity. If the player signs out between
  // the GET and the queue drain, we still scope the queue access to the
  // account that owned this load.
  const playerEmail = getCurrentPlayerEmail();

  // Step 1 — fetch whatever the server has. Done first (synchronous prefix
  // before any `await`) so concurrent loadSave callers all observe the
  // fetch as already in-flight by the time they consult `inflight`.
  //
  // CRITICAL INVARIANT: only call `markHydrationCompleted()` on paths where
  // we KNOW the server's authoritative state for this session. saveNow gates
  // on the flag — leaving it false on a transient failure means saveNow
  // skips the POST rather than clobbering the server save with INITIAL_STATE.
  let serverHydrated = false;
  try {
    const res = await fetch(ROUTES.api.save, { cache: "no-store" });
    if (res.status === 401) {
      // Unauthenticated. saveNow handles 401 separately (queues without POST)
      // and there is no server save to clobber for an anonymous user, so it
      // is safe to mark hydration complete here.
      serverHydrated = false;
      markHydrationCompleted();
    } else if (!res.ok) {
      // Surface server-side failures to the console — silent fallback to
      // INITIAL_STATE used to make a 500 indistinguishable from "no save yet"
      // and the user couldn't tell their save was actually unreachable.
      // DO NOT mark hydration complete — saveNow must skip POSTs until a
      // future load succeeds, otherwise INITIAL_STATE clobbers the real save.
      const detail = await res.text().catch(() => "");
      console.warn("loadSave: non-OK response", res.status, detail);
      serverHydrated = false;
    } else {
      const raw = (await res.json()) as unknown;
      if (raw === null) {
        // 200 + null body = no save row exists yet. Fresh authenticated user.
        // GameState's INITIAL_STATE is the correct starting point; future
        // saveNow calls are creating the first save, not clobbering one.
        markHydrationCompleted();
      } else {
        // Lazy-load the Zod schema only when we actually have a payload to
        // parse. Hoisting this import to module top would drag ~98 kB of
        // Zod into every route that touches sync.ts (landing's SignInButton,
        // /shop's useGameState, etc.) — verified by `ANALYZE=true npm run
        // build`. Keep this dynamic so routes that never see a /api/save
        // 200 don't pay the bundle cost.
        const { RemoteSaveSchema } = await import("@/lib/schemas/save");
        const parsed = RemoteSaveSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn(
            "loadSave: schema rejected save row\nissues:",
            JSON.stringify(parsed.error.issues, null, 2),
            "\nraw:",
            JSON.stringify(raw, null, 2)
          );
          // DELIBERATELY do not markHydrationCompleted: a parse failure means
          // GameState was NOT hydrated from the server, so it's still at
          // INITIAL_STATE. Letting saveNow POST that would wipe the real
          // (just-unparseable-by-this-client) save row.
        } else {
          const body = parsed.data;
          const snapshot: Partial<StateSnapshot> = {
            credits: body.credits,
            completedMissions: [...body.completedMissions],
            unlockedPlanets: [...body.unlockedPlanets],
            playedTimeSeconds: body.playedTimeSeconds,
            // The schema accepts both new and legacy ship shapes via union;
            // hydrate → migrateShip handles the runtime narrowing into the
            // strict ShipConfig. The cast through unknown is the standard
            // "trust runtime validation" pattern at this boundary.
            ship: body.shipConfig as unknown as StateSnapshot["ship"],
            saveSlot: body.slot,
            seenStoryEntries: (body.seenStoryEntries ?? []) as StateSnapshot["seenStoryEntries"]
          };
          hydrate(snapshot);
          serverHydrated = true;
          markHydrationCompleted();
        }
      }
    }
  } catch {
    // Network error — leave hydrationCompleted at false so saveNow refuses
    // to POST. The user's existing save (if any) stays intact on the server.
    serverHydrated = false;
  }

  // Step 2 — if there's a pending save in localStorage, it represents the
  // FRESHEST player state (it was written by saveNow's markSavePending
  // before the POST that eventually failed / was interrupted). Override
  // any server hydrate above — pending is strictly newer.
  //
  // CROSS-ACCOUNT SAFETY: the read is gated by the current playerEmail. A
  // snapshot left in localStorage by user A is invisible when user B is
  // signed in (the stamp doesn't match), so B's session can never hydrate
  // from A's data. Anonymous loads (playerEmail === null) also see null —
  // an anonymous browser must never inherit a previous account's snapshot.
  //
  // INVARIANT: never extend the saveQueue snapshot shape ahead of its
  // consumer. hydrate() REPLACES (missing keys fall back to INITIAL_STATE,
  // see persistence.ts). If a future deploy adds new StateSnapshot fields
  // to markSavePending BEFORE the matching reader lands, this hydrate would
  // clobber the just-loaded server state with INITIAL_STATE defaults. Bump
  // the saveQueue storage version (with a migrator) when the shape changes.
  const pending = readPendingSaveForTest(playerEmail);
  if (pending) {
    hydrate(pending.snapshot as unknown as Partial<StateSnapshot>);
  }

  // Step 3 — kick a background flush so the pending save catches up to the
  // server without blocking the splash. Failures self-heal on the next
  // visibility / online / mount trigger.
  void flushSaveQueue();

  return serverHydrated || pending !== null;
}

// Structured outcome from saveNow. GameCanvas surfaces this in the
// VictoryModal so the player gets feedback when their save didn't commit —
// silent failure used to make "I won but my progress isn't saved"
// undebuggable from the user's seat. The `message` field is intentionally
// short and human-readable; the raw server response goes to console.warn
// for developer detail.
//
// Three outcomes:
//  - kind: "ok"      — server accepted the save. Slot is empty.
//  - kind: "queued"  — POST didn't land (network / 5xx / 401), but the
//                      snapshot is durable in localStorage. Will retry on
//                      mount / visibility / online / sign-in. Player can
//                      reload, kill the tab, etc. without losing progress.
//  - kind: "failed"  — server permanently rejected (400 schema, 422
//                      cheat-guard). Replay of THIS snapshot can't pass.
//                      Slot is empty.
export type SyncResult =
  | { readonly kind: "ok" }
  | { readonly kind: "queued"; readonly message: string }
  | { readonly kind: "failed"; readonly status: number; readonly message: string };

const queueAwareSaveSubmit: SavePostFn = async (snapshot) => {
  try {
    const res = await fetch(ROUTES.api.save, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot)
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => "");
    console.warn("saveNow: server rejected save", res.status, detail);
    return { ok: false, status: res.status, errorCode: parseErrorCode(detail) };
  } catch (err) {
    console.warn("saveNow: network error", describeError(err));
    return { ok: false, status: 0, errorCode: null };
  }
};

// Push the pending save (if any) to the server. Safe to call from anywhere —
// no-op when the slot is empty, never throws, shares an in-flight flush with
// concurrent callers (no duplicate POSTs). GameCanvas auto-drives this on
// mount, on visibilitychange→visible, on `online`, and on auth change to
// authenticated, so a transient failure self-heals without user action.
//
// The flush is scoped to the CURRENT player email — a snapshot stamped for
// a different account is left untouched (it'll fire when that account signs
// back in). Anonymous sessions are no-ops at this layer; nothing to flush.
export async function flushSaveQueue(): Promise<FlushResult> {
  return flushPendingSave({
    submit: queueAwareSaveSubmit,
    playerEmail: getCurrentPlayerEmail()
  });
}

export async function saveNow(): Promise<SyncResult> {
  // Hydration guard. If loadSave hasn't positively determined the server's
  // state for this session — schema rejection, 5xx, network error, or just
  // "haven't tried yet" — the in-memory GameState may still be at
  // INITIAL_STATE. POSTing it would wipe the player's real save server-side.
  // The 2026-05-02 wipe (numminen.mikko.petteri@gmail.com) proved this
  // happens in production; this gate is the matching defense to the
  // server-side regression guard in saveValidation.ts.
  //
  // We do NOT markSavePending here either — the local pending queue would
  // then persist INITIAL_STATE across reloads and override the next
  // legitimate server load (see sync.ts step 2 in doLoadSave). Skip both.
  if (!isHydrationCompleted()) {
    console.warn(
      "saveNow: skipped — hydration not complete; refusing to POST INITIAL_STATE"
    );
    return {
      kind: "queued",
      message: "Save deferred — waiting for cloud sync to confirm server state."
    };
  }
  // Anonymous saves never touch the queue. A stamp-less snapshot would be
  // a footgun: the next signed-in session would treat it as not-mine and
  // drop it on the floor anyway, AND we'd be holding mid-flight game state
  // outside any account boundary. Cleaner to refuse up front.
  const playerEmail = getCurrentPlayerEmail();
  if (playerEmail === null) {
    console.warn("saveNow: skipped — no signed-in player to stamp the snapshot");
    return {
      kind: "queued",
      message: "Sign in to save your progress."
    };
  }
  const snap = toSnapshot();
  // Durability: the moment markSavePending returns, the snapshot SURVIVES
  // tab close, refresh, network drop, browser crash. Even if every retry
  // below fails, the next mount/visibility/online/sign-in trigger replays
  // it. This is what was missing before — saveNow used to return "ok=false"
  // on a 5xx and the snapshot evaporated; reload showed older server state.
  markSavePending(snap as unknown as Record<string, unknown>, playerEmail);

  const result = await flushSaveQueue();

  if (result.kind === "ok") {
    setSaveCache(true);
    return { kind: "ok" };
  }
  if (result.kind === "noop") {
    // Defensive: shouldn't happen — we just markSavePending'd. If the slot
    // disappeared (concurrent clearSaveQueue?), treat as ok since there's
    // no work outstanding.
    return { kind: "ok" };
  }
  if (result.kind === "queued" || result.kind === "anonymous") {
    // Network / 5xx / 401 — snapshot is durable and will retry. Player-facing
    // message is centralized in saveQueue.ts.
    return { kind: "queued", message: SAVE_QUEUED_MESSAGE };
  }
  // result.kind === "failed" — permanent rejection (400 / 422). Snapshot
  // dropped from the queue.
  return {
    kind: "failed",
    status: result.status,
    message: humanizeSaveError(result.status, result.errorCode)
  };
}

// Single-source-of-truth POST to /api/leaderboard. Returns the raw shape
// the queue needs ({ ok } | { ok=false, status, errorCode }) — never
// throws. The score path is queue-only now: production code goes through
// `enqueueScore` then `drainScoreQueue`, never a direct fire-and-forget
// POST. This keeps the leaderboard "every win lands eventually" promise
// from being undermined by a code path that bypasses the queue.
const queueAwareSubmit: ScorePostFn = async (input) => {
  try {
    const res = await fetch(ROUTES.api.leaderboard, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => "");
    console.warn("submitScore: server rejected score", res.status, detail);
    return { ok: false, status: res.status, errorCode: parseErrorCode(detail) };
  } catch (err) {
    console.warn("submitScore: network error", describeError(err));
    return { ok: false, status: 0, errorCode: null };
  }
};

// Public hook for callers (GameCanvas) that want to kick the queue. Safe to
// call from anywhere — does nothing if the queue is empty, never throws,
// shares an in-flight drain with concurrent callers (no duplicate POSTs).
export async function drainScoreQueue(): Promise<DrainResult> {
  return drainQueueWith(queueAwareSubmit);
}

// Status-code → short human-readable message. Reads the JSON `error` field
// from the route's error responses when present so a writer of a new guard
// (e.g. mission_not_completed) gets informative output without changing
// this code. Falls back to a generic per-status hint.
function humanizeSaveError(status: number, errCode: string | null): string {
  if (status === 401) return "Sign in to save your progress.";
  if (status === 400) return `Save rejected (validation failed${errCode ? `: ${errCode}` : ""}).`;
  if (status === 422) {
    if (errCode === "mission_graph_invalid") {
      return "Save rejected (mission unlock chain mismatch).";
    }
    if (errCode === "playtime_delta_invalid") {
      return "Save rejected (playtime delta too large).";
    }
    if (errCode === "credits_delta_invalid") {
      return "Save rejected (credits delta too large).";
    }
    return `Save rejected${errCode ? ` (${errCode})` : ""}.`;
  }
  return `Save failed (HTTP ${status}${errCode ? ` ${errCode}` : ""}).`;
}

function parseErrorCode(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

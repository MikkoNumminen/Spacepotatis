"use client";

// Save/load sync against /api/save and /api/leaderboard.
// Every call is best-effort — a missing auth session or failed fetch must not
// break gameplay. The game stays playable offline; persistence is a bonus.

import { hydrate, toSnapshot, type StateSnapshot } from "./GameState";
import { ROUTES } from "@/lib/routes";
import { RemoteSaveSchema } from "@/lib/schemas/save";
import {
  drainScoreQueue as drainQueueWith,
  type DrainResult,
  type ScorePostFn
} from "./scoreQueue";

// Module-level cache + in-flight de-dup. Both useCloudSaveSync (which
// hydrates the GameState) and useOptimisticAuth (which only needs to know
// whether a save exists for the CONTINUE label) want the same /api/save
// payload. Without this, both fired separate Edge invocations on every
// authenticated mount — doubling the cold-start cost for no gain. Cleared
// on sign-out so a different account doesn't see the previous one's save.
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export function clearLoadSaveCache(): void {
  cached = null;
  inflight = null;
}

// Read-only window into the module cache. Hooks consult this to seed their
// React initial state so a hot remount (e.g. nav between / and /play) can
// render with ready=true on the very first frame, skipping the splash.
export function isSaveCached(): boolean {
  return cached !== null;
}

export function getSaveCache(): boolean | null {
  return cached;
}

export async function loadSave(): Promise<boolean> {
  if (cached !== null) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      return await doLoadSave();
    } finally {
      inflight = null;
    }
  })();
  const result = await inflight;
  cached = result;
  return result;
}

async function doLoadSave(): Promise<boolean> {
  try {
    const res = await fetch(ROUTES.api.save, { cache: "no-store" });
    if (res.status === 401) return false;
    if (!res.ok) {
      // Surface server-side failures to the console — silent fallback to
      // INITIAL_STATE used to make a 500 indistinguishable from "no save yet"
      // and the user couldn't tell their save was actually unreachable.
      const detail = await res.text().catch(() => "");
      console.warn("loadSave: non-OK response", res.status, detail);
      return false;
    }
    const raw = (await res.json()) as unknown;
    if (raw === null) return false;

    const parsed = RemoteSaveSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        "loadSave: schema rejected save row\nissues:",
        JSON.stringify(parsed.error.issues, null, 2),
        "\nraw:",
        JSON.stringify(raw, null, 2)
      );
      return false;
    }
    const body = parsed.data;

    // shipConfig already passes the legacy-or-new union; hydrate -> migrateShip
    // does the real cleanup (drops unknown ids, clamps levels).
    const snapshot: Partial<StateSnapshot> = {
      credits: body.credits,
      completedMissions: [...body.completedMissions],
      unlockedPlanets: [...body.unlockedPlanets],
      playedTimeSeconds: body.playedTimeSeconds,
      // The schema accepts both new and legacy ship shapes via union; hydrate
      // → migrateShip handles the runtime narrowing into the strict
      // ShipConfig. The cast through unknown is the standard "trust runtime
      // validation" pattern at this boundary.
      ship: body.shipConfig as unknown as StateSnapshot["ship"],
      saveSlot: body.slot,
      seenStoryEntries: (body.seenStoryEntries ?? []) as StateSnapshot["seenStoryEntries"]
    };
    hydrate(snapshot);
    return true;
  } catch {
    return false;
  }
}

// Structured outcome from saveNow. GameCanvas surfaces this in the
// VictoryModal so the player gets feedback when their save didn't commit —
// silent failure used to make "I won but my progress isn't saved"
// undebuggable from the user's seat. The `message` field is intentionally
// short and human-readable; the raw server response goes to console.warn
// for developer detail.
export type SyncResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: number; readonly message: string };

export async function saveNow(): Promise<SyncResult> {
  const snap = toSnapshot();
  try {
    const res = await fetch(ROUTES.api.save, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snap)
    });
    // After a successful POST, the server now definitely has a save row,
    // so any future loadSave() should report hasSave=true without re-fetching.
    if (res.ok) {
      cached = true;
      return { ok: true };
    }
    // Surface server rejections (422 cheat-guard, 400 schema) to the
    // console for developer detail. Cheat attempts show up here too, but
    // that's fine: a determined cheater can read network responses
    // anyway, this just keeps honest players informed.
    const detail = await res.text().catch(() => "");
    console.warn("saveNow: server rejected save", res.status, detail);
    return { ok: false, status: res.status, message: humanizeSaveError(res.status, detail) };
  } catch (err) {
    // Network unreachable, CORS, etc. The snapshot stays in memory; next
    // save attempt will retry.
    return {
      ok: false,
      status: 0,
      message: `Network error — couldn't reach the save server (${describeError(err)})`
    };
  }
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
function humanizeSaveError(status: number, body: string): string {
  const errCode = parseErrorCode(body);
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

"use client";

import type { MissionId } from "@/types/game";

// Persistent retry queue for leaderboard score posts. The leaderboard MUST
// stay accurate — a score that wins a mission has to land on the board
// regardless of network blips, autoplay-blocked auth flows, or the player
// being signed out at the moment of the win. The queue is the safety net.
//
// Lifecycle:
//  - Mission complete (auth + win) → enqueue the {missionId, score, time}
//    triple, then try to drain immediately.
//  - Mission complete while signed out → enqueue, drain becomes a no-op
//    until they sign in.
//  - On mount of GameCanvas, on auth state change to "authenticated", and
//    on visibilitychange→visible: drain.
//  - Drain attempts each entry: if 2xx, drop; if 401 (anonymous), keep
//    untouched (don't burn attempts); if transient (5xx, network), keep
//    with attempts++; if permanent (400, 422 for non-mission-not-completed
//    reasons), drop with a console.warn.
//  - If the route returns 422 mission_not_completed, that means the save
//    row didn't catch up yet. Keep with attempts++ — a follow-up drain
//    after the next saveNow() will succeed.
//  - Cap MAX_ATTEMPTS at 50 so a chronically failing entry doesn't grow
//    unbounded; cap MAX_AGE_MS at 30 days so a long-cold queue self-purges.
//
// Why localStorage and not sessionStorage: a tab close shouldn't drop the
// queue. The player closes the tab thinking their score posted; we want
// the next visit to retry without their involvement.
//
// Storage shape is versioned (`:v1`) so a future schema change can read
// the old key, migrate, and write under `:v2` without conflict.
//
// Concurrency model:
//  - Drain holds a module-level in-flight promise. A second drainScoreQueue()
//    call while the first is running shares the same promise — it does NOT
//    fire a parallel HTTP burst that could double-POST entries.
//  - Drain writes are diff-based: at the end of a drain, we re-read the
//    current queue (which may have grown via enqueueScore mid-flight) and
//    only remove processed items by their unique key, then update transient
//    items' attempts. New entries added during drain are preserved.
//  - These two together close the window where concurrent drain triggers
//    or an enqueue-during-drain could either duplicate-POST or lose an
//    entry.

const STORAGE_KEY = "spacepotatis:scoreQueue:v1";
const MAX_ATTEMPTS = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Player-facing message used when a drain finishes but didn't post anything
// (transient failure / 401). Centralized here so the modal copy and the
// place that sets `kind: "queued"` agree.
export const QUEUED_MESSAGE =
  "Score saved locally — will post automatically as soon as the leaderboard is reachable.";

// Hand-rolled validator instead of Zod. The queue stores only its own
// shape; full mission-id validation belongs to the server (the leaderboard
// route's ScorePayloadSchema enforces the enum, and a stale id from an old
// build will be rejected as a permanent 400 there). Avoiding Zod here keeps
// ~98 kB of Zod runtime out of /play's import graph (and out of any other
// page that transitively imports sync.ts).
export interface QueuedScore {
  readonly missionId: MissionId;
  readonly score: number;
  readonly timeSeconds: number;
  // Wall-clock ms when the score was first enqueued. Used to age out
  // entries that have been sitting in the queue forever.
  readonly firstSeenMs: number;
  // Number of failed drain attempts so far. Capped at MAX_ATTEMPTS.
  readonly attempts: number;
}

function isQueuedScore(raw: unknown): raw is QueuedScore {
  if (raw === null || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.missionId !== "string") return false;
  if (typeof obj.score !== "number" || !Number.isInteger(obj.score)) return false;
  if (
    typeof obj.timeSeconds !== "number" ||
    !Number.isInteger(obj.timeSeconds) ||
    obj.timeSeconds < 0
  ) {
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

export interface ScorePostInput {
  readonly missionId: MissionId;
  readonly score: number;
  readonly timeSeconds: number;
}

export type ScorePostFn = (input: ScorePostInput) => Promise<{
  readonly ok: true;
} | {
  readonly ok: false;
  readonly status: number;
  readonly errorCode: string | null;
}>;

// Stable identity used to match a queue entry across reads — the diff-write
// at end of drain compares by this so concurrent enqueues during a drain
// don't get lost. {missionId, score, timeSeconds} alone is what enqueue
// dedupes on, so it's also the right grain for "is this the same entry".
// firstSeenMs disambiguates rare cases where the same triple is removed
// and re-enqueued mid-drain.
function entryKey(item: Pick<QueuedScore, "missionId" | "score" | "timeSeconds" | "firstSeenMs">): string {
  return `${item.missionId}|${item.score}|${item.timeSeconds}|${item.firstSeenMs}`;
}

function readQueue(): QueuedScore[] {
  if (typeof window === "undefined") return [];
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / quota / disabled storage — pretend queue is empty.
    // Better to drop than to throw and break gameplay flow.
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed) || !parsed.every(isQueuedScore)) {
    // A stray entry from a future schema or hand-edit can't be repaired
    // safely; drop the whole queue rather than risk silently posting
    // half-broken payloads. console.warn so a real regression surfaces,
    // and explicitly removeItem so the next read doesn't warn again on
    // the same poisoned blob.
    console.warn("[scoreQueue] dropped queue: schema mismatch", parsed);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore — if remove fails, next read warns again. Not fatal.
    }
    return [];
  }
  return [...parsed];
}

function writeQueue(items: readonly QueuedScore[]): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Quota / private mode — can't persist. The current run's score is
    // still in the in-memory queue for this session, but won't survive
    // a reload. Acceptable graceful degradation.
  }
}

export function clearScoreQueue(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function enqueueScore(input: ScorePostInput, nowMs: number = Date.now()): void {
  const items = readQueue();
  // Dedupe: if the same missionId + score + timeSeconds is already queued
  // (rapid double-fire of mission complete, network glitch retry from the
  // caller, etc.), don't add another copy. We DON'T dedupe by missionId
  // alone — a player can re-clear a mission with a different score and
  // both should post.
  const dupe = items.some(
    (q) =>
      q.missionId === input.missionId &&
      q.score === input.score &&
      q.timeSeconds === input.timeSeconds
  );
  if (dupe) return;
  const next: QueuedScore = {
    missionId: input.missionId,
    score: input.score,
    timeSeconds: input.timeSeconds,
    firstSeenMs: nowMs,
    attempts: 0
  };
  writeQueue([...items, next]);
}

export function readScoreQueueForTest(): readonly QueuedScore[] {
  return readQueue();
}

export interface DrainResult {
  readonly attempted: number;
  readonly succeeded: number;
  readonly remaining: number;
}

// Module-level in-flight drain promise. A second drainScoreQueue() call
// while one is already running returns the same promise instead of starting
// a parallel drain — that's what stops concurrent triggers (mount + auth
// change + visibility) from causing duplicate POSTs or stomping on each
// other's writes. Cleared in finally so the next drain can run cleanly.
let inflightDrain: Promise<DrainResult> | null = null;

// Drain the queue against the supplied submit function. Each item's
// outcome maps to one of three branches:
//
//   - Success (2xx) → drop the item.
//   - Permanent failure (400, 422 on a known-permanent code) → drop AND
//     log so a regression doesn't silently swallow a real bug.
//   - Anonymous (401) → stop draining (no point trying others against
//     the same un-auth state). Keep the item; don't burn an attempt
//     since the failure was guaranteed by lack of session.
//   - Transient (5xx, network status=0, 422 mission_not_completed) →
//     keep with attempts++.
//
// MAX_ATTEMPTS / MAX_AGE_MS purges happen up front, before any POST,
// so a permanently-stuck entry doesn't keep generating network traffic.
//
// Concurrent calls share the in-flight drain (no parallel HTTP). Writes
// at the end of the drain are diff-based against a fresh re-read of the
// queue, so an enqueueScore() that lands during the drain isn't clobbered
// when the drain commits its results.
export async function drainScoreQueue(
  submit: ScorePostFn,
  nowMs: number = Date.now()
): Promise<DrainResult> {
  if (inflightDrain) return inflightDrain;
  inflightDrain = doDrain(submit, nowMs).finally(() => {
    inflightDrain = null;
  });
  return inflightDrain;
}

async function doDrain(submit: ScorePostFn, nowMs: number): Promise<DrainResult> {
  const initial = readQueue();
  if (initial.length === 0) {
    return { attempted: 0, succeeded: 0, remaining: 0 };
  }

  // Track outcomes by entry key. We apply these as a diff against a fresh
  // re-read of the queue at the end so concurrent enqueues survive the
  // commit.
  const drop = new Set<string>();
  const updates = new Map<string, QueuedScore>();

  // Purge entries that have aged out or hit the attempt cap. These are
  // genuinely stuck — leaving them in burns bandwidth and ages further.
  const fresh: QueuedScore[] = [];
  for (const item of initial) {
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn(
        "[scoreQueue] dropping entry after max attempts",
        item.missionId,
        "score",
        item.score
      );
      drop.add(entryKey(item));
      continue;
    }
    if (nowMs - item.firstSeenMs > MAX_AGE_MS) {
      console.warn(
        "[scoreQueue] dropping entry after max age",
        item.missionId,
        "score",
        item.score
      );
      drop.add(entryKey(item));
      continue;
    }
    fresh.push(item);
  }

  let succeeded = 0;
  let attempted = 0;
  let stopOnAnonymous = false;

  for (const item of fresh) {
    if (stopOnAnonymous) {
      // Already saw a 401 in this drain — every other entry would 401
      // too. Keep them untouched (don't burn attempts) and move on.
      continue;
    }
    attempted += 1;
    const result = await submit({
      missionId: item.missionId,
      score: item.score,
      timeSeconds: item.timeSeconds
    });
    if (result.ok) {
      succeeded += 1;
      drop.add(entryKey(item));
      continue;
    }
    if (result.status === 401) {
      // Anonymous. Pause the drain; user will sign in eventually.
      stopOnAnonymous = true;
      continue;
    }
    if (isPermanent(result.status, result.errorCode)) {
      console.warn(
        "[scoreQueue] dropping entry after permanent rejection",
        item.missionId,
        "status",
        result.status,
        "code",
        result.errorCode
      );
      drop.add(entryKey(item));
      continue;
    }
    // Transient — keep with attempts++.
    updates.set(entryKey(item), { ...item, attempts: item.attempts + 1 });
  }

  // Re-read the queue NOW so any enqueueScore() calls that landed during
  // the drain are visible. Then apply the diff: drop succeeded/permanent/
  // purged entries by key, replace transient entries with their attempts++
  // versions, leave everything else (including new entries) intact.
  const current = readQueue();
  const next = current.flatMap((item) => {
    const k = entryKey(item);
    if (drop.has(k)) return [];
    const updated = updates.get(k);
    return updated ? [updated] : [item];
  });
  writeQueue(next);
  return { attempted, succeeded, remaining: next.length };
}

function isPermanent(status: number, errorCode: string | null): boolean {
  // 400 (schema rejection) is always permanent — payload shape can't
  // become valid by retrying.
  if (status === 400) return true;
  // 422 has a few sub-cases:
  //  - mission_not_completed → transient: a follow-up saveNow may
  //    catch it up. Keep retrying.
  //  - other 422 codes (validation_failed, etc.) → permanent.
  if (status === 422) return errorCode !== "mission_not_completed";
  return false;
}

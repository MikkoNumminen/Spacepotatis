"use client";

import { z } from "zod";
import type { MissionId } from "@/types/game";
import { MissionIdSchema } from "@/lib/schemas/save";

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

const STORAGE_KEY = "spacepotatis:scoreQueue:v1";
const MAX_ATTEMPTS = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const QueuedScoreSchema = z.object({
  missionId: MissionIdSchema,
  score: z.number().int(),
  timeSeconds: z.number().int().nonnegative(),
  // Wall-clock ms when the score was first enqueued. Used to age out
  // entries that have been sitting in the queue forever.
  firstSeenMs: z.number(),
  // Number of failed drain attempts so far. Capped at MAX_ATTEMPTS.
  attempts: z.number().int().nonnegative()
});

const QueueSchema = z.array(QueuedScoreSchema);

export type QueuedScore = z.infer<typeof QueuedScoreSchema>;

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
  const result = QueueSchema.safeParse(parsed);
  if (!result.success) {
    // A stray entry from a future schema or hand-edit can't be repaired
    // safely; drop the whole queue rather than risk silently posting
    // half-broken payloads. console.warn so a real regression surfaces.
    console.warn("[scoreQueue] dropped queue: schema mismatch", result.error.issues);
    return [];
  }
  return result.data;
}

function writeQueue(items: readonly QueuedScore[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
export async function drainScoreQueue(
  submit: ScorePostFn,
  nowMs: number = Date.now()
): Promise<DrainResult> {
  const before = readQueue();
  if (before.length === 0) {
    return { attempted: 0, succeeded: 0, remaining: 0 };
  }

  // Purge entries that have aged out or hit the attempt cap. These are
  // genuinely stuck — leaving them in burns bandwidth and ages further.
  const fresh = before.filter((item) => {
    if (item.attempts >= MAX_ATTEMPTS) {
      console.warn(
        "[scoreQueue] dropping entry after max attempts",
        item.missionId,
        "score",
        item.score
      );
      return false;
    }
    if (nowMs - item.firstSeenMs > MAX_AGE_MS) {
      console.warn(
        "[scoreQueue] dropping entry after max age",
        item.missionId,
        "score",
        item.score
      );
      return false;
    }
    return true;
  });

  let succeeded = 0;
  let attempted = 0;
  const remaining: QueuedScore[] = [];
  let stopOnAnonymous = false;

  for (const item of fresh) {
    if (stopOnAnonymous) {
      // Already saw a 401 in this drain — every other entry would 401
      // too. Keep them untouched (don't burn attempts) and move on.
      remaining.push(item);
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
      continue;
    }
    if (result.status === 401) {
      // Anonymous. Pause the drain; user will sign in eventually.
      stopOnAnonymous = true;
      remaining.push(item);
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
      continue;
    }
    // Transient — keep with attempts++.
    remaining.push({ ...item, attempts: item.attempts + 1 });
  }

  writeQueue(remaining);
  return { attempted, succeeded, remaining: remaining.length };
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

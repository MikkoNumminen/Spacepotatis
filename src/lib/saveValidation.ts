// Server-side guards for /api/save and /api/leaderboard. Pure functions so
// they're trivially testable and Edge-runtime safe (no Node primitives).
//
// Goal: catch the obvious cheats — DevTools writes to the Zustand store,
// hand-crafted POSTs against the API — without rejecting legitimate play.
// Numbers here are intentionally loose; tighten only after we've watched
// real telemetry for false positives.

import { getMission } from "@/game/data/missions";
import type { MissionId } from "@/types/game";

// Sustained credits-per-second the routes will accept. Real peak from a
// kill-dense wave is ~30-40/s; 100/s is roughly 3x that ceiling so a
// legitimately lucky run never hits the cap.
export const MAX_CREDITS_PER_SECOND = 100;

// Per-completion bonus allowance: a first clear can grant up to 1000
// credits from the loot pool plus the boss credit value (~500). 2000
// covers both with slack so we don't reject the moment a player clears
// a boss for the first time.
export const MAX_CREDITS_PER_FIRST_CLEAR = 2000;

// Fixed slack added to every delta. Absorbs rounding and the rare frame
// where the client batches a couple of stray credit awards across the
// save boundary.
export const CREDITS_DELTA_SLACK = 100;

// Wall-clock slack on the playtime guard. 60s covers client/server clock
// skew, the time between snapshot serialization and the POST landing,
// and the rare double-save during a network retry.
export const PLAYTIME_DELTA_SLACK_SECONDS = 60;

export interface ValidationResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface MissionGraphInput {
  readonly completedMissions: readonly MissionId[];
  readonly unlockedPlanets: readonly MissionId[];
}

// Reject saves whose unlock chain has been bypassed: every entry in
// completedMissions must have all of its `requires` already in
// completedMissions, and every entry in unlockedPlanets that's a combat
// mission (not a shop/scenery planet) must satisfy the same rule.
//
// Permissive on duplicates and on shop/scenery unlocks (those have no
// gameplay prerequisite — you can warp to a market without having
// cleared anything).
export function validateMissionGraph(input: MissionGraphInput): ValidationResult {
  const completed = new Set<MissionId>(input.completedMissions);

  for (const id of input.completedMissions) {
    const mission = safeGetMission(id);
    if (!mission) continue;
    for (const req of mission.requires) {
      if (!completed.has(req)) {
        return {
          ok: false,
          error: `completed mission "${id}" missing prerequisite "${req}"`
        };
      }
    }
  }

  for (const id of input.unlockedPlanets) {
    const mission = safeGetMission(id);
    if (!mission) continue;
    if (mission.kind !== "mission") continue;
    for (const req of mission.requires) {
      if (!completed.has(req)) {
        return {
          ok: false,
          error: `unlocked planet "${id}" missing prerequisite "${req}"`
        };
      }
    }
  }

  return { ok: true };
}

export interface CreditsDeltaSide {
  readonly credits: number;
  readonly playedTimeSeconds: number;
  readonly completedMissionsCount: number;
}

export interface CreditsDeltaInput {
  // null when no prior save row exists — the first save is bounded against
  // zero (i.e. all of the new credits must fit under the time + completion
  // budget the player has actually accumulated).
  readonly prev: CreditsDeltaSide | null;
  readonly next: CreditsDeltaSide;
}

// Reject saves whose credits jumped by more than the player could plausibly
// have earned since the previous save. Spending (negative delta) is always
// allowed — the market drains credits and we don't want to police that.
export function validateCreditsDelta(input: CreditsDeltaInput): ValidationResult {
  const { prev, next } = input;
  const prevCredits = prev?.credits ?? 0;
  const prevTime = prev?.playedTimeSeconds ?? 0;
  const prevCompleted = prev?.completedMissionsCount ?? 0;

  const deltaCredits = next.credits - prevCredits;
  if (deltaCredits <= 0) return { ok: true };

  const deltaTime = Math.max(0, next.playedTimeSeconds - prevTime);
  const deltaCompleted = Math.max(0, next.completedMissionsCount - prevCompleted);

  const maxDelta =
    deltaTime * MAX_CREDITS_PER_SECOND +
    deltaCompleted * MAX_CREDITS_PER_FIRST_CLEAR +
    CREDITS_DELTA_SLACK;

  if (deltaCredits > maxDelta) {
    return {
      ok: false,
      error: `credits delta ${deltaCredits} exceeds max ${maxDelta} (delta_time=${deltaTime}s, delta_completed=${deltaCompleted})`
    };
  }
  return { ok: true };
}

// Wall-clock guard on playedTimeSeconds growth. Closes the credits-cap
// escape hatch where a cheater POSTs an inflated `playedTimeSeconds`
// alongside inflated credits — without this, the credits-delta cap
// would happily allow `playtime * 100` extra credits for whatever
// playtime the body claimed. Here we tie the playtime delta to real
// seconds elapsed since the last save's updated_at.
//
// Skipped on the first save (no prior row to compare against). The
// credits cap still constrains first saves via `prev=null` defaulting
// previous values to zero.
export interface PlaytimeDeltaInput {
  readonly prev: {
    readonly playedTimeSeconds: number;
    // Accept Date OR string — Neon's Edge driver sometimes returns
    // TIMESTAMPTZ as a string and the route shouldn't have to coerce
    // before calling the validator.
    readonly updatedAt: Date | string;
  } | null;
  readonly next: {
    readonly playedTimeSeconds: number;
  };
  // Injected for test determinism. Production callers pass Date.now().
  readonly nowMs: number;
}

export function validatePlaytimeDelta(input: PlaytimeDeltaInput): ValidationResult {
  const { prev, next, nowMs } = input;
  if (!prev) return { ok: true };

  const deltaPlayed = next.playedTimeSeconds - prev.playedTimeSeconds;
  if (deltaPlayed <= 0) return { ok: true };

  const prevUpdatedMs =
    prev.updatedAt instanceof Date
      ? prev.updatedAt.getTime()
      : new Date(prev.updatedAt).getTime();
  // Defensive: an unparseable timestamp shouldn't lock the player out;
  // this only happens if the DB row has bogus data, which is its own
  // problem to debug. Fail open so legitimate saves still go through.
  if (!Number.isFinite(prevUpdatedMs)) return { ok: true };

  const wallClockSeconds = Math.max(0, (nowMs - prevUpdatedMs) / 1000);
  const allowedDelta = wallClockSeconds + PLAYTIME_DELTA_SLACK_SECONDS;

  if (deltaPlayed > allowedDelta) {
    return {
      ok: false,
      error: `playtime delta ${deltaPlayed}s exceeds wall-clock ${allowedDelta.toFixed(1)}s since last save`
    };
  }
  return { ok: true };
}

function safeGetMission(id: MissionId) {
  try {
    return getMission(id);
  } catch {
    // Schema validation already rejects unknown mission ids before the
    // validators run; this is purely defensive against future drift.
    return null;
  }
}

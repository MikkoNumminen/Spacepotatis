// Server-side guards for /api/save and /api/leaderboard. Pure functions so
// they're trivially testable and Edge-runtime safe (no Node primitives).
//
// Goal: catch the obvious cheats — DevTools writes to the Zustand store,
// hand-crafted POSTs against the API — without rejecting legitimate play.
// Numbers here are intentionally loose; tighten only after we've watched
// real telemetry for false positives.

import { getEnemy } from "@/game/data/enemies";
import { getAllLootPools } from "@/game/data/lootPools";
import { getAllMissions, getMission } from "@/game/data/missions";
import { getWavesForMission } from "@/game/data/waves";
import { SYSTEM_UNLOCK_GATES } from "@/game/state/stateCore";
import type { MissionId, SolarSystemId } from "@/types/game";

// ---------------------------------------------------------------------------
// Per-player, progression-aware cheat-guard caps
// ---------------------------------------------------------------------------
// The credits-delta cap used to be a global constant; that meant a brand-new
// player's cap was tuned to endgame loot, and a balance change to a far
// system silently loosened the cap for tutorial-only players too. The
// progression-aware version derives caps per-request from the player's
// completedMissions: only systems they've actually reached count toward
// their personal cap. New player can only earn at tutorial-system rates;
// players in tubernovae get tubernovae-tier caps; future systems light up
// only for players who've cleared their gating mission.
//
// Formulas (per reachable-system set):
//
//   maxPerSecond
//     = max(non-boss enemy creditValue across reachable systems' missions)
//       * KILL_CADENCE_CEILING * PER_SECOND_SAFETY_FACTOR
//   Bosses are excluded — they spawn once per mission, they shouldn't drive
//   a sustained per-second cap. KILL_CADENCE_CEILING is the wildest sustained
//   kill rate a player can plausibly maintain (5/s — packed wave + rapid-fire).
//   SAFETY_FACTOR is 3x to absorb chained explosions, multi-projectile
//   weapons, and lucky runs.
//
//   maxPerFirstClear
//     = ceil((max loot-pool credit max in reachable systems
//             + max boss creditValue across reachable systems) * 1.5)
//   Covers the worst-case first-clear in any reachable system.
//
// Reachable systems are derived purely from the SERVER's stored
// completedMissions — never trusted from the request body. So a cheater
// can't expand their cap by lying about completions: validateMissionGraph
// runs first and rejects illegitimate completions; only after that pass
// do we recompute caps from the (now-trusted) completedMissions.

const KILL_CADENCE_CEILING = 5;
const PER_SECOND_SAFETY_FACTOR = 3;
const PER_CLEAR_SAFETY_FACTOR = 1.5;

// Fixed slack added to every credits delta. Absorbs rounding and the rare
// frame where the client batches a couple of stray credit awards across the
// save boundary. Not derived — it's a constant absorption buffer for noise.
export const CREDITS_DELTA_SLACK = 100;

export interface CreditCaps {
  readonly maxPerSecond: number;
  readonly maxPerFirstClear: number;
}

// A system is reachable if:
//   - It's the always-unlocked starting system ("tutorial"), OR
//   - The player has completed any mission belonging to it (they've been
//     there), OR
//   - The player has completed a mission listed in SYSTEM_UNLOCK_GATES
//     whose target system is this one (they've earned the unlock even if
//     they haven't played a mission there yet).
//
// The third rule is what lets a player's cap expand the moment they
// finish boss-1, even before they POST their first tubernovae score.
export function getReachableSolarSystems(
  completedMissions: readonly MissionId[]
): Set<SolarSystemId> {
  const reachable = new Set<SolarSystemId>(["tutorial"]);
  for (const id of completedMissions) {
    const mission = safeGetMission(id);
    if (mission) reachable.add(mission.solarSystemId);
  }
  for (const [gateMission, gatedSystem] of SYSTEM_UNLOCK_GATES) {
    if (completedMissions.includes(gateMission)) {
      reachable.add(gatedSystem);
    }
  }
  return reachable;
}

// Compute the credit caps a player with this set of reachable systems is
// allowed to claim. Walks waves of every combat mission in the reachable
// systems to find peak non-boss creditValue (drives per-second cap), and
// cross-references loot pools + boss enemy values for the per-clear cap.
export function computeCreditCapsForSystems(
  reachableSystems: ReadonlySet<SolarSystemId>
): CreditCaps {
  let peakNonBossCredit = 0;
  let maxBossCreditInReach = 0;

  for (const mission of getAllMissions()) {
    if (mission.kind !== "mission") continue;
    if (!reachableSystems.has(mission.solarSystemId)) continue;
    const waves = getWavesForMission(mission.id);
    for (const wave of waves) {
      for (const spawn of wave.spawns) {
        let enemy;
        try {
          enemy = getEnemy(spawn.enemy);
        } catch {
          // Wave references an enemy id we no longer recognise. Skip
          // rather than throw — data integrity is its own test layer.
          continue;
        }
        if (enemy.behavior === "boss") {
          if (enemy.creditValue > maxBossCreditInReach) {
            maxBossCreditInReach = enemy.creditValue;
          }
        } else if (enemy.creditValue > peakNonBossCredit) {
          peakNonBossCredit = enemy.creditValue;
        }
      }
    }
  }

  let maxLootCreditInReach = 0;
  for (const pool of getAllLootPools()) {
    if (!reachableSystems.has(pool.systemId)) continue;
    if (pool.credits.max > maxLootCreditInReach) {
      maxLootCreditInReach = pool.credits.max;
    }
  }

  return {
    maxPerSecond:
      peakNonBossCredit * KILL_CADENCE_CEILING * PER_SECOND_SAFETY_FACTOR,
    maxPerFirstClear: Math.ceil(
      (maxLootCreditInReach + maxBossCreditInReach) * PER_CLEAR_SAFETY_FACTOR
    )
  };
}

// Convenience composition for callers that only have completedMissions.
export function computeCreditCapsForPlayer(
  completedMissions: readonly MissionId[]
): CreditCaps {
  return computeCreditCapsForSystems(getReachableSolarSystems(completedMissions));
}

// Surface the tutorial-only baseline caps once on cold start so a
// regression after a balance change shows up during local dev without
// needing extra instrumentation. Tutorial-only is the floor — every
// other player gets at least these caps. Dev-only: the gate must NOT
// fire on Vercel Edge production cold starts (process is shimmed there
// and NODE_ENV === "production"), which would log on every cold start
// of /api/save and /api/leaderboard.
if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
  const tutorialCaps = computeCreditCapsForSystems(new Set(["tutorial"]));
  // eslint-disable-next-line no-console
  console.log("[saveValidation] tutorial-only caps (floor)", {
    maxPerSecond: tutorialCaps.maxPerSecond,
    maxPerFirstClear: tutorialCaps.maxPerFirstClear,
    CREDITS_DELTA_SLACK
  });
}

// Aggregate ceiling across ALL systems — exposed for legacy callers that
// don't know about per-player progression yet. Equals what the most
// progressed player would see; used by /api/save when reading the prior
// save row's completedMissions falls back to "no prior row".
export const GLOBAL_CREDIT_CAPS: CreditCaps = computeCreditCapsForSystems(
  new Set(getAllLootPools().map((p) => p.systemId))
);

// Deprecated single-value accessors kept for backwards compatibility with
// older tests and call sites. Prefer per-player caps via
// computeCreditCapsForPlayer for any new code.
export const MAX_CREDITS_PER_SECOND = GLOBAL_CREDIT_CAPS.maxPerSecond;
export const MAX_CREDITS_PER_FIRST_CLEAR = GLOBAL_CREDIT_CAPS.maxPerFirstClear;

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
  // Per-player cap. Optional for backwards compatibility — defaults to
  // GLOBAL_CREDIT_CAPS (the tutorial+all-systems aggregate ceiling). New
  // callers should always pass per-player caps from
  // computeCreditCapsForPlayer(completedMissions) so the cap reflects the
  // player's actual progression.
  readonly caps?: CreditCaps;
}

// Reject saves whose credits jumped by more than the player could plausibly
// have earned since the previous save. Spending (negative delta) is always
// allowed — the market drains credits and we don't want to police that.
export function validateCreditsDelta(input: CreditsDeltaInput): ValidationResult {
  const { prev, next, caps = GLOBAL_CREDIT_CAPS } = input;
  const prevCredits = prev?.credits ?? 0;
  const prevTime = prev?.playedTimeSeconds ?? 0;
  const prevCompleted = prev?.completedMissionsCount ?? 0;

  const deltaCredits = next.credits - prevCredits;
  if (deltaCredits <= 0) return { ok: true };

  const deltaTime = Math.max(0, next.playedTimeSeconds - prevTime);
  const deltaCompleted = Math.max(0, next.completedMissionsCount - prevCompleted);

  const maxDelta =
    deltaTime * caps.maxPerSecond +
    deltaCompleted * caps.maxPerFirstClear +
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

// ---------------------------------------------------------------------------
// Save-state regression guard
// ---------------------------------------------------------------------------
// `validateCreditsDelta` and `validatePlaytimeDelta` only catch INFLATION —
// cheating UP. They explicitly allow regression (credits going down, playtime
// going down) because spending credits in the shop is a legitimate down-delta
// for credits, and the playtime guard short-circuits on negative deltas.
//
// The hole that left: any client path that POSTs an empty/default snapshot
// (credits=0, completedMissions=[], playedTimeSeconds=0) blows away a real
// save. This is exactly what wiped numminen.mikko.petteri@gmail.com's row at
// 2026-05-02 21:51:54 — months of progression destroyed by a single POST that
// the server happily accepted because the down-delta passed the cheat checks.
//
// This guard rejects three regression patterns a legitimate client never
// produces. Each is "the new state is strictly less than the prior state in
// a field that NEVER decreases under normal play":
//
//   1. completedMissions shrunk — once a mission is in the list it never
//      leaves (no "un-complete" mutator exists in the client).
//   2. playedTimeSeconds dropped — playtime is monotonic; only saveNow
//      increments it via addPlayedTime.
//   3. credits collapsed to 0 while prior credits were non-trivial AND
//      completedMissions also shrunk — pure credits down-delta is allowed
//      (shop), but credits→0 paired with a missions regression is the
//      INITIAL_STATE wipe signature, not a legitimate spend.
//
// Why all three together vs just a single check:
//   - A player CAN spend their entire credits balance at the market — that
//     alone is a valid down-delta. Don't reject it.
//   - A player's playtime can be equal to the prior value (no time elapsed),
//     but never less. The strict `<` catches the wipe without false positives.
//   - completedMissions strictly never shrinks under any client flow.
//
// Pure function so the route can call it after the existing graph/playtime/
// credits guards without any I/O.

export interface RegressionGuardInput {
  readonly prev: {
    readonly credits: number;
    readonly playedTimeSeconds: number;
    readonly completedMissions: readonly MissionId[];
  } | null;
  readonly next: {
    readonly credits: number;
    readonly playedTimeSeconds: number;
    readonly completedMissions: readonly MissionId[];
  };
}

export function validateNoRegression(input: RegressionGuardInput): ValidationResult {
  const { prev, next } = input;
  // No prior row → first save → nothing to regress from.
  if (!prev) return { ok: true };

  // Mission list shrank. Even one mission missing is a regression — clients
  // never un-complete missions.
  const prevMissions = new Set(prev.completedMissions);
  const missingMissions: MissionId[] = [];
  for (const id of prevMissions) {
    if (!next.completedMissions.includes(id)) missingMissions.push(id);
  }
  if (missingMissions.length > 0) {
    return {
      ok: false,
      error: `completedMissions regressed — missing previously-completed: ${missingMissions.join(", ")}`
    };
  }

  // Playtime moved backwards. Equal is fine (no-op save), strictly less is not.
  if (next.playedTimeSeconds < prev.playedTimeSeconds) {
    return {
      ok: false,
      error: `playedTimeSeconds regressed from ${prev.playedTimeSeconds} to ${next.playedTimeSeconds}`
    };
  }

  // Credits collapsed to 0 while prior was substantial. Pair this with a
  // missions check (already passed above by reaching here) so a legitimate
  // shop spend that drains credits doesn't trip the guard.
  //
  // The "1 credit" threshold is the absolute minimum to distinguish "real
  // collapse" from "player just spent everything to 0" — but at this point
  // we already know completedMissions didn't shrink, so a credits=0 next
  // alongside non-zero prev is a legit "spent everything" save.
  //
  // What we DO want to catch is the wipe pattern: credits collapsed AND
  // playtime collapsed (caught above) — but the playtime check above is
  // already strict, so any wipe with playtime=0 < prev_playtime > 0 is
  // already rejected. This block stays as documentation; the playtime +
  // missions checks together cover the wipe signature.

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

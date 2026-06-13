// PUBLIC API — every export from this file is part of the `content` module's contract.
//   See ./README.md for the rationale.
//
// Pure progress-evaluation against the mission catalog: given the player's
// completed set plus the mission they just finished, decide whether that
// victory cleared the current solar system and/or every unlocked system.
//
// This lives in `content` (not `audio`) because it reads the mission roster
// via getAllMissions(). The audio cue engine (clearedStateCue.ts) consumes
// the two booleans this returns and stays a types-only module — see
// docs/audit/04-found-bugs.md 2026-06-13 (audio → content edge closed).

import type { MissionId, SolarSystemId } from "@/types";
import { getAllMissions } from "./missions";

/**
 * Inputs for {@link evaluateClearedBoundaries}. `completedMissions` is the
 * player's set BEFORE this victory; `justCompletedMissionId` is folded in.
 *
 * @stable Part of `content` public API.
 */
export interface ClearedBoundariesInput {
  readonly justCompletedMissionId: MissionId;
  readonly completedMissions: readonly MissionId[];
  readonly currentSolarSystemId: SolarSystemId;
  readonly unlockedSolarSystems: readonly SolarSystemId[];
}

/**
 * Whether the just-finished victory flipped the player to a cleared boundary.
 *
 * - `systemNowCleared` — every combat mission in the CURRENT solar system done.
 * - `everythingNowCleared` — every combat mission in every UNLOCKED system done.
 *
 * Both consider only `kind: "mission"` entries (shop/hub planets are excluded)
 * and require at least one such mission to exist, so an empty/locked system
 * never reports "cleared".
 *
 * @stable Part of `content` public API.
 */
export function evaluateClearedBoundaries(
  input: ClearedBoundariesInput
): { systemNowCleared: boolean; everythingNowCleared: boolean } {
  const {
    justCompletedMissionId,
    completedMissions,
    currentSolarSystemId,
    unlockedSolarSystems
  } = input;

  const nextCompleted = new Set<MissionId>([...completedMissions, justCompletedMissionId]);
  const allMissions = getAllMissions().filter((m) => m.kind === "mission");

  const systemMissions = allMissions.filter((m) => m.solarSystemId === currentSolarSystemId);
  const systemNowCleared =
    systemMissions.length > 0 && systemMissions.every((m) => nextCompleted.has(m.id));

  // "Available content" = missions in unlocked systems. Locked systems'
  // missions can't be cleared yet anyway, so this matches the wording
  // "they're cooking up more, have a sit".
  const unlockedSet = new Set<SolarSystemId>(unlockedSolarSystems);
  const availableMissions = allMissions.filter((m) => unlockedSet.has(m.solarSystemId));
  const everythingNowCleared =
    availableMissions.length > 0 && availableMissions.every((m) => nextCompleted.has(m.id));

  return { systemNowCleared, everythingNowCleared };
}

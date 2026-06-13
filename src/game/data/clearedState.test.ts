import { describe, expect, it } from "vitest";
import type { MissionId, SolarSystemId } from "@/types";
import { getAllMissions } from "./missions";
import { evaluateClearedBoundaries } from "./clearedState";

// evaluateClearedBoundaries computes, from the live mission catalog + the
// player's progress, whether a victory cleared the current system and/or every
// unlocked system. This is the roster/progress math that used to live inside
// the audio cue engine (clearedStateCue.ts) before the 2026-06-13 boundary
// fix — see docs/audit/04-found-bugs.md.

const TUTORIAL: SolarSystemId = "tutorial";
const TUBERNOVAE: SolarSystemId = "tubernovae";

function getMissionIds(systemId: SolarSystemId): MissionId[] {
  return getAllMissions()
    .filter((m) => m.solarSystemId === systemId && m.kind === "mission")
    .map((m) => m.id);
}

describe("evaluateClearedBoundaries", () => {
  it("reports neither cleared when most missions are still open", () => {
    const result = evaluateClearedBoundaries({
      justCompletedMissionId: "tutorial" as MissionId,
      completedMissions: [],
      currentSolarSystemId: TUTORIAL,
      unlockedSolarSystems: [TUTORIAL]
    });
    expect(result.systemNowCleared).toBe(false);
    expect(result.everythingNowCleared).toBe(false);
  });

  it("reports systemNowCleared (but not everything) when the current system flips cleared while another unlocked system has open missions", () => {
    const tutorialIds = getMissionIds(TUTORIAL);
    const lastTutorial = tutorialIds[tutorialIds.length - 1];
    if (!lastTutorial) throw new Error("tutorial has no missions to test against");

    const result = evaluateClearedBoundaries({
      justCompletedMissionId: lastTutorial,
      completedMissions: tutorialIds.slice(0, -1),
      currentSolarSystemId: TUTORIAL,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    expect(result.systemNowCleared).toBe(true);
    expect(result.everythingNowCleared).toBe(false);
  });

  it("reports everythingNowCleared when the last mission across all unlocked systems completes", () => {
    const all = [...getMissionIds(TUTORIAL), ...getMissionIds(TUBERNOVAE)];
    const last = all[all.length - 1];
    if (!last) throw new Error("no missions to test against");

    const result = evaluateClearedBoundaries({
      justCompletedMissionId: last,
      completedMissions: all.slice(0, -1),
      currentSolarSystemId: TUBERNOVAE,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    expect(result.everythingNowCleared).toBe(true);
    // The current system (tubernovae) is also fully cleared, so systemNowCleared
    // is true too; the audio engine is responsible for suppressing the
    // system cue when everything cleared — that policy is tested there.
    expect(result.systemNowCleared).toBe(true);
  });

  it("does not report systemNowCleared for an empty/locked system (no missions)", () => {
    // A solar system the player isn't in and that has no missions in the
    // catalog must never report cleared (guards the .length > 0 check).
    const result = evaluateClearedBoundaries({
      justCompletedMissionId: "tutorial" as MissionId,
      completedMissions: getMissionIds(TUTORIAL),
      currentSolarSystemId: "no-such-system" as SolarSystemId,
      unlockedSolarSystems: ["no-such-system" as SolarSystemId]
    });
    expect(result.systemNowCleared).toBe(false);
    expect(result.everythingNowCleared).toBe(false);
  });
});

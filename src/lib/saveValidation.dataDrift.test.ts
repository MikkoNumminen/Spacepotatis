import { describe, expect, it, vi } from "vitest";

// Drift defense: the body of computeCreditCapsForSystems wraps getEnemy(...)
// in a try/catch so that a wave referencing a stale enemy id (after a
// rename / removal that didn't sweep waves.json) doesn't bring down the
// whole save validator. Mock the wave + enemy registries so we can drop a
// truly unknown id into the wave list and pin that the function returns
// a finite, non-throwing CreditCaps.

vi.mock("@/game/data/waves", () => ({
  getWavesForMission: (missionId: string) => {
    if (missionId === "tutorial") {
      return [
        {
          spawns: [
            // Real enemy id from enemies.json.
            { enemy: "aphid", count: 1 },
            // Fake enemy id — the swallowed catch should skip this entry
            // rather than throw out of the whole computation.
            { enemy: "ghost-enemy-that-no-longer-exists", count: 1 }
          ]
        }
      ];
    }
    return [];
  },
  getAllMissionWaves: () => []
}));

describe("computeCreditCapsForSystems data-drift defense", () => {
  it("does not throw when waves reference an unknown enemy id", async () => {
    const { computeCreditCapsForSystems } = await import("./saveValidation");
    expect(() =>
      computeCreditCapsForSystems(new Set(["tutorial"]))
    ).not.toThrow();
  });

  it("returns finite, non-negative caps when waves contain orphan refs", async () => {
    const { computeCreditCapsForSystems } = await import("./saveValidation");
    const caps = computeCreditCapsForSystems(new Set(["tutorial"]));
    expect(Number.isFinite(caps.maxPerSecond)).toBe(true);
    expect(Number.isFinite(caps.maxPerFirstClear)).toBe(true);
    expect(caps.maxPerSecond).toBeGreaterThanOrEqual(0);
    expect(caps.maxPerFirstClear).toBeGreaterThanOrEqual(0);
  });

  it("the orphan ref does not contribute to the cap (good enemy still drives it)", async () => {
    // With a single real enemy in the wave list and one unknown id, the cap
    // should reflect ONLY the real enemy's creditValue. Pinning that the
    // skipped row didn't bump the per-second cap upward.
    const { computeCreditCapsForSystems } = await import("./saveValidation");
    const { getEnemy } = await import("@/game/data/enemies");
    const caps = computeCreditCapsForSystems(new Set(["tutorial"]));
    const aphid = getEnemy("aphid");
    // KILL_CADENCE_CEILING (5) * PER_SECOND_SAFETY_FACTOR (3) = 15
    const expectedMaxPerSecond =
      aphid.behavior === "boss" ? 0 : aphid.creditValue * 15;
    expect(caps.maxPerSecond).toBe(expectedMaxPerSecond);
  });
});

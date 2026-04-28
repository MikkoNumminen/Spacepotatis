import { describe, expect, it } from "vitest";
import {
  CREDITS_DELTA_SLACK,
  MAX_CREDITS_PER_FIRST_CLEAR,
  MAX_CREDITS_PER_SECOND,
  validateCreditsDelta,
  validateMissionGraph
} from "./saveValidation";

describe("validateMissionGraph", () => {
  it("accepts an empty save", () => {
    expect(
      validateMissionGraph({ completedMissions: [], unlockedPlanets: [] }).ok
    ).toBe(true);
  });

  it("accepts a legitimate clear chain", () => {
    expect(
      validateMissionGraph({
        completedMissions: ["tutorial", "combat-1", "boss-1"],
        unlockedPlanets: ["tutorial", "combat-1", "boss-1", "pirate-beacon"]
      }).ok
    ).toBe(true);
  });

  it("rejects completing a mission whose prereq is missing", () => {
    const result = validateMissionGraph({
      // ember-run requires pirate-beacon — not in completedMissions.
      completedMissions: ["tutorial", "ember-run"],
      unlockedPlanets: ["tutorial", "ember-run"]
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ember-run");
    expect(result.error).toContain("pirate-beacon");
  });

  it("rejects unlocking a combat planet whose prereq is missing", () => {
    const result = validateMissionGraph({
      completedMissions: ["tutorial"],
      // burnt-spud requires ember-run — not in completedMissions.
      unlockedPlanets: ["tutorial", "burnt-spud"]
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("burnt-spud");
  });

  it("allows shop / scenery planets to be unlocked freely", () => {
    expect(
      validateMissionGraph({
        completedMissions: [],
        // market is kind: "shop", shop is kind: "scenery" — neither has
        // gameplay prereqs even though their `requires` may be empty.
        unlockedPlanets: ["market", "shop", "tubernovae-outpost"]
      }).ok
    ).toBe(true);
  });
});

describe("validateCreditsDelta", () => {
  it("allows the first save when credits fit within the playtime + clears budget", () => {
    expect(
      validateCreditsDelta({
        prev: null,
        next: {
          credits: 500,
          playedTimeSeconds: 60,
          completedMissionsCount: 1
        }
      }).ok
    ).toBe(true);
  });

  it("rejects the first save when credits dwarf the time + clears budget", () => {
    const result = validateCreditsDelta({
      prev: null,
      next: {
        credits: 999_999,
        playedTimeSeconds: 60,
        completedMissionsCount: 1
      }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("999999");
  });

  it("allows spending (negative delta) without checks", () => {
    // Player drained credits at the market — never reject this.
    expect(
      validateCreditsDelta({
        prev: { credits: 1000, playedTimeSeconds: 100, completedMissionsCount: 1 },
        next: { credits: 100, playedTimeSeconds: 100, completedMissionsCount: 1 }
      }).ok
    ).toBe(true);
  });

  it("allows credits to grow within the per-second + per-clear budget", () => {
    expect(
      validateCreditsDelta({
        prev: { credits: 100, playedTimeSeconds: 60, completedMissionsCount: 1 },
        next: {
          // +60s of play, +1 first clear, +500 credits. Within budget.
          credits: 600,
          playedTimeSeconds: 120,
          completedMissionsCount: 2
        }
      }).ok
    ).toBe(true);
  });

  it("rejects credits jumping with no playtime and no new completions", () => {
    // Classic DevTools cheat: open console, set credits, save again.
    const result = validateCreditsDelta({
      prev: { credits: 100, playedTimeSeconds: 60, completedMissionsCount: 1 },
      next: { credits: 1_000_000, playedTimeSeconds: 60, completedMissionsCount: 1 }
    });
    expect(result.ok).toBe(false);
  });

  it("allows a small credits jump with no playtime (covered by the slack)", () => {
    expect(
      validateCreditsDelta({
        prev: { credits: 100, playedTimeSeconds: 60, completedMissionsCount: 1 },
        next: {
          credits: 100 + CREDITS_DELTA_SLACK,
          playedTimeSeconds: 60,
          completedMissionsCount: 1
        }
      }).ok
    ).toBe(true);
  });

  it("scales the budget linearly with delta_time", () => {
    // 600 seconds = 60_000 credits at the per-second cap.
    const allowed = 600 * MAX_CREDITS_PER_SECOND;
    expect(
      validateCreditsDelta({
        prev: { credits: 0, playedTimeSeconds: 0, completedMissionsCount: 0 },
        next: { credits: allowed, playedTimeSeconds: 600, completedMissionsCount: 0 }
      }).ok
    ).toBe(true);
  });

  it("scales the budget by completion count", () => {
    // 3 first clears = 3 * MAX_CREDITS_PER_FIRST_CLEAR + slack, no playtime.
    const allowed = 3 * MAX_CREDITS_PER_FIRST_CLEAR + CREDITS_DELTA_SLACK;
    expect(
      validateCreditsDelta({
        prev: { credits: 0, playedTimeSeconds: 0, completedMissionsCount: 0 },
        next: { credits: allowed, playedTimeSeconds: 0, completedMissionsCount: 3 }
      }).ok
    ).toBe(true);
  });
});

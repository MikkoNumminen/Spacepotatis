import { describe, expect, it } from "vitest";
import {
  CREDITS_DELTA_SLACK,
  MAX_CREDITS_PER_FIRST_CLEAR,
  MAX_CREDITS_PER_SECOND,
  PLAYTIME_DELTA_SLACK_SECONDS,
  validateCreditsDelta,
  validateMissionGraph,
  validatePlaytimeDelta
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

describe("validatePlaytimeDelta", () => {
  // Fixed reference point so all wall-clock math is deterministic.
  const T0 = new Date("2026-04-28T12:00:00.000Z");
  const T0_MS = T0.getTime();

  it("allows the first save (no prev row)", () => {
    expect(
      validatePlaytimeDelta({
        prev: null,
        next: { playedTimeSeconds: 99_999 },
        nowMs: T0_MS
      }).ok
    ).toBe(true);
  });

  it("allows playtime growing within real wall-clock seconds (plus slack)", () => {
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 100, updatedAt: T0 },
        // 5 minutes later, claimed 4 minutes of new play. Plausible.
        next: { playedTimeSeconds: 100 + 240 },
        nowMs: T0_MS + 5 * 60 * 1000
      }).ok
    ).toBe(true);
  });

  it("allows the boundary case: delta exactly equal to elapsed + slack", () => {
    const elapsed = 600; // 10 minutes
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 0, updatedAt: T0 },
        next: { playedTimeSeconds: elapsed + PLAYTIME_DELTA_SLACK_SECONDS },
        nowMs: T0_MS + elapsed * 1000
      }).ok
    ).toBe(true);
  });

  it("rejects playtime jumping farther than wall-clock allows (closes credits-cap escape hatch)", () => {
    const result = validatePlaytimeDelta({
      prev: { playedTimeSeconds: 60, updatedAt: T0 },
      // Cheater claims +100k playtime to inflate the credits-delta cap,
      // but only 30 seconds of real time have passed.
      next: { playedTimeSeconds: 60 + 100_000 },
      nowMs: T0_MS + 30 * 1000
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("100000");
  });

  it("allows zero or negative delta (post-reset, double-save races)", () => {
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 1000, updatedAt: T0 },
        next: { playedTimeSeconds: 1000 },
        nowMs: T0_MS + 1_000_000
      }).ok
    ).toBe(true);
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 1000, updatedAt: T0 },
        next: { playedTimeSeconds: 0 },
        nowMs: T0_MS + 1_000_000
      }).ok
    ).toBe(true);
  });

  it("accepts updatedAt as an ISO string (Neon Edge driver returns strings)", () => {
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 0, updatedAt: T0.toISOString() },
        next: { playedTimeSeconds: 30 },
        nowMs: T0_MS + 60 * 1000
      }).ok
    ).toBe(true);
  });

  it("fails open if the prev timestamp is unparseable", () => {
    // Defensive: bad DB data shouldn't lock anyone out of saving. The
    // credits cap is still in effect via validateCreditsDelta.
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 0, updatedAt: "not-a-date" },
        next: { playedTimeSeconds: 99_999 },
        nowMs: T0_MS
      }).ok
    ).toBe(true);
  });
});

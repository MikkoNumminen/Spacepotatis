import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CREDITS_DELTA_SLACK,
  GLOBAL_CREDIT_CAPS,
  MAX_CREDITS_PER_FIRST_CLEAR,
  MAX_CREDITS_PER_SECOND,
  PLAYTIME_DELTA_SLACK_SECONDS,
  computeCreditCapsForPlayer,
  computeCreditCapsForSystems,
  getReachableSolarSystems,
  validateCreditsDelta,
  validateMissionGraph,
  validateNoRegression,
  validatePlaytimeDelta
} from "./saveValidation";

// Fixed reference point so all wall-clock math is deterministic. Used by
// every validatePlaytimeDelta test.
const T0 = new Date("2026-04-28T12:00:00.000Z");
const T0_MS = T0.getTime();

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

describe("getReachableSolarSystems", () => {
  it("includes the tutorial system for a brand-new player", () => {
    const reachable = getReachableSolarSystems([]);
    expect(reachable.has("tutorial")).toBe(true);
    expect(reachable.has("tubernovae")).toBe(false);
  });

  it("includes tubernovae once boss-1 is completed (gate fired)", () => {
    const reachable = getReachableSolarSystems(["tutorial", "combat-1", "boss-1"]);
    expect(reachable.has("tutorial")).toBe(true);
    expect(reachable.has("tubernovae")).toBe(true);
  });

  it("includes a system the moment the player completes any mission in it", () => {
    // Even without the formal unlock gate, completing a mission proves
    // the player has been in that system — counts toward their reach.
    const reachable = getReachableSolarSystems(["pirate-beacon"]);
    expect(reachable.has("tutorial")).toBe(true);
    expect(reachable.has("tubernovae")).toBe(true);
  });

  it("ignores unknown mission ids defensively", () => {
    // safeGetMission swallows the throw — schema-layer rejects already
    // catch unknown ids, this is just defensive against future drift.
    const reachable = getReachableSolarSystems(["totally-not-a-real-mission" as never]);
    expect(reachable.has("tutorial")).toBe(true);
  });
});

describe("computeCreditCapsForSystems / computeCreditCapsForPlayer", () => {
  it("tutorial-only caps are strictly LESS THAN OR EQUAL TO global caps", () => {
    const tutorialCaps = computeCreditCapsForSystems(new Set(["tutorial"]));
    expect(tutorialCaps.maxPerSecond).toBeLessThanOrEqual(GLOBAL_CREDIT_CAPS.maxPerSecond);
    expect(tutorialCaps.maxPerFirstClear).toBeLessThanOrEqual(GLOBAL_CREDIT_CAPS.maxPerFirstClear);
  });

  it("unlocking tubernovae cannot LOWER the player's caps (monotonic)", () => {
    const tutorialCaps = computeCreditCapsForPlayer(["tutorial", "combat-1"]);
    const tubernovaeCaps = computeCreditCapsForPlayer(["tutorial", "combat-1", "boss-1"]);
    expect(tubernovaeCaps.maxPerSecond).toBeGreaterThanOrEqual(tutorialCaps.maxPerSecond);
    expect(tubernovaeCaps.maxPerFirstClear).toBeGreaterThanOrEqual(tutorialCaps.maxPerFirstClear);
  });

  it("a brand-new player's caps are derived purely from the tutorial system", () => {
    const newPlayerCaps = computeCreditCapsForPlayer([]);
    const tutorialCaps = computeCreditCapsForSystems(new Set(["tutorial"]));
    expect(newPlayerCaps).toEqual(tutorialCaps);
  });

  it("caps are positive numbers (the data isn't degenerate)", () => {
    const caps = computeCreditCapsForPlayer([]);
    expect(caps.maxPerSecond).toBeGreaterThan(0);
    expect(caps.maxPerFirstClear).toBeGreaterThan(0);
  });
});

describe("validateCreditsDelta with per-player caps", () => {
  it("a new player's small credit delta passes against tutorial caps", () => {
    const caps = computeCreditCapsForPlayer([]);
    expect(
      validateCreditsDelta({
        prev: null,
        next: { credits: 200, playedTimeSeconds: 60, completedMissionsCount: 1 },
        caps
      }).ok
    ).toBe(true);
  });

  it("rejects a tubernovae-tier credit jump for a player still in tutorial", () => {
    // A player who's only completed tutorial missions tries to claim
    // credits that would only be plausible with tubernovae loot rewards.
    // Their per-clear cap (tutorial only, max 500 from loot pool + 500
    // from boss kill) shouldn't admit a 5000-credit single-clear bonus.
    const tutorialCaps = computeCreditCapsForPlayer(["tutorial"]);
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 60, completedMissionsCount: 1 },
      next: { credits: 5000, playedTimeSeconds: 60, completedMissionsCount: 2 },
      caps: tutorialCaps
    });
    // Cap is roughly: 0 (no playtime delta) + 1 * tutorialCaps.maxPerFirstClear + 100 slack.
    // Tutorial maxPerFirstClear ≈ ceil((500 + 500) * 1.5) = 1500.
    // 5000 - 0 = 5000 > 1500 + 100 = 1600 → rejected.
    expect(result.ok).toBe(false);
  });

  it("the same delta passes for a tubernovae-unlocked player (cap expanded)", () => {
    const tubernovaeCaps = computeCreditCapsForPlayer(["tutorial", "combat-1", "boss-1"]);
    expect(
      validateCreditsDelta({
        prev: { credits: 0, playedTimeSeconds: 60, completedMissionsCount: 3 },
        next: { credits: 2000, playedTimeSeconds: 60, completedMissionsCount: 4 },
        caps: tubernovaeCaps
      }).ok
    ).toBe(true);
  });
});

describe("module-load diagnostics", () => {
  // The cold-start console.log block must NOT fire on Vercel Edge
  // production (process is shimmed there and NODE_ENV === "production"),
  // otherwise every cold start of /api/save and /api/leaderboard logs.
  // It SHOULD still fire in development as a regression aid.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does NOT log on cold start when NODE_ENV is production", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    await import("./saveValidation");
    const fired = logSpy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("[saveValidation]")
    );
    expect(fired).toBe(false);
  });

  it("DOES log on cold start when NODE_ENV is development", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    await import("./saveValidation");
    const fired = logSpy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("[saveValidation]")
    );
    expect(fired).toBe(true);
  });
});

describe("validateCreditsDelta floor-clamp on negative deltaTime (post-reset re-save)", () => {
  // The line `Math.max(0, next.playedTimeSeconds - prevTime)` clamps a backward
  // playtime to 0. A reset-and-resave shouldn't crater the cap into negatives
  // (which would make every delta exceed an effectively-negative budget).
  it("clamps deltaTime to 0 when next.playedTimeSeconds < prev.playedTimeSeconds", () => {
    // Backward time travel + small positive credits delta still under
    // (1 first clear) * cap + slack should pass.
    const result = validateCreditsDelta({
      prev: { credits: 100, playedTimeSeconds: 1000, completedMissionsCount: 0 },
      next: {
        credits: 100 + CREDITS_DELTA_SLACK,
        playedTimeSeconds: 0,
        completedMissionsCount: 1
      }
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a large positive credits delta even with a backward playtime delta (deltaTime is clamped, not negative)", () => {
    // If deltaTime were -1000, that would multiply the cap into negative
    // territory and *every* positive credit delta would fail — but the
    // floor-clamp prevents that pathology. Instead, the cap is exactly:
    //   0 (clamped) * maxPerSecond + 0 * maxPerFirstClear + slack = slack.
    // A 999_999 delta is still way over budget.
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 1000, completedMissionsCount: 1 },
      next: {
        credits: 999_999,
        playedTimeSeconds: 0,
        completedMissionsCount: 1
      }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("delta_time=0s");
  });

  it("clamps deltaCompleted to 0 when next.completedMissionsCount < prev.completedMissionsCount", () => {
    // A weird shape but legal at the API boundary (Zod doesn't tie them
    // together). The clamp prevents the formula from going negative.
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 60, completedMissionsCount: 5 },
      next: {
        credits: CREDITS_DELTA_SLACK,
        playedTimeSeconds: 60,
        completedMissionsCount: 1
      }
    });
    // delta_time=0, delta_completed clamped to 0, slack only — still admits 100.
    expect(result.ok).toBe(true);
  });

  it("rejects a large positive credits delta when both deltas clamp to 0 (only slack admits credits)", () => {
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 1000, completedMissionsCount: 5 },
      next: {
        credits: 50_000,
        playedTimeSeconds: 500,
        completedMissionsCount: 0
      }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("delta_time=0s");
    expect(result.error).toContain("delta_completed=0");
  });
});

describe("validatePlaytimeDelta boundary at exactly nowMs === prevUpdatedMs", () => {
  // wallClockSeconds = max(0, (nowMs - prevUpdatedMs) / 1000) → 0 for a
  // simultaneous-millisecond double-save. allowedDelta is exactly the
  // PLAYTIME_DELTA_SLACK_SECONDS slack.
  it("accepts a delta within the slack when nowMs === prevUpdatedMs", () => {
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 100, updatedAt: T0 },
        next: { playedTimeSeconds: 100 + PLAYTIME_DELTA_SLACK_SECONDS },
        nowMs: T0_MS
      }).ok
    ).toBe(true);
  });

  it("rejects a delta past the slack when nowMs === prevUpdatedMs", () => {
    const result = validatePlaytimeDelta({
      prev: { playedTimeSeconds: 100, updatedAt: T0 },
      next: { playedTimeSeconds: 100 + PLAYTIME_DELTA_SLACK_SECONDS + 1 },
      nowMs: T0_MS
    });
    expect(result.ok).toBe(false);
  });

  it("clamps wallClockSeconds to 0 when nowMs < prevUpdatedMs (negative skew)", () => {
    // Server clock skew or stale prev row: the floor-clamp should keep the
    // budget at exactly the slack.
    expect(
      validatePlaytimeDelta({
        prev: { playedTimeSeconds: 0, updatedAt: T0 },
        next: { playedTimeSeconds: PLAYTIME_DELTA_SLACK_SECONDS },
        nowMs: T0_MS - 5000
      }).ok
    ).toBe(true);
    const result = validatePlaytimeDelta({
      prev: { playedTimeSeconds: 0, updatedAt: T0 },
      next: { playedTimeSeconds: PLAYTIME_DELTA_SLACK_SECONDS + 1 },
      nowMs: T0_MS - 5000
    });
    expect(result.ok).toBe(false);
  });
});

// validateNoRegression — defense against the INITIAL_STATE wipe pattern.
// A buggy or stale client that POSTs default state on top of a real save
// would otherwise pass every existing guard (the cheat-deltas only catch
// inflation; missing/empty fields look like 0-deltas, which the credits
// guard explicitly accepts). This test pins the regression scenarios.
describe("validateNoRegression", () => {
  const realPrev = {
    credits: 5000,
    playedTimeSeconds: 1800,
    completedMissions: [
      "tutorial",
      "combat-1",
      "boss-1",
      "pirate-beacon"
    ] as const
  };

  it("accepts the first save (no prior row)", () => {
    expect(
      validateNoRegression({
        prev: null,
        next: {
          credits: 100,
          playedTimeSeconds: 60,
          completedMissions: ["tutorial"]
        }
      }).ok
    ).toBe(true);
  });

  it("rejects the INITIAL_STATE wipe — credits/playtime/missions all collapsed", () => {
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        credits: 0,
        playedTimeSeconds: 0,
        completedMissions: []
      }
    });
    expect(result.ok).toBe(false);
    // Mission regression catches first since it's the strongest signal.
    expect(result.ok === false && result.error).toMatch(/completedMissions regressed/);
  });

  it("rejects a partial mission regression (one mission missing)", () => {
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        credits: 5000,
        playedTimeSeconds: 1800,
        completedMissions: ["tutorial", "combat-1", "boss-1"] // pirate-beacon dropped
      }
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/pirate-beacon/);
  });

  it("rejects a playtime regression even if missions are intact", () => {
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        credits: 5000,
        playedTimeSeconds: 1000, // dropped from 1800
        completedMissions: [...realPrev.completedMissions]
      }
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/playedTimeSeconds regressed/);
  });

  it("accepts an equal playtime (no-op save)", () => {
    expect(
      validateNoRegression({
        prev: realPrev,
        next: {
          credits: realPrev.credits,
          playedTimeSeconds: realPrev.playedTimeSeconds,
          completedMissions: [...realPrev.completedMissions]
        }
      }).ok
    ).toBe(true);
  });

  it("accepts a legitimate shop spend (credits drop, missions intact, playtime grew)", () => {
    expect(
      validateNoRegression({
        prev: realPrev,
        next: {
          credits: 0, // spent all of it
          playedTimeSeconds: realPrev.playedTimeSeconds + 60,
          completedMissions: [...realPrev.completedMissions]
        }
      }).ok
    ).toBe(true);
  });

  it("accepts forward progress (credits up, missions added, playtime up)", () => {
    expect(
      validateNoRegression({
        prev: realPrev,
        next: {
          credits: 6000,
          playedTimeSeconds: 2000,
          completedMissions: [...realPrev.completedMissions, "ember-run"]
        }
      }).ok
    ).toBe(true);
  });

  it("rejects a save with completedMissions reordered AND missing one (set semantics)", () => {
    // Reordering alone is fine; missing one is not. This pins that the check
    // is set-difference, not array equality.
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        credits: 5000,
        playedTimeSeconds: 1800,
        completedMissions: ["pirate-beacon", "boss-1", "tutorial"] // combat-1 dropped, others reordered
      }
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/combat-1/);
  });
});

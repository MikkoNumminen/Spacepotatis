import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CREDITS_DELTA_SLACK,
  GLOBAL_CREDIT_CAPS,
  MAX_CREDITS_PER_FIRST_CLEAR,
  MAX_CREDITS_PER_SECOND,
  MAX_SINGLE_EQUIPMENT_REFUND,
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
          credits: 100 + CREDITS_DELTA_SLACK(),
          playedTimeSeconds: 60,
          completedMissionsCount: 1
        }
      }).ok
    ).toBe(true);
  });

  it("scales the budget linearly with delta_time", () => {
    // 600 seconds = 60_000 credits at the per-second cap.
    const allowed = 600 * MAX_CREDITS_PER_SECOND();
    expect(
      validateCreditsDelta({
        prev: { credits: 0, playedTimeSeconds: 0, completedMissionsCount: 0 },
        next: { credits: allowed, playedTimeSeconds: 600, completedMissionsCount: 0 }
      }).ok
    ).toBe(true);
  });

  it("scales the budget by completion count", () => {
    // 3 first clears = 3 * MAX_CREDITS_PER_FIRST_CLEAR + slack, no playtime.
    const allowed = 3 * MAX_CREDITS_PER_FIRST_CLEAR() + CREDITS_DELTA_SLACK();
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
    expect(tutorialCaps.maxPerSecond).toBeLessThanOrEqual(GLOBAL_CREDIT_CAPS().maxPerSecond);
    expect(tutorialCaps.maxPerFirstClear).toBeLessThanOrEqual(GLOBAL_CREDIT_CAPS().maxPerFirstClear);
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
    // Cap is roughly: 0 (no playtime delta) + 1 * tutorialCaps.maxPerFirstClear
    // + CREDITS_DELTA_SLACK (BASE_SLACK + MAX_SINGLE_EQUIPMENT_REFUND, the
    // worst-case legitimate sell). Tutorial maxPerFirstClear ≈ 1500.
    // MAX_SINGLE_EQUIPMENT_REFUND for the current catalog is ~6900
    // (1400 + 3000 + 2500), so the legit ceiling is ~8500. We push well
    // past that to trigger the reject.
    const tutorialCaps = computeCreditCapsForPlayer(["tutorial"]);
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 60, completedMissionsCount: 1 },
      next: { credits: 50000, playedTimeSeconds: 60, completedMissionsCount: 2 },
      caps: tutorialCaps
    });
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
  //
  // After the lazy-init refactor the log fires on the FIRST CALL to
  // GLOBAL_CREDIT_CAPS() rather than at module import time. The dev-only
  // guard is still in effect — production never logs.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does NOT log when NODE_ENV is production, even after GLOBAL_CREDIT_CAPS() is called", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const mod = await import("./saveValidation");
    mod.GLOBAL_CREDIT_CAPS(); // trigger lazy init
    const fired = logSpy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("[saveValidation]")
    );
    expect(fired).toBe(false);
  });

  it("DOES log on first GLOBAL_CREDIT_CAPS() call when NODE_ENV is development", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const mod = await import("./saveValidation");
    mod.GLOBAL_CREDIT_CAPS(); // trigger lazy init
    const fired = logSpy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("[saveValidation]")
    );
    expect(fired).toBe(true);
  });
});

describe("MAX_SINGLE_EQUIPMENT_REFUND covers a worst-case sell event", () => {
  // PR #159 raised the sell rate to 100%. A player who sells one
  // fully-upgraded fully-augmented weapon gets the full investment back
  // in one transaction, and the saveQueue can land that on a save with
  // deltaTime ≈ 0. The credit-delta cap MUST allow that single-event
  // refund or every Mk5-weapon sell 422s legitimately.

  it("a single max-refund sell with deltaTime ≈ 0 passes the cap", () => {
    // Worst-case: player just sold a fully-decked-out weapon. The save
    // queue debounce fires ~immediately. No mission completion, no time
    // accrual, only the +refund credit delta.
    const caps = computeCreditCapsForPlayer([]);
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 100, completedMissionsCount: 1 },
      next: {
        credits: MAX_SINGLE_EQUIPMENT_REFUND(),
        playedTimeSeconds: 100,
        completedMissionsCount: 1
      },
      caps
    });
    expect(result.ok).toBe(true);
  });

  it("a delta that exceeds the slack by 1 still rejects", () => {
    // Pin the upper bound: anything beyond the slack + per-clear + 0
    // playtime delta is still a cheat signal.
    const caps = computeCreditCapsForPlayer([]);
    // No mission delta either — bare slack is the only allowance.
    const tooMuch = CREDITS_DELTA_SLACK() + 1;
    const result = validateCreditsDelta({
      prev: { credits: 0, playedTimeSeconds: 100, completedMissionsCount: 1 },
      next: {
        credits: tooMuch,
        playedTimeSeconds: 100,
        completedMissionsCount: 1
      },
      caps
    });
    expect(result.ok).toBe(false);
  });

  it("MAX_SINGLE_EQUIPMENT_REFUND is positive and big enough to matter", () => {
    // Smoke test on the catalog-derived constant — if a future balance
    // pass nukes weapon costs we want to know.
    expect(MAX_SINGLE_EQUIPMENT_REFUND()).toBeGreaterThan(1000);
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
        credits: 100 + CREDITS_DELTA_SLACK(),
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
        credits: CREDITS_DELTA_SLACK(),
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
    playedTimeSeconds: 1800,
    completedMissions: [
      "tutorial",
      "combat-1",
      "boss-1",
      "pirate-beacon"
    ] as const,
    unlockedPlanets: [
      "tutorial",
      "shop",
      "market",
      "pirate-beacon",
      "tubernovae-outpost",
      "combat-1",
      "boss-1",
      "ember-run"
    ] as const
  };

  it("accepts the first save (no prior row)", () => {
    expect(
      validateNoRegression({
        prev: null,
        next: {
          playedTimeSeconds: 60,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial", "shop", "market"]
        }
      }).ok
    ).toBe(true);
  });

  it("rejects the INITIAL_STATE wipe — playtime/missions/unlocks all collapsed", () => {
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        playedTimeSeconds: 0,
        completedMissions: [],
        unlockedPlanets: []
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
        playedTimeSeconds: 1800,
        completedMissions: ["tutorial", "combat-1", "boss-1"], // pirate-beacon dropped
        unlockedPlanets: [...realPrev.unlockedPlanets]
      }
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/pirate-beacon/);
  });

  it("rejects an unlocks regression even if missions and playtime are intact", () => {
    // Real wipe scenario for a player whose actual unlocks exceed
    // INITIAL_UNLOCKED — e.g. they have ember-run unlocked but the wipe
    // resets unlockedPlanets to the always-on default subset.
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        playedTimeSeconds: 1800,
        completedMissions: [...realPrev.completedMissions],
        unlockedPlanets: ["tutorial", "shop", "market", "pirate-beacon", "tubernovae-outpost"] // ember-run + combat-1 + boss-1 dropped
      }
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/unlockedPlanets regressed/);
    expect(result.ok === false && result.error).toMatch(/ember-run/);
  });

  it("rejects a playtime regression even if missions and unlocks are intact", () => {
    const result = validateNoRegression({
      prev: realPrev,
      next: {
        playedTimeSeconds: 1000, // dropped from 1800
        completedMissions: [...realPrev.completedMissions],
        unlockedPlanets: [...realPrev.unlockedPlanets]
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
          playedTimeSeconds: realPrev.playedTimeSeconds,
          completedMissions: [...realPrev.completedMissions],
          unlockedPlanets: [...realPrev.unlockedPlanets]
        }
      }).ok
    ).toBe(true);
  });

  it("accepts a legitimate shop spend (missions/unlocks intact, playtime grew)", () => {
    // Credits aren't part of the regression guard at all — the market
    // legitimately drains them and we don't want the guard to police that.
    expect(
      validateNoRegression({
        prev: realPrev,
        next: {
          playedTimeSeconds: realPrev.playedTimeSeconds + 60,
          completedMissions: [...realPrev.completedMissions],
          unlockedPlanets: [...realPrev.unlockedPlanets]
        }
      }).ok
    ).toBe(true);
  });

  it("accepts forward progress (missions added, unlocks added, playtime up)", () => {
    expect(
      validateNoRegression({
        prev: realPrev,
        next: {
          playedTimeSeconds: 2000,
          completedMissions: [...realPrev.completedMissions, "ember-run"],
          unlockedPlanets: [...realPrev.unlockedPlanets, "burnt-spud"]
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
        playedTimeSeconds: 1800,
        completedMissions: ["pirate-beacon", "boss-1", "tutorial"], // combat-1 dropped, others reordered
        unlockedPlanets: [...realPrev.unlockedPlanets]
      }
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/combat-1/);
  });

  it("accepts unlockedPlanets reordering with the same set", () => {
    expect(
      validateNoRegression({
        prev: realPrev,
        next: {
          playedTimeSeconds: realPrev.playedTimeSeconds,
          completedMissions: [...realPrev.completedMissions],
          // Same set, different order
          unlockedPlanets: [...realPrev.unlockedPlanets].reverse()
        }
      }).ok
    ).toBe(true);
  });

  // seenStoryEntries is a fourth monotonic field — markStorySeen is append-only
  // (stateCore.ts:131-135), and a partial POST that omits the field coalesces
  // to [] server-side. Without this guard, cross-device players lose story
  // history silently (the local seenStoriesLocal.ts backup only masks the
  // same-device case).
  describe("seenStoryEntries regression guard", () => {
    const prevWithStories = {
      ...realPrev,
      seenStoryEntries: ["great-potato-awakening", "tubernovae-arrival"] as const
    };

    it("rejects a partial POST that omits seenStoryEntries when prev had entries", () => {
      const result = validateNoRegression({
        prev: prevWithStories,
        next: {
          playedTimeSeconds: prevWithStories.playedTimeSeconds,
          completedMissions: [...prevWithStories.completedMissions],
          unlockedPlanets: [...prevWithStories.unlockedPlanets]
          // seenStoryEntries omitted — coalesces to [] in the route handler;
          // pass [] explicitly here to model that coalescing.
        }
      });
      // The explicit omission still rejects when prev had entries — guard
      // uses prev.seenStoryEntries ?? [] vs next.seenStoryEntries ?? [].
      // Modeled here as next.seenStoryEntries undefined.
      expect(result.ok).toBe(false);
    });

    it("rejects a partial mention regression (one story entry dropped)", () => {
      const result = validateNoRegression({
        prev: prevWithStories,
        next: {
          playedTimeSeconds: prevWithStories.playedTimeSeconds,
          completedMissions: [...prevWithStories.completedMissions],
          unlockedPlanets: [...prevWithStories.unlockedPlanets],
          seenStoryEntries: ["great-potato-awakening"] // tubernovae-arrival dropped
        }
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/seenStoryEntries regressed/);
      expect(result.ok === false && result.error).toMatch(/tubernovae-arrival/);
    });

    it("accepts forward progress (story entry added)", () => {
      expect(
        validateNoRegression({
          prev: prevWithStories,
          next: {
            playedTimeSeconds: prevWithStories.playedTimeSeconds,
            completedMissions: [...prevWithStories.completedMissions],
            unlockedPlanets: [...prevWithStories.unlockedPlanets],
            seenStoryEntries: [...prevWithStories.seenStoryEntries, "ember-arrival"]
          }
        }).ok
      ).toBe(true);
    });

    it("accepts the same set in a different order", () => {
      expect(
        validateNoRegression({
          prev: prevWithStories,
          next: {
            playedTimeSeconds: prevWithStories.playedTimeSeconds,
            completedMissions: [...prevWithStories.completedMissions],
            unlockedPlanets: [...prevWithStories.unlockedPlanets],
            seenStoryEntries: ["tubernovae-arrival", "great-potato-awakening"]
          }
        }).ok
      ).toBe(true);
    });

    it("accepts when prev has no entries (omitted field on both sides)", () => {
      // Pre-seen-story-feature saves have no seenStoryEntries on prev. A POST
      // without the field is fine — there are no entries to regress from.
      expect(
        validateNoRegression({
          prev: realPrev, // no seenStoryEntries
          next: {
            playedTimeSeconds: realPrev.playedTimeSeconds,
            completedMissions: [...realPrev.completedMissions],
            unlockedPlanets: [...realPrev.unlockedPlanets]
          }
        }).ok
      ).toBe(true);
    });
  });
});

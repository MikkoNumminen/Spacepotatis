import { describe, it, expect } from "vitest";
import { parseArgs, computeDiff } from "./restore-player.mjs";

describe("restore-player parseArgs", () => {
  it("parses bare email as dry-run", () => {
    const args = parseArgs(["alice@example.com"]);
    expect(args.email).toBe("alice@example.com");
    expect(args.apply).toBe(false);
    expect(args.noPrompt).toBe(false);
    expect(args.force).toBe(false);
    expect(args.playerEmail).toBeNull();
  });

  it("parses --apply with --player-email", () => {
    const args = parseArgs([
      "alice@example.com",
      "--apply",
      "--player-email=alice@example.com",
    ]);
    expect(args.apply).toBe(true);
    expect(args.playerEmail).toBe("alice@example.com");
  });

  it("parses the no-prompt path with all required flags", () => {
    const args = parseArgs([
      "alice@example.com",
      "--apply",
      "--player-email=alice@example.com",
      "--no-prompt",
      "--i-have-printed-the-before-state",
    ]);
    expect(args.apply).toBe(true);
    expect(args.noPrompt).toBe(true);
    expect(args.iHavePrintedTheBeforeState).toBe(true);
  });

  it("parses the destructive force flag", () => {
    const args = parseArgs([
      "alice@example.com",
      "--apply",
      "--player-email=alice@example.com",
      "--force-overwrite-i-know-this-destroys-progress",
    ]);
    expect(args.force).toBe(true);
  });

  it("throws on missing positional", () => {
    expect(() => parseArgs([])).toThrow(/missing <email>/);
  });

  it("throws on extra positional", () => {
    expect(() => parseArgs(["a@x", "b@x"])).toThrow(/too many positional/);
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(["a@x", "--what"])).toThrow(/unknown flag/);
  });
});

describe("restore-player computeDiff (monotonic-shrink guard)", () => {
  const target = {
    credits: 10000,
    completed: ["tutorial", "combat-1", "boss-1", "pirate-beacon"],
    unlocked: [
      "tutorial",
      "combat-1",
      "boss-1",
      "shop",
      "market",
      "pirate-beacon",
      "tubernovae-outpost",
      "ember-run",
    ],
    playtime: 1800,
  };

  it("reports no shrinks for a fresh-wipe BEFORE row", () => {
    const before = {
      credits: 0,
      completed_missions: [],
      unlocked_planets: ["tutorial"],
      played_time_seconds: 0,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks).toEqual([]);
  });

  it("flags credits shrink", () => {
    const before = {
      credits: 50000,
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 0,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks.some((s) => s.startsWith("credits:"))).toBe(true);
  });

  it("flags completed_missions count shrink", () => {
    const before = {
      credits: 0,
      completed_missions: [
        "tutorial",
        "combat-1",
        "boss-1",
        "pirate-beacon",
        "ember-run",
        "extra-mission",
      ],
      unlocked_planets: [],
      played_time_seconds: 0,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks.some((s) => s.includes("completed_missions count"))).toBe(
      true,
    );
  });

  it("flags unlocked_planets count shrink", () => {
    const before = {
      credits: 0,
      completed_missions: [],
      unlocked_planets: new Array(20).fill("p"),
      played_time_seconds: 0,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks.some((s) => s.includes("unlocked_planets count"))).toBe(
      true,
    );
  });

  it("flags played_time_seconds shrink — the canonical 2026-05-02 footgun", () => {
    const before = {
      credits: 10000,
      completed_missions: target.completed,
      unlocked_planets: target.unlocked,
      played_time_seconds: 7200,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks.some((s) => s.startsWith("played_time_seconds:"))).toBe(
      true,
    );
  });

  it("aggregates multiple shrinks", () => {
    const before = {
      credits: 99999,
      completed_missions: new Array(10).fill("m"),
      unlocked_planets: new Array(20).fill("p"),
      played_time_seconds: 99999,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks.length).toBe(4);
  });

  it("handles null/undefined BEFORE fields without throwing", () => {
    const before = {
      credits: null,
      completed_missions: null,
      unlocked_planets: null,
      played_time_seconds: null,
    };
    const { shrinks } = computeDiff(before, target);
    expect(shrinks).toEqual([]);
  });
});

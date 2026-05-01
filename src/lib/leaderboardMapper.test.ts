import { describe, expect, it } from "vitest";
import { mapRowToPilot, type TopPilotsRow } from "./leaderboardMapper";

describe("mapRowToPilot", () => {
  it("maps a well-formed row to the PilotEntry shape", () => {
    const row: TopPilotsRow = {
      handle: "spudlord",
      clears: 7,
      playtime: 3600,
      best_score: 12_345
    };
    expect(mapRowToPilot(row)).toEqual({
      handle: "spudlord",
      clears: 7,
      playtimeSeconds: 3600,
      bestScore: 12_345
    });
  });

  it("coerces numeric counters when Postgres returns them as strings", () => {
    // Some pg drivers stringify COALESCE/MAX results; the mapper survives
    // because Number() handles both.
    const row: TopPilotsRow = {
      handle: "spudlord",
      clears: "12",
      playtime: "9999",
      best_score: "55555"
    };
    const pilot = mapRowToPilot(row);
    expect(pilot.clears).toBe(12);
    expect(pilot.playtimeSeconds).toBe(9999);
    expect(pilot.bestScore).toBe(55_555);
    expect(typeof pilot.clears).toBe("number");
    expect(typeof pilot.playtimeSeconds).toBe("number");
    expect(typeof pilot.bestScore).toBe("number");
  });

  it("coerces numeric counters when Postgres returns bigint", () => {
    // The Neon driver returns bigint for COALESCE/MAX on bigint columns;
    // Number(bigint) coerces cleanly within Number.MAX_SAFE_INTEGER.
    const row: TopPilotsRow = {
      handle: "tubercat",
      clears: 5n,
      playtime: 1234n,
      best_score: 9000n
    };
    const pilot = mapRowToPilot(row);
    expect(pilot.clears).toBe(5);
    expect(pilot.playtimeSeconds).toBe(1234);
    expect(pilot.bestScore).toBe(9000);
    expect(typeof pilot.clears).toBe("number");
  });

  it("falls back to 'Pilot' when handle is null (legacy row, never picked a handle)", () => {
    // Production query already filters `p.handle is not null`, but the row
    // type still surfaces `string | null`; the mapper has a defensive
    // fallback that should NOT throw.
    const row: TopPilotsRow = {
      handle: null,
      clears: 1,
      playtime: 60,
      best_score: 100
    };
    expect(mapRowToPilot(row)).toEqual({
      handle: "Pilot",
      clears: 1,
      playtimeSeconds: 60,
      bestScore: 100
    });
  });

  it("handles a zeroed row (player with handle, no progress yet)", () => {
    const row: TopPilotsRow = {
      handle: "fresh",
      clears: 0,
      playtime: 0,
      best_score: 0
    };
    expect(mapRowToPilot(row)).toEqual({
      handle: "fresh",
      clears: 0,
      playtimeSeconds: 0,
      bestScore: 0
    });
  });

  it("preserves the empty-string handle as-is (does not collapse to 'Pilot')", () => {
    // Only `null` triggers the fallback (?? operator). An empty handle
    // would have been rejected at insert time by the players-table
    // constraints, but the mapper doesn't second-guess the row.
    const row: TopPilotsRow = {
      handle: "",
      clears: 0,
      playtime: 0,
      best_score: 0
    };
    expect(mapRowToPilot(row).handle).toBe("");
  });
});

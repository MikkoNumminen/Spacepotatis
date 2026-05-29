import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the prev-row STORY_IDS filter in
 * `src/app/api/save/route.ts`.
 *
 * Before this fix, `prevSeenStoryEntries` was type-filtered
 * (`typeof s === "string"`) but NOT membership-filtered against the live
 * `STORY_IDS` catalog. A retired/renamed story id sitting in a legacy save
 * row would slip into `validateNoRegression`'s prev side, the client
 * (which runs the row through `isKnownStoryId` on hydrate) would drop it
 * from the next side, and every subsequent POST would 422 with
 * `save_regression` — bricking saves until manual intervention.
 *
 * The fix mirrors the `knownPrevMissions` pattern at the top of the same
 * transaction body: filter prev seen-stories through `STORY_IDS` before
 * handing them to the regression guard. Retired ids drop silently; live
 * ids still gate.
 */

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

const auditInsertSpy = vi.fn();

function makeSelectChain(row: Record<string, unknown> | undefined) {
  const chain = {
    selectAll: () => chain,
    select: () => chain,
    where: () => chain,
    forUpdate: () => chain,
    executeTakeFirst: async () => row
  };
  return chain;
}

function makeInsertChain(table: string) {
  const isAudit = table === "spacepotatis.save_audit";
  const chain = {
    values: (v: Record<string, unknown>) => {
      if (isAudit) auditInsertSpy(v);
      return chain;
    },
    onConflict: () => chain,
    execute: async () => [{ numInsertedOrUpdatedRows: 1n }]
  };
  return chain;
}

function makeDbHandle(prevRow: Record<string, unknown> | undefined) {
  return {
    selectFrom: () => makeSelectChain(prevRow),
    insertInto: (table: string) => makeInsertChain(table),
    transaction: () => ({
      execute: async <T>(
        cb: (trx: ReturnType<typeof makeDbHandle>) => Promise<T>
      ): Promise<T> => cb(makeDbHandle(prevRow))
    })
  };
}

const PLAYER_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PLAYER_EMAIL = "player@example.com";

let prevRowOverride: Record<string, unknown> | undefined = undefined;

vi.mock("@/lib/db", () => ({
  getDb: () => makeDbHandle(prevRowOverride)
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  auditInsertSpy.mockReset();
  authMock.mockResolvedValue({ user: { email: PLAYER_EMAIL, name: null } });
  upsertMock.mockResolvedValue(PLAYER_UUID);
  prevRowOverride = undefined;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/save/route");
}

describe("prev-row STORY_IDS filter — retired story ids no longer 422 every POST", () => {
  it("retired story id in prev row is filtered before validateNoRegression", async () => {
    // Prev row carries a legacy/retired id ("retired-story-id") alongside
    // a live id ("great-potato-awakening"). The client filters unknowns out
    // on hydrate, so its POST body only carries the live id. Pre-fix, the
    // route's setDifference reported the retired id as missing and 422'd.
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      played_time_seconds: 100,
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial"],
      seen_story_entries: ["retired-story-id", "great-potato-awakening"],
      current_solar_system_id: "tutorial",
      updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
    };

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 200,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial"],
          // Live ids only — the client's hydrate path dropped "retired-story-id".
          seenStoryEntries: ["great-potato-awakening"],
          currentSolarSystemId: "tutorial"
        })
      })
    );

    expect(res.status).toBe(204);
  });

  it("legitimately-dropped live story id still 422s (filter is membership-not-everything)", async () => {
    // Prev row carries TWO live ids; body drops one of them. The dropped id
    // is in STORY_IDS, so the regression guard correctly rejects.
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      played_time_seconds: 100,
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial"],
      seen_story_entries: ["great-potato-awakening", "market-arrival"],
      current_solar_system_id: "tutorial",
      updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
    };

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 200,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial"],
          // Dropped "market-arrival" — both are live ids → real regression.
          seenStoryEntries: ["great-potato-awakening"],
          currentSolarSystemId: "tutorial"
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_regression");
  });

  it("only-retired prev ids + empty body next → 204 (all noise, no real prev)", async () => {
    // Prev row is entirely retired ids. Filtered prev is []; body's empty
    // next still produces an empty difference. Save proceeds.
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      played_time_seconds: 100,
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial"],
      seen_story_entries: ["retired-1", "retired-2"],
      current_solar_system_id: "tutorial",
      updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
    };

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 200,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial"],
          seenStoryEntries: [],
          currentSolarSystemId: "tutorial"
        })
      })
    );

    expect(res.status).toBe(204);
  });
});

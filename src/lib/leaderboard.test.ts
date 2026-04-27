import { describe, expect, it, vi, beforeEach } from "vitest";

// Capture the unstable_cache call so we can assert on its tag/TTL/key without
// pulling in the real next/cache module (which expects to run inside a Next
// request scope and explodes on import otherwise).
const cacheCall = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: readonly string[],
    options?: { revalidate?: number; tags?: readonly string[] }
  ) => {
    cacheCall(keyParts, options);
    // Return the underlying fn so behavior tests can call through.
    return fn;
  }
}));

// db is mocked per-test; module-scoped fakeKysely lets each test stage rows
// and read back the recorded query chain.
type CapturedCall = { method: string; args: unknown[] };
const fakeRows: { rows: unknown[] } = { rows: [] };
const captured: CapturedCall[] = [];

function chain(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "execute") return async () => fakeRows.rows;
        return (...args: unknown[]) => {
          captured.push({ method: prop, args });
          return chain();
        };
      }
    }
  );
}

vi.mock("./db", () => ({
  getDb: () => ({
    selectFrom: (...args: unknown[]) => {
      captured.push({ method: "selectFrom", args });
      return chain();
    }
  })
}));

beforeEach(() => {
  cacheCall.mockClear();
  captured.length = 0;
  fakeRows.rows = [];
});

describe("getCachedLeaderboard cache wiring", () => {
  it("registers the leaderboard cache tag, key, and 60s revalidate window", async () => {
    // Importing here so the mocks above are in place before the module evaluates.
    const mod = await import("./leaderboard");
    expect(cacheCall).toHaveBeenCalledTimes(1);
    const [keyParts, options] = cacheCall.mock.calls[0] as [string[], { revalidate: number; tags: string[] }];
    expect(keyParts).toEqual(["leaderboard-entries-v1"]);
    expect(options.revalidate).toBe(60);
    expect(options.tags).toEqual([mod.LEADERBOARD_CACHE_TAG]);
    expect(mod.LEADERBOARD_CACHE_TAG).toBe("leaderboard");
  });
});

describe("fetchLeaderboardEntries (via getCachedLeaderboard, db mocked)", () => {
  it("issues a select with join, mission filter, double order, limit, and maps rows", async () => {
    const created = new Date("2025-01-02T03:04:05.000Z");
    fakeRows.rows = [
      { player_handle: "spud", score: 1000, time_seconds: 60, created_at: created },
      { player_handle: null, score: 500, time_seconds: null, created_at: created }
    ];
    const { getCachedLeaderboard } = await import("./leaderboard");
    const entries = await getCachedLeaderboard("tutorial" as never, 20);

    expect(entries).toEqual([
      { playerName: "spud", score: 1000, timeSeconds: 60, createdAt: created.toISOString() },
      { playerName: "Pilot", score: 500, timeSeconds: null, createdAt: created.toISOString() }
    ]);

    const methods = captured.map((c) => c.method);
    expect(methods).toContain("selectFrom");
    expect(methods).toContain("innerJoin");
    expect(methods).toContain("select");
    expect(methods).toContain("where");
    expect(methods).toContain("orderBy");
    expect(methods).toContain("limit");

    const selectFromCall = captured.find((c) => c.method === "selectFrom");
    expect(selectFromCall?.args[0]).toBe("spacepotatis.leaderboard as lb");
    const innerJoinCall = captured.find((c) => c.method === "innerJoin");
    expect(innerJoinCall?.args[0]).toBe("spacepotatis.players as p");
    const limitCall = captured.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(20);

    const whereCall = captured.find((c) => c.method === "where");
    expect(whereCall?.args).toEqual(["lb.mission_id", "=", "tutorial"]);

    const orderBys = captured.filter((c) => c.method === "orderBy");
    expect(orderBys).toHaveLength(2);
    expect(orderBys[0]?.args).toEqual(["lb.score", "desc"]);
    expect(orderBys[1]?.args).toEqual(["lb.created_at", "desc"]);
  });

  it("returns [] when the underlying query returns no rows", async () => {
    fakeRows.rows = [];
    const { getCachedLeaderboard } = await import("./leaderboard");
    expect(await getCachedLeaderboard("any" as never, 5)).toEqual([]);
  });
});

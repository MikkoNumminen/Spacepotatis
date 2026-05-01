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
// Records every callback the production code passes into Kysely (leftJoin
// subqueries, where(eb=>...) predicates, etc). The chain proxy invokes them
// against a stub `eb` so their bodies execute — without this the inner
// closures stay 0% covered and fetchTopPilots looks half-tested.
const callbackCalls: { kind: string }[] = [];

function makeEb(): unknown {
  // `eb` is callable: eb("col", "op", value) — used by Kysely for ad-hoc
  // predicates. It also exposes selectFrom (for leftJoin subqueries) and
  // or(...)/and(...) for predicate composition.
  const eb = ((..._args: unknown[]) => chain()) as unknown as Record<
    string,
    unknown
  >;
  eb["selectFrom"] = (...args: unknown[]) => {
    captured.push({ method: "selectFrom", args });
    return chain();
  };
  eb["or"] = (...args: unknown[]) => {
    captured.push({ method: "or", args });
    return chain();
  };
  eb["and"] = (...args: unknown[]) => {
    captured.push({ method: "and", args });
    return chain();
  };
  return eb;
}

function makeJoin(): unknown {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        return (...args: unknown[]) => {
          captured.push({ method: prop, args });
          return makeJoin();
        };
      }
    }
  );
}

function chain(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "execute") return async () => fakeRows.rows;
        return (...args: unknown[]) => {
          captured.push({ method: prop, args });
          // Invoke any function args so production callbacks (leftJoin
          // subqueries, where(eb=>...) predicates) actually run — bumps
          // coverage from "we registered the call" to "we exercised the
          // closure". leftJoin gets [subquery, joinCondition] in one call:
          // first arg gets `eb`, second gets `join`.
          if (prop === "leftJoin") {
            callbackCalls.push({ kind: "leftJoin" });
            if (typeof args[0] === "function") {
              (args[0] as (eb: unknown) => unknown)(makeEb());
            }
            if (typeof args[1] === "function") {
              (args[1] as (join: unknown) => unknown)(makeJoin());
            }
          } else {
            for (const a of args) {
              if (typeof a === "function") {
                callbackCalls.push({ kind: prop });
                (a as (eb: unknown) => unknown)(makeEb());
              }
            }
          }
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
    // The module wires TWO caches (entries + top-pilots), both under the same tag.
    const mod = await import("./leaderboard");
    expect(cacheCall).toHaveBeenCalledTimes(2);

    const [entriesKey, entriesOpts] = cacheCall.mock.calls[0] as [string[], { revalidate: number; tags: string[] }];
    expect(entriesKey).toEqual(["leaderboard-entries-v1"]);
    expect(entriesOpts.revalidate).toBe(60);
    expect(entriesOpts.tags).toEqual([mod.LEADERBOARD_CACHE_TAG]);

    const [topPilotsKey, topPilotsOpts] = cacheCall.mock.calls[1] as [string[], { revalidate: number; tags: string[] }];
    expect(topPilotsKey).toEqual(["top-pilots-v1"]);
    expect(topPilotsOpts.revalidate).toBe(60);
    expect(topPilotsOpts.tags).toEqual([mod.LEADERBOARD_CACHE_TAG]);

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

describe("fetchTopPilots (via getCachedTopPilots, db mocked)", () => {
  it("issues the players-table top-pilots query with handle-is-not-null filter, OR predicate, three-key sort, and limit", async () => {
    fakeRows.rows = [];
    const { getCachedTopPilots } = await import("./leaderboard");
    await getCachedTopPilots(25);

    // selectFrom is the players table aliased as p.
    const selectFromCall = captured.find((c) => c.method === "selectFrom");
    expect(selectFromCall?.args[0]).toBe("spacepotatis.players as p");

    // Two leftJoin calls — save_games-derived clears+playtime, and
    // leaderboard-derived best_score.
    const leftJoinCalls = captured.filter((c) => c.method === "leftJoin");
    expect(leftJoinCalls.length).toBe(2);

    // p.handle filter is added as a where("p.handle", "is not", null) call.
    const handleFilter = captured.find(
      (c) =>
        c.method === "where" &&
        Array.isArray(c.args) &&
        c.args[0] === "p.handle" &&
        c.args[1] === "is not"
    );
    expect(handleFilter).toBeDefined();
    expect(handleFilter?.args[2]).toBeNull();

    // The OR-predicate where() is the variant taking a callback (single
    // function arg) — distinguishable from the literal handle filter above.
    const orPredicate = captured.find(
      (c) => c.method === "where" && c.args.length === 1 && typeof c.args[0] === "function"
    );
    expect(orPredicate).toBeDefined();

    // Three orderBy calls — the public sort contract: clears DESC, then
    // best_score DESC, then playtime ASC.
    const orderBys = captured.filter((c) => c.method === "orderBy");
    expect(orderBys).toHaveLength(3);
    expect(orderBys[0]?.args[1]).toBe("desc");
    expect(orderBys[1]?.args[1]).toBe("desc");
    expect(orderBys[2]?.args[1]).toBe("asc");

    // Limit forwarded as-is.
    const limitCall = captured.find((c) => c.method === "limit");
    expect(limitCall?.args[0]).toBe(25);
  });

  it("maps rows through mapRowToPilot — null handles collapse to 'Pilot'", async () => {
    // The handle-is-not-null filter would normally elide null rows in
    // production, but the row type still surfaces `string | null` and the
    // mapper has a defensive ?? "Pilot" fallback. Pin that the pipeline
    // actually applies the mapper rather than passing rows through raw.
    fakeRows.rows = [
      { handle: "spudlord", clears: 5, playtime: 1234, best_score: 9999 },
      { handle: null, clears: 0, playtime: 0, best_score: 100 }
    ];
    const { getCachedTopPilots } = await import("./leaderboard");
    const pilots = await getCachedTopPilots(10);
    expect(pilots).toEqual([
      { handle: "spudlord", clears: 5, playtimeSeconds: 1234, bestScore: 9999 },
      { handle: "Pilot", clears: 0, playtimeSeconds: 0, bestScore: 100 }
    ]);
  });

  it("includes a player whose clears>0 even if best_score=0 (OR predicate, branch 1)", async () => {
    fakeRows.rows = [
      { handle: "grinder", clears: 4, playtime: 800, best_score: 0 }
    ];
    const { getCachedTopPilots } = await import("./leaderboard");
    const pilots = await getCachedTopPilots(10);
    expect(pilots).toHaveLength(1);
    expect(pilots[0]).toEqual({
      handle: "grinder",
      clears: 4,
      playtimeSeconds: 800,
      bestScore: 0
    });
  });

  it("includes a player whose best_score>0 even if clears=0 (OR predicate, branch 2)", async () => {
    fakeRows.rows = [
      { handle: "score-hunter", clears: 0, playtime: 0, best_score: 4242 }
    ];
    const { getCachedTopPilots } = await import("./leaderboard");
    const pilots = await getCachedTopPilots(10);
    expect(pilots).toHaveLength(1);
    expect(pilots[0]).toEqual({
      handle: "score-hunter",
      clears: 0,
      playtimeSeconds: 0,
      bestScore: 4242
    });
  });

  it("returns [] when the query yields no rows", async () => {
    fakeRows.rows = [];
    const { getCachedTopPilots } = await import("./leaderboard");
    expect(await getCachedTopPilots(5)).toEqual([]);
  });

  it("handles bigint-flavored COALESCE values from the Postgres driver", async () => {
    // Neon/pg returns bigint for some COALESCE results — pin that the
    // mapper-driven coercion kicks in even when the row hands us bigints.
    fakeRows.rows = [
      { handle: "tubercat", clears: 3n, playtime: 600n, best_score: 5000n }
    ];
    const { getCachedTopPilots } = await import("./leaderboard");
    const pilots = await getCachedTopPilots(1);
    expect(pilots[0]).toEqual({
      handle: "tubercat",
      clears: 3,
      playtimeSeconds: 600,
      bestScore: 5000
    });
  });
});

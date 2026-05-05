import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-013 — TOCTOU on `prevRow` SELECT in `POST /api/save`.
//
// Without the fix:
//   Tab A: SELECT prevRow → validators pass → upsert (commits new state).
//   Tab B (started before Tab A finished): SELECT prevRow (sees pre-Tab-A
//     baseline) → validators pass against stale baseline → upsert (overwrites
//     Tab A's richer state with Tab B's regression-shaped payload).
//
// With the fix (BEGIN; SELECT ... FOR UPDATE; <validators>; UPSERT; COMMIT;):
//   Tab A's transaction holds the row lock until COMMIT.
//   Tab B's SELECT FOR UPDATE blocks until Tab A's COMMIT releases the lock,
//   then re-reads the now-updated row. Tab B's validators see the fresh
//   prevRow and `validateNoRegression` rejects the stale-baseline payload.
//
// Because the Edge runtime's mocked DB doesn't actually serialize, this test
// simulates the post-fix behavior by:
//   (a) asserting the route opens a Kysely transaction (`db.transaction()`),
//   (b) asserting the SELECT inside that transaction calls `.forUpdate()`,
//   (c) running Tab A then Tab B with a shared `currentRow` that mutates
//       between the two transactions — Tab B's transaction-scoped SELECT
//       returns Tab A's already-written row (the row-lock semantics
//       projected into a single-threaded mock). Tab B is then rejected by
//       `validateNoRegression`. Without the fix, the route would read the
//       module-level prevRow that captured pre-Tab-A state.

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

// Per-test stubs. The mock models a single `currentRow` of state in
// `spacepotatis.save_games`, mutated by upserts and read by selects.
//
// `forUpdateCalled` records whether the prev-row SELECT used `.forUpdate()`.
// `transactionCalled` records whether the route opened a transaction.
const dbStub: {
  currentRow: Record<string, unknown> | undefined;
  transactionCalled: boolean;
  forUpdateCalled: boolean;
  selectInsideTx: boolean;
  selectsObserved: number;
  upsertsObserved: number;
} = {
  currentRow: undefined,
  transactionCalled: false,
  forUpdateCalled: false,
  selectInsideTx: false,
  selectsObserved: 0,
  upsertsObserved: 0
};

function makeSelectChain(opts: { insideTx: boolean }) {
  const chain = {
    selectAll: () => chain,
    select: () => chain,
    where: () => chain,
    forUpdate: () => {
      dbStub.forUpdateCalled = true;
      if (opts.insideTx) dbStub.selectInsideTx = true;
      return chain;
    },
    executeTakeFirst: async () => {
      dbStub.selectsObserved += 1;
      return dbStub.currentRow;
    }
  };
  return chain;
}

function makeInsertChain(table: string, opts: { insideTx: boolean }) {
  const isAudit = table === "spacepotatis.save_audit";
  let captured: Record<string, unknown> | undefined;
  const chain = {
    values: (v: Record<string, unknown>) => {
      captured = v;
      return chain;
    },
    onConflict: (cb: unknown) => {
      // Simulate ON CONFLICT (player_id, slot) DO UPDATE — for save_games,
      // any upsert just replaces currentRow with the new values.
      void cb;
      return chain;
    },
    execute: async () => {
      if (!isAudit && captured) {
        dbStub.upsertsObserved += 1;
        // Mirror the values the route writes onto our shared currentRow,
        // shaped like the SELECT result.
        dbStub.currentRow = {
          slot: 1,
          credits: captured.credits,
          current_planet: captured.current_planet,
          ship_config: captured.ship_config,
          completed_missions: captured.completed_missions,
          unlocked_planets: captured.unlocked_planets,
          played_time_seconds: captured.played_time_seconds,
          seen_story_entries: captured.seen_story_entries ?? [],
          current_solar_system_id: captured.current_solar_system_id ?? null,
          updated_at: captured.updated_at ?? new Date()
        };
      }
      return undefined;
    }
  };
  void opts;
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    selectFrom: () => makeSelectChain({ insideTx: false }),
    insertInto: (table: string) => makeInsertChain(table, { insideTx: false }),
    transaction: () => ({
      execute: async (
        cb: (trx: {
          selectFrom: () => ReturnType<typeof makeSelectChain>;
          insertInto: (t: string) => ReturnType<typeof makeInsertChain>;
        }) => Promise<unknown>
      ) => {
        dbStub.transactionCalled = true;
        return cb({
          selectFrom: () => makeSelectChain({ insideTx: true }),
          insertInto: (t: string) => makeInsertChain(t, { insideTx: true })
        });
      }
    })
  })
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  dbStub.currentRow = undefined;
  dbStub.transactionCalled = false;
  dbStub.forUpdateCalled = false;
  dbStub.selectInsideTx = false;
  dbStub.selectsObserved = 0;
  dbStub.upsertsObserved = 0;
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/save/route");
}

describe("SEC-013 — POST /api/save wraps prev-row read + validate + upsert in a transaction with FOR UPDATE", () => {
  it("opens a Kysely transaction when handling POST", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.currentRow = undefined;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 30,
          completedMissions: [],
          unlockedPlanets: []
        })
      })
    );
    expect(res.status).toBe(204);
    expect(dbStub.transactionCalled).toBe(true);
  });

  it("calls .forUpdate() on the prev-row SELECT inside the transaction", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.currentRow = undefined;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 30,
          completedMissions: [],
          unlockedPlanets: []
        })
      })
    );
    expect(res.status).toBe(204);
    expect(dbStub.forUpdateCalled).toBe(true);
    expect(dbStub.selectInsideTx).toBe(true);
  });

  it("rejects a stale-baseline POST after a concurrent richer save committed (post-FOR-UPDATE serialization)", async () => {
    // Sequential mock execution simulates the post-fix behavior: Tab B's
    // SELECT inside the transaction reads the now-Tab-A-updated row. The
    // serialization is what FOR UPDATE buys us in production; the test
    // asserts that given that serialization, validateNoRegression catches
    // the stale-baseline overwrite. The structural tests above (transaction
    // + forUpdate) are what gate the fix; this test asserts the end-state
    // contract.
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.currentRow = {
      slot: 1,
      credits: 100,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial", "shop", "market", "pirate-beacon", "tubernovae-outpost"],
      played_time_seconds: 60,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 60_000)
    };

    const { POST } = await loadRoute();

    // Tab A: legitimate progression — adds combat-1 to completedMissions.
    const tabA = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 100,
          playedTimeSeconds: 100,
          completedMissions: ["tutorial", "combat-1"],
          unlockedPlanets: [
            "tutorial",
            "shop",
            "market",
            "pirate-beacon",
            "tubernovae-outpost",
            "combat-1",
            "boss-1"
          ]
        })
      })
    );
    expect(tabA.status).toBe(204);
    expect(dbStub.upsertsObserved).toBe(1);

    // Tab B: stale baseline — its client-side state predates Tab A's win.
    // With FOR UPDATE inside the transaction, Tab B's SELECT reads the
    // post-Tab-A row, and validateNoRegression rejects because
    // completedMissions shrank from ["tutorial","combat-1"] back to ["tutorial"].
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tabB = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 100,
          playedTimeSeconds: 100,
          completedMissions: ["tutorial"],
          unlockedPlanets: [
            "tutorial",
            "shop",
            "market",
            "pirate-beacon",
            "tubernovae-outpost"
          ]
        })
      })
    );
    warnSpy.mockRestore();
    expect(tabB.status).toBe(422);
    const body = (await tabB.json()) as { error: string };
    expect(body.error).toBe("save_regression");
    // Tab A's upsert is the ONLY successful write — Tab B was rejected
    // before reaching the upsert.
    expect(dbStub.upsertsObserved).toBe(1);
  });
});

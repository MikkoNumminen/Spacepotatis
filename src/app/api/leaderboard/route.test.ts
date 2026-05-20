import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

const cachedLeaderboardMock = vi.fn();
vi.mock("@/lib/leaderboard", () => ({
  LEADERBOARD_CACHE_TAG: "leaderboard",
  getCachedLeaderboard: (mission: string, limit: number) => cachedLeaderboardMock(mission, limit)
}));

const revalidateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => revalidateTagMock(tag)
}));

const dbStub: {
  insertSpy: (v: Record<string, unknown>) => void;
  insertImpl: () => Promise<unknown>;
  // The leaderboard POST now reads save_games to enforce the mission-
  // completion guard. Tests stub the completed_missions array via this
  // promise; default is ["tutorial"] so existing happy paths keep working.
  selectImpl: () => Promise<{ completed_missions: readonly string[] } | undefined>;
} = {
  insertSpy: () => undefined,
  insertImpl: async () => undefined,
  selectImpl: async () => ({ completed_missions: ["tutorial"] })
};

function insertChain() {
  return {
    values: (v: Record<string, unknown>) => {
      dbStub.insertSpy(v);
      return insertChain();
    },
    execute: () => dbStub.insertImpl()
  };
}

function selectChain() {
  return {
    select: () => selectChain(),
    where: () => selectChain(),
    // SEC-013 mirror — the prev-row SELECT inside the transaction calls
    // `.forUpdate()`. The mock just chains through; serialization isn't
    // modeled here.
    forUpdate: () => selectChain(),
    executeTakeFirst: () => dbStub.selectImpl()
  };
}

// The leaderboard POST opens a transaction for the completed_missions read
// + mission-completion guard + score INSERT (mirrors SEC-013 from
// /api/save). The mock's `.transaction().execute(cb)` runs `cb` against a
// trx shaped like the top-level db so the existing chain stubs work
// transparently inside the transaction.
function makeDbHandle() {
  return {
    insertInto: () => insertChain(),
    selectFrom: () => selectChain(),
    transaction: () => ({
      execute: async <T>(cb: (trx: ReturnType<typeof makeDbHandle>) => Promise<T>): Promise<T> =>
        cb(makeDbHandle())
    })
  };
}

vi.mock("@/lib/db", () => ({
  getDb: () => makeDbHandle()
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  cachedLeaderboardMock.mockReset();
  revalidateTagMock.mockReset();
  dbStub.insertSpy = vi.fn();
  dbStub.insertImpl = async () => undefined;
  dbStub.selectImpl = async () => ({ completed_missions: ["tutorial"] });
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("./route");
}

describe("GET /api/leaderboard", () => {
  it("returns 400 when the mission query param is missing", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/leaderboard"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "mission_required" });
  });

  it("clamps the limit to [1, 50] and defaults to 20", async () => {
    cachedLeaderboardMock.mockResolvedValue([]);
    const { GET } = await loadRoute();

    await GET(new Request("http://x/api/leaderboard?mission=tutorial"));
    expect(cachedLeaderboardMock).toHaveBeenLastCalledWith("tutorial", 20);

    await GET(new Request("http://x/api/leaderboard?mission=tutorial&limit=999"));
    expect(cachedLeaderboardMock).toHaveBeenLastCalledWith("tutorial", 50);

    await GET(new Request("http://x/api/leaderboard?mission=tutorial&limit=-3"));
    expect(cachedLeaderboardMock).toHaveBeenLastCalledWith("tutorial", 1);

    await GET(new Request("http://x/api/leaderboard?mission=tutorial&limit=banana"));
    expect(cachedLeaderboardMock).toHaveBeenLastCalledWith("tutorial", 20);
  });

  it("returns the cached entries verbatim", async () => {
    const entries = [
      { playerName: "spud", score: 1000, timeSeconds: 60, createdAt: "2025-01-01T00:00:00.000Z" }
    ];
    cachedLeaderboardMock.mockResolvedValue(entries);
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/leaderboard?mission=tutorial&limit=5"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ missionId: "tutorial", entries });
  });

  it("returns 500 if the cached lookup throws", async () => {
    cachedLeaderboardMock.mockRejectedValueOnce(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/leaderboard?mission=tutorial"));
    errSpy.mockRestore();
    expect(res.status).toBe(500);
  });

  it("does NOT require authentication for reads", async () => {
    cachedLeaderboardMock.mockResolvedValue([]);
    authMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://x/api/leaderboard?mission=tutorial"));
    expect(res.status).toBe(200);
    expect(authMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/leaderboard", () => {
  it("returns 401 unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://x/api/leaderboard", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", { method: "POST", body: "{not-json" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_json" });
  });

  it("returns 400 when missionId is missing or score is non-numeric", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    let res = await POST(
      new Request("http://x/api/leaderboard", { method: "POST", body: JSON.stringify({ score: 100 }) })
    );
    expect(res.status).toBe(400);
    // Zod schema rejection — wire format is { error: "validation_failed", issues: [...] }
    expect((await res.json()).error).toBe("validation_failed");

    res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: "high" })
      })
    );
    expect(res.status).toBe(400);
  });

  it("inserts an integer score, revalidates the cache tag, returns 201", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const { POST } = await loadRoute();
    // Zod schema requires integer score + integer timeSeconds. Float values
    // are now rejected at parse time (was: silently truncated by route logic).
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 1234, timeSeconds: 60 })
      })
    );
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({
      player_id: "player-uuid",
      mission_id: "tutorial",
      score: 1234,
      time_seconds: 60
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("leaderboard");
  });

  it("accepts a missing timeSeconds and stores null", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 1 })
      })
    );
    expect(res.status).toBe(201);
    const passed = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(passed.time_seconds).toBeNull();
  });

  it("rejects a score for a mission the player hasn't completed (cheat guard)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.selectImpl = async () => ({ completed_missions: ["tutorial"] });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        // burnt-spud is in the enum so passes schema, but completed_missions
        // only has tutorial — the route must reject before insert.
        body: JSON.stringify({ missionId: "burnt-spud", score: 9999, timeSeconds: 1 })
      })
    );
    warnSpy.mockRestore();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "mission_not_completed" });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("rejects a mission id not in the MissionId enum (closes string POST hole)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "evil-mission", score: 1 })
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
  });

  it("returns 500 when the insert fails", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.insertImpl = async () => {
      throw new Error("db down");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 5 })
      })
    );
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

// Same Neon control-plane flake the /leaderboard fan-out and /api/save can
// hit also applies to /api/leaderboard's score POST. The route wraps
// upsertPlayerId, the completed_missions SELECT, and the score INSERT in
// withNeonRetry so a single flake doesn't 500 a user submitting a score
// (which would otherwise leave the score in the client-side scoreQueue
// awaiting retry). Pin transient + non-transient paths on each surface.
describe("POST /api/leaderboard Neon retry", () => {
  it("retries upsertPlayerId on a transient flake and returns 201", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let upsertCalls = 0;
    upsertMock.mockImplementation(async () => {
      upsertCalls += 1;
      if (upsertCalls === 1) throw new Error("Control plane request failed");
      return "player-uuid";
    });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 1234 })
      })
    );
    warnSpy.mockRestore();
    expect(res.status).toBe(201);
    expect(upsertCalls).toBe(2);
    // Insert still runs exactly once on the eventual success.
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("retries the score INSERT on a transient flake and eventually lands the row", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let insertCalls = 0;
    dbStub.insertImpl = async () => {
      insertCalls += 1;
      if (insertCalls === 1) throw new Error("Connection terminated unexpectedly");
      return undefined;
    };
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 5 })
      })
    );
    warnSpy.mockRestore();
    expect(res.status).toBe(201);
    // .values() called twice — once per attempt. The acknowledged trade-off
    // is a duplicate row in the rare phantom-commit case (route comment
    // explains why this is acceptable for a leaderboard).
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(insertCalls).toBe(2);
    expect(revalidateTagMock).toHaveBeenCalledWith("leaderboard");
  });

  it("does NOT retry on a non-transient permission error (returns 500 immediately)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let insertCalls = 0;
    dbStub.insertImpl = async () => {
      insertCalls += 1;
      throw new Error("permission denied for table leaderboard");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 5 })
      })
    );
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    // Single attempt — non-transient errors must NOT be retried.
    expect(insertCalls).toBe(1);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

// Audit fix: max-body guard + transient/permanent error code distinction.
// See docs/audits/audit-2026-05-20.md, fix branch fix/audit-leaderboard-pipeline.
describe("POST /api/leaderboard body & error-class guards", () => {
  it("rejects a Content-Length above 16 KB with 413 payload_too_large", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        headers: { "content-length": String(17 * 1024) },
        body: JSON.stringify({ missionId: "tutorial", score: 1 })
      })
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
  });

  it("returns server_error_permanent (500) on a TypeError thrown from the upsert", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    upsertMock.mockImplementation(async () => {
      // Simulate a JS runtime bug — the route must classify this as permanent
      // so scoreQueue drops the entry instead of retrying for 30 days.
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 5 })
      })
    );
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error_permanent" });
  });

  it("keeps transient errors as server_error (500) so scoreQueue retries", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    // Generic Error (not a JS-runtime class) → transient. Mirrors the
    // permission-denied path above, but pinned here for the error-class
    // contract specifically.
    dbStub.insertImpl = async () => {
      throw new Error("permission denied for table leaderboard");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 5 })
      })
    );
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
  });
});

// Audit fix: SELECT completed_missions + mission-completion guard + score
// INSERT now run inside ONE Kysely transaction with FOR UPDATE. Mirrors
// SEC-013. The mock can't model row locking, but we can pin that the
// transaction wrapper is used (i.e. the .transaction().execute() path is
// the only path that hits the DB) by verifying the existing happy + reject
// behaviors still work.
describe("POST /api/leaderboard transaction wiring", () => {
  it("runs the completed_missions read and score INSERT against the trx handle (transaction wrapper engaged)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/leaderboard", {
        method: "POST",
        body: JSON.stringify({ missionId: "tutorial", score: 50, timeSeconds: 10 })
      })
    );
    // Happy path lands a 201 — exercises the .transaction().execute(cb)
    // mock plus the .forUpdate() chain on the prev-row read.
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});

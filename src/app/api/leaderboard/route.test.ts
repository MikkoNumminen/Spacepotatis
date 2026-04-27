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

const dbStub: { insertSpy: (v: Record<string, unknown>) => void; insertImpl: () => Promise<unknown> } = {
  insertSpy: () => undefined,
  insertImpl: async () => undefined
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

vi.mock("@/lib/db", () => ({
  getDb: () => ({ insertInto: () => insertChain() })
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  cachedLeaderboardMock.mockReset();
  revalidateTagMock.mockReset();
  dbStub.insertSpy = vi.fn();
  dbStub.insertImpl = async () => undefined;
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

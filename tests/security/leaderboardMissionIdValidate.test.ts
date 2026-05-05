// SEC-003 regression test — GET /api/leaderboard ?mission= parameter must be
// validated against the MissionIdSchema enum. Before the fix, an `as MissionId`
// cast accepted any string, creating a cache-key pollution + DoS surface.
// After the fix, unknown ids return 400; known ids succeed.
//
// This test FAILS on master (the cast accepts anything) and PASSES with the fix
// (MissionIdSchema.safeParse rejects unknown strings).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the leaderboard helper so we don't need a real DB.
const cachedLeaderboardMock = vi.fn();
vi.mock("@/lib/leaderboard", () => ({
  LEADERBOARD_CACHE_TAG: "leaderboard",
  getCachedLeaderboard: (mission: string, limit: number) =>
    cachedLeaderboardMock(mission, limit)
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn()
}));

vi.mock("@/lib/players", () => ({
  upsertPlayerId: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn()
}));

beforeEach(() => {
  cachedLeaderboardMock.mockReset();
  cachedLeaderboardMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/leaderboard/route");
}

describe("SEC-003 — GET /api/leaderboard rejects unknown ?mission= values", () => {
  it("returns 400 with validation_error when ?mission= is a bogus string", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://x/api/leaderboard?mission=bogus-not-a-real-mission")
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("invalid_mission");
  });

  it("returns 400 for a random UUID-like string (cache-key pollution attempt)", async () => {
    const { GET } = await loadRoute();
    const randomish = "00000000-0000-0000-0000-000000000000";
    const res = await GET(
      new Request(`http://x/api/leaderboard?mission=${randomish}`)
    );
    expect(res.status).toBe(400);
    expect(cachedLeaderboardMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an SQL-injection-shaped string", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request(
        "http://x/api/leaderboard?mission=" +
          encodeURIComponent("'; DROP TABLE spacepotatis.leaderboard; --")
      )
    );
    expect(res.status).toBe(400);
    expect(cachedLeaderboardMock).not.toHaveBeenCalled();
  });

  it("accepts a valid MissionId ('tutorial') and calls the cache helper", async () => {
    const entries = [
      { playerName: "spud", score: 500, timeSeconds: 30, createdAt: "2026-01-01T00:00:00.000Z" }
    ];
    cachedLeaderboardMock.mockResolvedValueOnce(entries);
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://x/api/leaderboard?mission=tutorial")
    );
    expect(res.status).toBe(200);
    expect(cachedLeaderboardMock).toHaveBeenCalledWith("tutorial", 20);
    const body = await res.json() as Record<string, unknown>;
    expect(body.missionId).toBe("tutorial");
  });

  it("accepts every id in MISSION_IDS", async () => {
    const { GET } = await loadRoute();
    const { MISSION_IDS } = await import("../../src/lib/schemas/save");
    for (const id of MISSION_IDS) {
      cachedLeaderboardMock.mockResolvedValueOnce([]);
      const res = await GET(
        new Request(`http://x/api/leaderboard?mission=${id}`)
      );
      expect(res.status).toBe(200);
    }
  });
});

// SEC-014 regression test — POST /api/leaderboard score must be bounded by a
// per-mission cap derived from enemies.json + waves.json. Before the fix,
// `score: z.number().int()` had no max(), letting any authenticated player who
// completed a mission POST score=2_147_483_647 and own the leaderboard.
//
// After the fix:
//  • Zod-level sanity cap (max 10_000_000) catches obviously-bogus values.
//  • Per-mission server-side cap via `maxLegitScore(missionId)` rejects
//    implausible but sub-10M values with 422 score_implausible.
//
// This test FAILS on master (no cap, INT max accepted) and PASSES with the fix.

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
  getCachedLeaderboard: (mission: string, limit: number) =>
    cachedLeaderboardMock(mission, limit)
}));

const revalidateTagMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => revalidateTagMock(tag)
}));

const insertSpy = vi.fn();
const dbStub = {
  selectImpl: async (): Promise<{ completed_missions: readonly string[] } | undefined> =>
    ({ completed_missions: ["tutorial", "combat-1"] })
};

function insertChain() {
  return {
    values: (v: Record<string, unknown>) => {
      insertSpy(v);
      return insertChain();
    },
    execute: async () => undefined
  };
}

function selectChain() {
  return {
    select: () => selectChain(),
    where: () => selectChain(),
    // SEC-013 mirror — the prev-row SELECT inside the leaderboard transaction
    // chains `.forUpdate()`. Mock just chains through.
    forUpdate: () => selectChain(),
    executeTakeFirst: () => dbStub.selectImpl()
  };
}

// Mirror the production-side fix: completed_missions read + score INSERT
// wrap in a Kysely transaction. The mock's trx is shaped like the top-level
// db so the existing chain stubs work inside the transaction.
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
  authMock.mockResolvedValue({ user: { email: "attacker@example.com", name: null } });
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  insertSpy.mockReset();
  revalidateTagMock.mockReset();
  cachedLeaderboardMock.mockReset();
  dbStub.selectImpl = async () => ({ completed_missions: ["tutorial", "combat-1"] });
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/leaderboard/route");
}

async function post(body: Record<string, unknown>, route?: { POST: (r: Request) => Promise<Response> }) {
  const { POST } = route ?? (await loadRoute());
  return POST(
    new Request("http://x/api/leaderboard", {
      method: "POST",
      body: JSON.stringify(body)
    })
  );
}

describe("SEC-014 — POST /api/leaderboard rejects implausible scores", () => {
  it("rejects the INT max (2_147_483_647) — exceeds Zod sanity cap, returns 400", async () => {
    // 2_147_483_647 > SCORE_SANITY_CAP (10_000_000) so Zod rejects it first
    // with 400 validation_failed. The per-mission 422 path handles values that
    // pass Zod but exceed the data-derived cap.
    const res = await post({ missionId: "combat-1", score: 2_147_483_647, timeSeconds: 1 });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects score=10_000_001 (above Zod sanity cap) with 400 validation_failed", async () => {
    // The Zod-level cap is 10_000_000. Values above it fail at the schema level.
    const res = await post({ missionId: "tutorial", score: 10_000_001, timeSeconds: 1 });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects score=10_000_000 (equal to Zod sanity cap) with 422 score_implausible for tutorial", async () => {
    // 10_000_000 passes the Zod cap (it's <= max) but still exceeds the
    // per-mission data-derived cap for tutorial (a few hundred enemies at
    // most, scoreValue ~30–100 each, max combo 8).
    const res = await post({ missionId: "tutorial", score: 10_000_000, timeSeconds: 1 });
    expect(res.status).toBe(422);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("score_implausible");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a negative score with 400 (Zod min(0))", async () => {
    const res = await post({ missionId: "tutorial", score: -1, timeSeconds: 1 });
    expect(res.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("accepts a legitimate score for tutorial (score = 0)", async () => {
    dbStub.selectImpl = async () => ({ completed_missions: ["tutorial"] });
    const res = await post({ missionId: "tutorial", score: 0, timeSeconds: 999 });
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalled();
  });

  it("accepts a realistic score for tutorial (well below per-mission cap)", async () => {
    // tutorial has 11 enemies (5 aphids + 5 aphids + 1 aphid-giant).
    // Max score with all kills at combo 8: 5*30*8 + 5*30*8 + 1*100*8 = 3200.
    // A score of 1500 is realistic and should be accepted.
    dbStub.selectImpl = async () => ({ completed_missions: ["tutorial"] });
    const res = await post({ missionId: "tutorial", score: 1500, timeSeconds: 30 });
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalled();
  });

  it("accepts a realistic score for combat-1 (well below per-mission cap)", async () => {
    // combat-1 has ~34 enemies across 3 waves. Generous max is well under 50000.
    const res = await post({ missionId: "combat-1", score: 25000, timeSeconds: 120 });
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalled();
  });
});

describe("SEC-014 — maxLegitScore derivation", () => {
  it("returns a finite positive number for every mission in MISSION_IDS", async () => {
    const { maxLegitScore } = await import("../../src/lib/saveValidation");
    const { MISSION_IDS } = await import("../../src/lib/schemas/save");
    for (const id of MISSION_IDS) {
      const cap = maxLegitScore(id);
      expect(cap).toBeGreaterThan(0);
      expect(Number.isFinite(cap)).toBe(true);
    }
  });

  it("tutorial cap is above realistic score (1500) and below INT max", async () => {
    const { maxLegitScore } = await import("../../src/lib/saveValidation");
    const cap = maxLegitScore("tutorial");
    expect(cap).toBeGreaterThan(1500);
    expect(cap).toBeLessThan(2_147_483_647);
  });

  it("combat-1 cap is above 25000 (realistic) and below 10_000_000", async () => {
    const { maxLegitScore } = await import("../../src/lib/saveValidation");
    const cap = maxLegitScore("combat-1");
    expect(cap).toBeGreaterThan(25000);
    expect(cap).toBeLessThan(10_000_000);
  });

  it("missions with no waves (shops/hubs) fall back to a non-zero default cap", async () => {
    const { maxLegitScore } = await import("../../src/lib/saveValidation");
    // 'shop', 'market' are non-combat missions with no waves; they have
    // a mission-completion guard upstream so a score for them is unusual,
    // but the cap helper must not return 0 (0 would block even score=0).
    const shopCap = maxLegitScore("shop");
    expect(shopCap).toBeGreaterThan(0);
  });
});

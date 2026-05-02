import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

// Per-test stubs for the shape getDb() returns. We only need
// selectFrom().selectAll().where().where().executeTakeFirst() and
// insertInto().values().onConflict().execute().
const dbStub: {
  selectRow: Record<string, unknown> | undefined;
  insertSpy: (values: Record<string, unknown>) => void;
  insertImpl: () => Promise<unknown>;
} = {
  selectRow: undefined,
  insertSpy: () => undefined,
  insertImpl: async () => undefined
};

function selectChain() {
  return {
    selectAll: () => selectChain(),
    // POST now reads the prior save row via .select([...]) before writing,
    // to bound the credits delta. Reuses the same dbStub.selectRow so a
    // test can stub the "previous credits" by setting it.
    select: () => selectChain(),
    where: () => selectChain(),
    executeTakeFirst: async () => dbStub.selectRow
  };
}

function insertChain() {
  return {
    values: (v: Record<string, unknown>) => {
      dbStub.insertSpy(v);
      return insertChain();
    },
    onConflict: () => insertChain(),
    execute: () => dbStub.insertImpl()
  };
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    selectFrom: () => selectChain(),
    insertInto: () => insertChain()
  })
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  dbStub.selectRow = undefined;
  dbStub.insertSpy = vi.fn();
  dbStub.insertImpl = async () => undefined;
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("./route");
}

describe("GET /api/save", () => {
  it("returns 401 when no session is present (graceful degrade for offline play)", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns null when no save row exists for the player", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    dbStub.selectRow = undefined;
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("maps the DB row into the API shape", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const updatedAt = new Date("2025-06-01T00:00:00.000Z");
    dbStub.selectRow = {
      slot: 1,
      credits: 42,
      current_planet: "tutorial",
      ship_config: { foo: "bar" },
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial", "combat-1"],
      played_time_seconds: 60,
      seen_story_entries: ["great-potato-awakening"],
      updated_at: updatedAt
    };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      slot: 1,
      credits: 42,
      currentPlanet: "tutorial",
      shipConfig: { foo: "bar" },
      completedMissions: ["tutorial"],
      unlockedPlanets: ["tutorial", "combat-1"],
      playedTimeSeconds: 60,
      seenStoryEntries: ["great-potato-awakening"],
      updatedAt: updatedAt.toISOString()
    });
  });

  it("returns 500 on a DB error", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    upsertMock.mockRejectedValueOnce(new Error("connection refused"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await loadRoute();
    const res = await GET();
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error", message: "connection refused" });
  });
});

describe("POST /api/save", () => {
  it("returns 401 unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://x/api/save", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON body", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", { method: "POST", body: "{not json" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_json" });
  });

  it("rejects malformed payload with 400 + validation_failed (Zod strict)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const { POST } = await loadRoute();
    // Pre-T2 the route silently coerced/floored these fields; post-T2
    // SavePayloadSchema.safeParse rejects garbage at the boundary.
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 99.7,
        currentPlanet: "tutorial",
        shipConfig: { weapon: "rapid-fire" },
        completedMissions: ["tutorial", 42, null],
        unlockedPlanets: "not-an-array",
        playedTimeSeconds: "garbage"
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation_failed");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects an array as shipConfig with 400 (Zod strict)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({ shipConfig: ["bad"] })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects an inflated playedTimeSeconds claim (closes credits-cap escape hatch)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    // Pretend the player saved 60s ago with 100s of playtime. A POST that
    // claims 100_000s of new playtime in 60s of wall-clock is the workaround
    // for the credits-delta cap — the playtime guard rejects it before the
    // credits validator even runs.
    dbStub.selectRow = {
      slot: 1,
      credits: 100,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial"],
      played_time_seconds: 100,
      updated_at: new Date(Date.now() - 60_000)
    };
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 100,
        playedTimeSeconds: 100_000,
        completedMissions: ["tutorial"],
        unlockedPlanets: ["tutorial"]
      })
    });
    const res = await POST(req);
    warnSpy.mockRestore();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("playtime_delta_invalid");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects a save-state regression with 422 save_regression (the 2026-05-02 wipe pattern)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    // Existing save row: real progression — completedMissions and
    // unlockedPlanets populated, playtime = 1800s, recent updated_at so the
    // playtime guard doesn't trip first on the wall-clock check.
    dbStub.selectRow = {
      slot: 1,
      credits: 5000,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial", "combat-1", "boss-1", "pirate-beacon"],
      unlocked_planets: [
        "tutorial",
        "shop",
        "market",
        "pirate-beacon",
        "tubernovae-outpost",
        "combat-1",
        "boss-1",
        "ember-run"
      ],
      played_time_seconds: 1800,
      updated_at: new Date(Date.now() - 5000)
    };
    const insertSpy = vi.fn();
    dbStub.insertSpy = insertSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    // Buggy client posts INITIAL_STATE on top of the real save: empty
    // completedMissions, zero playtime, default-only unlocked planets.
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 0,
        playedTimeSeconds: 0,
        completedMissions: [],
        unlockedPlanets: ["tutorial", "shop", "market", "pirate-beacon", "tubernovae-outpost"]
      })
    });
    const res = await POST(req);
    warnSpy.mockRestore();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("save_regression");
    expect(body.message).toMatch(/completedMissions regressed/);
    // Critical: the upsert MUST NOT have run.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 500 when the DB write fails", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.insertImpl = async () => {
      throw new Error("write failed");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({})
    });
    const res = await POST(req);
    errSpy.mockRestore();
    expect(res.status).toBe(500);
  });
});

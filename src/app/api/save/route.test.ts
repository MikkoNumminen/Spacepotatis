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

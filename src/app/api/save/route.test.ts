import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

// Per-test stubs for the shape getDb() returns. We need both
// `selectFrom("spacepotatis.save_games")` (the prev-row lookup) and
// `insertInto(table)` for two tables: `spacepotatis.save_games` (the
// upsert) and `spacepotatis.save_audit` (the forensic log written by
// every authenticated POST attempt).
const dbStub: {
  selectRow: Record<string, unknown> | undefined;
  saveInsertSpy: (values: Record<string, unknown>) => void;
  saveInsertImpl: () => Promise<unknown>;
  auditInsertSpy: (values: Record<string, unknown>) => void;
  auditInsertImpl: () => Promise<unknown>;
} = {
  selectRow: undefined,
  saveInsertSpy: () => undefined,
  saveInsertImpl: async () => undefined,
  auditInsertSpy: () => undefined,
  auditInsertImpl: async () => undefined
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

function insertChain(table: string) {
  const isAudit = table === "spacepotatis.save_audit";
  return {
    values: (v: Record<string, unknown>) => {
      if (isAudit) dbStub.auditInsertSpy(v);
      else dbStub.saveInsertSpy(v);
      return insertChain(table);
    },
    onConflict: () => insertChain(table),
    execute: () => (isAudit ? dbStub.auditInsertImpl() : dbStub.saveInsertImpl())
  };
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    selectFrom: () => selectChain(),
    insertInto: (table: string) => insertChain(table)
  })
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  dbStub.selectRow = undefined;
  dbStub.saveInsertSpy = vi.fn();
  dbStub.saveInsertImpl = async () => undefined;
  dbStub.auditInsertSpy = vi.fn();
  dbStub.auditInsertImpl = async () => undefined;
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
      current_solar_system_id: "tubernovae",
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
      currentSolarSystemId: "tubernovae",
      updatedAt: updatedAt.toISOString()
    });
  });

  it("returns null currentSolarSystemId for rows that pre-date the column", async () => {
    // Old save rows in prod won't have the column populated until the
    // player warps once after migration. The GET surface must pass null
    // through; the client's hydrate() treats null as "fall back to
    // first unlocked system". If we accidentally coerced null to
    // "tutorial" here we'd defeat the whole point of persisting the
    // last-viewed system.
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
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: updatedAt
    };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { currentSolarSystemId: unknown };
    expect(body.currentSolarSystemId).toBeNull();
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
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://x/api/save", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    // Anonymous attempts have no player_id to FK to — must NOT audit.
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON body (no audit row)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", { method: "POST", body: "{not json" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_json" });
    // Malformed JSON has no usable payload — route already 400s and skips audit.
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed payload with 400 + validation_failed (Zod strict)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
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
    expect(saveInsertSpy).not.toHaveBeenCalled();
  });

  it("rejects an array as shipConfig with 400 (Zod strict)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({ shipConfig: ["bad"] })
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(saveInsertSpy).not.toHaveBeenCalled();
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
      seen_story_entries: [],
      updated_at: new Date(Date.now() - 60_000)
    };
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
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
    expect(saveInsertSpy).not.toHaveBeenCalled();
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
      seen_story_entries: [],
      updated_at: new Date(Date.now() - 5000)
    };
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
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
    expect(saveInsertSpy).not.toHaveBeenCalled();
  });

  it("returns 500 when the DB write fails", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.saveInsertImpl = async () => {
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

  it("persists currentSolarSystemId on the upsert (Continue lands the player back where they left off)", async () => {
    // Regression test for the bug where Continue always restarted the
    // player at Sol Spudensis: the column existed in GameState and the
    // schema accepted the field, but the upsert silently dropped it.
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 0,
        playedTimeSeconds: 0,
        completedMissions: [],
        unlockedPlanets: [],
        currentSolarSystemId: "tubernovae"
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(saveInsertSpy).toHaveBeenCalledTimes(1);
    const written = saveInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written.current_solar_system_id).toBe("tubernovae");
  });

  it("writes null current_solar_system_id when the client doesn't send one", async () => {
    // Anonymous-ish saves and pre-warp saves omit the field; we must not
    // coerce that to "tutorial" or any other id — the column is nullable
    // by design.
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 0,
        playedTimeSeconds: 0,
        completedMissions: [],
        unlockedPlanets: []
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    const written = saveInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(written.current_solar_system_id).toBeNull();
  });
});

describe("POST /api/save audit log", () => {
  it("writes an audit row on a successful save (status 204, response_error NULL, prev snapshot populated)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    const updatedAt = new Date(Date.now() - 30_000);
    dbStub.selectRow = {
      slot: 1,
      credits: 100,
      current_planet: "tutorial",
      ship_config: { slots: [] },
      completed_missions: ["tutorial"],
      unlocked_planets: ["tutorial", "combat-1"],
      played_time_seconds: 120,
      seen_story_entries: ["great-potato-awakening"],
      current_solar_system_id: "tubernovae",
      updated_at: updatedAt
    };
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 105,
        playedTimeSeconds: 150,
        completedMissions: ["tutorial"],
        unlockedPlanets: ["tutorial", "combat-1"]
      }),
      headers: {
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "vitest/forensic"
      }
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const audit = auditSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(audit.player_id).toBe("player-uuid");
    expect(audit.slot).toBe(1);
    expect(audit.response_status).toBe(204);
    expect(audit.response_error).toBeNull();
    expect(audit.request_ip).toBe("203.0.113.7");
    expect(audit.user_agent).toBe("vitest/forensic");
    const payload = audit.request_payload as Record<string, unknown>;
    expect(payload.credits).toBe(105);
    expect(payload.playedTimeSeconds).toBe(150);
    const prev = audit.prev_snapshot as Record<string, unknown>;
    expect(prev.credits).toBe(100);
    expect(prev.completedMissions).toEqual(["tutorial"]);
    expect(prev.playedTimeSeconds).toBe(120);
    // Forensic completeness: the audit must capture the previous solar
    // system pointer so that if a future bug ever wipes it, we can see
    // what it was before.
    expect(prev.currentSolarSystemId).toBe("tubernovae");
    expect(prev.updatedAt).toBe(updatedAt.toISOString());
  });

  it("writes an audit row on a 422 rejection (response_error = the rejection code, prev snapshot populated, request payload preserved)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
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
      seen_story_entries: [],
      updated_at: new Date(Date.now() - 5000)
    };
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const saveInsertSpy = vi.fn();
    dbStub.saveInsertSpy = saveInsertSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const reqBody = {
      credits: 0,
      playedTimeSeconds: 0,
      completedMissions: [],
      unlockedPlanets: ["tutorial", "shop", "market", "pirate-beacon", "tubernovae-outpost"]
    };
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify(reqBody)
    });
    const res = await POST(req);
    warnSpy.mockRestore();
    expect(res.status).toBe(422);
    expect(saveInsertSpy).not.toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const audit = auditSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(audit.response_status).toBe(422);
    expect(audit.response_error).toBe("save_regression");
    expect(audit.request_payload).toEqual(reqBody);
    const prev = audit.prev_snapshot as Record<string, unknown>;
    expect(prev.credits).toBe(5000);
    expect(prev.completedMissions).toEqual([
      "tutorial",
      "combat-1",
      "boss-1",
      "pirate-beacon"
    ]);
  });

  it("writes an audit row even when the save itself fails (500 captures the attempt)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.saveInsertImpl = async () => {
      throw new Error("write failed");
    };
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({})
    });
    const res = await POST(req);
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const audit = auditSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(audit.response_status).toBe(500);
    expect(audit.response_error).toBe("server_error");
  });

  it("first save (no prev row): prev_snapshot is NULL, audit inserted normally", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.selectRow = undefined;
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 0,
        playedTimeSeconds: 30,
        completedMissions: [],
        unlockedPlanets: []
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const audit = auditSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(audit.response_status).toBe(204);
    expect(audit.response_error).toBeNull();
    expect(audit.prev_snapshot).toBeNull();
  });

  it("anonymous user (401): no audit row written (no player_id to FK to)", async () => {
    authMock.mockResolvedValue(null);
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({ credits: 1 })
      })
    );
    expect(res.status).toBe(401);
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("audit insert failure does NOT block the save (still returns 204)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.auditInsertImpl = async () => {
      throw new Error("audit table missing");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 0,
        playedTimeSeconds: 30,
        completedMissions: [],
        unlockedPlanets: []
      })
    });
    const res = await POST(req);
    errSpy.mockRestore();
    expect(res.status).toBe(204);
  });
});

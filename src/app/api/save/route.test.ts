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
// `insertInto(table)` for THREE tables:
//   - `spacepotatis.save_games`    — the authoritative upsert (current state)
//   - `spacepotatis.save_audit`    — forensic log (every attempt)
//   - `spacepotatis.save_snapshots`— append-only history (success only),
//                                    the structural fix to the 2026-05-02 wipe
const dbStub: {
  selectRow: Record<string, unknown> | undefined;
  saveInsertSpy: (values: Record<string, unknown>) => void;
  saveInsertImpl: () => Promise<unknown>;
  auditInsertSpy: (values: Record<string, unknown>) => void;
  auditInsertImpl: () => Promise<unknown>;
  snapshotInsertSpy: (values: Record<string, unknown>) => void;
  snapshotInsertImpl: () => Promise<unknown>;
} = {
  selectRow: undefined,
  saveInsertSpy: () => undefined,
  saveInsertImpl: async () => undefined,
  auditInsertSpy: () => undefined,
  auditInsertImpl: async () => undefined,
  snapshotInsertSpy: () => undefined,
  snapshotInsertImpl: async () => undefined
};

function selectChain() {
  return {
    selectAll: () => selectChain(),
    // POST now reads the prior save row via .select([...]) before writing,
    // to bound the credits delta. Reuses the same dbStub.selectRow so a
    // test can stub the "previous credits" by setting it.
    select: () => selectChain(),
    where: () => selectChain(),
    // SEC-013 — the prev-row SELECT inside the transaction calls
    // `.forUpdate()`. The mock just chains through; serialization isn't
    // simulated here (the dedicated saveRace.test.ts asserts the structural
    // contract). Returning the same shape keeps existing route tests green.
    forUpdate: () => selectChain(),
    executeTakeFirst: async () => dbStub.selectRow
  };
}

function insertChain(table: string) {
  const isAudit = table === "spacepotatis.save_audit";
  const isSnapshot = table === "spacepotatis.save_snapshots";
  return {
    values: (v: Record<string, unknown>) => {
      if (isAudit) dbStub.auditInsertSpy(v);
      else if (isSnapshot) dbStub.snapshotInsertSpy(v);
      else dbStub.saveInsertSpy(v);
      return insertChain(table);
    },
    onConflict: () => insertChain(table),
    execute: () =>
      isAudit
        ? dbStub.auditInsertImpl()
        : isSnapshot
          ? dbStub.snapshotInsertImpl()
          : dbStub.saveInsertImpl()
  };
}

// The route opens a transaction for the read-validate-write critical path
// (SEC-013). The mock's `.transaction().execute(cb)` runs `cb` against a trx
// shaped like the top-level db — same selectFrom + insertInto chains — so
// the existing test stubs just work inside the transaction.
function makeDbHandle() {
  return {
    selectFrom: () => selectChain(),
    insertInto: (table: string) => insertChain(table),
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
  dbStub.selectRow = undefined;
  dbStub.saveInsertSpy = vi.fn();
  dbStub.saveInsertImpl = async () => undefined;
  dbStub.auditInsertSpy = vi.fn();
  dbStub.auditInsertImpl = async () => undefined;
  dbStub.snapshotInsertSpy = vi.fn();
  dbStub.snapshotInsertImpl = async () => undefined;
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
    expect(await res.json()).toEqual({ error: "server_error" });
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
    // SEC-020 — playtime_delta_invalid is collapsed to save_rejected in the
    // client-visible response. The specific code lives in save_audit.response_error.
    expect((await res.json()).error).toBe("save_rejected");
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
        currentSolarSystemId: "tubernovae",
        // SEC-027: currentSolarSystemId must be in unlockedSolarSystems.
        unlockedSolarSystems: ["tubernovae"]
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

  it("audit insert retries on a transient Neon flake and the audit row eventually lands", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let auditCalls = 0;
    dbStub.auditInsertImpl = async () => {
      auditCalls += 1;
      if (auditCalls === 1) throw new Error("Control plane request failed");
      return undefined;
    };
    const auditSpy = (dbStub.auditInsertSpy = vi.fn());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    warnSpy.mockRestore();
    expect(res.status).toBe(204);
    // Two .values() calls — one per attempt. The successful retry is what
    // lands the forensic row; the first attempt's row was never committed.
    expect(auditSpy).toHaveBeenCalledTimes(2);
    expect(auditCalls).toBe(2);
  });
});

// Append-only history mirror of every SUCCESSFUL save. The structural
// counterpart to validateNoRegression — even if a future bug wipes
// save_games, the prior snapshot stays queryable here. v1 dual-write: the
// GET path still reads from save_games, so a snapshot-write failure costs
// no user-visible state, only a forensic history row.
//
// Pin the contract:
//   - Successful POST writes a snapshot with the new state shape.
//   - Rejected POST (422) does NOT write a snapshot (no row committed).
//   - 500 server error does NOT write a snapshot (no row committed).
//   - Snapshot insert failure NEVER blocks the save (still returns 204).
describe("POST /api/save save_snapshots dual-write", () => {
  it("writes a snapshot on a successful save with the new state shape", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
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
      updated_at: new Date(Date.now() - 30_000)
    };
    const snapshotSpy = vi.fn();
    dbStub.snapshotInsertSpy = snapshotSpy;
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 105,
        playedTimeSeconds: 150,
        completedMissions: ["tutorial"],
        unlockedPlanets: ["tutorial", "combat-1"],
        shipConfig: { slots: [{ id: "rapid-fire" }] },
        seenStoryEntries: ["great-potato-awakening", "tubernovae-arrival"]
      })
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    const row = snapshotSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.player_id).toBe("player-uuid");
    expect(row.slot).toBe(1);
    expect(row.source).toBe("post_api_save");
    const payload = row.payload as Record<string, unknown>;
    expect(payload.credits).toBe(105);
    expect(payload.playedTimeSeconds).toBe(150);
    expect(payload.completedMissions).toEqual(["tutorial"]);
    expect(payload.shipConfig).toEqual({ slots: [{ id: "rapid-fire" }] });
    expect(payload.seenStoryEntries).toEqual([
      "great-potato-awakening",
      "tubernovae-arrival"
    ]);
  });

  it("does NOT write a snapshot when the save is rejected (422 save_regression)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.selectRow = {
      slot: 1,
      credits: 5000,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial", "combat-1"],
      unlocked_planets: ["tutorial", "combat-1"],
      played_time_seconds: 1800,
      seen_story_entries: [],
      updated_at: new Date(Date.now() - 5000)
    };
    const snapshotSpy = vi.fn();
    dbStub.snapshotInsertSpy = snapshotSpy;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({
        credits: 0,
        playedTimeSeconds: 0,
        completedMissions: [],
        unlockedPlanets: ["tutorial", "combat-1"]
      })
    });
    const res = await POST(req);
    warnSpy.mockRestore();
    expect(res.status).toBe(422);
    // Critical: the rejected save did not commit, so a snapshot would
    // misrepresent the authoritative state.
    expect(snapshotSpy).not.toHaveBeenCalled();
  });

  it("does NOT write a snapshot when the save_games upsert fails (500)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.saveInsertImpl = async () => {
      throw new Error("write failed");
    };
    const snapshotSpy = vi.fn();
    dbStub.snapshotInsertSpy = snapshotSpy;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify({})
    });
    const res = await POST(req);
    errSpy.mockRestore();
    expect(res.status).toBe(500);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });

  it("snapshot insert failure does NOT block the save (still returns 204)", async () => {
    // Mirrors the audit-table failure-mode contract — the structural-fix
    // table is a forensic shadow, never the critical path.
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.snapshotInsertImpl = async () => {
      throw new Error("save_snapshots table missing");
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

// Same Neon control-plane flake the /leaderboard fan-out can hit also
// applies to /api/save's connection acquire. The route wraps upsertPlayerId
// and the transaction body in withNeonRetry so a single flake doesn't 500
// the user's save POST. Pin both:
//   - Transient flake → route eventually returns 204 (retry succeeded).
//   - Non-transient error → route 500s on first attempt (no retry).
describe("POST /api/save Neon retry", () => {
  it("retries on a transient 'Control plane request failed' flake from upsertPlayerId and returns 204", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let upsertCalls = 0;
    upsertMock.mockImplementation(async () => {
      upsertCalls += 1;
      if (upsertCalls === 1) throw new Error("Control plane request failed");
      return "player-uuid";
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    warnSpy.mockRestore();
    expect(res.status).toBe(204);
    expect(upsertCalls).toBe(2);
  });

  it("retries on a transient flake during the transaction body and returns 204 — proves the upsert is idempotent under retry", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let saveInsertCalls = 0;
    dbStub.saveInsertImpl = async () => {
      saveInsertCalls += 1;
      if (saveInsertCalls === 1) throw new Error("Connection terminated unexpectedly");
      return undefined;
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
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
    warnSpy.mockRestore();
    expect(res.status).toBe(204);
    // Two upsert attempts: first threw and rolled back, second committed.
    // Pins the safety reasoning in the route header — the upsert is
    // idempotent under retry because of ON CONFLICT (player_id, slot).
    expect(saveInsertCalls).toBe(2);
  });

  it("does NOT retry on a non-transient DB error (returns 500 immediately)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let saveInsertCalls = 0;
    dbStub.saveInsertImpl = async () => {
      saveInsertCalls += 1;
      throw new Error("permission denied for table save_games");
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
    expect(res.status).toBe(500);
    expect(saveInsertCalls).toBe(1);
  });
});

// Same retry behavior on the read path. Less impactful (a flaked GET just
// asks the user to refresh) but symmetric — the same flake symptom can hit
// either route, so both should cover it.
describe("GET /api/save Neon retry", () => {
  it("retries upsertPlayerId on a transient flake and returns the row", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    let upsertCalls = 0;
    upsertMock.mockImplementation(async () => {
      upsertCalls += 1;
      if (upsertCalls === 1) throw new Error("Control plane request failed");
      return "player-uuid";
    });
    dbStub.selectRow = {
      slot: 1,
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 0,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date("2025-06-01T00:00:00.000Z")
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { GET } = await loadRoute();
    const res = await GET();
    warnSpy.mockRestore();
    expect(res.status).toBe(200);
    expect(upsertCalls).toBe(2);
  });
});

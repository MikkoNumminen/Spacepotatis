import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-020 — Validator error-code ordering exposes guard-pass/fail structure.
//
// Three of the four 422 error codes are collapsed to `save_rejected` in the
// client-visible response body. `save_regression` stays distinct because
// saveQueue.ts treats it as TRANSIENT for its retry logic — collapsing it
// would cause the queue to treat the rejection as PERMANENT and drop the
// pending save, breaking save durability.
//
// The save_audit row's `response_error` column still gets the specific code
// on all four paths (tested via the audit insert spy).
//
// Test FAILS on master (three codes are currently specific, not collapsed)
// and PASSES after the fix.

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

// Audit insert spy — captures `response_error` from each save_audit write.
const auditInsertSpy = vi.fn();

function makeSelectChain(row: Record<string, unknown> | undefined) {
  const chain = {
    select: () => chain,
    where: () => chain,
    forUpdate: () => chain,
    executeTakeFirst: async () => row
  };
  return chain;
}

function makeInsertChain(table: string) {
  const isAudit = table === "spacepotatis.save_audit";
  const chain = {
    values: (v: Record<string, unknown>) => {
      if (isAudit) auditInsertSpy(v);
      return chain;
    },
    onConflict: () => chain,
    execute: async () => undefined
  };
  return chain;
}

function makeDbHandle(prevRow: Record<string, unknown> | undefined) {
  return {
    selectFrom: () => makeSelectChain(prevRow),
    insertInto: (table: string) => makeInsertChain(table),
    transaction: () => ({
      execute: async <T>(
        cb: (trx: ReturnType<typeof makeDbHandle>) => Promise<T>
      ): Promise<T> => cb(makeDbHandle(prevRow))
    })
  };
}

const PLAYER_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PLAYER_EMAIL = "player@example.com";

let prevRowOverride: Record<string, unknown> | undefined = undefined;

vi.mock("@/lib/db", () => ({
  getDb: () => makeDbHandle(prevRowOverride)
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  auditInsertSpy.mockReset();
  authMock.mockResolvedValue({ user: { email: PLAYER_EMAIL, name: null } });
  upsertMock.mockResolvedValue(PLAYER_UUID);
  prevRowOverride = undefined;
  // Silence console.warn during rejection paths (cosmetic).
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/save/route");
}

const BASE_PAYLOAD = {
  credits: 0,
  playedTimeSeconds: 30,
  completedMissions: [] as string[],
  unlockedPlanets: [] as string[]
};

describe("SEC-020 — 422 response body codes are opaque (save_rejected) except save_regression", () => {
  it("mission_graph_invalid → response body error is save_rejected (collapsed)", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          completedMissions: [],
          unlockedPlanets: ["combat-1"] // requires tutorial — triggers mission_graph_invalid
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");
    expect(body.error).not.toBe("mission_graph_invalid");
  });

  it("mission_graph_invalid → save_audit row still gets specific error code", async () => {
    const { POST } = await loadRoute();

    await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          completedMissions: [],
          unlockedPlanets: ["combat-1"]
        })
      })
    );

    // The audit insert should have been called with the specific code.
    const auditCalls = auditInsertSpy.mock.calls as Array<[Record<string, unknown>]>;
    const auditRows = auditCalls.map((call) => call[0]);
    const rejectionRow = auditRows.find((r) => r.response_status === 422);
    expect(rejectionRow).toBeDefined();
    expect(rejectionRow?.response_error).toBe("mission_graph_invalid");
  });

  it("playtime_delta_invalid → response body error is save_rejected (collapsed)", async () => {
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 30,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 5_000) // only 5 s ago
    };

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          playedTimeSeconds: 9999 // 9969 s delta vs 5 s window
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");
    expect(body.error).not.toBe("playtime_delta_invalid");
  });

  it("playtime_delta_invalid → save_audit row still gets specific error code", async () => {
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 30,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 5_000)
    };

    const { POST } = await loadRoute();

    await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          playedTimeSeconds: 9999
        })
      })
    );

    const auditCalls = auditInsertSpy.mock.calls as Array<[Record<string, unknown>]>;
    const auditRows = auditCalls.map((call) => call[0]);
    const rejectionRow = auditRows.find((r) => r.response_status === 422);
    expect(rejectionRow).toBeDefined();
    expect(rejectionRow?.response_error).toBe("playtime_delta_invalid");
  });

  it("credits_delta_invalid → response body error is save_rejected (collapsed)", async () => {
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 30,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 300_000) // 5 min ago
    };

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          credits: 999999,
          playedTimeSeconds: 35
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");
    expect(body.error).not.toBe("credits_delta_invalid");
  });

  it("credits_delta_invalid → save_audit row still gets specific error code", async () => {
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 30,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 300_000)
    };

    const { POST } = await loadRoute();

    await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          credits: 999999,
          playedTimeSeconds: 35
        })
      })
    );

    const auditCalls = auditInsertSpy.mock.calls as Array<[Record<string, unknown>]>;
    const auditRows = auditCalls.map((call) => call[0]);
    const rejectionRow = auditRows.find((r) => r.response_status === 422);
    expect(rejectionRow).toBeDefined();
    expect(rejectionRow?.response_error).toBe("credits_delta_invalid");
  });

  it("save_regression → response body error is save_regression (preserved!)", async () => {
    // save_regression MUST stay distinct — saveQueue.ts treats it as
    // TRANSIENT for retry logic (isPermanent returns false for save_regression).
    // Collapsing it to save_rejected would make isPermanent return true
    // (save_rejected is not in the TRANSIENT list), causing the queue to drop
    // the pending save instead of retrying — breaking save durability.
    prevRowOverride = {
      credits: 100,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial", "combat-1"],
      unlocked_planets: [
        "tutorial",
        "shop",
        "market",
        "pirate-beacon",
        "tubernovae-outpost",
        "combat-1",
        "boss-1"
      ],
      played_time_seconds: 120,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 60_000)
    };

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          credits: 100,
          playedTimeSeconds: 60,
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

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_regression");
    expect(body.error).not.toBe("save_rejected");
  });

  it("save_regression → save_audit row also gets save_regression (not collapsed)", async () => {
    prevRowOverride = {
      credits: 100,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial", "combat-1"],
      unlocked_planets: [
        "tutorial",
        "shop",
        "market",
        "pirate-beacon",
        "tubernovae-outpost",
        "combat-1",
        "boss-1"
      ],
      played_time_seconds: 120,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 60_000)
    };

    const { POST } = await loadRoute();

    await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          credits: 100,
          playedTimeSeconds: 60,
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

    const auditCalls = auditInsertSpy.mock.calls as Array<[Record<string, unknown>]>;
    const auditRows = auditCalls.map((call) => call[0]);
    const rejectionRow = auditRows.find((r) => r.response_status === 422);
    expect(rejectionRow).toBeDefined();
    expect(rejectionRow?.response_error).toBe("save_regression");
  });
});

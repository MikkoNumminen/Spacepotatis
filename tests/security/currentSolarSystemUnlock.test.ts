import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-027 — `currentSolarSystemId` not validated against `unlockedSolarSystems`.
//
// A hand-crafted POST can set `currentSolarSystemId` to any valid system id
// without it being in the player's `unlockedSolarSystems` list. Impact is
// UI-cosmetic only (galaxy view opens at a system the player technically can't
// enter), but the schema-validates-shape-not-state pattern was a small
// future-rake; this check closes it.
//
// The new guard fires inside the SEC-013 transaction, after all other validators,
// before the upsert. Rejection follows the SEC-020 collapsed-code pattern:
// client response body → `{error: "save_rejected"}`; audit row's
// `response_error` → `"solar_system_not_unlocked"` (specific, for forensics).
//
// Test FAILS on master (no check exists) and PASSES after the fix.

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
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/save/route");
}

// Minimal valid payload that passes all other guards (no prev row → first save).
const BASE_PAYLOAD = {
  credits: 0,
  playedTimeSeconds: 30,
  completedMissions: [] as string[],
  unlockedPlanets: [] as string[],
  unlockedSolarSystems: ["tutorial"] as string[]
};

describe("SEC-027 — POST /api/save rejects currentSolarSystemId not in unlockedSolarSystems", () => {
  it("locked system → 422 save_rejected (response body collapsed per SEC-020)", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          currentSolarSystemId: "tubernovae",
          unlockedSolarSystems: ["tutorial"] // tubernovae not unlocked
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");
  });

  it("locked system → audit row response_error is solar_system_not_unlocked (specific code)", async () => {
    const { POST } = await loadRoute();

    await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          currentSolarSystemId: "tubernovae",
          unlockedSolarSystems: ["tutorial"]
        })
      })
    );

    const auditCalls = auditInsertSpy.mock.calls as Array<[Record<string, unknown>]>;
    const auditRows = auditCalls.map((call) => call[0]);
    const rejectionRow = auditRows.find((r) => r.response_status === 422);
    expect(rejectionRow).toBeDefined();
    expect(rejectionRow?.response_error).toBe("solar_system_not_unlocked");
  });

  it("currentSolarSystemId matches unlockedSolarSystems → 204 success", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: ["tutorial"]
        })
      })
    );

    expect(res.status).toBe(204);
  });

  it("currentSolarSystemId omitted → 204 success (absent field is always allowed)", async () => {
    const { POST } = await loadRoute();

    // Omitting currentSolarSystemId (Zod sees undefined) means the client
    // hasn't set a preferred system yet. The schema marks the field as
    // .optional() (not nullable), so omission is the correct expression of
    // "no current system"; the route writes null to the DB column in that case.
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          // currentSolarSystemId intentionally absent
          unlockedSolarSystems: ["tutorial"]
        })
      })
    );

    expect(res.status).toBe(204);
  });

  it("currentSolarSystemId set but unlockedSolarSystems is empty → 422 (defense-in-depth)", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: [] // even tutorial not listed
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");
  });
});

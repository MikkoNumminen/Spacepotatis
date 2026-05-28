import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-027 (post-fix) — the unlock check derives the unlocked-systems set from
// `prevRow.completed_missions + SYSTEM_UNLOCK_GATES` on the server. The body's
// `unlockedSolarSystems` is IGNORED by the guard.
//
// Before this fix, an attacker could POST a forged `unlockedSolarSystems`
// list alongside `currentSolarSystemId` and the route would accept it. The
// field is still on the wire (SavePayloadSchema accepts it for backwards
// compatibility) but the SEC-027 guard derives trust from prev.completed_missions.
//
// Same pattern as SEC-017's deriveCapInputMissions — the credits-cap input is
// derived from the trusted prev row, not from the user-submitted completion list.

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

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
    execute: async () => [{ numInsertedOrUpdatedRows: 1n }]
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

// Minimal prev row simulating a tutorial-only player. Only completed
// "combat-tutorial-1"... wait, the actual mission ids in MISSION_IDS are
// ["tutorial", "combat-1", "boss-1", ...]. boss-1 is what unlocks tubernovae
// (per SYSTEM_UNLOCK_GATES). A tutorial-only player has NOT cleared boss-1,
// so tubernovae is locked. We use ["tutorial"] (or just []) to model that.
function makePrevRow(opts: {
  completedMissions: readonly string[];
  unlockedPlanets?: readonly string[];
  seenStoryEntries?: readonly string[];
}): Record<string, unknown> {
  return {
    credits: 0,
    current_planet: null,
    ship_config: {},
    played_time_seconds: 100,
    completed_missions: [...opts.completedMissions],
    unlocked_planets: [...(opts.unlockedPlanets ?? opts.completedMissions)],
    seen_story_entries: [...(opts.seenStoryEntries ?? [])],
    current_solar_system_id: "tutorial",
    // Old prev row — gives the playtime guard plenty of wall-clock slack so
    // the test bodies can claim higher playedTimeSeconds without tripping
    // validatePlaytimeDelta. The wall-clock budget is `nowMs - updatedAt`.
    updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
  };
}

describe("SEC-027 — POST /api/save derives unlocked-systems from prevRow.completed_missions", () => {
  it("forged body.unlockedSolarSystems is IGNORED — locked system still 422s", async () => {
    // Prev row has only tutorial-tier completions; boss-1 is NOT in the list.
    // Per SYSTEM_UNLOCK_GATES, tubernovae stays locked.
    prevRowOverride = makePrevRow({
      completedMissions: ["tutorial", "combat-1"]
    });

    const { POST } = await loadRoute();

    // Forged body: claims tubernovae is unlocked. Body must be ignored.
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 200,
          completedMissions: ["tutorial", "combat-1"],
          unlockedPlanets: ["tutorial", "combat-1"],
          currentSolarSystemId: "tubernovae",
          unlockedSolarSystems: ["tutorial", "tubernovae"] // forged
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");

    // Audit row preserves the specific rejection code for forensics.
    const auditCalls = auditInsertSpy.mock.calls as Array<[Record<string, unknown>]>;
    const rejectionRow = auditCalls
      .map((c) => c[0])
      .find((r) => r.response_status === 422);
    expect(rejectionRow).toBeDefined();
    expect(rejectionRow?.response_error).toBe("solar_system_not_unlocked");
  });

  it("server-derived unlock honors a real boss-1 completion (tubernovae allowed)", async () => {
    // Prev row HAS the gate completion → tubernovae IS unlocked server-side.
    prevRowOverride = makePrevRow({
      completedMissions: ["tutorial", "combat-1", "boss-1"],
      unlockedPlanets: ["tutorial", "combat-1", "boss-1"]
    });

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 200,
          completedMissions: ["tutorial", "combat-1", "boss-1"],
          unlockedPlanets: ["tutorial", "combat-1", "boss-1"],
          currentSolarSystemId: "tubernovae",
          // No unlockedSolarSystems in body — server derives it.
        })
      })
    );

    expect(res.status).toBe(204);
  });

  it("no prev row + currentSolarSystemId=tutorial → 204 (tutorial always unlocked)", async () => {
    prevRowOverride = undefined;

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 30,
          completedMissions: [],
          unlockedPlanets: [],
          currentSolarSystemId: "tutorial"
          // unlockedSolarSystems omitted — server derives ["tutorial"].
        })
      })
    );

    expect(res.status).toBe(204);
  });

  it("no prev row + currentSolarSystemId=tubernovae → 422 (no gate completion)", async () => {
    prevRowOverride = undefined;

    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          credits: 0,
          playedTimeSeconds: 30,
          completedMissions: [],
          unlockedPlanets: [],
          currentSolarSystemId: "tubernovae",
          // Forged: try to convince the server tubernovae is unlocked.
          unlockedSolarSystems: ["tutorial", "tubernovae"]
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_rejected");
  });
});

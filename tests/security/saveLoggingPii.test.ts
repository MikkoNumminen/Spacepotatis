import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-005 — Player email must NOT appear in console.warn on save-rejection
// paths. The fix replaces `sessionEmail` with `playerId` in the four warn
// calls inside the transaction block.
//
// This test triggers each of the four rejection paths and captures every
// console.warn argument. It asserts that NONE of the captured arguments
// contain "@" (sentinel for email format), and that the player UUID IS
// present in the args. Test FAILS on master (warns currently include
// sessionEmail like "p@example.com") and PASSES after the fix.

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

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
    values: () => chain,
    onConflict: () => chain,
    execute: async () => undefined
  };
  void isAudit;
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
  authMock.mockResolvedValue({ user: { email: PLAYER_EMAIL, name: null } });
  upsertMock.mockResolvedValue(PLAYER_UUID);
  prevRowOverride = undefined;
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/save/route");
}

function captureWarns(): string[][] {
  const captured: string[][] = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    captured.push(args.map(String));
  });
  return captured;
}

function assertNoPiiInWarns(captured: string[][]) {
  const allArgs = captured.flat().join(" ");
  expect(allArgs, "console.warn must not contain player email (@)").not.toContain("@");
}

function assertPlayerIdInWarns(captured: string[][]) {
  const allArgs = captured.flat().join(" ");
  expect(allArgs, "console.warn must contain the player UUID").toContain(PLAYER_UUID);
}

// A minimal valid base payload to build rejection payloads from.
const BASE_PAYLOAD = {
  credits: 0,
  playedTimeSeconds: 30,
  completedMissions: [] as string[],
  unlockedPlanets: [] as string[]
};

describe("SEC-005 — console.warn on save-rejection paths must log playerId, not email", () => {
  it("mission_graph_invalid path: no email in warn, playerId present", async () => {
    const captured = captureWarns();
    const { POST } = await loadRoute();

    // Supply an unlocked planet without the corresponding completed mission
    // to trigger mission_graph_invalid.
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          completedMissions: [],
          unlockedPlanets: ["combat-1"] // combat-1 requires tutorial to be completed
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    // The response may be save_rejected (post-SEC-020) or mission_graph_invalid
    // (pre-SEC-020) — either way the reject path runs and the warn fires.
    expect(["mission_graph_invalid", "save_rejected"]).toContain(body.error);
    assertNoPiiInWarns(captured);
    assertPlayerIdInWarns(captured);
    vi.restoreAllMocks();
  });

  it("save_regression path: no email in warn, playerId present", async () => {
    // Set up a prevRow with more advanced state than the incoming payload so
    // validateNoRegression fires.
    prevRowOverride = {
      credits: 100,
      current_planet: null,
      ship_config: {},
      completed_missions: ["tutorial", "combat-1"],
      unlocked_planets: ["tutorial", "shop", "market", "pirate-beacon", "tubernovae-outpost", "combat-1", "boss-1"],
      played_time_seconds: 120,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 60_000)
    };

    const captured = captureWarns();
    const { POST } = await loadRoute();

    // Send a payload that regresses completedMissions.
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          credits: 100,
          playedTimeSeconds: 60,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial", "shop", "market", "pirate-beacon", "tubernovae-outpost"]
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("save_regression");
    assertNoPiiInWarns(captured);
    assertPlayerIdInWarns(captured);
    vi.restoreAllMocks();
  });

  it("playtime_delta_invalid path: no email in warn, playerId present", async () => {
    // Set up a prevRow with a recent updated_at so a large playtime jump
    // triggers playtime_delta_invalid.
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 30,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 5_000) // only 5 seconds ago
    };

    const captured = captureWarns();
    const { POST } = await loadRoute();

    // Send a playtime that is impossibly large given the 5-second window.
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          playedTimeSeconds: 9999 // 9999 - 30 = 9969 s delta vs 5 s window
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(["playtime_delta_invalid", "save_rejected"]).toContain(body.error);
    assertNoPiiInWarns(captured);
    assertPlayerIdInWarns(captured);
    vi.restoreAllMocks();
  });

  it("credits_delta_invalid path: no email in warn, playerId present", async () => {
    // Use a prevRow with a small credit balance so a large credits jump triggers
    // credits_delta_invalid.
    prevRowOverride = {
      credits: 0,
      current_planet: null,
      ship_config: {},
      completed_missions: [],
      unlocked_planets: [],
      played_time_seconds: 30,
      seen_story_entries: [],
      current_solar_system_id: null,
      updated_at: new Date(Date.now() - 300_000) // 5 minutes ago — generous window
    };

    const captured = captureWarns();
    const { POST } = await loadRoute();

    // Send credits that vastly exceed the tutorial cap.
    const res = await POST(
      new Request("http://x/api/save", {
        method: "POST",
        body: JSON.stringify({
          ...BASE_PAYLOAD,
          credits: 999999,
          playedTimeSeconds: 35 // 5 s delta — within window
        })
      })
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(["credits_delta_invalid", "save_rejected"]).toContain(body.error);
    assertNoPiiInWarns(captured);
    assertPlayerIdInWarns(captured);
    vi.restoreAllMocks();
  });
});

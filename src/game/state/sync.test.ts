import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoadSaveCache, loadSave, saveNow, submitScore } from "./sync";
import { getState, resetForTests } from "./GameState";
import type { CombatSummary } from "@/game/phaser/config";

// ----- loadSave / saveNow / submitScore: best-effort fetch wrappers -----
//
// These functions sit on the gameplay-vs-persistence boundary. The contract
// (see CLAUDE.md §6 and the "best-effort" comment at the top of sync.ts) is
// that NONE of them are allowed to throw — a missing session, a 5xx, or a
// network error must degrade gracefully so single-player keeps working.

interface FetchCall {
  input: string;
  init?: RequestInit;
}
const fetchCalls: FetchCall[] = [];
const fetchImpl: { current: (input: string, init?: RequestInit) => Promise<Response> } = {
  current: async () => new Response(null, { status: 200 })
};

beforeEach(() => {
  fetchCalls.length = 0;
  fetchImpl.current = async () => new Response(null, { status: 200 });
  resetForTests();
  // loadSave caches at module level so consecutive calls dedupe — that's
  // the production behavior, but each test case needs a fresh slate so a
  // 401 fixture in one case doesn't leak into a 200 fixture in the next.
  clearLoadSaveCache();
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ input: url, init });
    return fetchImpl.current(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSave", () => {
  it("returns false when the API replies 401 (anonymous play)", async () => {
    fetchImpl.current = async () => new Response("unauthorized", { status: 401 });
    expect(await loadSave()).toBe(false);
  });

  it("returns false on a 500 response", async () => {
    fetchImpl.current = async () => new Response("oops", { status: 500 });
    expect(await loadSave()).toBe(false);
  });

  it("returns false on a network/transport error", async () => {
    fetchImpl.current = async () => {
      throw new TypeError("network down");
    };
    expect(await loadSave()).toBe(false);
  });

  it("returns false when the body is null (no remote save yet)", async () => {
    fetchImpl.current = async () =>
      new Response("null", { status: 200, headers: { "content-type": "application/json" } });
    expect(await loadSave()).toBe(false);
  });

  it("hydrates GameState from a valid remote save and returns true", async () => {
    const remote = {
      slot: 1,
      credits: 4242,
      currentPlanet: null,
      shipConfig: {
        slots: [{ id: "rapid-fire", level: 1, augments: [] }],
        inventory: [],
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      },
      completedMissions: ["tutorial"],
      unlockedPlanets: ["tutorial", "combat-1"],
      playedTimeSeconds: 99,
      updatedAt: "2025-01-01T00:00:00.000Z"
    };
    fetchImpl.current = async () =>
      new Response(JSON.stringify(remote), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    expect(await loadSave()).toBe(true);
    const s = getState();
    expect(s.credits).toBe(4242);
    expect(s.completedMissions).toEqual(["tutorial"]);
    expect(s.playedTimeSeconds).toBe(99);
    // Sent the no-store cache hint so we never see a stale save on remount.
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe("/api/save");
    expect(fetchCalls[0]?.init?.cache).toBe("no-store");
  });

  it("still loads credits / missions when shipConfig is degenerate", async () => {
    const remote = {
      slot: 1,
      credits: 1170,
      currentPlanet: null,
      // Some old POSTs stored `{}` here because the client was sending the
      // ship under a different field name. We can't lose the player's
      // credits and progress just because of that — schema is permissive,
      // migrateShip falls back to DEFAULT_SHIP for the ship itself.
      shipConfig: {},
      completedMissions: ["tutorial"],
      unlockedPlanets: ["tutorial", "shop"],
      playedTimeSeconds: 99,
      updatedAt: "2025-01-01T00:00:00.000Z"
    };
    fetchImpl.current = async () =>
      new Response(JSON.stringify(remote), { status: 200 });
    expect(await loadSave()).toBe(true);
    const s = getState();
    expect(s.credits).toBe(1170);
    expect(s.completedMissions).toEqual(["tutorial"]);
    // migrateShip falls back to DEFAULT_SHIP, which is one slot holding a
    // fresh rapid-fire WeaponInstance and an empty inventory.
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[0]?.level).toBe(1);
    expect(s.ship.slots[0]?.augments).toEqual([]);
    expect(s.ship.inventory).toEqual([]);
  });

  it("dedupes concurrent calls into a single /api/save fetch", async () => {
    // useCloudSaveSync (galaxy hydration) and useOptimisticAuth (CONTINUE
    // label) both want this — without the dedup the boot splash spent ~200ms
    // extra waiting on a redundant Edge invocation.
    type ResolveFn = (res: Response) => void;
    const holder: { resolve: ResolveFn | null } = { resolve: null };
    fetchImpl.current = () =>
      new Promise<Response>((resolve) => {
        holder.resolve = resolve;
      });
    const a = loadSave();
    const b = loadSave();
    expect(fetchCalls).toHaveLength(1);
    holder.resolve?.(new Response(null, { status: 200 }));
    expect(await a).toBe(false);
    expect(await b).toBe(false);
    expect(fetchCalls).toHaveLength(1);
  });

  it("subsequent loadSave calls hit the cache without re-fetching", async () => {
    fetchImpl.current = async () => new Response(null, { status: 401 });
    expect(await loadSave()).toBe(false);
    expect(await loadSave()).toBe(false);
    expect(fetchCalls).toHaveLength(1);
  });

  it("logs and returns false when the remote save row fails RemoteSaveSchema", async () => {
    // RemoteSaveSchema requires `slot`, `credits`, `completedMissions`, etc.
    // A row missing those keys exercises the safeParse-failure branch
    // (sync.ts:67-76) which today is silent except for a console.warn.
    const malformed = { not: "a save", credits: "definitely not a number" };
    fetchImpl.current = async () =>
      new Response(JSON.stringify(malformed), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await loadSave()).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      const firstCall = warnSpy.mock.calls[0];
      expect(firstCall?.[0]).toMatch(/loadSave: schema rejected save row/);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("saveNow", () => {
  it("POSTs the snapshot as JSON to /api/save", async () => {
    await saveNow();
    expect(fetchCalls).toHaveLength(1);
    const c = fetchCalls[0];
    expect(c?.input).toBe("/api/save");
    expect(c?.init?.method).toBe("POST");
    const headers = c?.init?.headers as Record<string, string>;
    expect(headers?.["content-type"]).toBe("application/json");
    const body = JSON.parse((c?.init?.body as string) ?? "{}");
    expect(body).toHaveProperty("credits");
    expect(body).toHaveProperty("ship");
    expect(body).toHaveProperty("completedMissions");
  });

  it("returns ok=true on a 2xx response", async () => {
    fetchImpl.current = async () => new Response(null, { status: 204 });
    await expect(saveNow()).resolves.toEqual({ ok: true });
  });

  it("returns ok=false with status + humanized message on a non-2xx response", async () => {
    fetchImpl.current = async () =>
      new Response(JSON.stringify({ error: "credits_delta_invalid" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await saveNow();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
        expect(result.message).toContain("credits delta");
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not throw on a network error and returns ok=false with status=0", async () => {
    fetchImpl.current = async () => {
      throw new TypeError("network down");
    };
    const result = await saveNow();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.message).toMatch(/Network error/);
    }
  });
});

describe("submitScore", () => {
  const winning: CombatSummary = {
    missionId: "tutorial",
    score: 1234,
    credits: 5,
    timeSeconds: 60,
    victory: true
  };
  const losing: CombatSummary = { ...winning, victory: false };

  it("does NOT post when the run was a loss; returns ok=true (nothing-to-do)", async () => {
    const result = await submitScore(losing);
    expect(fetchCalls).toHaveLength(0);
    expect(result).toEqual({ ok: true });
  });

  it("posts mission/score/time on a victory and returns ok=true", async () => {
    fetchImpl.current = async () => new Response(null, { status: 201 });
    const result = await submitScore(winning);
    expect(fetchCalls).toHaveLength(1);
    const c = fetchCalls[0];
    expect(c?.input).toBe("/api/leaderboard");
    expect(c?.init?.method).toBe("POST");
    const body = JSON.parse((c?.init?.body as string) ?? "{}");
    expect(body).toEqual({ missionId: "tutorial", score: 1234, timeSeconds: 60 });
    expect(result).toEqual({ ok: true });
  });

  it("returns ok=false with sign-in message on 401 (anonymous)", async () => {
    fetchImpl.current = async () => new Response(null, { status: 401 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await submitScore(winning);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(401);
        expect(result.message).toMatch(/[Ss]ign in/);
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns ok=false with mission_not_completed hint on 422", async () => {
    fetchImpl.current = async () =>
      new Response(JSON.stringify({ error: "mission_not_completed" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await submitScore(winning);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(422);
        expect(result.message).toContain("doesn't see this mission as completed");
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("returns ok=false on a 500 response", async () => {
    fetchImpl.current = async () => new Response(null, { status: 500 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await submitScore(winning);
      expect(result.ok).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not throw on a network error and returns ok=false with status=0", async () => {
    fetchImpl.current = async () => {
      throw new TypeError("offline");
    };
    const result = await submitScore(winning);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.message).toMatch(/Network error/);
    }
  });
});

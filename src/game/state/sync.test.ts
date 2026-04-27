import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSave, saveNow, submitScore } from "./sync";
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
        slots: { front: "rapid-fire", rear: null, sidekickLeft: null, sidekickRight: null },
        unlockedWeapons: ["rapid-fire"],
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

  it("rejects the whole payload when shipConfig is malformed (Zod strict)", async () => {
    const remote = {
      slot: 1,
      credits: 10,
      currentPlanet: null,
      shipConfig: { totally: "not a ship" },
      completedMissions: [],
      unlockedPlanets: [],
      playedTimeSeconds: 0,
      updatedAt: "2025-01-01T00:00:00.000Z"
    };
    fetchImpl.current = async () =>
      new Response(JSON.stringify(remote), { status: 200 });
    // Post-T2 (Zod schemas), an invalid shipConfig fails RemoteSaveSchema.safeParse
    // → loadSave returns false. State stays at defaults.
    expect(await loadSave()).toBe(false);
    expect(getState().ship.slots[0]).toBe("rapid-fire");
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

  it("does not throw on a non-2xx response", async () => {
    fetchImpl.current = async () => new Response(null, { status: 500 });
    await expect(saveNow()).resolves.toBeUndefined();
  });

  it("does not throw on a network error", async () => {
    fetchImpl.current = async () => {
      throw new TypeError("network down");
    };
    await expect(saveNow()).resolves.toBeUndefined();
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

  it("does NOT post when the run was a loss", async () => {
    await submitScore(losing);
    expect(fetchCalls).toHaveLength(0);
  });

  it("posts mission/score/time on a victory", async () => {
    await submitScore(winning);
    expect(fetchCalls).toHaveLength(1);
    const c = fetchCalls[0];
    expect(c?.input).toBe("/api/leaderboard");
    expect(c?.init?.method).toBe("POST");
    const body = JSON.parse((c?.init?.body as string) ?? "{}");
    expect(body).toEqual({ missionId: "tutorial", score: 1234, timeSeconds: 60 });
  });

  it("does not throw when the leaderboard rejects with 401 (anonymous)", async () => {
    fetchImpl.current = async () => new Response(null, { status: 401 });
    await expect(submitScore(winning)).resolves.toBeUndefined();
  });

  it("does not throw on a 500 response", async () => {
    fetchImpl.current = async () => new Response(null, { status: 500 });
    await expect(submitScore(winning)).resolves.toBeUndefined();
  });

  it("does not throw on a network error", async () => {
    fetchImpl.current = async () => {
      throw new TypeError("offline");
    };
    await expect(submitScore(winning)).resolves.toBeUndefined();
  });
});

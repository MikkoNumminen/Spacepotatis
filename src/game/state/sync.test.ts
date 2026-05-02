import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoadSaveCache, drainScoreQueue, loadSave, saveNow } from "./sync";
import { getState, resetForTests } from "./GameState";
import { clearScoreQueue, enqueueScore, readScoreQueueForTest } from "./scoreQueue";
import { clearSaveQueue, readPendingSaveForTest } from "./saveQueue";
import { FakeStorage, installFakeLocalStorage } from "../../__tests__/fakeStorage";

// ----- loadSave / saveNow / drainScoreQueue: best-effort fetch wrappers -----
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

// Most cases either expect or tolerate a console.warn from the failure-path
// branches; spying once in beforeEach avoids re-spying in every individual
// test (and the cases that assert on the warning use vi.mocked(console.warn)
// directly).
beforeEach(() => {
  fetchCalls.length = 0;
  fetchImpl.current = async () => new Response(null, { status: 200 });
  resetForTests();
  // Fresh storage per test so a 5xx-induced pending save in one case doesn't
  // bleed into a clean fixture in the next.
  installFakeLocalStorage();
  clearSaveQueue();
  // loadSave caches at module level so consecutive calls dedupe — that's
  // the production behavior, but each test case needs a fresh slate so a
  // 401 fixture in one case doesn't leak into a 200 fixture in the next.
  clearLoadSaveCache();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ input: url, init });
    return fetchImpl.current(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadSave", () => {
  // None of these failure modes are allowed to throw — single-player must
  // keep working when auth/network/server is degraded. Each branch lives in
  // a distinct conditional inside loadSave (status check, transport catch,
  // null-body guard), so we still hit each one — just from one table.
  it.each([
    { label: "API replies 401 (anonymous play)", respond: () => new Response("unauthorized", { status: 401 }) },
    { label: "API replies 500", respond: () => new Response("oops", { status: 500 }) },
    {
      label: "transport error",
      respond: () => {
        throw new TypeError("network down");
      }
    },
    {
      label: "body is null (no remote save yet)",
      respond: () =>
        new Response("null", { status: 200, headers: { "content-type": "application/json" } })
    }
  ])("returns false when $label", async ({ respond }) => {
    fetchImpl.current = async () => respond();
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

  it("hydrates from a pending save in localStorage even if the server returns 401", async () => {
    // The exact regression that motivated the save queue: player completed
    // a mission, saveNow's POST hit a 5xx, snapshot was durably stored in
    // localStorage. They reload — the server still has the OLD save (or
    // returns 401 because the cookie expired). loadSave must NOT show stale
    // server state; the pending snapshot is the freshest progression.
    fetchImpl.current = async () => new Response("unauthorized", { status: 401 });
    // Hand-write a pending save with one more clear than INITIAL_STATE.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      JSON.stringify({
        snapshot: {
          credits: 4242,
          completedMissions: ["tutorial", "combat-1"],
          unlockedPlanets: ["tutorial", "combat-1"],
          playedTimeSeconds: 88,
          ship: {},
          saveSlot: 1,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: ["tutorial"],
          seenStoryEntries: []
        },
        firstSeenMs: Date.now(),
        attempts: 0
      })
    );
    expect(await loadSave()).toBe(true);
    const s = getState();
    expect(s.credits).toBe(4242);
    expect(s.completedMissions).toEqual(["tutorial", "combat-1"]);
    expect(s.playedTimeSeconds).toBe(88);
  });

  it("pending save overrides server hydrate — pending is strictly newer", async () => {
    // Even if the server has a save (older), pending wins. This is what
    // protects against "I cleared pirate-beacon but the save POST hit a
    // 5xx; on reload the server still shows my older state".
    const remote = {
      slot: 1,
      credits: 100, // older
      currentPlanet: null,
      shipConfig: {
        slots: [{ id: "rapid-fire", level: 1, augments: [] }],
        inventory: [],
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      },
      completedMissions: ["tutorial"], // older
      unlockedPlanets: ["tutorial"],
      playedTimeSeconds: 30,
      updatedAt: "2025-01-01T00:00:00.000Z"
    };
    fetchImpl.current = async () =>
      new Response(JSON.stringify(remote), { status: 200 });
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      JSON.stringify({
        snapshot: {
          credits: 9999, // newer
          completedMissions: ["tutorial", "combat-1", "boss-1"], // newer
          unlockedPlanets: ["tutorial", "combat-1", "boss-1"],
          playedTimeSeconds: 600,
          ship: {},
          saveSlot: 1,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: ["tutorial"],
          seenStoryEntries: []
        },
        firstSeenMs: Date.now(),
        attempts: 0
      })
    );
    expect(await loadSave()).toBe(true);
    const s = getState();
    // Newer pending state wins.
    expect(s.credits).toBe(9999);
    expect(s.completedMissions).toContain("boss-1");
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
    const warnSpy = vi.mocked(console.warn);
    expect(await loadSave()).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    const firstCall = warnSpy.mock.calls[0];
    expect(firstCall?.[0]).toMatch(/loadSave: schema rejected save row/);
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

  it("returns kind=ok and clears the pending slot on a 2xx response", async () => {
    fetchImpl.current = async () => new Response(null, { status: 204 });
    await expect(saveNow()).resolves.toEqual({ kind: "ok" });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("returns kind=queued on a 422 credits_delta_invalid — slot persists for a fresher snapshot to pass", async () => {
    // saveQueue classifies playtime/credits_delta_invalid as TRANSIENT — the
    // server's comparison baseline may simply be stale (e.g. an earlier save
    // got dropped), so a future attempt with a fresher snapshot might pass.
    fetchImpl.current = async () =>
      new Response(JSON.stringify({ error: "credits_delta_invalid" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    const result = await saveNow();
    expect(result.kind).toBe("queued");
    if (result.kind === "queued") {
      expect(result.message).toMatch(/sync automatically/);
    }
    const pending = readPendingSaveForTest();
    expect(pending).not.toBeNull();
    expect(pending?.attempts).toBe(1);
  });

  it("returns kind=failed on a 422 mission_graph_invalid — slot dropped (permanent)", async () => {
    // Schema/graph violations can't be fixed by retrying — drop the slot so
    // the same bad snapshot doesn't burn attempts forever.
    fetchImpl.current = async () =>
      new Response(JSON.stringify({ error: "mission_graph_invalid" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    const result = await saveNow();
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(422);
    }
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("returns kind=queued on a network error — snapshot persists for retry", async () => {
    fetchImpl.current = async () => {
      throw new TypeError("network down");
    };
    const result = await saveNow();
    expect(result.kind).toBe("queued");
    if (result.kind === "queued") {
      expect(result.message).toMatch(/sync automatically/);
    }
    // The whole point of the durability layer: the snapshot is STILL in
    // localStorage. A reload would pick it up; a visibility/online retry
    // would push it. Pre-fix, this returned ok=false and the snapshot
    // evaporated on the next render.
    const pending = readPendingSaveForTest();
    expect(pending).not.toBeNull();
    expect(pending?.attempts).toBe(1);
  });

  it("returns kind=queued on a 5xx — same retry semantics as network error", async () => {
    fetchImpl.current = async () => new Response("oops", { status: 503 });
    const result = await saveNow();
    expect(result.kind).toBe("queued");
    expect(readPendingSaveForTest()?.attempts).toBe(1);
  });
});

// Integration-style tests for the drain path. scoreQueue.test.ts unit-tests
// the queue against a hand-rolled ScorePostFn mock; these tests exercise
// the REAL queueAwareSubmit adapter (i.e. it actually issues a fetch and
// parses the JSON error code) by funneling through drainScoreQueue().
describe("drainScoreQueue (via queueAwareSubmit fetch adapter)", () => {
  beforeEach(() => {
    installFakeLocalStorage();
    clearScoreQueue();
  });

  it("POSTs the queued entry to /api/leaderboard with mission/score/time", async () => {
    enqueueScore({ missionId: "tutorial", score: 1234, timeSeconds: 60 }, Date.now());
    fetchImpl.current = async () => new Response(null, { status: 201 });
    const result = await drainScoreQueue();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.input).toBe("/api/leaderboard");
    const body = JSON.parse((fetchCalls[0]?.init?.body as string) ?? "{}");
    expect(body).toEqual({ missionId: "tutorial", score: 1234, timeSeconds: 60 });
    expect(result).toEqual({ attempted: 1, succeeded: 1, remaining: 0 });
    expect(readScoreQueueForTest()).toHaveLength(0);
  });

  // Each transient branch keeps the entry on the queue. The 401 case leaves
  // attempts at 0 (anonymous play — never burn the budget); the others bump
  // attempts so MAX_ATTEMPTS eventually drops a permanently-broken entry.
  it.each([
    {
      label: "on 401 (anonymous): keeps the entry, doesn't burn attempts",
      respond: () => new Response("unauthorized", { status: 401 }),
      expectedAttempts: 0
    },
    {
      label: "on 422 mission_not_completed: keeps the entry with attempts++",
      respond: () =>
        new Response(JSON.stringify({ error: "mission_not_completed" }), {
          status: 422,
          headers: { "content-type": "application/json" }
        }),
      expectedAttempts: 1
    },
    {
      label: "on 5xx: keeps with attempts++ (transient)",
      respond: () => new Response(null, { status: 500 }),
      expectedAttempts: 1
    },
    {
      label: "on network error: keeps with attempts++, no throw",
      respond: () => {
        throw new TypeError("offline");
      },
      expectedAttempts: 1
    }
  ])("$label", async ({ respond, expectedAttempts }) => {
    enqueueScore({ missionId: "tutorial", score: 1234, timeSeconds: 60 }, Date.now());
    fetchImpl.current = async () => respond();
    const result = await drainScoreQueue();
    expect(result.remaining).toBe(1);
    expect(readScoreQueueForTest()[0]?.attempts).toBe(expectedAttempts);
  });

  it("on 422 with a non-mission-not-completed code: drops as permanent", async () => {
    enqueueScore({ missionId: "tutorial", score: 1234, timeSeconds: 60 }, Date.now());
    fetchImpl.current = async () =>
      new Response(JSON.stringify({ error: "validation_failed" }), {
        status: 422,
        headers: { "content-type": "application/json" }
      });
    const result = await drainScoreQueue();
    expect(result.remaining).toBe(0);
  });

  it("concurrent drainScoreQueue() calls share the in-flight drain (no double-POST)", async () => {
    enqueueScore({ missionId: "tutorial", score: 1234, timeSeconds: 60 }, Date.now());
    let resolved = false;
    fetchImpl.current = () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolved = true;
          resolve(new Response(null, { status: 201 }));
        }, 5);
      });
    // Fire two drains in quick succession; the second one MUST NOT issue
    // its own fetch — that's the whole point of the in-flight share lock.
    const a = drainScoreQueue();
    const b = drainScoreQueue();
    const [resA, resB] = await Promise.all([a, b]);
    expect(resolved).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(resA).toEqual(resB);
    expect(readScoreQueueForTest()).toHaveLength(0);
  });

  it("enqueue during drain is preserved by the diff-write commit (no lost score)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, Date.now());
    const holder: { resolve: ((r: Response) => void) | null } = { resolve: null };
    fetchImpl.current = () =>
      new Promise<Response>((resolve) => {
        holder.resolve = resolve;
      });
    const drain = drainScoreQueue();
    // While drain is in flight, the user wins another mission and enqueues
    // a fresh score. Without diff-write, the drain's final writeQueue() of
    // [] would clobber this entry and the player's win would silently
    // disappear.
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, Date.now());
    holder.resolve?.(new Response(null, { status: 201 }));
    const result = await drain;
    expect(result).toEqual({ attempted: 1, succeeded: 1, remaining: 1 });
    const queue = readScoreQueueForTest();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.missionId).toBe("combat-1");
  });
});

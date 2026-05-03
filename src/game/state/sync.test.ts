import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoadSaveCache, drainScoreQueue, loadSave, saveNow } from "./sync";
import { getState, resetForTests } from "./GameState";
import { clearScoreQueue, enqueueScore, readScoreQueueForTest } from "./scoreQueue";
import { clearSaveQueue, readPendingSaveForTest } from "./saveQueue";
import { markHydrationCompleted, setCurrentPlayerEmail } from "./syncCache";
import { FakeStorage, installFakeLocalStorage } from "../../__tests__/fakeStorage";

const TEST_EMAIL = "tester@example.com";

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
  // Default test player. Individual cases that exercise the cross-account
  // or anonymous code paths override this via setCurrentPlayerEmail.
  setCurrentPlayerEmail(TEST_EMAIL);
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
  // Each failure mode now reports a distinct LoadResult.kind so the splash
  // gate / error overlay can distinguish "fresh account" from "we couldn't
  // read the server" — pre-fix, all of these collapsed into `false` and
  // the player saw INITIAL_STATE without warning. Errors are also logged
  // with console.error (not warn) on the load-failed branches.
  it.each([
    {
      label: "API replies 401 (anonymous play)",
      respond: () => new Response("unauthorized", { status: 401 }),
      expectedKind: "anon" as const
    },
    {
      label: "API replies 500",
      respond: () => new Response("oops", { status: 500 }),
      expectedKind: "load-failed" as const,
      expectedReason: "http_error" as const,
      expectedStatus: 500
    },
    {
      label: "transport error",
      respond: () => {
        throw new TypeError("network down");
      },
      expectedKind: "load-failed" as const,
      expectedReason: "network_error" as const,
      expectedStatus: 0
    },
    {
      label: "body is null (no remote save yet)",
      respond: () =>
        new Response("null", { status: 200, headers: { "content-type": "application/json" } }),
      expectedKind: "no-save" as const
    }
  ])("returns kind=$expectedKind when $label", async (row) => {
    // The load-failed branches use console.error (not warn) — silence it
    // so the test output stays clean while still exercising the path.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchImpl.current = async () => row.respond();
    const result = await loadSave();
    expect(result.kind).toBe(row.expectedKind);
    if (row.expectedKind === "load-failed") {
      expect(result.reason).toBe(row.expectedReason);
      expect(result.status).toBe(row.expectedStatus);
    }
  });

  it("hydrates GameState from a valid remote save and returns kind=server-loaded", async () => {
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
    expect((await loadSave()).kind).toBe("server-loaded");
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
    expect((await loadSave()).kind).toBe("server-loaded");
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
    holder.resolve?.(
      new Response("null", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    expect((await a).kind).toBe("no-save");
    expect((await b).kind).toBe("no-save");
    expect(fetchCalls).toHaveLength(1);
  });

  it("subsequent loadSave calls hit the cache without re-fetching", async () => {
    fetchImpl.current = async () => new Response(null, { status: 401 });
    expect((await loadSave()).kind).toBe("anon");
    expect((await loadSave()).kind).toBe("anon");
    expect(fetchCalls).toHaveLength(1);
  });

  it("hydrates from a pending save in localStorage even if the server returns 401 — kind=pending-only", async () => {
    // The exact regression that motivated the save queue: player completed
    // a mission, saveNow's POST hit a 5xx, snapshot was durably stored in
    // localStorage. They reload — the server still has the OLD save (or
    // returns 401 because the cookie expired). loadSave must NOT show stale
    // server state; the pending snapshot is the freshest progression.
    fetchImpl.current = async () => new Response("unauthorized", { status: 401 });
    // Hand-write a pending save with one more clear than INITIAL_STATE.
    // Stamped for the active test player so the cross-account guard lets
    // it through.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v2",
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
        attempts: 0,
        playerEmail: TEST_EMAIL
      })
    );
    expect((await loadSave()).kind).toBe("pending-only");
    const s = getState();
    expect(s.credits).toBe(4242);
    expect(s.completedMissions).toEqual(["tutorial", "combat-1"]);
    expect(s.playedTimeSeconds).toBe(88);
  });

  it("returns kind=pending-only when the server 5xx's but a pending save exists — overlay must NOT trigger", async () => {
    // Critical: a pending localStorage save means the player has authoritative
    // state on-disk. Even if the server load failed, GameState is hydrated
    // from pending — rendering the load-failed overlay would falsely tell
    // them their progress is at risk.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchImpl.current = async () => new Response("oops", { status: 500 });
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v2",
      JSON.stringify({
        snapshot: {
          credits: 1234,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial"],
          playedTimeSeconds: 50,
          ship: {},
          saveSlot: 1,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: ["tutorial"],
          seenStoryEntries: []
        },
        firstSeenMs: Date.now(),
        attempts: 0,
        playerEmail: TEST_EMAIL
      })
    );
    const result = await loadSave();
    expect(result.kind).toBe("pending-only");
    expect(getState().credits).toBe(1234);
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
      "spacepotatis:pendingSave:v2",
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
        attempts: 0,
        playerEmail: TEST_EMAIL
      })
    );
    // Server returned a valid save AND pending exists; server-loaded wins
    // the kind classification (server is authoritative for "did the load
    // succeed"), but pending overlays the actual GameState (newer wins).
    expect((await loadSave()).kind).toBe("server-loaded");
    const s = getState();
    // Newer pending state wins.
    expect(s.credits).toBe(9999);
    expect(s.completedMissions).toContain("boss-1");
  });

  it("logs error and returns kind=load-failed reason=schema_rejected when the remote save row fails RemoteSaveSchema", async () => {
    // RemoteSaveSchema requires `slot`, `credits`, `completedMissions`, etc.
    // A row missing those keys exercises the safeParse-failure branch.
    // The console output is now console.error (not warn) because the
    // operator NEEDS this surfaced — the user is seeing INITIAL_STATE and
    // panicking that their save is gone.
    const malformed = { not: "a save", credits: "definitely not a number" };
    fetchImpl.current = async () =>
      new Response(JSON.stringify(malformed), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await loadSave();
    expect(result.kind).toBe("load-failed");
    expect(result.reason).toBe("schema_rejected");
    expect(errorSpy).toHaveBeenCalled();
    const firstCall = errorSpy.mock.calls[0];
    expect(firstCall?.[0]).toMatch(/loadSave: schema rejected save row/);
  });
});

describe("saveNow", () => {
  // Most saveNow tests assume hydration completed (the legitimate case after
  // a successful loadSave). The wipe-prevention gate is exercised in its own
  // dedicated `it` below.
  beforeEach(() => {
    markHydrationCompleted();
  });

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

  it("returns kind=queued on a 422 save_regression — slot persists, defense never deletes queued data", async () => {
    // The regression guard (PR #94) rejects when the server's stored
    // snapshot is more advanced than the client's. Pre-fix, saveQueue
    // classified this as PERMANENT and DROPPED the player's queued snapshot
    // — the defense itself was deleting save data. Now TRANSIENT: the slot
    // persists for retry with a fresher snapshot, capped by MAX_ATTEMPTS /
    // MAX_AGE_MS so a genuinely stale offline save still ages out.
    fetchImpl.current = async () =>
      new Response(JSON.stringify({ error: "save_regression" }), {
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

// Defends against the 2026-05-02 wipe pattern: when loadSave fails silently
// (5xx, schema parse, network error), GameState may still be at INITIAL_STATE.
// saveNow must NOT POST that — it would clobber the user's real save row.
// This test exercises the gate from a clean slate where no hydration has
// happened yet.
describe("saveNow hydration guard", () => {
  it("skips the POST entirely when hydration has not completed", async () => {
    // No markHydrationCompleted call; the beforeEach above isn't this scope.
    const result = await saveNow();
    // No fetch should have been made.
    expect(fetchCalls).toHaveLength(0);
    // No localStorage pending save either — we must not persist INITIAL_STATE.
    expect(readPendingSaveForTest()).toBeNull();
    // Returns a queued-shaped result so callers (VictoryModal etc.) see a
    // "save deferred" message rather than a misleading "ok".
    expect(result.kind).toBe("queued");
  });

  it("POSTs normally once hydration completes", async () => {
    fetchImpl.current = async () => new Response(null, { status: 204 });
    markHydrationCompleted();
    const result = await saveNow();
    expect(fetchCalls).toHaveLength(1);
    expect(result.kind).toBe("ok");
  });

  it("STILL refuses to POST after a real load-failure path (overlay-dismissal can't unlock saveNow)", async () => {
    // End-to-end: a real loadSave attempt hits a 5xx (load-failed branch
    // does NOT call markHydrationCompleted). Even after the user dismisses
    // the error overlay in the UI ("I understand the risk"), saveNow must
    // STILL skip the POST — the overlay dismiss is purely visual; the
    // hydration flag in syncCache is the source of truth and only flips on
    // a path that proved the server's authoritative state.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchImpl.current = async () => new Response("oops", { status: 500 });
    const loadResult = await loadSave();
    expect(loadResult.kind).toBe("load-failed");
    // Reset the fetch counter so the saveNow assertion is unambiguous.
    fetchCalls.length = 0;
    fetchImpl.current = async () => new Response(null, { status: 204 });
    const saveResult = await saveNow();
    // No POST went out — saveNow refused at the gate.
    expect(fetchCalls).toHaveLength(0);
    // No localStorage pending save either — INITIAL_STATE must never
    // become a durable snapshot.
    expect(readPendingSaveForTest()).toBeNull();
    expect(saveResult.kind).toBe("queued");
  });
});

// Cross-account safety. Defends against the 2026-05 leak: user A's pending
// save sat in localStorage; on sign-out the auth cache was wiped but the
// queue wasn't. User B signed in on the same browser, doLoadSave's pending
// read hydrated B's session with A's snapshot, and the next flush POSTed
// A's progression as B — destroying B's real save.
describe("cross-account pending-save isolation", () => {
  it("doLoadSave does NOT hydrate B's session from A's leftover snapshot", async () => {
    // Pretend A had progress that never reached the server.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v2",
      JSON.stringify({
        snapshot: {
          credits: 9999,
          completedMissions: ["tutorial", "combat-1", "boss-1"],
          unlockedPlanets: ["tutorial", "combat-1", "boss-1"],
          playedTimeSeconds: 600,
          ship: {},
          saveSlot: 1,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: ["tutorial"],
          seenStoryEntries: []
        },
        firstSeenMs: Date.now(),
        attempts: 0,
        playerEmail: "a@example.com"
      })
    );
    // B is now signed in, with no server save of their own (200 + null).
    setCurrentPlayerEmail("b@example.com");
    fetchImpl.current = async () =>
      new Response("null", { status: 200, headers: { "content-type": "application/json" } });

    const result = await loadSave();

    // No leakage: B sees a fresh INITIAL_STATE, not A's progression.
    // (200 + null body for a fresh authenticated user is "no-save".)
    expect(result.kind).toBe("no-save");
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.completedMissions).toEqual([]);
    expect(s.playedTimeSeconds).toBe(0);
    // And the snapshot is preserved for A to flush when they sign back in.
    expect(
      readPendingSaveForTest("a@example.com")?.snapshot
    ).toMatchObject({ credits: 9999 });
  });

  it("background flushSaveQueue under B's session does NOT POST A's stamped snapshot", async () => {
    // The exact regression: A's snapshot sits in localStorage, B signs in,
    // background drainBoth() in GameCanvas fires flushSaveQueue() before B
    // ever calls saveNow. Pre-fix, that POST landed A's snapshot AS B.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v2",
      JSON.stringify({
        snapshot: { credits: 9999, completedMissions: ["combat-1"] },
        firstSeenMs: Date.now(),
        attempts: 0,
        playerEmail: "a@example.com"
      })
    );
    setCurrentPlayerEmail("b@example.com");
    fetchImpl.current = async () => new Response(null, { status: 204 });

    // Mimic the GameCanvas drainBoth() trigger: flush the queue under B's
    // session. A's snapshot must be invisible — no POST.
    const { flushSaveQueue } = await import("./sync");
    const result = await flushSaveQueue();
    expect(result).toEqual({ kind: "noop" });
    // Critically: NO POST happened. The score post fetch URL is
    // /api/leaderboard; the save post is /api/save. Neither should appear.
    const savePost = fetchCalls.find(
      (c) => c.input === "/api/save" && c.init?.method === "POST"
    );
    expect(savePost).toBeUndefined();
    // A's snapshot is still in storage, untouched, waiting for A to sign
    // back in and reclaim it.
    expect(
      readPendingSaveForTest("a@example.com")?.snapshot
    ).toMatchObject({ credits: 9999 });
  });

  it("if B then runs saveNow, only B's snapshot is POSTed (A's slot is overwritten by B's stamp)", async () => {
    // Storage holds at most one pending slot. When B saves, B's stamp
    // overwrites A's. A's snapshot is lost from the queue — acceptable
    // cost; the leak fix is about preventing CROSS-ACCOUNT POSTs, not
    // preserving the prior account's queue across an overwrite.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v2",
      JSON.stringify({
        snapshot: { credits: 9999, completedMissions: ["combat-1"] },
        firstSeenMs: Date.now(),
        attempts: 0,
        playerEmail: "a@example.com"
      })
    );
    setCurrentPlayerEmail("b@example.com");
    markHydrationCompleted();
    fetchImpl.current = async () => new Response(null, { status: 204 });
    await saveNow();
    const savePost = fetchCalls.find(
      (c) => c.input === "/api/save" && c.init?.method === "POST"
    );
    expect(savePost).toBeDefined();
    const body = JSON.parse((savePost?.init?.body as string) ?? "{}");
    // Critically: NOT A's 9999 credits.
    expect(body.credits).toBe(0);
    expect(body.credits).not.toBe(9999);
  });

  it("anonymous (signed-out) saveNow refuses to POST and never stamps the queue", async () => {
    // The "no session" footgun. saveNow with no signed-in user must not
    // store an unstamped snapshot — it would either be invisible to every
    // future session (waste of storage) or, worse, leak if some future
    // code path forgot to validate the stamp.
    setCurrentPlayerEmail(null);
    markHydrationCompleted(); // Even if hydration was somehow proven, the
                              // missing email blocks the POST.
    const result = await saveNow();
    expect(result.kind).toBe("queued");
    expect(fetchCalls).toHaveLength(0);
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("a leftover :v1 blob is dropped on read — never leaks across the upgrade", async () => {
    // Prior to this fix, the queue stored under :v1 with no email stamp.
    // After upgrade, those blobs are silently dropped — losing one queued
    // save per active user is acceptable cost for closing the leak.
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      JSON.stringify({
        snapshot: { credits: 9999, completedMissions: ["combat-1"] },
        firstSeenMs: Date.now(),
        attempts: 0
      })
    );
    fetchImpl.current = async () =>
      new Response("null", { status: 200, headers: { "content-type": "application/json" } });
    const result = await loadSave();
    // 200 + null body = no-save (legacy :v1 blob got dropped, didn't bleed
    // into a "pending-only" classification).
    expect(result.kind).toBe("no-save");
    expect(getState().credits).toBe(0);
    // The legacy blob was purged on the read.
    expect(
      (globalThis as unknown as { localStorage: FakeStorage }).localStorage.getItem(
        "spacepotatis:pendingSave:v1"
      )
    ).toBeNull();
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

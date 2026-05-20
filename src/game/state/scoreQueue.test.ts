import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearScoreQueue,
  drainScoreQueue,
  enqueueScore,
  readScoreQueueForTest,
  type ScorePostFn
} from "./scoreQueue";
import { FakeStorage, installFakeLocalStorage } from "../../__tests__/fakeStorage";

beforeEach(() => {
  // Fresh store every test so a hand-edited entry in one test doesn't
  // bleed into the next.
  installFakeLocalStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueScore", () => {
  it("appends a new score with attempts=0", () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, 1000);
    const queue = readScoreQueueForTest();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      missionId: "tutorial",
      score: 100,
      timeSeconds: 30,
      attempts: 0,
      firstSeenMs: 1000
    });
  });

  it("dedupes the exact same triple — rapid double-fire shouldn't double-post", () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, 1000);
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, 2000);
    expect(readScoreQueueForTest()).toHaveLength(1);
  });

  it("does NOT dedupe two clears of the same mission with different scores", () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, 1000);
    enqueueScore({ missionId: "tutorial", score: 200, timeSeconds: 28 }, 2000);
    const queue = readScoreQueueForTest();
    expect(queue).toHaveLength(2);
    expect(queue.map((q) => q.score)).toEqual([100, 200]);
  });
});

describe("clearScoreQueue", () => {
  it("removes every entry", () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, 1000);
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, 1100);
    expect(readScoreQueueForTest()).toHaveLength(2);
    clearScoreQueue();
    expect(readScoreQueueForTest()).toHaveLength(0);
  });
});

describe("drainScoreQueue", () => {
  // Tests pin a synthetic clock at NOW so `firstSeenMs` (also NOW) doesn't
  // accidentally trip the MAX_AGE_MS purge. Real-world clocks diverge by
  // milliseconds, not days, so this matches production behavior.
  const NOW = 1_700_000_000_000;

  it("drops entries that the server accepted (2xx)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    const result = await drainScoreQueue(submit, NOW);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ attempted: 2, succeeded: 2, remaining: 0 });
    expect(readScoreQueueForTest()).toHaveLength(0);
  });

  it("keeps and increments attempts on transient failures (5xx)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 503,
      errorCode: null
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.remaining).toBe(1);
    expect(readScoreQueueForTest()[0]?.attempts).toBe(1);
  });

  it("keeps with attempts++ on 422 mission_not_completed (transient — save will catch up)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "mission_not_completed"
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.remaining).toBe(1);
    expect(readScoreQueueForTest()[0]?.attempts).toBe(1);
  });

  it("DROPS on 400 (schema rejection — payload can't become valid by retrying)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 400,
      errorCode: "validation_failed"
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.remaining).toBe(0);
    expect(readScoreQueueForTest()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("DROPS on 422 with a non-mission-not-completed code (e.g. validation_failed)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "validation_failed"
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.remaining).toBe(0);
  });

  it("PAUSES on 401 — keeps every entry untouched, doesn't burn attempts", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 401,
      errorCode: "unauthorized"
    }));
    const result = await drainScoreQueue(submit, NOW);
    // First call returns 401 → drain stops; only one POST issued, both
    // entries remain queued with attempts still at 0.
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result.remaining).toBe(2);
    const queue = readScoreQueueForTest();
    expect(queue.every((q) => q.attempts === 0)).toBe(true);
  });

  it("drops entries that exceed MAX_ATTEMPTS up front (without POSTing them)", async () => {
    // Hand-write a queue with one entry already at the cap. The drain
    // should purge it before issuing any HTTP.
    const stuckEntry = {
      missionId: "tutorial",
      score: 100,
      timeSeconds: 30,
      firstSeenMs: NOW,
      attempts: 50
    };
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:scoreQueue:v1",
      JSON.stringify([stuckEntry])
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    const result = await drainScoreQueue(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result.remaining).toBe(0);
    expect(readScoreQueueForTest()).toHaveLength(0);
  });

  it("drops entries older than MAX_AGE_MS (30 days)", async () => {
    const ancient = {
      missionId: "tutorial",
      score: 100,
      timeSeconds: 30,
      firstSeenMs: 0,
      attempts: 0
    };
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:scoreQueue:v1",
      JSON.stringify([ancient])
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const result = await drainScoreQueue(submit, oneYearMs);
    expect(submit).not.toHaveBeenCalled();
    expect(result.remaining).toBe(0);
  });

  it("returns zero counts and skips storage write on an empty queue", async () => {
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    const result = await drainScoreQueue(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 0, succeeded: 0, remaining: 0 });
  });

  it("survives a malformed queue blob — reads as empty, doesn't throw, and self-heals the poisoned key", async () => {
    const ls = (globalThis as unknown as { localStorage: FakeStorage }).localStorage;
    ls.setItem("spacepotatis:scoreQueue:v1", "not json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    const result = await drainScoreQueue(submit, NOW);
    warnSpy.mockRestore();
    expect(result).toEqual({ attempted: 0, succeeded: 0, remaining: 0 });
    // Audit fix: a corrupted blob now self-heals on next read so it doesn't
    // trap the queue forever. Pre-fix this assertion would have failed —
    // JSON.parse swallowed silently and the bad blob lingered.
    expect(ls.getItem("spacepotatis:scoreQueue:v1")).toBeNull();
  });

  it("survives a schema-mismatched queue blob — drops the whole queue with a warning", async () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:scoreQueue:v1",
      JSON.stringify([{ missionId: 999, score: "not a number" }])
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    const result = await drainScoreQueue(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result.remaining).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("dropped queue: schema mismatch"),
      expect.anything()
    );
  });

  it("treats 500 server_error_permanent as permanent (drops the entry instead of spinning forever)", async () => {
    // Audit fix: pre-fix every 500 was treated as transient, so a permanent
    // server-side bug (Zod validation throw, JS runtime error) would keep
    // re-POSTing for up to MAX_AGE_MS. The route now tags those as
    // server_error_permanent; this test pins the queue's matching behavior.
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 500,
      errorCode: "server_error_permanent"
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.remaining).toBe(0); // dropped, not retained
  });

  it("treats 500 server_error (without _permanent suffix) as transient (keeps retrying)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 500,
      errorCode: "server_error"
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.remaining).toBe(1); // retained for next drain
  });

  it("treats 413 payload_too_large as permanent (same body keeps being too big)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({
      ok: false,
      status: 413,
      errorCode: "payload_too_large"
    }));
    const result = await drainScoreQueue(submit, NOW);
    expect(result.attempted).toBe(1);
    expect(result.remaining).toBe(0);
  });

  it("multi-entry mixed-outcome drain — success drops, transient retries, permanent drops", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    enqueueScore({ missionId: "boss-1", score: 300, timeSeconds: 120 }, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let call = 0;
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => {
      call += 1;
      if (call === 1) return { ok: true };
      if (call === 2) return { ok: false, status: 503, errorCode: null };
      return { ok: false, status: 422, errorCode: "validation_failed" };
    });
    const result = await drainScoreQueue(submit, NOW);
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(1);
    expect(result.remaining).toBe(1); // tutorial dropped (success), boss-1 dropped (permanent), combat-1 retained
    const queue = readScoreQueueForTest();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.missionId).toBe("combat-1");
    expect(queue[0]?.attempts).toBe(1);
  });
});

describe("drainScoreQueue concurrency", () => {
  const NOW = 1_700_000_000_000;

  it("concurrent calls share the in-flight drain — submit is called once per entry, not twice", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    const callOrder: string[] = [];
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async (input) => {
      callOrder.push(input.missionId);
      // Block the first POST so the second drain trigger lands while the
      // first is still mid-flight. Without the in-flight lock, drain B
      // would read the queue at this point and start its own POSTs.
      if (callOrder.length === 1) {
        await new Promise<void>((resolve) => {
          holder.resolve = resolve;
        });
      }
      return { ok: true };
    });
    const drainA = drainScoreQueue(submit, NOW);
    const drainB = drainScoreQueue(submit, NOW);
    // Let the queued microtasks run so drain B has a chance to read state.
    await Promise.resolve();
    holder.resolve?.();
    const [resA, resB] = await Promise.all([drainA, drainB]);
    // submit fires exactly once per queue entry, never twice.
    expect(submit).toHaveBeenCalledTimes(2);
    // Both promises resolve to the same DrainResult (drainB returned the
    // shared in-flight promise).
    expect(resA).toEqual(resB);
    expect(readScoreQueueForTest()).toHaveLength(0);
  });

  it("enqueue during a drain is preserved at commit (no lost score)", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => {
      // Block until the test enqueues a new score, then succeed. The
      // drain's final write is "remove tutorial entry" — but the queue
      // also contains combat-1 by then, and diff-write must keep it.
      await new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
      return { ok: true };
    });
    const drain = drainScoreQueue(submit, NOW);
    await Promise.resolve();
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    holder.resolve?.();
    const result = await drain;
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    // tutorial dropped (succeeded), combat-1 preserved (added during drain).
    const queue = readScoreQueueForTest();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.missionId).toBe("combat-1");
    expect(result.remaining).toBe(1);
  });

  it("enqueue during a transient-failing drain doesn't lose either entry", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => {
      await new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
      return { ok: false, status: 503, errorCode: null };
    });
    const drain = drainScoreQueue(submit, NOW);
    await Promise.resolve();
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    holder.resolve?.();
    await drain;
    const queue = readScoreQueueForTest();
    expect(queue).toHaveLength(2);
    // tutorial: was in initial drain pool, transient → attempts++.
    // combat-1: enqueued during drain, untouched.
    const tutorial = queue.find((q) => q.missionId === "tutorial");
    const combat = queue.find((q) => q.missionId === "combat-1");
    expect(tutorial?.attempts).toBe(1);
    expect(combat?.attempts).toBe(0);
  });

  it("after one drain completes, the lock releases so the next drain can run", async () => {
    enqueueScore({ missionId: "tutorial", score: 100, timeSeconds: 30 }, NOW);
    const submit: ScorePostFn = vi.fn<ScorePostFn>(async () => ({ ok: true }));
    await drainScoreQueue(submit, NOW); // drain 1: drops tutorial
    enqueueScore({ missionId: "combat-1", score: 200, timeSeconds: 60 }, NOW);
    const result2 = await drainScoreQueue(submit, NOW); // drain 2: drops combat-1
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result2.succeeded).toBe(1);
    expect(readScoreQueueForTest()).toHaveLength(0);
  });
});

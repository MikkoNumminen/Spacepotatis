import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSaveQueue,
  flushPendingSave,
  markSavePending,
  readPendingSaveForTest,
  type SavePostFn
} from "./saveQueue";
import { FakeStorage, installFakeLocalStorage } from "../../__tests__/fakeStorage";

beforeEach(() => {
  installFakeLocalStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = 1_700_000_000_000;
const SNAP = { credits: 100, completedMissions: ["tutorial"] };

describe("markSavePending", () => {
  it("writes the snapshot with attempts=0", () => {
    markSavePending(SNAP, NOW);
    const pending = readPendingSaveForTest();
    expect(pending).toMatchObject({
      snapshot: SNAP,
      firstSeenMs: NOW,
      attempts: 0
    });
  });

  it("overwrites the prior snapshot — newest wins", () => {
    markSavePending({ credits: 100 }, NOW);
    markSavePending({ credits: 200 }, NOW + 1000);
    const pending = readPendingSaveForTest();
    expect(pending?.snapshot).toEqual({ credits: 200 });
    expect(pending?.firstSeenMs).toBe(NOW + 1000);
  });

  it("resets attempts to 0 when overwriting a transient-bumped slot", async () => {
    markSavePending({ credits: 100 }, NOW);
    const fail: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 503,
      errorCode: null
    }));
    await flushPendingSave(fail, NOW);
    expect(readPendingSaveForTest()?.attempts).toBe(1);
    markSavePending({ credits: 200 }, NOW + 1000);
    expect(readPendingSaveForTest()?.attempts).toBe(0);
  });
});

describe("clearSaveQueue", () => {
  it("removes the pending slot", () => {
    markSavePending(SNAP, NOW);
    expect(readPendingSaveForTest()).not.toBeNull();
    clearSaveQueue();
    expect(readPendingSaveForTest()).toBeNull();
  });
});

describe("flushPendingSave", () => {
  it("returns noop when there's nothing pending", async () => {
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    const result = await flushPendingSave(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "noop" });
  });

  it("posts the snapshot and clears the slot on 2xx", async () => {
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    const result = await flushPendingSave(submit, NOW);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(SNAP);
    expect(result).toEqual({ kind: "ok" });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("retains the slot and bumps attempts on 5xx (transient)", async () => {
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 503,
      errorCode: null
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toEqual({ kind: "queued", status: 503 });
    const pending = readPendingSaveForTest();
    expect(pending).not.toBeNull();
    expect(pending?.attempts).toBe(1);
  });

  it("retains the slot and bumps attempts on a network error (status 0)", async () => {
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 0,
      errorCode: null
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toEqual({ kind: "queued", status: 0 });
    expect(readPendingSaveForTest()?.attempts).toBe(1);
  });

  it("on 401 retains the slot WITHOUT burning an attempt", async () => {
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 401,
      errorCode: "unauthorized"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toEqual({ kind: "anonymous" });
    const pending = readPendingSaveForTest();
    expect(pending?.attempts).toBe(0); // didn't burn an attempt
    expect(pending?.snapshot).toEqual(SNAP);
  });

  it("DROPS the slot on 400 (schema rejection — payload can't become valid)", async () => {
    markSavePending(SNAP, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 400,
      errorCode: "validation_failed"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toMatchObject({ kind: "failed", status: 400 });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("DROPS the slot on 422 mission_graph_invalid — unlock chain is wrong, replay can't pass", async () => {
    markSavePending(SNAP, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "mission_graph_invalid"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toMatchObject({ kind: "failed", status: 422 });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("DROPS the slot on 422 validation_failed — schema-side rejection, permanent", async () => {
    markSavePending(SNAP, NOW);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "validation_failed"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toMatchObject({ kind: "failed", status: 422 });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("RETAINS the slot on 422 playtime_delta_invalid — baseline may be stale, retry", async () => {
    // The server compares deltas against its last-saved row. If a previous
    // save was lost (the very thing this queue exists to prevent going
    // forward), the row is stale and our delta looks too large. A retry
    // after a fresher row lands can pass.
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "playtime_delta_invalid"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toEqual({ kind: "queued", status: 422 });
    const pending = readPendingSaveForTest();
    expect(pending).not.toBeNull();
    expect(pending?.attempts).toBe(1);
    expect(pending?.snapshot).toEqual(SNAP);
  });

  it("RETAINS the slot on 422 credits_delta_invalid — baseline may be stale, retry", async () => {
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "credits_delta_invalid"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toEqual({ kind: "queued", status: 422 });
    const pending = readPendingSaveForTest();
    expect(pending).not.toBeNull();
    expect(pending?.attempts).toBe(1);
    expect(pending?.snapshot).toEqual(SNAP);
  });

  it("RETAINS the slot on 422 save_regression — server snapshot more advanced, retry with fresher state", async () => {
    // The regression guard from PR #94 fires when the server's stored
    // snapshot is more advanced than the client's. Treating it as PERMANENT
    // meant the defense itself DELETED the player's queued snapshot — the
    // exact scenario the durability layer exists to prevent. Now classified
    // TRANSIENT alongside playtime/credits_delta_invalid: a future saveNow
    // with the freshest in-memory state will pass the regression check, OR
    // the snapshot will age out cleanly via MAX_ATTEMPTS / MAX_AGE_MS.
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({
      ok: false,
      status: 422,
      errorCode: "save_regression"
    }));
    const result = await flushPendingSave(submit, NOW);
    expect(result).toEqual({ kind: "queued", status: 422 });
    const pending = readPendingSaveForTest();
    expect(pending).not.toBeNull();
    expect(pending?.attempts).toBe(1);
    expect(pending?.snapshot).toEqual(SNAP);
  });

  it("drops the slot up front when attempts >= MAX_ATTEMPTS (no POST)", async () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      JSON.stringify({ snapshot: SNAP, firstSeenMs: NOW, attempts: 50 })
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    const result = await flushPendingSave(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "noop" });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("drops the slot up front when older than MAX_AGE_MS (no POST)", async () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      JSON.stringify({ snapshot: SNAP, firstSeenMs: 0, attempts: 0 })
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    const result = await flushPendingSave(submit, oneYear);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "noop" });
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("survives a malformed JSON blob — reads as empty, doesn't throw", async () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      "not json"
    );
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    const result = await flushPendingSave(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "noop" });
  });

  it("survives a schema-mismatched blob — drops it with a warning", async () => {
    (globalThis as unknown as { localStorage: FakeStorage }).localStorage.setItem(
      "spacepotatis:pendingSave:v1",
      JSON.stringify({ snapshot: "not an object", firstSeenMs: "nope", attempts: -1 })
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    const result = await flushPendingSave(submit, NOW);
    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "noop" });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("dropped pending: schema mismatch"),
      expect.anything()
    );
  });
});

describe("flushPendingSave concurrency", () => {
  it("concurrent calls share the in-flight flush — submit fires once, not twice", async () => {
    markSavePending(SNAP, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => {
      await new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
      return { ok: true };
    });
    const flushA = flushPendingSave(submit, NOW);
    const flushB = flushPendingSave(submit, NOW);
    await Promise.resolve();
    holder.resolve?.();
    const [resA, resB] = await Promise.all([flushA, flushB]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(resA).toEqual(resB);
    expect(readPendingSaveForTest()).toBeNull();
  });

  it("markSavePending mid-flight: the fresher snapshot SURVIVES the prior flush's success", async () => {
    // The slot identity is firstSeenMs. If a flush is mid-flight and a new
    // markSavePending overwrites the slot, the flush's success commit must
    // not clear the FRESHER snapshot.
    markSavePending({ credits: 100 }, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => {
      await new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
      return { ok: true };
    });
    const flush = flushPendingSave(submit, NOW);
    await Promise.resolve();
    // Player completes another mission while the prior save is in flight.
    markSavePending({ credits: 200 }, NOW + 1000);
    holder.resolve?.();
    const result = await flush;
    expect(result).toEqual({ kind: "ok" });
    // Slot still holds the FRESHER snapshot, untouched.
    const pending = readPendingSaveForTest();
    expect(pending?.snapshot).toEqual({ credits: 200 });
    expect(pending?.firstSeenMs).toBe(NOW + 1000);
    expect(pending?.attempts).toBe(0);
  });

  it("markSavePending mid-flight: a transient failure does NOT bump the fresher snapshot's attempts", async () => {
    markSavePending({ credits: 100 }, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => {
      await new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
      return { ok: false, status: 503, errorCode: null };
    });
    const flush = flushPendingSave(submit, NOW);
    await Promise.resolve();
    markSavePending({ credits: 200 }, NOW + 1000);
    holder.resolve?.();
    await flush;
    const pending = readPendingSaveForTest();
    expect(pending?.snapshot).toEqual({ credits: 200 });
    expect(pending?.attempts).toBe(0); // fresh snapshot starts clean
  });

  it("markSavePending mid-flight: a permanent failure does NOT clear the fresher snapshot", async () => {
    markSavePending({ credits: 100 }, NOW);
    const holder: { resolve: (() => void) | null } = { resolve: null };
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => {
      await new Promise<void>((resolve) => {
        holder.resolve = resolve;
      });
      return { ok: false, status: 422, errorCode: "mission_graph_invalid" };
    });
    const flush = flushPendingSave(submit, NOW);
    await Promise.resolve();
    markSavePending({ credits: 200 }, NOW + 1000);
    holder.resolve?.();
    await flush;
    // The fresher snapshot is preserved — it hasn't been tried yet, even
    // though the flush we just did saw a 422 on the OLDER snapshot.
    const pending = readPendingSaveForTest();
    expect(pending?.snapshot).toEqual({ credits: 200 });
  });

  it("after one flush completes, the lock releases for the next flush", async () => {
    markSavePending(SNAP, NOW);
    const submit: SavePostFn = vi.fn<SavePostFn>(async () => ({ ok: true }));
    await flushPendingSave(submit, NOW);
    expect(readPendingSaveForTest()).toBeNull();
    markSavePending({ credits: 200 }, NOW + 1000);
    const result2 = await flushPendingSave(submit, NOW + 2000);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result2).toEqual({ kind: "ok" });
  });
});

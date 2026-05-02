import { afterEach, describe, expect, it } from "vitest";
import {
  clearLoadSaveCache,
  getInflightLoad,
  getSaveCache,
  isSaveCached,
  setInflightLoad,
  setSaveCache
} from "./syncCache";

// syncCache holds module-level state that the sync.ts loadSave path reads
// and writes via the exported mutators. The functions are tiny but they're
// the source of truth for "does the player have a server save", which gates
// the CONTINUE label and the splash bypass — a regression here looks like
// a stuck splash or a wrong CONTINUE state, both undebuggable from the
// user's seat. Keep these basic invariants pinned.

afterEach(() => {
  clearLoadSaveCache();
});

describe("syncCache", () => {
  it("starts empty (cache miss, no inflight)", () => {
    expect(getSaveCache()).toBeNull();
    expect(isSaveCached()).toBe(false);
    expect(getInflightLoad()).toBeNull();
  });

  it("setSaveCache(true) round-trips through getSaveCache + isSaveCached", () => {
    setSaveCache(true);
    expect(getSaveCache()).toBe(true);
    expect(isSaveCached()).toBe(true);
  });

  it("setSaveCache(false) is distinct from null — represents 'we checked, no save'", () => {
    setSaveCache(false);
    expect(getSaveCache()).toBe(false);
    expect(isSaveCached()).toBe(true); // false is a CACHED answer, not a miss
  });

  it("clearLoadSaveCache wipes both cache and inflight", () => {
    setSaveCache(true);
    const promise = Promise.resolve(true);
    setInflightLoad(promise);
    clearLoadSaveCache();
    expect(getSaveCache()).toBeNull();
    expect(getInflightLoad()).toBeNull();
  });

  it("setInflightLoad / getInflightLoad round-trip", () => {
    expect(getInflightLoad()).toBeNull();
    const promise = Promise.resolve(true);
    setInflightLoad(promise);
    expect(getInflightLoad()).toBe(promise);
    setInflightLoad(null);
    expect(getInflightLoad()).toBeNull();
  });
});

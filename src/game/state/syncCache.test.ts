import { afterEach, describe, expect, it } from "vitest";
import {
  clearLoadSaveCache,
  getCurrentPlayerEmail,
  getInflightLoad,
  getSaveCache,
  isHydrationCompleted,
  isSaveCached,
  markHydrationCompleted,
  resetHydrationCompleted,
  setCurrentPlayerEmail,
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

  // Hydration flag — the saveNow gate that prevents INITIAL_STATE wipes
  // when loadSave hasn't proven the server's state for this session.
  it("hydrationCompleted starts false (load not yet attempted)", () => {
    expect(isHydrationCompleted()).toBe(false);
  });

  it("markHydrationCompleted flips it true", () => {
    expect(isHydrationCompleted()).toBe(false);
    markHydrationCompleted();
    expect(isHydrationCompleted()).toBe(true);
  });

  it("clearLoadSaveCache resets hydrationCompleted to false", () => {
    markHydrationCompleted();
    expect(isHydrationCompleted()).toBe(true);
    clearLoadSaveCache();
    expect(isHydrationCompleted()).toBe(false);
  });

  it("resetHydrationCompleted flips it back to false without touching the rest", () => {
    setSaveCache(true);
    markHydrationCompleted();
    resetHydrationCompleted();
    expect(isHydrationCompleted()).toBe(false);
    // The save cache is independent — resetting hydration shouldn't blow it
    // away. (Sign-in resets hydration to gate POSTs but the prior session's
    // CONTINUE label can stay rendered until the new load finishes.)
    expect(getSaveCache()).toBe(true);
  });

  // Player email — drives saveQueue's account-stamping and gates which
  // pending snapshots are visible to the current session.
  it("currentPlayerEmail starts null (no signed-in player)", () => {
    expect(getCurrentPlayerEmail()).toBeNull();
  });

  it("setCurrentPlayerEmail round-trips through getCurrentPlayerEmail", () => {
    setCurrentPlayerEmail("a@example.com");
    expect(getCurrentPlayerEmail()).toBe("a@example.com");
    setCurrentPlayerEmail(null);
    expect(getCurrentPlayerEmail()).toBeNull();
  });

  it("setting the SAME email is a no-op (does NOT reset hydration)", () => {
    setCurrentPlayerEmail("a@example.com");
    markHydrationCompleted();
    setCurrentPlayerEmail("a@example.com");
    // Hydration was proven for THIS account; setting the same email again
    // (e.g. a second hook firing on the same session) must not invalidate it.
    expect(isHydrationCompleted()).toBe(true);
  });

  it("changing the email to a different value resets hydrationCompleted + cache + inflight", () => {
    setCurrentPlayerEmail("a@example.com");
    markHydrationCompleted();
    setSaveCache(true);
    const inflightPromise = Promise.resolve(true);
    setInflightLoad(inflightPromise);

    setCurrentPlayerEmail("b@example.com");

    // Account swap: the previous account's load doesn't prove anything
    // about this account's server state, so saveNow must block until a
    // fresh loadSave verifies. Cache + inflight also belonged to the old
    // account's response — clear them too.
    expect(isHydrationCompleted()).toBe(false);
    expect(getSaveCache()).toBeNull();
    expect(getInflightLoad()).toBeNull();
  });

  it("changing the email to null (sign-out) resets hydration too", () => {
    setCurrentPlayerEmail("a@example.com");
    markHydrationCompleted();
    setCurrentPlayerEmail(null);
    expect(isHydrationCompleted()).toBe(false);
    expect(getCurrentPlayerEmail()).toBeNull();
  });

  it("clearLoadSaveCache resets currentPlayerEmail too", () => {
    setCurrentPlayerEmail("a@example.com");
    clearLoadSaveCache();
    expect(getCurrentPlayerEmail()).toBeNull();
  });
});

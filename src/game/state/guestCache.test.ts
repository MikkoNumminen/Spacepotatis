import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindGuestPersistenceOnce,
  clearGuestSnapshot,
  readGuestSnapshot,
  resetGuestPersistenceForTests,
  writeGuestSnapshot
} from "./guestCache";
import { addCredits, completeMission, getState, resetForTests } from "./GameState";
import { setCurrentPlayerEmail } from "./syncCache";
import { installFakeLocalStorage, FakeStorage } from "../../__tests__/fakeStorage";

const STORAGE_KEY = "spacepotatis:guest-progress:v1";

let storage: FakeStorage;

// Tiny event-listener shim on the fake window so the cross-tab `storage`
// listener can be exercised in the Node test env (no DOM by default).
// Mirrors the bits guestCache.ts actually uses: addEventListener,
// removeEventListener, dispatchEvent.
interface FakeListenerWindow {
  addEventListener?: (type: string, listener: (e: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (e: unknown) => void) => void;
  dispatchEvent?: (e: { type: string }) => boolean;
}

function installFakeWindowEvents(): void {
  const w = globalThis as unknown as FakeListenerWindow;
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  w.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type)?.push(listener);
  };
  w.removeEventListener = (type, listener) => {
    const arr = listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(listener);
    if (idx >= 0) arr.splice(idx, 1);
  };
  w.dispatchEvent = (e) => {
    const arr = listeners.get(e.type) ?? [];
    for (const l of arr) l(e);
    return true;
  };
}

beforeEach(() => {
  storage = installFakeLocalStorage();
  installFakeWindowEvents();
  resetForTests();
  resetGuestPersistenceForTests();
  setCurrentPlayerEmail(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readGuestSnapshot", () => {
  it("returns null when no entry exists", () => {
    expect(readGuestSnapshot()).toBeNull();
  });

  it("returns null when the stored value is not valid JSON", () => {
    storage.setItem(STORAGE_KEY, "not json");
    expect(readGuestSnapshot()).toBeNull();
  });

  it("returns null when the envelope shape is wrong", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    expect(readGuestSnapshot()).toBeNull();
  });

  it("returns null when the schema version doesn't match", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 999, savedAtMs: Date.now(), snapshot: { credits: 1 } })
    );
    expect(readGuestSnapshot()).toBeNull();
  });

  it("returns the snapshot when the envelope is valid", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAtMs: Date.now(),
        snapshot: { credits: 42 }
      })
    );
    expect(readGuestSnapshot()).toEqual({ credits: 42 });
  });
});

describe("writeGuestSnapshot / clearGuestSnapshot", () => {
  it("round-trips a snapshot", () => {
    writeGuestSnapshot({
      credits: 100,
      completedMissions: [],
      unlockedPlanets: [],
      playedTimeSeconds: 30,
      ship: {
        slots: [],
        inventory: [],
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      },
      saveSlot: 1,
      currentSolarSystemId: "tutorial",
      unlockedSolarSystems: ["tutorial"],
      seenStoryEntries: []
    });
    const got = readGuestSnapshot();
    expect(got?.credits).toBe(100);
    expect(got?.playedTimeSeconds).toBe(30);
  });

  it("clearGuestSnapshot removes the entry", () => {
    writeGuestSnapshot({
      credits: 1,
      completedMissions: [],
      unlockedPlanets: [],
      playedTimeSeconds: 0,
      ship: {
        slots: [],
        inventory: [],
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      },
      saveSlot: 1,
      currentSolarSystemId: "tutorial",
      unlockedSolarSystems: ["tutorial"],
      seenStoryEntries: []
    });
    expect(readGuestSnapshot()).not.toBeNull();
    clearGuestSnapshot();
    expect(readGuestSnapshot()).toBeNull();
  });

  it("write tolerates a localStorage that throws (quota / private mode)", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      length: 0,
      key: () => null
    };
    (globalThis as unknown as { localStorage: typeof throwing }).localStorage = throwing;
    expect(() =>
      writeGuestSnapshot({
        credits: 1,
        completedMissions: [],
        unlockedPlanets: [],
        playedTimeSeconds: 0,
        ship: {
          slots: [],
          inventory: [],
          augmentInventory: [],
          shieldLevel: 0,
          armorLevel: 0,
          reactor: { capacityLevel: 0, rechargeLevel: 0 }
        },
        saveSlot: 1,
        currentSolarSystemId: "tutorial",
        unlockedSolarSystems: ["tutorial"],
        seenStoryEntries: []
      })
    ).not.toThrow();
  });

  it("warns once per session when localStorage write fails (debuggability)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      length: 0,
      key: () => null
    };
    (globalThis as unknown as { localStorage: typeof throwing }).localStorage = throwing;
    const stub = {
      credits: 0,
      completedMissions: [],
      unlockedPlanets: [],
      playedTimeSeconds: 0,
      ship: {
        slots: [],
        inventory: [],
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      },
      saveSlot: 1,
      currentSolarSystemId: "tutorial" as const,
      unlockedSolarSystems: ["tutorial" as const],
      seenStoryEntries: []
    };
    // Three write attempts, but only ONE warn — log spam is the failure
    // mode the once-per-session guard protects against.
    writeGuestSnapshot(stub);
    writeGuestSnapshot(stub);
    writeGuestSnapshot(stub);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/localStorage write failed/i);
  });
});

describe("bindGuestPersistenceOnce — writer gate", () => {
  it("writes a snapshot on every commit while anonymous", () => {
    const unbind = bindGuestPersistenceOnce();
    addCredits(50);
    const after = readGuestSnapshot();
    expect(after?.credits).toBe(50);
    unbind();
  });

  it("does NOT write while authenticated (gate is currentPlayerEmail !== null)", () => {
    setCurrentPlayerEmail("authuser@example.com");
    const unbind = bindGuestPersistenceOnce();
    addCredits(50);
    expect(readGuestSnapshot()).toBeNull();
    unbind();
  });

  it("flips back on after sign-out (currentPlayerEmail returns to null)", () => {
    setCurrentPlayerEmail("authuser@example.com");
    const unbind = bindGuestPersistenceOnce();
    addCredits(50);
    expect(readGuestSnapshot()).toBeNull();
    setCurrentPlayerEmail(null);
    addCredits(25); // commit while anonymous again
    const after = readGuestSnapshot();
    expect(after?.credits).toBe(75);
    unbind();
  });

  it("a second bindGuestPersistenceOnce in the same lifetime is a no-op", () => {
    const firstUnbind = bindGuestPersistenceOnce();
    const secondUnbind = bindGuestPersistenceOnce();
    addCredits(10);
    // Single subscriber means a single write per commit; if we double-bound
    // we'd see two writes overwriting each other — the value would still
    // be 10 but readGuestSnapshot can't tell the difference. Instead,
    // verify the second unbind is a no-op (doesn't unsubscribe the first).
    secondUnbind();
    addCredits(5);
    expect(readGuestSnapshot()?.credits).toBe(15);
    firstUnbind();
  });
});

describe("bindGuestPersistenceOnce — boot recovery", () => {
  it("hydrates GameState from a persisted guest snapshot when anonymous", () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAtMs: Date.now(),
        snapshot: {
          credits: 999,
          completedMissions: ["tutorial"],
          unlockedPlanets: ["tutorial", "combat-1"],
          playedTimeSeconds: 60,
          ship: {
            slots: [],
            inventory: [],
            augmentInventory: [],
            shieldLevel: 0,
            armorLevel: 0,
            reactor: { capacityLevel: 0, rechargeLevel: 0 }
          },
          saveSlot: 1,
          currentSolarSystemId: "tutorial",
          unlockedSolarSystems: ["tutorial"],
          seenStoryEntries: []
        }
      })
    );
    const unbind = bindGuestPersistenceOnce();
    // hydrate happens synchronously inside bind. We trigger a no-op commit
    // through the existing GameState mutators to read the live state.
    completeMission("tutorial"); // already completed, idempotent
    const after = readGuestSnapshot();
    expect(after?.credits).toBe(999);
    expect(after?.completedMissions).toContain("tutorial");
    unbind();
  });

  it("does NOT hydrate when the auth cache says authenticated (avoids flash)", () => {
    // Seed the auth cache to look like a returning authenticated user.
    storage.setItem(
      "spacepotatis:auth",
      JSON.stringify({ v: 1, status: "authenticated", handle: "TestPilot", hasSave: true })
    );
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAtMs: Date.now(),
        snapshot: { credits: 999 }
      })
    );
    const unbind = bindGuestPersistenceOnce();
    // Trigger a commit. addCredits(0) is a no-op (early return), so use a
    // non-zero value. If boot recovery had wrongly hydrated the 999, this
    // commit would reflect 999 + 1 = 1000. With recovery skipped, live
    // state stayed at INITIAL (credits=0) and addCredits(1) lands at 1.
    addCredits(1);
    expect(readGuestSnapshot()?.credits).toBe(1);
    unbind();
  });

  it("a returning authenticated user (auth cache + email both set) leaves the cache untouched", () => {
    // Production-faithful: a returning authenticated user has BOTH the
    // auth cache populated AND `currentPlayerEmail` set by the time
    // GuestProgressMount runs (useCloudSaveSync's setCurrentPlayerEmail
    // effect fires before bindGuestPersistenceOnce). Boot recovery must
    // skip, AND the writer subscription must skip on commits because the
    // email gate evaluates non-null.
    storage.setItem(
      "spacepotatis:auth",
      JSON.stringify({ v: 1, status: "authenticated", handle: "TestPilot", hasSave: true })
    );
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAtMs: Date.now(),
        snapshot: { credits: 999 }
      })
    );
    setCurrentPlayerEmail("returning@example.com");
    const unbind = bindGuestPersistenceOnce();
    // Authenticated user plays — every commit goes through saveQueue, NOT
    // the guest cache. The cache must remain at the seeded 999.
    addCredits(50);
    expect(readGuestSnapshot()?.credits).toBe(999);
    unbind();
  });
});

describe("bindGuestPersistenceOnce — cross-tab sync", () => {
  function dispatchStorageEvent(key: string, newValue: string | null): void {
    const w = globalThis as unknown as { dispatchEvent?: (e: { type: string }) => boolean };
    w.dispatchEvent?.({ type: "storage", key, newValue } as unknown as { type: string });
  }

  it("a storage event from another tab hydrates this tab's GameState", () => {
    setCurrentPlayerEmail(null);
    const unbind = bindGuestPersistenceOnce();
    // Simulate Tab B writing a fresh envelope and dispatching a storage
    // event into Tab A (the one running the test).
    const fresh = JSON.stringify({
      v: 1,
      savedAtMs: Date.now(),
      snapshot: {
        credits: 777,
        completedMissions: [],
        unlockedPlanets: [],
        playedTimeSeconds: 0,
        ship: {
          slots: [],
          inventory: [],
          augmentInventory: [],
          shieldLevel: 0,
          armorLevel: 0,
          reactor: { capacityLevel: 0, rechargeLevel: 0 }
        },
        saveSlot: 1,
        currentSolarSystemId: "tutorial",
        unlockedSolarSystems: ["tutorial"],
        seenStoryEntries: []
      }
    });
    storage.setItem(STORAGE_KEY, fresh);
    dispatchStorageEvent(STORAGE_KEY, fresh);
    // GameState should reflect the cross-tab write — and the writer must
    // NOT have ping-ponged a re-write back into the cache (suppressed
    // during the cross-tab hydrate).
    expect(getState().credits).toBe(777);
    // Storage still has the original sibling write — same envelope, same
    // savedAtMs. If the writer had fired despite suppression, savedAtMs
    // would have advanced; we don't assert that here because Date.now is
    // mocked at test boundaries and the structural equality is enough.
    expect(readGuestSnapshot()?.credits).toBe(777);
    unbind();
  });

  it("ignores a sibling-tab clear (newValue=null) instead of resetting GameState", () => {
    setCurrentPlayerEmail(null);
    const unbind = bindGuestPersistenceOnce();
    addCredits(150); // local progress in this tab — also writes to cache
    // Sibling tab clears the cache (e.g. they just signed in and consumed
    // the snapshot via the claim path).
    storage.removeItem(STORAGE_KEY);
    dispatchStorageEvent(STORAGE_KEY, null);
    // This tab's in-memory progress is unaffected — sibling's clear is
    // about THEIR session, not ours. The cache is empty, but our state
    // still reads 150.
    expect(getState().credits).toBe(150);
    expect(readGuestSnapshot()).toBeNull();
    unbind();
  });

  it("storage events for unrelated keys are ignored", () => {
    setCurrentPlayerEmail(null);
    const unbind = bindGuestPersistenceOnce();
    addCredits(50);
    const beforeCredits = readGuestSnapshot()?.credits ?? null;
    // An unrelated key firing a storage event must NOT re-hydrate or
    // trigger any guest-cache logic.
    dispatchStorageEvent("spacepotatis:auth", '{"v":1,"status":"authenticated"}');
    const afterCredits = readGuestSnapshot()?.credits ?? null;
    expect(afterCredits).toBe(beforeCredits);
    expect(getState().credits).toBe(50);
    unbind();
  });
});

describe("bindGuestPersistenceOnce — cross-tab error handling", () => {
  function dispatchStorageEvent(key: string, newValue: string | null): void {
    const w = globalThis as unknown as { dispatchEvent?: (e: { type: string }) => boolean };
    w.dispatchEvent?.({ type: "storage", key, newValue } as unknown as { type: string });
  }

  it("a sibling-tab envelope that crashes hydrate is swallowed + warned, not propagated", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setCurrentPlayerEmail(null);
    const unbind = bindGuestPersistenceOnce();
    // Structurally valid envelope, semantically broken inner snapshot:
    // shipConfig has a recognizably bogus shape that trips up migrateShip
    // (slots is a string instead of object/array). We rely on the
    // existing isEnvelopeShape only checking the top-level keys.
    const malformed = JSON.stringify({
      v: 1,
      savedAtMs: Date.now(),
      snapshot: {
        credits: 50,
        // Non-array completedMissions — passes the structural envelope
        // check but hydrate calls `.includes(...)` on it, which throws on
        // a plain object. Same shape used in the matching sync.test.ts
        // case.
        completedMissions: { not: "an array" },
        unlockedPlanets: [],
        playedTimeSeconds: 0,
        ship: {
          slots: [],
          inventory: [],
          augmentInventory: [],
          shieldLevel: 0,
          armorLevel: 0,
          reactor: { capacityLevel: 0, rechargeLevel: 0 }
        },
        saveSlot: 1,
        currentSolarSystemId: "tutorial",
        unlockedSolarSystems: ["tutorial"],
        seenStoryEntries: []
      }
    });
    storage.setItem(STORAGE_KEY, malformed);
    // The dispatch must NOT throw out of the listener — production
    // browsers would log "Uncaught error in event handler" and stop
    // running other listeners on the same event.
    expect(() => dispatchStorageEvent(STORAGE_KEY, malformed)).not.toThrow();
    // We logged a single warning so the failure leaves a trail.
    expect(warn).toHaveBeenCalled();
    // Subsequent same-tab commits still trigger the writer — the suppress
    // flag was correctly reset in the finally block.
    addCredits(7);
    expect(readGuestSnapshot()?.credits).toBe(7);
    unbind();
  });
});

describe("bindGuestPersistenceOnce — reference counting", () => {
  it("two callers share a single subscription; only the last cleanup unbinds", () => {
    setCurrentPlayerEmail(null);
    const unbindA = bindGuestPersistenceOnce();
    const unbindB = bindGuestPersistenceOnce();
    addCredits(10);
    expect(readGuestSnapshot()?.credits).toBe(10);
    // First cleanup decrements; subscription stays alive.
    unbindA();
    addCredits(5);
    expect(readGuestSnapshot()?.credits).toBe(15);
    // Last cleanup detaches the writer.
    unbindB();
    addCredits(20);
    // After the final unbind, the writer no longer fires — the previous
    // value (15) persists in the cache.
    expect(readGuestSnapshot()?.credits).toBe(15);
  });
});

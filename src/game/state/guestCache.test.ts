import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindGuestPersistenceOnce,
  clearGuestSnapshot,
  readGuestSnapshot,
  resetGuestPersistenceForTests,
  writeGuestSnapshot
} from "./guestCache";
import { addCredits, completeMission, resetForTests } from "./GameState";
import { setCurrentPlayerEmail } from "./syncCache";
import { installFakeLocalStorage, FakeStorage } from "../../__tests__/fakeStorage";

const STORAGE_KEY = "spacepotatis:guest-progress:v1";

let storage: FakeStorage;

beforeEach(() => {
  storage = installFakeLocalStorage();
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
});

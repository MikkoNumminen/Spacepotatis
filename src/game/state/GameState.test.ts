import { beforeEach, describe, expect, it } from "vitest";
import {
  addCredits,
  addPlayedTime,
  buyArmorUpgrade,
  buyShieldUpgrade,
  buyWeapon,
  completeMission,
  getState,
  hydrate,
  isMissionCompleted,
  isPlanetUnlocked,
  resetForTests,
  selectWeapon,
  setSolarSystem,
  spendCredits,
  subscribe,
  toSnapshot
} from "./GameState";

beforeEach(() => {
  resetForTests();
});

describe("initial state", () => {
  it("starts with zero credits and the entry-point planets unlocked", () => {
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.completedMissions).toEqual([]);
    expect(s.unlockedPlanets).toContain("tutorial");
    expect(s.unlockedPlanets).toContain("shop");
    expect(s.unlockedPlanets).not.toContain("combat-1");
    expect(s.unlockedPlanets).not.toContain("boss-1");
    expect(s.playedTimeSeconds).toBe(0);
    expect(s.saveSlot).toBe(1);
  });

  it("starts in the tutorial system with only the tutorial system unlocked", () => {
    const s = getState();
    expect(s.currentSolarSystemId).toBe("tutorial");
    expect(s.unlockedSolarSystems).toEqual(["tutorial"]);
  });
});

describe("credits", () => {
  it("addCredits accumulates and clamps the floor at zero", () => {
    addCredits(50);
    expect(getState().credits).toBe(50);
    addCredits(-30);
    expect(getState().credits).toBe(20);
    addCredits(-9999);
    expect(getState().credits).toBe(0);
  });

  it("addCredits is a no-op for zero", () => {
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });
    addCredits(0);
    unsub();
    expect(calls).toBe(0);
  });

  it("spendCredits succeeds when the wallet has enough", () => {
    addCredits(100);
    expect(spendCredits(40)).toBe(true);
    expect(getState().credits).toBe(60);
  });

  it("spendCredits refuses to overdraw and leaves credits untouched", () => {
    addCredits(20);
    expect(spendCredits(50)).toBe(false);
    expect(getState().credits).toBe(20);
  });
});

describe("playedTime", () => {
  it("accumulates positive seconds and ignores zero/negative", () => {
    addPlayedTime(30);
    addPlayedTime(0);
    addPlayedTime(-10);
    addPlayedTime(15);
    expect(getState().playedTimeSeconds).toBe(45);
  });
});

describe("completeMission", () => {
  it("records completion and is idempotent", () => {
    completeMission("tutorial");
    completeMission("tutorial");
    expect(getState().completedMissions).toEqual(["tutorial"]);
    expect(isMissionCompleted("tutorial")).toBe(true);
  });

  it("unlocks downstream missions when prereqs are satisfied", () => {
    expect(isPlanetUnlocked("combat-1")).toBe(false);
    completeMission("tutorial");
    expect(isPlanetUnlocked("combat-1")).toBe(true);
    expect(isPlanetUnlocked("boss-1")).toBe(false);
    completeMission("combat-1");
    expect(isPlanetUnlocked("boss-1")).toBe(true);
  });

  it("does not duplicate planets that were already unlocked", () => {
    completeMission("tutorial");
    completeMission("tutorial");
    const dupes = getState().unlockedPlanets.filter((p) => p === "combat-1");
    expect(dupes).toHaveLength(1);
  });

  it("completing boss-1 unlocks the tubernovae solar system", () => {
    expect(getState().unlockedSolarSystems).not.toContain("tubernovae");
    completeMission("boss-1");
    expect(getState().unlockedSolarSystems).toContain("tubernovae");
  });

  it("completing boss-1 a second time does not duplicate the system unlock", () => {
    completeMission("boss-1");
    completeMission("boss-1");
    const occurrences = getState().unlockedSolarSystems.filter((s) => s === "tubernovae");
    expect(occurrences).toHaveLength(1);
  });
});

describe("setSolarSystem", () => {
  it("refuses to switch to a system the player has not unlocked", () => {
    expect(setSolarSystem("tubernovae")).toBe(false);
    expect(getState().currentSolarSystemId).toBe("tutorial");
  });

  it("switches when the system is unlocked", () => {
    completeMission("boss-1"); // unlocks tubernovae
    expect(setSolarSystem("tubernovae")).toBe(true);
    expect(getState().currentSolarSystemId).toBe("tubernovae");
  });

  it("is a no-op (returns true) when already on the requested system", () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    expect(setSolarSystem("tutorial")).toBe(true);
    unsub();
    expect(count).toBe(0);
    expect(getState().currentSolarSystemId).toBe("tutorial");
  });
});

describe("ship purchases", () => {
  it("selectWeapon refuses weapons that are not yet unlocked", () => {
    expect(selectWeapon("heavy-cannon")).toBe(false);
    expect(getState().ship.primaryWeapon).toBe("rapid-fire");
  });

  it("selectWeapon switches to an unlocked weapon", () => {
    addCredits(900);
    expect(buyWeapon("heavy-cannon")).toBe(true);
    expect(selectWeapon("rapid-fire")).toBe(true);
    expect(getState().ship.primaryWeapon).toBe("rapid-fire");
  });

  it("buyWeapon refuses when the player can't afford it", () => {
    expect(buyWeapon("heavy-cannon")).toBe(false);
    expect(getState().ship.unlockedWeapons).toEqual(["rapid-fire"]);
  });

  it("buyWeapon spends credits, unlocks, and equips on success", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.ship.unlockedWeapons).toContain("spread-shot");
    expect(s.ship.primaryWeapon).toBe("spread-shot");
  });

  it("buyWeapon refuses to re-purchase a weapon already owned", () => {
    expect(buyWeapon("rapid-fire")).toBe(false);
  });

  it("buyShieldUpgrade increments the level and spends credits", () => {
    addCredits(200);
    expect(buyShieldUpgrade()).toBe(true);
    expect(getState().ship.shieldLevel).toBe(1);
    expect(getState().credits).toBe(0);
  });

  it("buyShieldUpgrade refuses past MAX_LEVEL", () => {
    addCredits(1_000_000);
    for (let i = 0; i < 5; i++) buyShieldUpgrade();
    expect(getState().ship.shieldLevel).toBe(5);
    expect(buyShieldUpgrade()).toBe(false);
  });

  it("buyArmorUpgrade has the same gating as shields", () => {
    expect(buyArmorUpgrade()).toBe(false);
    addCredits(300);
    expect(buyArmorUpgrade()).toBe(true);
    expect(getState().ship.armorLevel).toBe(1);
  });
});

describe("snapshot / hydrate", () => {
  it("toSnapshot is a deep copy that survives mutating the live state", () => {
    addCredits(123);
    completeMission("tutorial");
    const snap = toSnapshot();
    addCredits(50);
    completeMission("combat-1");
    expect(snap.credits).toBe(123);
    expect(snap.completedMissions).toEqual(["tutorial"]);
  });

  it("hydrate restores from a partial snapshot using INITIAL defaults for missing fields", () => {
    hydrate({ credits: 999, completedMissions: ["tutorial"] });
    const s = getState();
    expect(s.credits).toBe(999);
    expect(s.completedMissions).toEqual(["tutorial"]);
    expect(s.ship.primaryWeapon).toBe("rapid-fire");
  });

  it("hydrate defaults solar-system fields when the snapshot predates them", () => {
    // Old snapshots have no currentSolarSystemId / unlockedSolarSystems fields.
    // They should fall back to the tutorial system + only the tutorial unlocked.
    hydrate({ credits: 42, completedMissions: ["tutorial", "combat-1"] });
    const s = getState();
    expect(s.currentSolarSystemId).toBe("tutorial");
    expect(s.unlockedSolarSystems).toEqual(["tutorial"]);
  });

  it("hydrate clamps a saved currentSolarSystemId to one the player has unlocked", () => {
    // Pretend a save was tampered with — currentSolarSystemId says tubernovae
    // but unlockedSolarSystems doesn't list it. Migration should reset.
    hydrate({
      currentSolarSystemId: "tubernovae",
      unlockedSolarSystems: ["tutorial"]
    });
    expect(getState().currentSolarSystemId).toBe("tutorial");
  });

  it("hydrate restores both solar-system fields when present", () => {
    hydrate({
      currentSolarSystemId: "tubernovae",
      unlockedSolarSystems: ["tutorial", "tubernovae"]
    });
    const s = getState();
    expect(s.currentSolarSystemId).toBe("tubernovae");
    expect(s.unlockedSolarSystems).toEqual(["tutorial", "tubernovae"]);
  });

  it("subscribe fires on commit and unsubscribe stops it", () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    addCredits(10);
    addCredits(20);
    expect(count).toBe(2);
    unsub();
    addCredits(30);
    expect(count).toBe(2);
  });
});

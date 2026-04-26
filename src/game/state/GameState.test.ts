import { beforeEach, describe, expect, it } from "vitest";
import {
  addCredits,
  addPlayedTime,
  buyArmorUpgrade,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  buyWeapon,
  completeMission,
  equipWeapon,
  getState,
  grantWeapon,
  hydrate,
  isMissionCompleted,
  isPlanetUnlocked,
  resetForTests,
  sellWeapon,
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

  it("ship boots with rapid-fire equipped to the front slot only", () => {
    const ship = getState().ship;
    expect(ship.slots.front).toBe("rapid-fire");
    expect(ship.slots.rear).toBeNull();
    expect(ship.slots.sidekickLeft).toBeNull();
    expect(ship.slots.sidekickRight).toBeNull();
    expect(ship.reactor.capacityLevel).toBe(0);
    expect(ship.reactor.rechargeLevel).toBe(0);
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
});

describe("ship purchases", () => {
  it("buyWeapon refuses when the player cannot afford it", () => {
    expect(buyWeapon("heavy-cannon")).toBe(false);
    expect(getState().ship.unlockedWeapons).toEqual(["rapid-fire"]);
  });

  it("buyWeapon spends credits, unlocks, and leaves the front slot alone when occupied", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.ship.unlockedWeapons).toContain("spread-shot");
    expect(s.ship.slots.front).toBe("rapid-fire");
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

  it("buyReactorCapacityUpgrade increments level when affordable, refuses otherwise", () => {
    expect(buyReactorCapacityUpgrade()).toBe(false);
    addCredits(200);
    expect(buyReactorCapacityUpgrade()).toBe(true);
    expect(getState().ship.reactor.capacityLevel).toBe(1);
    expect(getState().credits).toBe(0);
  });

  it("buyReactorRechargeUpgrade increments and refuses past MAX_LEVEL", () => {
    addCredits(1_000_000);
    for (let i = 0; i < 5; i++) buyReactorRechargeUpgrade();
    expect(getState().ship.reactor.rechargeLevel).toBe(5);
    expect(buyReactorRechargeUpgrade()).toBe(false);
  });
});

describe("equipWeapon", () => {
  it("refuses to equip a weapon the player does not own", () => {
    expect(equipWeapon("front", "heavy-cannon")).toBe(false);
    expect(getState().ship.slots.front).toBe("rapid-fire");
  });

  it("refuses to equip a weapon into a slot of a different kind", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    expect(equipWeapon("rear", "spread-shot")).toBe(false);
    expect(getState().ship.slots.rear).toBeNull();
  });

  it("equips an owned weapon into a matching slot", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    expect(equipWeapon("front", "spread-shot")).toBe(true);
    expect(getState().ship.slots.front).toBe("spread-shot");
  });

  it("equipping a different weapon into a slot replaces what was there", () => {
    addCredits(900);
    buyWeapon("heavy-cannon");
    expect(equipWeapon("front", "heavy-cannon")).toBe(true);
    expect(getState().ship.slots.front).toBe("heavy-cannon");
    expect(equipWeapon("front", "rapid-fire")).toBe(true);
    expect(getState().ship.slots.front).toBe("rapid-fire");
  });

  it("equipping null clears the slot", () => {
    expect(equipWeapon("front", null)).toBe(true);
    expect(getState().ship.slots.front).toBeNull();
  });

  it("equipping a weapon that was in another slot vacates that other slot (no duplication)", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    equipWeapon("front", "spread-shot");
    expect(equipWeapon("front", "rapid-fire")).toBe(true);
    const slots = getState().ship.slots;
    expect(slots.front).toBe("rapid-fire");
    expect(Object.values(slots).filter((s) => s === "spread-shot")).toHaveLength(0);
  });
});

describe("grantWeapon (mission pickup)", () => {
  it("unlocks a new weapon and equips it into its canonical slot (front for front weapons)", () => {
    grantWeapon("heavy-cannon");
    const s = getState();
    expect(s.ship.unlockedWeapons).toContain("heavy-cannon");
    expect(s.ship.slots.front).toBe("heavy-cannon");
  });

  it("is a no-op (no commit) when the weapon is already unlocked AND already in its canonical slot", () => {
    grantWeapon("spread-shot");
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });
    grantWeapon("spread-shot");
    unsub();
    expect(calls).toBe(0);
  });
});

describe("sellWeapon", () => {
  it("refuses to sell a weapon equipped in any slot", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    equipWeapon("front", "spread-shot");
    expect(sellWeapon("spread-shot")).toBe(false);
    expect(getState().ship.unlockedWeapons).toContain("spread-shot");
  });

  it("sells an owned, unequipped weapon for half its purchase price", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    expect(sellWeapon("spread-shot")).toBe(true);
    expect(getState().ship.unlockedWeapons).not.toContain("spread-shot");
    expect(getState().credits).toBe(225);
  });

  it("refuses to sell the starter weapon (cost 0 → no refund)", () => {
    equipWeapon("front", null);
    expect(sellWeapon("rapid-fire")).toBe(false);
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
    expect(snap.ship.slots.front).toBe("rapid-fire");
    expect(snap.ship.reactor).toEqual({ capacityLevel: 0, rechargeLevel: 0 });
  });

  it("hydrate restores from a partial snapshot using INITIAL defaults for missing fields", () => {
    hydrate({ credits: 999, completedMissions: ["tutorial"] });
    const s = getState();
    expect(s.credits).toBe(999);
    expect(s.completedMissions).toEqual(["tutorial"]);
    expect(s.ship.slots.front).toBe("rapid-fire");
  });

  it("hydrate migrates a legacy snapshot (primaryWeapon, no slots, no reactor)", () => {
    const legacy = {
      credits: 500,
      ship: {
        primaryWeapon: "heavy-cannon",
        unlockedWeapons: ["rapid-fire", "heavy-cannon"],
        shieldLevel: 2,
        armorLevel: 1
      }
    } as unknown as Parameters<typeof hydrate>[0];
    hydrate(legacy);
    const s = getState();
    expect(s.credits).toBe(500);
    expect(s.ship.unlockedWeapons).toEqual(["rapid-fire", "heavy-cannon"]);
    expect(s.ship.slots.front).toBe("heavy-cannon");
    expect(s.ship.slots.rear).toBeNull();
    expect(s.ship.slots.sidekickLeft).toBeNull();
    expect(s.ship.slots.sidekickRight).toBeNull();
    expect(s.ship.shieldLevel).toBe(2);
    expect(s.ship.armorLevel).toBe(1);
    expect(s.ship.reactor).toEqual({ capacityLevel: 0, rechargeLevel: 0 });
  });

  it("hydrate accepts a new-format snapshot directly", () => {
    const snap = {
      credits: 10,
      ship: {
        slots: {
          front: "rapid-fire",
          rear: null,
          sidekickLeft: null,
          sidekickRight: null
        },
        unlockedWeapons: ["rapid-fire"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 3, rechargeLevel: 2 }
      }
    } as unknown as Parameters<typeof hydrate>[0];
    hydrate(snap);
    expect(getState().ship.reactor).toEqual({ capacityLevel: 3, rechargeLevel: 2 });
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

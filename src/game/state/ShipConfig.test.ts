import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIP,
  EMPTY_SLOTS,
  MAX_LEVEL,
  armorUpgradeCost,
  findEquippedSlot,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  isWeaponEquipped,
  isWeaponUnlocked,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  slotKindFor,
  type ShipConfig
} from "./ShipConfig";

describe("DEFAULT_SHIP", () => {
  it("starts with the free starter weapon equipped to the front slot only", () => {
    expect(DEFAULT_SHIP.slots.front).toBe("rapid-fire");
    expect(DEFAULT_SHIP.slots.rear).toBeNull();
    expect(DEFAULT_SHIP.slots.sidekickLeft).toBeNull();
    expect(DEFAULT_SHIP.slots.sidekickRight).toBeNull();
    expect(DEFAULT_SHIP.unlockedWeapons).toEqual(["rapid-fire"]);
    expect(DEFAULT_SHIP.shieldLevel).toBe(0);
    expect(DEFAULT_SHIP.armorLevel).toBe(0);
    expect(DEFAULT_SHIP.reactor.capacityLevel).toBe(0);
    expect(DEFAULT_SHIP.reactor.rechargeLevel).toBe(0);
  });

  it("EMPTY_SLOTS exposes a fully empty slot record", () => {
    expect(EMPTY_SLOTS).toEqual({
      front: null,
      rear: null,
      sidekickLeft: null,
      sidekickRight: null
    });
  });
});

describe("getMaxShield / getMaxArmor", () => {
  it("returns base values at level 0", () => {
    expect(getMaxShield(DEFAULT_SHIP)).toBe(40);
    expect(getMaxArmor(DEFAULT_SHIP)).toBe(60);
  });

  it("scales monotonically with level", () => {
    let prevShield = -1;
    let prevArmor = -1;
    for (let lvl = 0; lvl <= MAX_LEVEL; lvl++) {
      const s = getMaxShield({ ...DEFAULT_SHIP, shieldLevel: lvl });
      const a = getMaxArmor({ ...DEFAULT_SHIP, armorLevel: lvl });
      expect(s).toBeGreaterThan(prevShield);
      expect(a).toBeGreaterThan(prevArmor);
      prevShield = s;
      prevArmor = a;
    }
  });
});

describe("reactor", () => {
  it("returns base capacity and recharge at level 0", () => {
    expect(getReactorCapacity(DEFAULT_SHIP)).toBe(100);
    expect(getReactorRecharge(DEFAULT_SHIP)).toBe(25);
  });

  it("capacity grows by +30 per level, recharge by +8 per level", () => {
    for (let lvl = 0; lvl <= MAX_LEVEL; lvl++) {
      const ship: ShipConfig = {
        ...DEFAULT_SHIP,
        reactor: { capacityLevel: lvl, rechargeLevel: lvl }
      };
      expect(getReactorCapacity(ship)).toBe(100 + lvl * 30);
      expect(getReactorRecharge(ship)).toBe(25 + lvl * 8);
    }
  });

  it("capacity and recharge scale monotonically", () => {
    let prevCap = -1;
    let prevRech = -1;
    for (let lvl = 0; lvl <= MAX_LEVEL; lvl++) {
      const ship: ShipConfig = {
        ...DEFAULT_SHIP,
        reactor: { capacityLevel: lvl, rechargeLevel: lvl }
      };
      const cap = getReactorCapacity(ship);
      const rech = getReactorRecharge(ship);
      expect(cap).toBeGreaterThan(prevCap);
      expect(rech).toBeGreaterThan(prevRech);
      prevCap = cap;
      prevRech = rech;
    }
  });
});

describe("upgrade costs", () => {
  it("doubles per level for shields, armor, and both reactor stats", () => {
    expect(shieldUpgradeCost(0)).toBe(200);
    expect(shieldUpgradeCost(1)).toBe(400);
    expect(shieldUpgradeCost(4)).toBe(200 * 16);
    expect(armorUpgradeCost(0)).toBe(300);
    expect(armorUpgradeCost(2)).toBe(1200);
    expect(reactorCapacityCost(0)).toBe(200);
    expect(reactorCapacityCost(3)).toBe(200 * 8);
    expect(reactorRechargeCost(0)).toBe(200);
    expect(reactorRechargeCost(4)).toBe(200 * 16);
  });
});

describe("isWeaponUnlocked", () => {
  it("recognizes the unlocked starter weapon", () => {
    expect(isWeaponUnlocked(DEFAULT_SHIP, "rapid-fire")).toBe(true);
  });

  it("rejects weapons not present in unlockedWeapons", () => {
    expect(isWeaponUnlocked(DEFAULT_SHIP, "spread-shot")).toBe(false);
    expect(isWeaponUnlocked(DEFAULT_SHIP, "heavy-cannon")).toBe(false);
  });

  it("recognizes additional unlocked weapons", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      unlockedWeapons: ["rapid-fire", "heavy-cannon"]
    };
    expect(isWeaponUnlocked(ship, "heavy-cannon")).toBe(true);
    expect(isWeaponUnlocked(ship, "spread-shot")).toBe(false);
  });
});

describe("slot helpers", () => {
  it("slotKindFor maps slot names to weapon-slot kinds", () => {
    expect(slotKindFor("front")).toBe("front");
    expect(slotKindFor("rear")).toBe("rear");
    expect(slotKindFor("sidekickLeft")).toBe("sidekick");
    expect(slotKindFor("sidekickRight")).toBe("sidekick");
  });

  it("isWeaponEquipped reports true when the weapon is in any slot", () => {
    expect(isWeaponEquipped(DEFAULT_SHIP, "rapid-fire")).toBe(true);
    expect(isWeaponEquipped(DEFAULT_SHIP, "heavy-cannon")).toBe(false);
  });

  it("findEquippedSlot returns the slot name or null", () => {
    expect(findEquippedSlot(DEFAULT_SHIP, "rapid-fire")).toBe("front");
    expect(findEquippedSlot(DEFAULT_SHIP, "heavy-cannon")).toBeNull();
  });
});

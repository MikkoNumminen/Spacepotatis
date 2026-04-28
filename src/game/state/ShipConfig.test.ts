import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIP,
  MAX_LEVEL,
  MAX_WEAPON_SLOTS,
  armorUpgradeCost,
  firstEmptySlot,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  ownsAnyOfType,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  slotPurchaseCost,
  weaponDamageMultiplier,
  weaponUpgradeCost,
  type ShipConfig
} from "./ShipConfig";
import {
  NEUTRAL_AUGMENT_EFFECTS,
  foldAugmentEffects
} from "@/game/data/augments";

describe("DEFAULT_SHIP", () => {
  it("starts with one slot containing the free starter weapon", () => {
    expect(DEFAULT_SHIP.slots.length).toBe(1);
    expect(DEFAULT_SHIP.slots[0]?.id).toBe("rapid-fire");
    expect(ownsAnyOfType(DEFAULT_SHIP, "rapid-fire")).toBe(true);
    expect(DEFAULT_SHIP.shieldLevel).toBe(0);
    expect(DEFAULT_SHIP.armorLevel).toBe(0);
    expect(DEFAULT_SHIP.reactor.capacityLevel).toBe(0);
    expect(DEFAULT_SHIP.reactor.rechargeLevel).toBe(0);
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

describe("ownsAnyOfType (weapon ownership)", () => {
  it("recognizes the unlocked starter weapon", () => {
    expect(ownsAnyOfType(DEFAULT_SHIP, "rapid-fire")).toBe(true);
  });

  it("rejects weapons not owned in slots or inventory", () => {
    expect(ownsAnyOfType(DEFAULT_SHIP, "spread-shot")).toBe(false);
    expect(ownsAnyOfType(DEFAULT_SHIP, "heavy-cannon")).toBe(false);
  });

  it("recognizes additional owned weapons", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      inventory: [{ id: "heavy-cannon", level: 1, augments: [] }]
    };
    expect(ownsAnyOfType(ship, "heavy-cannon")).toBe(true);
    expect(ownsAnyOfType(ship, "spread-shot")).toBe(false);
  });
});

describe("slot helpers", () => {
  it("ship.slots.some reports true when the weapon is in any slot", () => {
    expect(DEFAULT_SHIP.slots.some(s => s?.id === "rapid-fire")).toBe(true);
    expect(DEFAULT_SHIP.slots.some(s => s?.id === "heavy-cannon")).toBe(false);
  });

  it("ship.slots.findIndex returns the slot index or -1", () => {
    expect(DEFAULT_SHIP.slots.findIndex(s => s?.id === "rapid-fire")).toBe(0);
    expect(DEFAULT_SHIP.slots.findIndex(s => s?.id === "heavy-cannon")).toBe(-1);
  });

  it("firstEmptySlot finds the leftmost null", () => {
    expect(firstEmptySlot(DEFAULT_SHIP)).toBe(-1);
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      slots: [
        { id: "rapid-fire", level: 1, augments: [] },
        null,
        { id: "spread-shot", level: 1, augments: [] }
      ]
    };
    expect(firstEmptySlot(ship)).toBe(1);
  });
});

describe("slotPurchaseCost", () => {
  it("returns the per-slot cost curve: 500, 2000, then doubles past slot 3", () => {
    expect(slotPurchaseCost(1)).toBe(500);
    expect(slotPurchaseCost(2)).toBe(2000);
    expect(slotPurchaseCost(3)).toBe(4000);
    expect(slotPurchaseCost(4)).toBe(8000);
    expect(slotPurchaseCost(5)).toBe(16000);
  });

  it("returns 0 for nonsense input below 1 slot", () => {
    expect(slotPurchaseCost(0)).toBe(0);
    expect(slotPurchaseCost(-1)).toBe(0);
  });

  it("MAX_WEAPON_SLOTS is the soft cap consumers should respect", () => {
    expect(MAX_WEAPON_SLOTS).toBeGreaterThanOrEqual(3);
  });
});

describe("weapon mark levels", () => {
  it("default ship's starter weapon is at level 1; unowned weapons fall back to 1", () => {
    const starter = DEFAULT_SHIP.slots.find(s => s?.id === "rapid-fire");
    expect(starter?.level ?? 1).toBe(1);
    const spread =
      DEFAULT_SHIP.slots.find(s => s?.id === "spread-shot") ??
      DEFAULT_SHIP.inventory.find(i => i.id === "spread-shot");
    expect(spread?.level ?? 1).toBe(1);
  });

  it("a weapon instance carries its own explicit level", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      slots: [{ id: "rapid-fire", level: 4, augments: [] }]
    };
    const rapid = ship.slots.find(s => s?.id === "rapid-fire");
    expect(rapid?.level).toBe(4);
    // Other weapons aren't present; readers default to 1.
    const spread =
      ship.slots.find(s => s?.id === "spread-shot") ??
      ship.inventory.find(i => i.id === "spread-shot");
    expect(spread?.level ?? 1).toBe(1);
  });

  it("weaponDamageMultiplier scales linearly: level 1 = 1.0, level 5 = 1.60", () => {
    expect(weaponDamageMultiplier(1)).toBeCloseTo(1.0, 6);
    expect(weaponDamageMultiplier(2)).toBeCloseTo(1.15, 6);
    expect(weaponDamageMultiplier(3)).toBeCloseTo(1.3, 6);
    expect(weaponDamageMultiplier(4)).toBeCloseTo(1.45, 6);
    expect(weaponDamageMultiplier(5)).toBeCloseTo(1.6, 6);
  });

  it("weaponUpgradeCost doubles per current level: 200 / 400 / 800 / 1600", () => {
    expect(weaponUpgradeCost(1)).toBe(200);
    expect(weaponUpgradeCost(2)).toBe(400);
    expect(weaponUpgradeCost(3)).toBe(800);
    expect(weaponUpgradeCost(4)).toBe(1600);
  });
});

describe("installed augments", () => {
  it("default ship's starter weapon has no augments installed", () => {
    const starter = DEFAULT_SHIP.slots.find(s => s?.id === "rapid-fire");
    expect(starter?.augments ?? []).toEqual([]);
  });

  it("reads back the augments stored on a weapon instance", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      slots: [{ id: "rapid-fire", level: 1, augments: ["damage-up", "fire-rate-up"] }]
    };
    const rapid = ship.slots.find(s => s?.id === "rapid-fire");
    expect(rapid?.augments).toEqual(["damage-up", "fire-rate-up"]);
  });

  it("returns [] for an owned weapon with no augments installed", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      slots: [{ id: "rapid-fire", level: 1, augments: ["damage-up"] }],
      inventory: [{ id: "spread-shot", level: 1, augments: [] }]
    };
    const spread =
      ship.slots.find(s => s?.id === "spread-shot") ??
      ship.inventory.find(i => i.id === "spread-shot");
    expect(spread?.augments ?? []).toEqual([]);
  });
});

describe("foldAugmentEffects", () => {
  it("returns the identity for an empty list", () => {
    expect(foldAugmentEffects([])).toEqual(NEUTRAL_AUGMENT_EFFECTS);
    expect(foldAugmentEffects([])).toEqual({
      damageMul: 1,
      fireRateMul: 1,
      projectileBonus: 0,
      energyMul: 1,
      turnRateMul: 1
    });
  });

  it("a single augment surfaces only its modifier; others stay at default", () => {
    const eff = foldAugmentEffects(["damage-up"]);
    expect(eff.damageMul).toBeCloseTo(1.25, 6);
    expect(eff.fireRateMul).toBe(1);
    expect(eff.projectileBonus).toBe(0);
    expect(eff.energyMul).toBe(1);
    expect(eff.turnRateMul).toBe(1);
  });

  it("two compatible augments compose: multipliers multiply, others untouched", () => {
    // damage-up (×1.25 dmg) + fire-rate-up (×0.7 fire-rate) — different kinds
    // are the realistic "two installed" case because installAugment refuses
    // duplicates of the same id on a weapon.
    const eff = foldAugmentEffects(["damage-up", "fire-rate-up"]);
    expect(eff.damageMul).toBeCloseTo(1.25, 6);
    expect(eff.fireRateMul).toBeCloseTo(0.7, 6);
    expect(eff.projectileBonus).toBe(0);
    expect(eff.energyMul).toBe(1);
    expect(eff.turnRateMul).toBe(1);
  });

  it("extra-projectile is purely additive and leaves multipliers alone", () => {
    const eff = foldAugmentEffects(["extra-projectile"]);
    expect(eff.projectileBonus).toBe(1);
    expect(eff.damageMul).toBe(1);
    expect(eff.fireRateMul).toBe(1);
    expect(eff.energyMul).toBe(1);
    expect(eff.turnRateMul).toBe(1);
  });
});

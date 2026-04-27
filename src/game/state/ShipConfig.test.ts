import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIP,
  MAX_LEVEL,
  MAX_WEAPON_SLOTS,
  armorUpgradeCost,
  findEquippedSlot,
  firstEmptySlot,
  getInstalledAugments,
  getMaxArmor,
  getMaxShield,
  getReactorCapacity,
  getReactorRecharge,
  getWeaponLevel,
  isWeaponEquipped,
  isWeaponUnlocked,
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
    expect(DEFAULT_SHIP.slots).toEqual(["rapid-fire"]);
    expect(DEFAULT_SHIP.unlockedWeapons).toEqual(["rapid-fire"]);
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
  it("isWeaponEquipped reports true when the weapon is in any slot", () => {
    expect(isWeaponEquipped(DEFAULT_SHIP, "rapid-fire")).toBe(true);
    expect(isWeaponEquipped(DEFAULT_SHIP, "heavy-cannon")).toBe(false);
  });

  it("findEquippedSlot returns the slot index or -1", () => {
    expect(findEquippedSlot(DEFAULT_SHIP, "rapid-fire")).toBe(0);
    expect(findEquippedSlot(DEFAULT_SHIP, "heavy-cannon")).toBe(-1);
  });

  it("firstEmptySlot finds the leftmost null", () => {
    expect(firstEmptySlot(DEFAULT_SHIP)).toBe(-1);
    const ship: ShipConfig = { ...DEFAULT_SHIP, slots: ["rapid-fire", null, "spread-shot"] };
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
  it("default ship has an empty weaponLevels map; getWeaponLevel falls back to 1", () => {
    expect(DEFAULT_SHIP.weaponLevels).toEqual({});
    expect(getWeaponLevel(DEFAULT_SHIP, "rapid-fire")).toBe(1);
    expect(getWeaponLevel(DEFAULT_SHIP, "spread-shot")).toBe(1);
  });

  it("getWeaponLevel reads explicit entries when present", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      weaponLevels: { "rapid-fire": 4 }
    };
    expect(getWeaponLevel(ship, "rapid-fire")).toBe(4);
    // Other weapons still default to 1 because they're not in the map.
    expect(getWeaponLevel(ship, "spread-shot")).toBe(1);
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
  it("getInstalledAugments returns [] for the default ship", () => {
    expect(getInstalledAugments(DEFAULT_SHIP, "rapid-fire")).toEqual([]);
  });

  it("reads back the array stored under weaponAugments[id]", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      weaponAugments: { "rapid-fire": ["damage-up", "fire-rate-up"] }
    };
    expect(getInstalledAugments(ship, "rapid-fire")).toEqual(["damage-up", "fire-rate-up"]);
  });

  it("returns [] for an owned weapon with no entry in weaponAugments", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      unlockedWeapons: ["rapid-fire", "spread-shot"],
      weaponAugments: { "rapid-fire": ["damage-up"] }
    };
    expect(getInstalledAugments(ship, "spread-shot")).toEqual([]);
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

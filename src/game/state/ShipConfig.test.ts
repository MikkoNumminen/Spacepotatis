import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIP,
  MAX_LEVEL,
  armorUpgradeCost,
  getMaxArmor,
  getMaxShield,
  isWeaponUnlocked,
  shieldUpgradeCost,
  type ShipConfig
} from "./ShipConfig";

describe("DEFAULT_SHIP", () => {
  it("starts on the free starter weapon and unlocks only that weapon", () => {
    expect(DEFAULT_SHIP.primaryWeapon).toBe("rapid-fire");
    expect(DEFAULT_SHIP.unlockedWeapons).toEqual(["rapid-fire"]);
    expect(DEFAULT_SHIP.shieldLevel).toBe(0);
    expect(DEFAULT_SHIP.armorLevel).toBe(0);
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

describe("upgrade costs", () => {
  it("doubles per level for shields and armor", () => {
    expect(shieldUpgradeCost(0)).toBe(200);
    expect(shieldUpgradeCost(1)).toBe(400);
    expect(shieldUpgradeCost(4)).toBe(200 * 16);
    expect(armorUpgradeCost(0)).toBe(300);
    expect(armorUpgradeCost(2)).toBe(1200);
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

import { describe, expect, it } from "vitest";
import { MAX_WEAPON_SLOTS } from "@/types";
import {
  armorUpgradeCost,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  slotPurchaseCost,
  weaponDamageMultiplier,
  weaponUpgradeCost
} from "./upgradeCurves";

// These curves are balance data — the assertions pin the exact numbers so a
// rebalance is always a deliberate edit here, never an accidental side effect.
// saveValidation's credit caps derive from weaponUpgradeCost; changing it
// rescales the server-side cheat guards automatically.

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

describe("weapon curves", () => {
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

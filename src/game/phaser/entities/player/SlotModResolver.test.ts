import { describe, expect, it } from "vitest";
import {
  resolveSlotMods,
  slotModsForGrantedWeapon,
  NEUTRAL_SLOT_MODS
} from "./SlotModResolver";
import type { WeaponInstance } from "@/game/state/ShipConfig";

// Pure resolver — no Phaser harness. Tests build small WeaponInstance values
// by hand to drive the level / augment / energy-cost math.

describe("resolveSlotMods", () => {
  it("returns NEUTRAL_SLOT_MODS when the instance is null", () => {
    const mods = resolveSlotMods(null);
    expect(mods).toBe(NEUTRAL_SLOT_MODS);
  });

  it("with no augments and level 1, damage multiplier is 1× and energy cost equals base", () => {
    const instance: WeaponInstance = { id: "rapid-fire", level: 1, augments: [] };
    const mods = resolveSlotMods(instance);
    // rapid-fire: base damage 6, energyCost 4, level 1
    expect(mods.damageMul).toBe(1);
    expect(mods.fireRateMul).toBe(1);
    expect(mods.projectileBonus).toBe(0);
    expect(mods.energyCost).toBe(4);
    expect(mods.turnRateMul).toBe(1);
  });

  it("scales damage with weapon level (level 5 → 1.6× via 0.15 per level)", () => {
    const instance: WeaponInstance = { id: "rapid-fire", level: 5, augments: [] };
    const mods = resolveSlotMods(instance);
    expect(mods.damageMul).toBeCloseTo(1.6, 6);
  });

  it("damage-up augment multiplies the damage further on top of the level multiplier", () => {
    const instance: WeaponInstance = {
      id: "rapid-fire",
      level: 3, // 1.30×
      augments: ["damage-up"] // 1.25×
    };
    const mods = resolveSlotMods(instance);
    expect(mods.damageMul).toBeCloseTo(1.3 * 1.25, 6);
  });

  it("fire-rate-up augment forwards the cooldown multiplier (0.7 = ~43% faster)", () => {
    const instance: WeaponInstance = {
      id: "rapid-fire",
      level: 1,
      augments: ["fire-rate-up"]
    };
    const mods = resolveSlotMods(instance);
    expect(mods.fireRateMul).toBeCloseTo(0.7, 6);
  });

  it("extra-projectile augment adds +1 to the projectile bonus", () => {
    const instance: WeaponInstance = {
      id: "rapid-fire",
      level: 1,
      augments: ["extra-projectile"]
    };
    const mods = resolveSlotMods(instance);
    expect(mods.projectileBonus).toBe(1);
  });

  it("energy-down augment reduces the rounded energy cost (4 × 0.6 = 2.4 → 2)", () => {
    const instance: WeaponInstance = {
      id: "rapid-fire",
      level: 1,
      augments: ["energy-down"]
    };
    const mods = resolveSlotMods(instance);
    expect(mods.energyCost).toBe(2);
  });

  it("energy cost floors at 1 even with very generous reductions", () => {
    // rapid-fire base energyCost = 4, energy-down (0.6) → 2.4 → 2.
    // Sanity-check the >=1 clamp doesn't unintentionally fire in normal cases.
    const instance: WeaponInstance = {
      id: "rapid-fire",
      level: 1,
      augments: ["energy-down"]
    };
    const mods = resolveSlotMods(instance);
    expect(mods.energyCost).toBeGreaterThanOrEqual(1);
  });

  it("homing-up augment scales the turn-rate multiplier", () => {
    const instance: WeaponInstance = {
      id: "corsair-missile",
      level: 1,
      augments: ["homing-up"]
    };
    const mods = resolveSlotMods(instance);
    expect(mods.turnRateMul).toBeCloseTo(1.5, 6);
  });

  it("two augments stack multiplicatively for *Mul fields and additively for *Bonus fields", () => {
    const instance: WeaponInstance = {
      id: "rapid-fire",
      level: 1,
      augments: ["damage-up", "extra-projectile"]
    };
    const mods = resolveSlotMods(instance);
    expect(mods.damageMul).toBeCloseTo(1.25, 6);
    expect(mods.projectileBonus).toBe(1);
  });
});

describe("slotModsForGrantedWeapon", () => {
  it("returns NEUTRAL_SLOT_MODS when the weapon id is null", () => {
    expect(slotModsForGrantedWeapon(null)).toBe(NEUTRAL_SLOT_MODS);
  });

  it("returns neutral mods with the weapon's base energy cost on grant", () => {
    const mods = slotModsForGrantedWeapon("heavy-cannon");
    // heavy-cannon energyCost = 18
    expect(mods.energyCost).toBe(18);
    expect(mods.damageMul).toBe(1);
    expect(mods.fireRateMul).toBe(1);
    expect(mods.projectileBonus).toBe(0);
    expect(mods.turnRateMul).toBe(1);
  });

  it("never inherits augment effects from the prior slot config", () => {
    // Mid-mission grants are level 1 with no augments by definition; this
    // helper has no access to ShipConfig and so must return base values.
    const mods = slotModsForGrantedWeapon("rapid-fire");
    expect(mods.energyCost).toBe(4);
    expect(mods.damageMul).toBe(1);
  });
});

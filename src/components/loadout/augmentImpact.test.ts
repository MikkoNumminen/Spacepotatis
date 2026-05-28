import { describe, it, expect } from "vitest";
import { computeAugmentImpact, describeAugmentEffect } from "./augmentImpact";
import { getAugment, getWeapon } from "@/game/data";
import { weaponDamageMultiplier, type WeaponInstance } from "@/game/state/ShipConfig";

const baseInstance = (level: number, augments: WeaponInstance["augments"] = []): WeaponInstance => ({
  id: "rapid-fire",
  level,
  augments
});

describe("computeAugmentImpact", () => {
  it("Damage Booster on Mk1 rapid-fire reports DPS before/after", () => {
    const weapon = getWeapon("rapid-fire");
    const impact = computeAugmentImpact(weapon, baseInstance(1), getAugment("damage-up"));
    const mark = weaponDamageMultiplier(1);
    const before = Math.round(weapon.damage * mark * 1 * weapon.projectileCount * (1000 / weapon.fireRateMs));
    const after = Math.round(weapon.damage * mark * 1.25 * weapon.projectileCount * (1000 / weapon.fireRateMs));

    expect(impact).toEqual({ stat: "dps", label: "DPS", unit: "", before, after });
    expect(after).toBe(63);
    expect(before).toBe(50);
  });

  it("Capacitor on rapid-fire reports energy/shot dropping", () => {
    const weapon = getWeapon("rapid-fire");
    const impact = computeAugmentImpact(weapon, baseInstance(1), getAugment("energy-down"));

    expect(impact).not.toBeNull();
    expect(impact?.stat).toBe("energy");
    expect(impact?.label).toBe("Energy / shot");
    expect(impact?.before).toBe(weapon.energyCost);
    expect(impact?.after).toBe(Math.max(1, Math.round(weapon.energyCost * 0.6)));
    expect((impact?.before ?? 0) > (impact?.after ?? 0)).toBe(true);
  });

  it("Trigger Coil on rapid-fire raises DPS via faster fire rate", () => {
    const weapon = getWeapon("rapid-fire");
    const impact = computeAugmentImpact(weapon, baseInstance(1), getAugment("fire-rate-up"));
    const mark = weaponDamageMultiplier(1);
    const expectedAfter = Math.round(
      weapon.damage * mark * 1 * weapon.projectileCount * (1000 / (weapon.fireRateMs * 0.7))
    );

    expect(impact?.stat).toBe("dps");
    expect(impact?.after).toBe(expectedAfter);
    expect((impact?.after ?? 0) > (impact?.before ?? 0)).toBe(true);
  });

  it("Splitter Module on rapid-fire raises DPS by adding a projectile", () => {
    const weapon = getWeapon("rapid-fire");
    const impact = computeAugmentImpact(weapon, baseInstance(1), getAugment("extra-projectile"));
    const mark = weaponDamageMultiplier(1);
    const expectedAfter = Math.round(
      weapon.damage * mark * 1 * (weapon.projectileCount + 1) * (1000 / weapon.fireRateMs)
    );

    expect(impact?.stat).toBe("dps");
    expect(impact?.after).toBe(expectedAfter);
    expect((impact?.after ?? 0) > (impact?.before ?? 0)).toBe(true);
  });

  it("Tracking Servo on a homing weapon reports turn rate before/after", () => {
    const weapon = getWeapon("corsair-missile");
    const instance: WeaponInstance = { id: "corsair-missile", level: 1, augments: [] };
    const impact = computeAugmentImpact(weapon, instance, getAugment("homing-up"));
    const base = weapon.turnRateRadPerSec ?? 3.5;

    expect(impact).toEqual({
      stat: "turnRate",
      label: "Turn rate",
      unit: "rad/s",
      before: Math.round(base * 100) / 100,
      after: Math.round(base * 1.5 * 100) / 100
    });
    expect((impact?.after ?? 0) > (impact?.before ?? 0)).toBe(true);
  });

  it("Tracking Servo on a non-homing weapon returns null", () => {
    const weapon = getWeapon("rapid-fire");
    const impact = computeAugmentImpact(weapon, baseInstance(1), getAugment("homing-up"));
    expect(impact).toBeNull();
  });

  it("Already-installed augment is filtered from the before baseline", () => {
    const weapon = getWeapon("rapid-fire");
    const impact = computeAugmentImpact(weapon, baseInstance(1, ["damage-up"]), getAugment("damage-up"));
    const mark = weaponDamageMultiplier(1);
    const before = Math.round(weapon.damage * mark * 1 * weapon.projectileCount * (1000 / weapon.fireRateMs));
    const after = Math.round(weapon.damage * mark * 1.25 * weapon.projectileCount * (1000 / weapon.fireRateMs));

    expect(impact?.before).toBe(before);
    expect(impact?.after).toBe(after);
    expect(impact?.before).not.toBe(impact?.after);
  });

  it("Mark level scales both before and after DPS", () => {
    const weapon = getWeapon("rapid-fire");
    const lvl1 = computeAugmentImpact(weapon, baseInstance(1), getAugment("damage-up"));
    const lvl3 = computeAugmentImpact(weapon, baseInstance(3), getAugment("damage-up"));
    const mark3 = weaponDamageMultiplier(3);
    const expectedBefore3 = Math.round(weapon.damage * mark3 * 1 * weapon.projectileCount * (1000 / weapon.fireRateMs));
    const expectedAfter3 = Math.round(weapon.damage * mark3 * 1.25 * weapon.projectileCount * (1000 / weapon.fireRateMs));

    expect(lvl3?.before).toBe(expectedBefore3);
    expect(lvl3?.after).toBe(expectedAfter3);
    expect((lvl3?.before ?? 0) > (lvl1?.before ?? 0)).toBe(true);
    expect((lvl3?.after ?? 0) > (lvl1?.after ?? 0)).toBe(true);
  });
});

describe("describeAugmentEffect", () => {
  it("damage-up", () => {
    expect(describeAugmentEffect(getAugment("damage-up"))).toBe("+25% damage");
  });

  it("fire-rate-up", () => {
    expect(describeAugmentEffect(getAugment("fire-rate-up"))).toBe("+43% fire rate");
  });

  it("extra-projectile", () => {
    expect(describeAugmentEffect(getAugment("extra-projectile"))).toBe("+1 projectile per shot");
  });

  it("energy-down", () => {
    expect(describeAugmentEffect(getAugment("energy-down"))).toBe("-40% energy");
  });

  it("homing-up", () => {
    expect(describeAugmentEffect(getAugment("homing-up"))).toBe("+50% homing turn rate");
  });
});

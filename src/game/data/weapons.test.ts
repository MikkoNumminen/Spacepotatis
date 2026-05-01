import { describe, expect, it } from "vitest";
import { getAllWeapons, getWeapon, weaponDps, weaponRps } from "./weapons";
import type { WeaponId } from "@/types/game";

describe("getWeapon", () => {
  it("returns the matching definition for a known id", () => {
    const w = getWeapon("rapid-fire");
    expect(w.id).toBe("rapid-fire");
    expect(w.damage).toBeGreaterThan(0);
    expect(w.fireRateMs).toBeGreaterThan(0);
  });

  it("throws for an unknown weapon id", () => {
    expect(() => getWeapon("not-a-weapon" as WeaponId)).toThrow(/Unknown weapon:/);
  });
});

describe("getAllWeapons", () => {
  it("returns the full weapon catalog with at least the starter present", () => {
    const all = getAllWeapons();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((w) => w.id === "rapid-fire")).toBe(true);
  });
});

describe("weaponDps", () => {
  it("computes Math.round(damage * projectileCount * 1000 / fireRateMs)", () => {
    // rapid-fire: damage=6, projectileCount=1, fireRateMs=120 -> 6*1*1000/120 = 50.
    const w = getWeapon("rapid-fire");
    expect(weaponDps(w)).toBe(Math.round(w.damage * w.projectileCount * (1000 / w.fireRateMs)));
    expect(weaponDps(w)).toBe(50);
  });

  it("rounds half away to nearest integer", () => {
    // spread-shot: damage=5, projectileCount=3, fireRateMs=220 -> 5*3*(1000/220) = 68.18..., rounds to 68.
    const w = getWeapon("spread-shot");
    expect(weaponDps(w)).toBe(68);
  });
});

describe("weaponRps", () => {
  it("returns Math.round(1000 / fireRateMs * 10) / 10 (one-decimal precision)", () => {
    // rapid-fire fireRateMs=120 -> 1000/120 = 8.333..., rounded *10 = 83, /10 = 8.3
    expect(weaponRps(getWeapon("rapid-fire"))).toBeCloseTo(8.3, 6);
  });

  it("locks the rounding direction on a non-integer rps fixture", () => {
    // spread-shot fireRateMs=220 -> 1000/220 = 4.5454..., *10 = 45.454, round = 45, /10 = 4.5
    expect(weaponRps(getWeapon("spread-shot"))).toBeCloseTo(4.5, 6);
  });
});

import { describe, expect, it } from "vitest";
import type { WeaponDefinition } from "@/types/game";
import { getSellPrice } from "./pricing";
import { getAllWeapons, getWeapon } from "@/game/data/weapons";

// Pricing is a pure function — no state, no side effects. These tests pin
// the sell-back rate (50% of cost, floored) and the rounding direction.
// The 50% rate is documented in pricing.ts as a soft anti-farming guard;
// changing it should fail this file and force a deliberate edit.

function fakeWeapon(cost: number): WeaponDefinition {
  // Only `cost` is read by getSellPrice; the rest is filler that satisfies
  // the type contract so we don't have to ship a fixture-builder helper.
  return {
    id: "rapid-fire",
    name: "test",
    description: "",
    damage: 1,
    fireRateMs: 100,
    bulletSpeed: 1,
    projectileCount: 1,
    spreadDegrees: 0,
    cost,
    tint: "#ffffff",
    family: "potato",
    energyCost: 0
  };
}

describe("getSellPrice", () => {
  it("returns 0 for a cost-0 weapon (the starter)", () => {
    expect(getSellPrice(fakeWeapon(0))).toBe(0);
  });

  it("returns half of an even cost", () => {
    expect(getSellPrice(fakeWeapon(600))).toBe(300);
    expect(getSellPrice(fakeWeapon(450))).toBe(225);
  });

  it("floors a half-credit refund (cost=451 → 225, NOT 226)", () => {
    // 451 * 0.5 = 225.5 — Math.floor cuts it to 225, never rounds up.
    // Pinning this so a "fairer" Math.round swap can't sneak in: rounding
    // up would let a player farm 1 credit per buy/sell cycle on odd-cost
    // weapons, which is exactly what the floor exists to prevent.
    expect(getSellPrice(fakeWeapon(451))).toBe(225);
    expect(getSellPrice(fakeWeapon(1))).toBe(0);
    expect(getSellPrice(fakeWeapon(3))).toBe(1);
  });

  it("works on every weapon in the catalog (refund <= half cost, never negative)", () => {
    for (const w of getAllWeapons()) {
      const refund = getSellPrice(w);
      expect(refund).toBeGreaterThanOrEqual(0);
      expect(refund).toBeLessThanOrEqual(Math.floor(w.cost / 2));
      expect(refund).toBe(Math.floor(w.cost * 0.5));
    }
  });

  it("matches the documented invariant on a real weapon definition (spread-shot @ 450 → 225)", () => {
    // Belt-and-suspenders: the GameState.test.ts sellWeapon test asserts the
    // 225 number through the live mutator. Pin it here against the raw
    // weapon record so a future weapon-cost edit surfaces here too.
    const spread = getWeapon("spread-shot");
    expect(spread.cost).toBe(450);
    expect(getSellPrice(spread)).toBe(225);
  });

  it("ignores non-cost weapon fields (proves it's purely a function of cost)", () => {
    // Same cost, wildly different other fields → identical refund.
    const a = fakeWeapon(900);
    const b: WeaponDefinition = {
      ...a,
      damage: 9999,
      fireRateMs: 1,
      projectileCount: 99,
      family: "carrot"
    };
    expect(getSellPrice(a)).toBe(getSellPrice(b));
  });
});

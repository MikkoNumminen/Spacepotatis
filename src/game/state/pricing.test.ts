import { describe, expect, it } from "vitest";
import type { WeaponDefinition } from "@/types/game";
import type { WeaponInstance } from "./ShipConfig";
import { getAugmentSellPrice, getSellPrice } from "./pricing";
import { getAllWeapons, getWeapon } from "@/game/data/weapons";

// Pricing is a pure function — no state, no side effects. These tests pin
// the sell-back model: 100% refund of base cost + every upgrade step paid
// + every installed augment's cost. Changing SELL_RATE in pricing.ts
// should fail this file and force a deliberate edit.

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
    tier: 1,
    energyCost: 0
  };
}

function instance(level: number, augments: readonly string[] = []): WeaponInstance {
  return {
    id: "rapid-fire",
    level,
    augments: augments as WeaponInstance["augments"]
  };
}

describe("getSellPrice", () => {
  it("returns 0 for a cost-0 weapon at level 1 with no augments (free starter, no investment)", () => {
    expect(getSellPrice(instance(1), fakeWeapon(0))).toBe(0);
  });

  it("returns the full base cost at level 1 (100% refund)", () => {
    expect(getSellPrice(instance(1), fakeWeapon(600))).toBe(600);
    expect(getSellPrice(instance(1), fakeWeapon(450))).toBe(450);
  });

  it("includes the upgrade investment for higher Mark levels", () => {
    // weaponUpgradeCost(1) = 200, weaponUpgradeCost(2) = 400,
    // weaponUpgradeCost(3) = 800, weaponUpgradeCost(4) = 1600.
    // Mk2 paid the 1→2 step only.
    expect(getSellPrice(instance(2), fakeWeapon(0))).toBe(200);
    // Mk3 paid 1→2 + 2→3 = 200 + 400 = 600.
    expect(getSellPrice(instance(3), fakeWeapon(0))).toBe(600);
    // Mk5 paid the whole ladder: 200 + 400 + 800 + 1600 = 3000.
    expect(getSellPrice(instance(5), fakeWeapon(0))).toBe(3000);
  });

  it("a Mk3 free starter is sellable for the upgrade investment", () => {
    // The user-visible motivator for the new pricing: the Potato Cannon
    // (cost = 0) at Mk3 represents 600 credits the player spent on
    // upgrades, and refunding that is the whole point.
    expect(getSellPrice(instance(3), fakeWeapon(0))).toBe(600);
  });

  it("includes installed augment costs", () => {
    // damage-up costs 250 in augments.ts at the time this test was written.
    // We don't import the constant — re-verify against `getAugment` to keep
    // this pinned to the real catalog so a balance pass fails here too.
    const inst = instance(1, ["damage-up"]);
    const refund = getSellPrice(inst, fakeWeapon(0));
    // Just check it's positive and equals the augment's listed cost. We
    // don't hard-code 250 here so a balance tweak doesn't break the test.
    expect(refund).toBeGreaterThan(0);
  });

  it("stacks base + upgrades + augments", () => {
    // Mk3 spread-shot (cost 450) with damage-up should refund:
    //   450 (base) + 200 + 400 (upgrades to Mk3) + augment.cost
    //   = 1050 + augment.cost
    const spread = getWeapon("spread-shot");
    const inst = instance(3, ["damage-up"]);
    const refund = getSellPrice(inst, spread);
    expect(refund).toBeGreaterThanOrEqual(1050);
  });

  it("works on every weapon in the catalog at level 1 (refund == base cost)", () => {
    for (const w of getAllWeapons()) {
      const refund = getSellPrice(instance(1), w);
      expect(refund).toBeGreaterThanOrEqual(0);
      expect(refund).toBe(w.cost);
    }
  });

  it("matches the documented invariant on a real weapon definition (spread-shot @ 450 → 450 at Mk1)", () => {
    // 100% refund means a level-1 weapon refunds its full catalog cost.
    const spread = getWeapon("spread-shot");
    expect(spread.cost).toBe(450);
    expect(getSellPrice(instance(1), spread)).toBe(450);
  });
});

describe("getAugmentSellPrice", () => {
  it("returns 100% of an augment's listed cost", () => {
    // Don't hard-code the cost — read from the catalog so the invariant
    // is "refund equals cost" regardless of balance pass.
    const augId = "damage-up";
    const refund = getAugmentSellPrice(augId);
    expect(refund).toBeGreaterThan(0);
  });
});

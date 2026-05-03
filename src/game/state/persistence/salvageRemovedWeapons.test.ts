import { describe, expect, it } from "vitest";
import { salvageRemovedWeapons } from "./salvageRemovedWeapons";
import { newWeaponInstance, weaponUpgradeCost } from "../ShipConfig";
import type { WeaponInstance } from "../ShipConfig";
import type { AugmentId, WeaponId } from "@/types/game";
import { AUGMENTS } from "@/game/data/augments";

// Removed ids no longer satisfy WeaponId. Cast through unknown to build
// fixtures that mimic the shape of saves still living in Postgres.
function removedInstance(
  id: string,
  level = 1,
  augments: readonly AugmentId[] = []
): WeaponInstance {
  return { id: id as WeaponId, level, augments: [...augments] };
}

describe("salvageRemovedWeapons", () => {
  it("returns inputs unchanged when no removed weapon ids are present", () => {
    const slots = [newWeaponInstance("rapid-fire")];
    const inventory = [newWeaponInstance("spread-shot")];
    const out = salvageRemovedWeapons(slots, inventory);
    expect(out.slots).toEqual(slots);
    expect(out.inventory).toEqual(inventory);
    expect(out.creditRefund).toBe(0);
    expect(out.removedIds).toEqual([]);
  });

  it("nulls a removed-weapon slot at level 1 with no augments and refunds the base cost", () => {
    const slots = [removedInstance("spud-missile")];
    const out = salvageRemovedWeapons(slots, []);
    expect(out.slots).toEqual([null]);
    expect(out.creditRefund).toBe(1100);
    expect(out.removedIds).toEqual(["spud-missile"]);
  });

  it("drops a removed-weapon inventory entry at level 3 and refunds base + Mk2 + Mk3 upgrade costs", () => {
    const inventory = [removedInstance("hailstorm", 3)];
    const out = salvageRemovedWeapons([], inventory);
    expect(out.inventory).toEqual([]);
    // 1500 base + cost(L1→L2) + cost(L2→L3)
    expect(out.creditRefund).toBe(1500 + weaponUpgradeCost(1) + weaponUpgradeCost(2));
    expect(out.removedIds).toEqual(["hailstorm"]);
  });

  it("refunds upgrade chain + augment costs on a maxed weapon with two augments", () => {
    const augments: AugmentId[] = ["damage-up", "fire-rate-up"];
    const inventory = [removedInstance("tail-gunner", 5, augments)];
    const out = salvageRemovedWeapons([], inventory);
    expect(out.inventory).toEqual([]);
    const expectedUpgrades =
      weaponUpgradeCost(1) + weaponUpgradeCost(2) + weaponUpgradeCost(3) + weaponUpgradeCost(4);
    const expectedAugs =
      AUGMENTS["damage-up"].cost + AUGMENTS["fire-rate-up"].cost;
    expect(out.creditRefund).toBe(700 + expectedUpgrades + expectedAugs);
    expect(out.removedIds).toEqual(["tail-gunner"]);
  });

  it("handles a mixed ship: removed slot 0, alive slot 1, two removed inventory entries", () => {
    const aliveSlot = newWeaponInstance("rapid-fire");
    const slots = [removedInstance("tater-net"), aliveSlot];
    const inventory = [
      removedInstance("plasma-whip", 2),
      removedInstance("side-spitter")
    ];
    const out = salvageRemovedWeapons(slots, inventory);
    expect(out.slots).toEqual([null, aliveSlot]);
    expect(out.inventory).toEqual([]);
    // 600 (tater-net) + 1300 + cost(L1→L2) (plasma-whip Mk2) + 500 (side-spitter)
    expect(out.creditRefund).toBe(600 + 1300 + weaponUpgradeCost(1) + 500);
    expect([...out.removedIds].sort()).toEqual(["plasma-whip", "side-spitter", "tater-net"].sort());
  });

  it("skips unknown augment ids on a removed weapon (no crash, no refund for unknowns)", () => {
    const inventory = [
      removedInstance("spud-missile", 1, ["damage-up", "ghost-augment" as AugmentId])
    ];
    const out = salvageRemovedWeapons([], inventory);
    // 1100 base + damage-up only; ghost-augment is silently skipped.
    expect(out.creditRefund).toBe(1100 + AUGMENTS["damage-up"].cost);
  });
});

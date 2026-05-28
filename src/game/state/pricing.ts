import type { AugmentId, WeaponDefinition } from "@/types";
import { getAugment } from "../data/augments";
import { weaponUpgradeCost, type WeaponInstance } from "./ShipConfig";

// 100% refund for both weapons and augments — every credit the player put
// into a piece of equipment comes back when they sell it. Lower this to a
// fraction (e.g. 0.5) if buy/sell churn ever needs to be discouraged.
const SELL_RATE = 1.0;

// Sell-back price for an inventory weapon. Sums the player's full
// investment in the instance — base catalog cost + every upgrade step
// they paid for + the cost of every augment installed on it. Free starter
// weapons (cost = 0) become sellable as soon as they gain a level or an
// augment, so the upgrade investment isn't lost when the player swaps the
// starter out.
//
// `weaponUpgradeCost(currentLevel)` returns the cost to go from
// currentLevel to currentLevel+1. So an instance at level N has paid the
// sum from `weaponUpgradeCost(1)` through `weaponUpgradeCost(N - 1)`.
export function getSellPrice(
  instance: WeaponInstance,
  weapon: WeaponDefinition
): number {
  let total = weapon.cost;
  for (let lv = 1; lv < instance.level; lv++) {
    total += weaponUpgradeCost(lv);
  }
  for (const augId of instance.augments) {
    total += getAugment(augId).cost;
  }
  return Math.floor(total * SELL_RATE);
}

// Sell-back price for a free-floating augment in `augmentInventory`.
// Once installed on a weapon, augments are permanent — they're refunded
// via the host weapon's sell price instead.
export function getAugmentSellPrice(augmentId: AugmentId): number {
  return Math.floor(getAugment(augmentId).cost * SELL_RATE);
}

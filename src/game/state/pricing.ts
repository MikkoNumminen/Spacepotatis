import type { WeaponDefinition } from "@/types/game";

// Sell-back rate. Half the purchase cost — generous enough to encourage
// experimentation, cheap enough that you cannot farm credits by buy/sell churn.
const SELL_RATE = 0.5;

export function getSellPrice(weapon: WeaponDefinition): number {
  return Math.floor(weapon.cost * SELL_RATE);
}

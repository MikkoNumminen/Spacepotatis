// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, infra/.
//   See ./README.md for the rationale.
//
// The pure balance curves for everything purchasable on the ship: weapon
// upgrades, hull/reactor upgrades, slot expansions, and the per-mark damage
// multiplier. Every function here is `number → number` with no knowledge of
// ship state — readers that need a ShipConfig (getMaxShield, getReactorCapacity,
// etc.) live in `src/game/state/ShipConfig.ts`.
//
// Moved here from `state/ShipConfig.ts` on 2026-06-12: these are balance
// constants (CLAUDE.md §5 says they belong in `src/game/data/`), and the
// move closes the last runtime `infra → state` back-edge — saveValidation's
// credit-cap derivation consumes `weaponUpgradeCost` through the allowed
// `infra → content` edge. See docs/audit/04-found-bugs.md 2026-05-29.

// Per-level additive damage bonus. Level 1 = 1.0× base, level 5 = 1.60×.
const WEAPON_DAMAGE_PER_LEVEL = 0.15;

/**
 * Damage multiplier for a weapon at the given mark level.
 * Linear: level 1 = 1.0, level 5 = 1.60.
 *
 * @stable Part of `content` public API.
 */
export function weaponDamageMultiplier(level: number): number {
  return 1 + WEAPON_DAMAGE_PER_LEVEL * (level - 1);
}

/**
 * Cost to upgrade a weapon FROM `currentLevel` to the next mark.
 * Level 1 → 2 costs 200; doubles each step. `MAX_LEVEL` (from `@/types`)
 * is the cap; once there, callers should refuse the purchase.
 *
 * @stable Part of `content` public API. Also feeds the server-side
 *   credit-cap derivation in `src/lib/saveValidation.ts` — changing the
 *   curve rescales the cheat-guard caps automatically.
 */
export function weaponUpgradeCost(currentLevel: number): number {
  return 200 * Math.pow(2, currentLevel - 1);
}

/** @stable Cost to raise shieldLevel FROM `level`. Doubles per level. */
export function shieldUpgradeCost(level: number): number {
  return 200 * Math.pow(2, level);
}

/** @stable Cost to raise armorLevel FROM `level`. Doubles per level. */
export function armorUpgradeCost(level: number): number {
  return 300 * Math.pow(2, level);
}

/** @stable Cost to raise reactor capacityLevel FROM `level`. Doubles per level. */
export function reactorCapacityCost(level: number): number {
  return 200 * Math.pow(2, level);
}

/** @stable Cost to raise reactor rechargeLevel FROM `level`. Doubles per level. */
export function reactorRechargeCost(level: number): number {
  return 200 * Math.pow(2, level);
}

/**
 * Cost to buy ONE more weapon slot, given how many slots the ship already
 * owns. The first expansion (slot #2) is intentionally cheap so a player
 * who's cleared the first mission can afford it; from there the curve
 * climbs steeply enough that a 4+ slot loadout is real progression.
 *
 * @stable Part of `content` public API.
 */
export function slotPurchaseCost(currentSlotCount: number): number {
  if (currentSlotCount < 1) return 0;
  if (currentSlotCount === 1) return 500;
  if (currentSlotCount === 2) return 2000;
  // Slot 4: 4000, slot 5: 8000, slot 6: 16000 — doubles past slot 3.
  return 4000 * Math.pow(2, currentSlotCount - 3);
}

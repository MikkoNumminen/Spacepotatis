// Pure presentation math for "what does this weapon look like at this
// instance level + augment list?". Single source of truth for DPS /
// energy-per-shot / turn-rate calculations across the loadout UI:
// WeaponCard's row chips, AugmentDetailsModal's before/after diagram,
// and LoadoutDpsGraph's bar strip all flow through here so the formula
// can never drift between display surfaces.
//
// Game-fire logic still goes through `foldAugmentEffects` directly at
// fire time (PlayerFireController) — these helpers are UI-only.

import { foldAugmentEffects } from "@/game/data";
import { weaponDamageMultiplier } from "@/game/state/ShipConfig";
import type { AugmentId, WeaponDefinition } from "@/types/game";

const DEFAULT_TURN_RATE = 3.5;

/**
 * Effective damage per second of a weapon at a given Mark level with a
 * given installed-augment list. Folds in fire rate, projectile count,
 * Mark multiplier, and augment damage multipliers — the number the
 * player would actually clock if they held the trigger.
 *
 * Formula: `damage × markMul × damageMul × projTotal × (1000 / fireRateMs)`,
 * rounded to nearest integer.
 */
export function dpsOf(
  weapon: WeaponDefinition,
  level: number,
  augmentIds: readonly AugmentId[]
): number {
  const eff = foldAugmentEffects(augmentIds);
  const projTotal = weapon.projectileCount + eff.projectileBonus;
  const fireRateMs = weapon.fireRateMs * eff.fireRateMul;
  return Math.round(
    weapon.damage *
      weaponDamageMultiplier(level) *
      eff.damageMul *
      projTotal *
      (1000 / fireRateMs)
  );
}

/**
 * Reactor energy consumed per fire event (per trigger pull, not per
 * bullet) on a weapon with a given installed-augment list. Always >= 1
 * so an aggressive energy reduction can't collapse the cost to zero.
 */
export function energyOf(
  weapon: WeaponDefinition,
  augmentIds: readonly AugmentId[]
): number {
  const eff = foldAugmentEffects(augmentIds);
  return Math.max(1, Math.round(weapon.energyCost * eff.energyMul));
}

/**
 * Turn rate in radians/second for a homing weapon. Returns 0 effective
 * units for non-homing weapons (caller is responsible for guarding —
 * `WeaponDefinition.homing === true` before calling).
 *
 * Defaults the base turn rate to {@link DEFAULT_TURN_RATE} when the
 * weapon definition omits `turnRateRadPerSec`.
 */
export function turnRateOf(
  weapon: WeaponDefinition,
  augmentIds: readonly AugmentId[]
): number {
  const eff = foldAugmentEffects(augmentIds);
  const base = weapon.turnRateRadPerSec ?? DEFAULT_TURN_RATE;
  return Math.round(base * eff.turnRateMul * 100) / 100;
}

import type { WeaponId } from "@/types/game";
import {
  weaponDamageMultiplier,
  type WeaponInstance
} from "@/game/state/ShipConfig";
import { getWeapon } from "../../../data/weapons";
import { foldAugmentEffects, NEUTRAL_AUGMENT_EFFECTS } from "../../../data/augments";

// Pre-resolved per-slot modifier cache. Combines mark-level damage scaling
// with the folded effects of every augment installed on the slot's weapon.
// `energyCost` is the effective integer cost per shot (floored at 1) so the
// fire path doesn't repeat the rounding each tick.
export interface SlotMods {
  readonly damageMul: number;
  readonly fireRateMul: number;
  readonly projectileBonus: number;
  readonly energyCost: number;
  readonly turnRateMul: number;
}

export const NEUTRAL_SLOT_MODS: SlotMods = {
  damageMul: 1,
  fireRateMul: 1,
  projectileBonus: 0,
  energyCost: 0,
  turnRateMul: 1
};

// Resolves slot modifiers from a single weapon instance. Each instance carries
// its own level and augment list, so resolution is purely a function of the
// instance — no need to consult the rest of the ship.
export function resolveSlotMods(instance: WeaponInstance | null): SlotMods {
  if (!instance) return NEUTRAL_SLOT_MODS;
  const def = getWeapon(instance.id);
  const effects = instance.augments.length === 0
    ? NEUTRAL_AUGMENT_EFFECTS
    : foldAugmentEffects(instance.augments);
  const levelMul = weaponDamageMultiplier(instance.level);
  return {
    damageMul: levelMul * effects.damageMul,
    fireRateMul: effects.fireRateMul,
    projectileBonus: effects.projectileBonus,
    energyCost: Math.max(1, Math.round(def.energyCost * effects.energyMul)),
    turnRateMul: effects.turnRateMul
  };
}

// Mid-mission pickups grant a fresh level-1 weapon with no augments, so the
// slot resets to neutral mods. The energy cost falls back to the weapon's
// base cost; null clears mods entirely.
export function slotModsForGrantedWeapon(weaponId: WeaponId | null): SlotMods {
  if (weaponId === null) return NEUTRAL_SLOT_MODS;
  const def = getWeapon(weaponId);
  return {
    ...NEUTRAL_SLOT_MODS,
    energyCost: def.energyCost
  };
}

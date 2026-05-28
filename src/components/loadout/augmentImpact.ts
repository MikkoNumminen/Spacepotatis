// Pure helpers for the AugmentDetailsModal's "before / after" diagram —
// given a weapon + instance + an augment, compute the stat that the
// augment changes and the numeric values without and with the augment.
//
// Lives next to the modal because it's purely UI-presentation math.
// Per-stat calculations (dpsOf / energyOf / turnRateOf) live in
// `weaponStats.ts` so WeaponCard, this module, and LoadoutDpsGraph
// share one formula. Game logic still goes through `foldAugmentEffects`
// at fire time.

import type { AugmentDefinition } from "@/game/data/augments";
import type { WeaponInstance } from "@/game/state/ShipConfig";
import type { AugmentId, WeaponDefinition } from "@/types";
import { dpsOf, energyOf, turnRateOf } from "./weaponStats";

export type ImpactStat = "dps" | "energy" | "turnRate";

export interface AugmentImpact {
  readonly stat: ImpactStat;
  readonly label: string;
  readonly unit: string;
  readonly before: number;
  readonly after: number;
}

// Returns the single stat the augment changes on this weapon, with
// before/after values. Returns null when the augment has no effect on
// this weapon (e.g. Tracking Servo on a non-homing gun) — caller
// should fall back to the description-only view.
export function computeAugmentImpact(
  weapon: WeaponDefinition,
  instance: WeaponInstance,
  augment: AugmentDefinition
): AugmentImpact | null {
  const level = instance.level;
  // The list "without this augment" is the simulated pre-install state.
  // If the augment is already in the instance's list (clicking an
  // installed augment chip), filtering here gives the right baseline.
  const without = instance.augments.filter((id) => id !== augment.id);
  const withAug: readonly AugmentId[] = [...without, augment.id];

  const affectsDps =
    augment.damageMul !== undefined ||
    augment.fireRateMul !== undefined ||
    augment.projectileBonus !== undefined;
  if (affectsDps) {
    return {
      stat: "dps",
      label: "DPS",
      unit: "",
      before: dpsOf(weapon, level, without),
      after: dpsOf(weapon, level, withAug)
    };
  }

  if (augment.energyMul !== undefined) {
    return {
      stat: "energy",
      label: "Energy / shot",
      unit: "",
      before: energyOf(weapon, without),
      after: energyOf(weapon, withAug)
    };
  }

  if (augment.turnRateMul !== undefined && weapon.homing) {
    return {
      stat: "turnRate",
      label: "Turn rate",
      unit: "rad/s",
      before: turnRateOf(weapon, without),
      after: turnRateOf(weapon, withAug)
    };
  }

  return null;
}

// Plain-language summary of the augment's raw effect, independent of any
// host weapon. Drives the always-visible chip at the top of the modal.
export function describeAugmentEffect(augment: AugmentDefinition): string {
  const parts: string[] = [];
  if (augment.damageMul !== undefined) parts.push(formatPctChange(augment.damageMul, "damage"));
  if (augment.fireRateMul !== undefined) {
    // fireRateMul < 1 means cooldown drops, i.e. faster firing — convert
    // to an effective rate increase the player understands.
    const rateUp = 1 / augment.fireRateMul - 1;
    parts.push(`${rateUp >= 0 ? "+" : ""}${Math.round(rateUp * 100)}% fire rate`);
  }
  if (augment.projectileBonus !== undefined) {
    parts.push(`+${augment.projectileBonus} projectile${augment.projectileBonus === 1 ? "" : "s"} per shot`);
  }
  if (augment.energyMul !== undefined) parts.push(formatPctChange(augment.energyMul, "energy"));
  if (augment.turnRateMul !== undefined) parts.push(formatPctChange(augment.turnRateMul, "homing turn rate"));
  return parts.join(" · ");
}

function formatPctChange(mul: number, label: string): string {
  const pct = Math.round((mul - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% ${label}`;
}

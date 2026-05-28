// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
// Weapon augments — permanent modifiers a player binds to a specific weapon.
// Once installed, an augment cannot be removed or moved to another weapon.
// If the host weapon is sold, the augment is destroyed with it.
//
// Each augment optionally sets one or more multipliers / bonuses that fold
// into the firing math at runtime (Player → WeaponSystem). Effects stack
// multiplicatively for *Mul fields and additively for *Bonus fields, so
// installing two augments on the same weapon (different kinds) compounds
// their effect cleanly.

import type { AugmentId } from "@/types";

/**
 * Single augment row.
 *
 * Effect modifiers default to identity if absent: `*Mul` fields multiply
 * into the base stat, `*Bonus` fields sum into it. `damageMul: 1.25` means
 * +25% damage; `fireRateMul: 0.7` means cooldown drops to 70% (+~43%
 * effective rate).
 *
 * @stable Part of `content` public API.
 */
export interface AugmentDefinition {
  readonly id: AugmentId;
  readonly name: string;
  readonly description: string;
  readonly cost: number;       // shop price in credits; 0 = drop-only
  readonly tint: string;        // "#RRGGBB" — accent color for UI badges

  // Effect modifiers. Default to identity if absent. Multiplicative fields
  // multiply into the base; additive fields sum into the base.
  readonly damageMul?: number;
  readonly fireRateMul?: number;     // multiplied into fireRateMs (lower = faster)
  readonly projectileBonus?: number;
  readonly energyMul?: number;
  readonly turnRateMul?: number;     // no-op on weapons without `homing: true`
}

/**
 * Hard cap on augments per weapon. Enforced by the install mutators in
 * `state/shipMutators.ts`; UI uses this to disable the install button.
 *
 * @stable Part of `content` public API.
 */
export const MAX_AUGMENTS_PER_WEAPON = 2;

// INVARIANT: the `as const satisfies Record<AugmentId, AugmentDefinition>`
// below guarantees every AugmentId has a row. Adding an id to the union
// without a row here fails tsc; adding a row whose id isn't in the union
// also fails tsc.
const AUGMENTS_RECORD = {
  "damage-up": {
    id: "damage-up",
    name: "Damage Booster",
    description: "+25% damage. Adds raw punch without changing how the gun feels.",
    cost: 1000,
    tint: "#ff5566",
    damageMul: 1.25
  },
  "fire-rate-up": {
    id: "fire-rate-up",
    name: "Trigger Coil",
    description: "+~43% fire rate (cooldown -30%). Drains your reactor faster.",
    cost: 900,
    tint: "#ffcc33",
    fireRateMul: 0.7
  },
  "extra-projectile": {
    id: "extra-projectile",
    name: "Splitter Module",
    description: "+1 projectile per shot. Stacks with existing spread.",
    cost: 1500,
    tint: "#66ffaa",
    projectileBonus: 1
  },
  "energy-down": {
    id: "energy-down",
    name: "Capacitor",
    description: "-40% energy cost per fire. Pure utility.",
    cost: 600,
    tint: "#4fd1ff",
    energyMul: 0.6
  },
  "homing-up": {
    id: "homing-up",
    name: "Tracking Servo",
    description: "+50% homing turn rate. No effect on non-homing weapons.",
    cost: 500,
    tint: "#cc44ff",
    turnRateMul: 1.5
  }
} as const satisfies Record<AugmentId, AugmentDefinition>;

/**
 * Every augment definition keyed by id. Total record — every {@link AugmentId}
 * has a row.
 *
 * @stable Part of `content` public API.
 */
export const AUGMENTS: Readonly<Record<AugmentId, AugmentDefinition>> = AUGMENTS_RECORD;

/**
 * Canonical, ordered list of every augment id. Used by the shop, the
 * loadout UI, and the integrity check.
 *
 * @stable Part of `content` public API.
 */
export const AUGMENT_IDS: readonly AugmentId[] = Object.keys(AUGMENTS_RECORD) as AugmentId[];

/**
 * Resolves an augment id to its full definition. Total — never throws,
 * because {@link AUGMENTS} is exhaustive over `AugmentId`.
 *
 * @stable Part of `content` public API.
 */
export function getAugment(id: AugmentId): AugmentDefinition {
  return AUGMENTS[id];
}

/**
 * Returns every augment definition in the order declared by
 * {@link AUGMENT_IDS}.
 *
 * @stable Part of `content` public API.
 */
export function getAllAugments(): readonly AugmentDefinition[] {
  return AUGMENT_IDS.map((id) => AUGMENTS[id]);
}

/**
 * Result of folding installed augment effects into a single multiplier set.
 *
 * @stable Part of `content` public API.
 */
export interface AugmentEffects {
  readonly damageMul: number;
  readonly fireRateMul: number;
  readonly projectileBonus: number;
  readonly energyMul: number;
  readonly turnRateMul: number;
}

/**
 * Identity effects — multipliers at 1, bonuses at 0. Returned by
 * {@link foldAugmentEffects} for an empty input. Useful as a default in
 * weapon math when no augments are installed.
 *
 * @stable Part of `content` public API.
 */
export const NEUTRAL_AUGMENT_EFFECTS: AugmentEffects = {
  damageMul: 1,
  fireRateMul: 1,
  projectileBonus: 0,
  energyMul: 1,
  turnRateMul: 1
};

/**
 * Folds a list of installed augment ids into a single combined effect set.
 * Multiplicative fields multiply; additive fields sum. Use at fire time to
 * multiply into the weapon's base stats — never recompute this inline.
 *
 * @example
 * ```ts
 * const effects = foldAugmentEffects(["damage-up", "fire-rate-up"]);
 * const finalDamage = baseDamage * effects.damageMul;
 * const finalCooldown = baseFireRateMs * effects.fireRateMul;
 * ```
 *
 * @stable Part of `content` public API.
 */
export function foldAugmentEffects(ids: readonly AugmentId[]): AugmentEffects {
  let damageMul = 1;
  let fireRateMul = 1;
  let projectileBonus = 0;
  let energyMul = 1;
  let turnRateMul = 1;

  for (const id of ids) {
    const aug = AUGMENTS[id];
    if (aug.damageMul !== undefined) damageMul *= aug.damageMul;
    if (aug.fireRateMul !== undefined) fireRateMul *= aug.fireRateMul;
    if (aug.projectileBonus !== undefined) projectileBonus += aug.projectileBonus;
    if (aug.energyMul !== undefined) energyMul *= aug.energyMul;
    if (aug.turnRateMul !== undefined) turnRateMul *= aug.turnRateMul;
  }

  return { damageMul, fireRateMul, projectileBonus, energyMul, turnRateMul };
}

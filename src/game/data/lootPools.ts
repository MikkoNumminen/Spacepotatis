// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
// Per-solar-system loot pool. First-clear of any mission rolls a reward
// from its system's pool — weapons / augments / upgrades the player can
// already obtain through the normal shop economy, never bespoke loot.
// Each system gates a different tier of progression so warping forward
// keeps offering meaningful drops. Tier gating: the tutorial pool is
// tier-1 (potato) only by design (the pirate haul ships in tubernovae);
// the shop UI applies the matching filter so a player docking in
// tutorial sees the same set the loot pool offers.

import type {
  AugmentId,
  SolarSystemId,
  WeaponId
} from "@/types/game";

/**
 * Permanent ship-stat upgrade buckets. A loot roll resolving to one of
 * these picks a corresponding `+1 level` for the player's ship.
 *
 * @stable Part of `content` public API.
 */
export type UpgradeField =
  | "shield"
  | "armor"
  | "reactor-capacity"
  | "reactor-recharge";

/**
 * Per-solar-system reward pool. Used by the first-clear reward roll and
 * by the shop UI's tier gate (so what you find in the system matches what
 * you can buy in its market).
 *
 * @stable Part of `content` public API.
 */
export interface LootPool {
  readonly systemId: SolarSystemId;
  readonly weapons: readonly WeaponId[];
  readonly augments: readonly AugmentId[];
  readonly upgrades: readonly UpgradeField[];
  readonly credits: { readonly min: number; readonly max: number };
}

const POOLS: ReadonlyMap<SolarSystemId, LootPool> = new Map([
  [
    "tutorial",
    {
      systemId: "tutorial",
      weapons: ["spread-shot", "heavy-cannon"],
      augments: ["damage-up", "fire-rate-up", "extra-projectile", "energy-down"],
      upgrades: ["shield", "armor", "reactor-capacity", "reactor-recharge"],
      credits: { min: 200, max: 500 }
    }
  ],
  [
    "tubernovae",
    {
      systemId: "tubernovae",
      weapons: ["corsair-missile", "grapeshot-cannon", "boarding-snare"],
      augments: ["damage-up", "fire-rate-up", "extra-projectile", "energy-down", "homing-up"],
      upgrades: ["shield", "armor", "reactor-capacity", "reactor-recharge"],
      credits: { min: 500, max: 1000 }
    }
  ]
]);

/**
 * Resolves a system id to its loot pool.
 *
 * @throws Error if no pool is declared for the given system. The integrity
 *   check guards against this for known systems at boot, so this throw
 *   should only fire for an unknown id passed by a fresh caller.
 *
 * @stable Part of `content` public API.
 */
export function getLootPool(id: SolarSystemId): LootPool {
  const pool = POOLS.get(id);
  if (!pool) throw new Error(`Unknown loot pool: ${id}`);
  return pool;
}

/**
 * Returns every loot pool. Used by the integrity check, the cheat-guard
 * cap derivations in `lib/saveValidation.ts`, and the shop tier gate.
 *
 * @stable Part of `content` public API.
 */
export function getAllLootPools(): readonly LootPool[] {
  return Array.from(POOLS.values());
}

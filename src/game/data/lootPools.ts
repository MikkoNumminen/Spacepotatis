// Per-solar-system loot pool. First-clear of any mission rolls a reward
// from its system's pool — weapons / augments / upgrades the player can
// already obtain through the normal shop economy, never bespoke loot.
// Each system gates a different tier of progression so warping forward
// keeps offering meaningful drops. Family gating: the tutorial pool is
// potato-only by design (carrots and turnips ship in tubernovae and
// later systems); the shop UI applies the matching filter so a player
// docking in tutorial sees the same set the loot pool offers.

import type {
  AugmentId,
  SolarSystemId,
  WeaponId
} from "@/types/game";

export type UpgradeField =
  | "shield"
  | "armor"
  | "reactor-capacity"
  | "reactor-recharge";

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
      weapons: ["spread-shot", "heavy-cannon", "spud-missile"],
      augments: ["damage-up", "fire-rate-up", "extra-projectile", "energy-down"],
      upgrades: ["shield", "armor", "reactor-capacity", "reactor-recharge"],
      credits: { min: 200, max: 500 }
    }
  ],
  [
    "tubernovae",
    {
      systemId: "tubernovae",
      weapons: ["tail-gunner", "side-spitter", "plasma-whip", "hailstorm"],
      augments: ["damage-up", "fire-rate-up", "extra-projectile", "energy-down", "homing-up"],
      upgrades: ["shield", "armor", "reactor-capacity", "reactor-recharge"],
      credits: { min: 500, max: 1000 }
    }
  ]
]);

export function getLootPool(id: SolarSystemId): LootPool {
  const pool = POOLS.get(id);
  if (!pool) throw new Error(`Unknown loot pool: ${id}`);
  return pool;
}

export function getAllLootPools(): readonly LootPool[] {
  return Array.from(POOLS.values());
}

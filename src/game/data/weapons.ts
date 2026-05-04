// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
// Pure data accessors for weapons.json. Separated from WeaponSystem so the
// React shop can read weapon metadata without pulling Phaser into an SSG
// bundle (Phaser touches `window` at import time).
//
// JSON shape is validated by `WeaponsFileSchema` in [src/lib/schemas/weapons.ts]
// via the CI test in [src/game/data/__tests__/jsonSchemaValidation.test.ts] —
// not at module load. Keeps Zod out of this file's import graph (~98 kB
// per-route bundle saving).
import weaponsData from "./weapons.json";
import type { WeaponDefinition, WeaponId } from "@/types/game";

// AI-NOTE: deliberate `as` cast — soundness enforced by jsonSchemaValidation.test.ts.
// Re-adding Zod.parse at module load cost ~98 kB first-load JS (PR history).
const ALL_WEAPONS: readonly WeaponDefinition[] =
  (weaponsData as { weapons: readonly WeaponDefinition[] }).weapons;

/**
 * Canonical, ordered list of every weapon id in the catalog.
 *
 * Lives next to the data so callers needing membership checks (persistence
 * helpers, save schema construction, shop derivations) can import a
 * Zod-free const. The equivalent in `src/lib/schemas/save.ts` builds a
 * `z.enum` from the same list — the save-schema test enforces structural
 * equality.
 *
 * @stable Part of `content` public API.
 */
// INVARIANT: drift between this array and the WeaponId union fails tsc.
export const WEAPON_IDS = [
  "rapid-fire",
  "spread-shot",
  "heavy-cannon",
  "corsair-missile",
  "grapeshot-cannon",
  "boarding-snare"
] as const satisfies readonly WeaponId[];

const WEAPONS: ReadonlyMap<WeaponId, WeaponDefinition> = new Map(
  ALL_WEAPONS.map((w) => [w.id, w])
);

/**
 * Resolves a weapon id to its full definition.
 *
 * @param id - One of the kebab-case weapon ids from {@link WEAPON_IDS}.
 * @returns The matching {@link WeaponDefinition}.
 * @throws Error if `id` is not in the loaded catalog. Treated as a
 *   programming error — saves carrying a removed weapon are filtered
 *   upstream by the persistence-layer salvage step.
 *
 * @example
 * ```ts
 * const rapid = getWeapon("rapid-fire");
 * console.log(rapid.fireRateMs); // 120
 * ```
 *
 * @stable Part of `content` public API.
 */
export function getWeapon(id: WeaponId): WeaponDefinition {
  const w = WEAPONS.get(id);
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}

/**
 * Returns every weapon definition in catalog order. Stable order: matches
 * the declaration order in `weapons.json`. The shop list and any UI sort
 * relies on this order being deterministic.
 *
 * @stable Part of `content` public API.
 */
export function getAllWeapons(): readonly WeaponDefinition[] {
  return ALL_WEAPONS;
}

/**
 * Single-projectile damage-per-second for a weapon, before augments.
 * Pure derivation — kept here so UI never recomputes it inline and risks
 * drift from the formula `damage * projectileCount * (1000 / fireRateMs)`.
 *
 * @stable Part of `content` public API.
 */
export function weaponDps(w: WeaponDefinition): number {
  return Math.round(w.damage * w.projectileCount * (1000 / w.fireRateMs));
}

/**
 * Rounds-per-second a weapon fires (rounded to one decimal). Pure
 * derivation; pairs with {@link weaponDps} for shop tooltips.
 *
 * @stable Part of `content` public API.
 */
export function weaponRps(w: WeaponDefinition): number {
  return Math.round((1000 / w.fireRateMs) * 10) / 10;
}

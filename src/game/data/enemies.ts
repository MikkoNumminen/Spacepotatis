// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
// Pure data accessor for enemies.json. Mirrors the weapons.ts/waves.ts pattern
// so non-Phaser callers (tests, data validators) can resolve enemy definitions
// without importing the Phaser-bound Enemy class.
//
// JSON shape is validated by `EnemiesFileSchema` in [src/lib/schemas/enemies.ts]
// via the CI test in [src/game/data/__tests__/jsonSchemaValidation.test.ts] —
// not at module load. Keeps Zod out of this file's import graph (~98 kB
// per-route bundle saving).
import enemiesData from "./enemies.json";
import type { EnemyDefinition, EnemyId } from "@/types";

// AI-NOTE: deliberate `as` cast — soundness enforced by jsonSchemaValidation.test.ts.
// Re-adding Zod.parse at module load cost ~98 kB first-load JS (PR history).
const ALL_ENEMIES: readonly EnemyDefinition[] =
  (enemiesData as { enemies: readonly EnemyDefinition[] }).enemies;

const ENEMIES: ReadonlyMap<EnemyId, EnemyDefinition> = new Map(
  ALL_ENEMIES.map((e) => [e.id, e])
);

/**
 * Resolves an enemy id to its full definition.
 *
 * @param id - One of the kebab-case enemy ids declared in `enemies.json`.
 * @returns The matching {@link EnemyDefinition}.
 * @throws Error if `id` is not in the loaded catalog. Wave / spawn data
 *   referencing an unknown id is caught at module load by
 *   `runDataIntegrityCheck`, so this throw should only fire if a fresh
 *   caller passes a typo'd id.
 *
 * @stable Part of `content` public API.
 */
export function getEnemy(id: EnemyId): EnemyDefinition {
  const def = ENEMIES.get(id);
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}

/**
 * Returns every enemy definition in catalog order. Used by tests, data
 * validators, and the integrity check.
 *
 * @stable Part of `content` public API.
 */
export function getAllEnemies(): readonly EnemyDefinition[] {
  return ALL_ENEMIES;
}

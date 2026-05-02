// Pure data accessor for enemies.json. Mirrors the weapons.ts/waves.ts pattern
// so non-Phaser callers (tests, data validators) can resolve enemy definitions
// without importing the Phaser-bound Enemy class.
//
// JSON shape is validated by `EnemiesFileSchema` in [src/lib/schemas/enemies.ts]
// via the CI test in [src/game/data/__tests__/jsonSchemaValidation.test.ts] —
// not at module load. Keeps Zod out of this file's import graph (~98 kB
// per-route bundle saving).
import enemiesData from "./enemies.json";
import type { EnemyDefinition, EnemyId } from "@/types/game";

const ALL_ENEMIES: readonly EnemyDefinition[] =
  (enemiesData as { enemies: readonly EnemyDefinition[] }).enemies;

const ENEMIES: ReadonlyMap<EnemyId, EnemyDefinition> = new Map(
  ALL_ENEMIES.map((e) => [e.id, e])
);

export function getEnemy(id: EnemyId): EnemyDefinition {
  const def = ENEMIES.get(id);
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}

export function getAllEnemies(): readonly EnemyDefinition[] {
  return ALL_ENEMIES;
}

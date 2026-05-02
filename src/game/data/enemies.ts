// Pure data accessor for enemies.json. Mirrors the weapons.ts/waves.ts pattern
// so non-Phaser callers (tests, data validators) can resolve enemy definitions
// without importing the Phaser-bound Enemy class.
//
// enemies.json is parsed through EnemiesFileSchema at module load so a
// drifted entry (missing field, wrong type, unknown enum) throws here with a
// helpful Zod path rather than leaking a NaN/undefined into spawn math.
import enemiesData from "./enemies.json";
import type { EnemyDefinition, EnemyId } from "@/types/game";
import { EnemiesFileSchema } from "@/lib/schemas/enemies";

const PARSED = EnemiesFileSchema.parse(enemiesData);
const ALL_ENEMIES: readonly EnemyDefinition[] = PARSED.enemies;

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

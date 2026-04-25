// Pure data accessor for enemies.json. Mirrors the weapons.ts/waves.ts pattern
// so non-Phaser callers (tests, data validators) can resolve enemy definitions
// without importing the Phaser-bound Enemy class.
import enemiesData from "./enemies.json";
import type { EnemyDefinition, EnemyId } from "@/types/game";

const ENEMIES: ReadonlyMap<EnemyId, EnemyDefinition> = new Map(
  (enemiesData.enemies as readonly EnemyDefinition[]).map((e) => [e.id, e])
);

export function getEnemy(id: EnemyId): EnemyDefinition {
  const def = ENEMIES.get(id);
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}

export function getAllEnemies(): readonly EnemyDefinition[] {
  return enemiesData.enemies as readonly EnemyDefinition[];
}

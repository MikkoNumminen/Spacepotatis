// Pure data accessor for obstacles.json. Mirrors enemies.ts so non-Phaser
// callers (tests, data validators) can resolve obstacle definitions without
// importing the Phaser-bound Obstacle class.
//
// JSON shape is validated by `ObstaclesFileSchema` in
// [src/lib/schemas/obstacles.ts] via the CI test in
// [src/game/data/__tests__/jsonSchemaValidation.test.ts] — not at module load.
// Keeps Zod out of this file's import graph (~98 kB per-route bundle saving).
import obstaclesData from "./obstacles.json";
import type { ObstacleDefinition, ObstacleId } from "@/types/game";

const ALL_OBSTACLES: readonly ObstacleDefinition[] =
  (obstaclesData as { obstacles: readonly ObstacleDefinition[] }).obstacles;

const OBSTACLES: ReadonlyMap<ObstacleId, ObstacleDefinition> = new Map(
  ALL_OBSTACLES.map((o) => [o.id, o])
);

export function getObstacle(id: ObstacleId): ObstacleDefinition {
  const def = OBSTACLES.get(id);
  if (!def) throw new Error(`Unknown obstacle: ${id}`);
  return def;
}

export function getAllObstacles(): readonly ObstacleDefinition[] {
  return ALL_OBSTACLES;
}

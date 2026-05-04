// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
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

// AI-NOTE: deliberate `as` cast — soundness enforced by jsonSchemaValidation.test.ts.
// Re-adding Zod.parse at module load cost ~98 kB first-load JS (PR history).
const ALL_OBSTACLES: readonly ObstacleDefinition[] =
  (obstaclesData as { obstacles: readonly ObstacleDefinition[] }).obstacles;

const OBSTACLES: ReadonlyMap<ObstacleId, ObstacleDefinition> = new Map(
  ALL_OBSTACLES.map((o) => [o.id, o])
);

/**
 * Resolves an obstacle id to its full definition.
 *
 * @throws Error if `id` is not in the loaded catalog.
 * @stable Part of `content` public API.
 */
export function getObstacle(id: ObstacleId): ObstacleDefinition {
  const def = OBSTACLES.get(id);
  if (!def) throw new Error(`Unknown obstacle: ${id}`);
  return def;
}

/**
 * Returns every obstacle definition in catalog order.
 *
 * @stable Part of `content` public API.
 */
export function getAllObstacles(): readonly ObstacleDefinition[] {
  return ALL_OBSTACLES;
}

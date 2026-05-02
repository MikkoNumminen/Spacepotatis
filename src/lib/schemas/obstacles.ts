// Runtime schema for src/game/data/obstacles.json. Mirrors `ObstacleDefinition`
// in src/types/game.ts. The JSON itself is validated once per `npm test` by
// src/game/data/__tests__/jsonSchemaValidation.test.ts — not at module load,
// so Zod stays out of the per-route client bundle.
//
// Keep field shapes 1:1 with `ObstacleDefinition`. The compile-time guard at
// the bottom fails to typecheck if the schema drifts.

import { z } from "zod";

import type { ObstacleBehavior, ObstacleDefinition, ObstacleId } from "@/types/game";

// Source of truth for the ObstacleId enum at runtime. The
// `satisfies readonly ObstacleId[]` clause fails to typecheck if the lists
// drift apart.
export const OBSTACLE_IDS = [
  "asteroid-small"
] as const satisfies readonly ObstacleId[];

export const ObstacleIdSchema = z.enum(OBSTACLE_IDS);

const ObstacleBehaviorSchema = z.enum(["drift"]);

export const ObstacleDefinitionSchema = z.object({
  id: ObstacleIdSchema,
  name: z.string(),
  speed: z.number().positive(),
  behavior: ObstacleBehaviorSchema,
  spriteKey: z.string().min(1),
  collisionDamage: z.number().nonnegative(),
  hitboxRadius: z.number().positive()
});

export const ObstaclesFileSchema = z.object({
  // The JSON has a `$schema` field for IDE-assisted JSON authoring (jsonschema
  // file in src/game/data/schema/). Allow the field through without
  // constraining the path; everything outside `obstacles` is presentational.
  $schema: z.string().optional(),
  obstacles: z.array(ObstacleDefinitionSchema)
});

// Compile-time drift guard. The function bodies are unused at runtime; their
// only purpose is to make tsc fail if the schema's inferred type stops being
// assignable to the canonical TS interface.
type _ObstacleBehavior = z.infer<typeof ObstacleBehaviorSchema>;
type _ObstacleDefinition = z.infer<typeof ObstacleDefinitionSchema>;
const _obstacleBehaviorCheck = (x: _ObstacleBehavior): ObstacleBehavior => x;
const _obstacleDefCheck = (x: _ObstacleDefinition): ObstacleDefinition => x;
void _obstacleBehaviorCheck;
void _obstacleDefCheck;

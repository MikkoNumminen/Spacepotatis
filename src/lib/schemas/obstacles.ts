// Runtime schema for src/game/data/obstacles.json. Mirrors `ObstacleDefinition`
// in src/types/game.ts. The JSON itself is validated once per `npm test` by
// src/game/data/__tests__/jsonSchemaValidation.test.ts — not at module load,
// so Zod stays out of the per-route client bundle.
//
// Keep field shapes 1:1 with `ObstacleDefinition`. The compile-time guard at
// the bottom fails to typecheck if the schema drifts.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   See ./README.md for the rationale.

import { z } from "zod";

import type { ObstacleBehavior, ObstacleDefinition, ObstacleId } from "@/types/game";

// INVARIANT: OBSTACLE_IDS uses `as const satisfies readonly ObstacleId[]`
//   so the literal union in src/types/game.ts and this runtime list are
//   locked together at compile time.

/**
 * Runtime list of every `ObstacleId` literal.
 *
 * Source of truth for the `ObstacleId` enum at runtime. Locked-in-lockstep
 * with the literal union in `src/types/game.ts` via the
 * `satisfies readonly ObstacleId[]` clause.
 *
 * @stable
 */
export const OBSTACLE_IDS = [
  "asteroid-small"
] as const satisfies readonly ObstacleId[];

/**
 * Zod enum validator for `ObstacleId`.
 *
 * Used by `ObstacleDefinitionSchema` and re-imported by `WavesFileSchema`
 * to gate the obstacle-spawn id list.
 *
 * @stable
 */
export const ObstacleIdSchema = z.enum(OBSTACLE_IDS);

// @internal
const ObstacleBehaviorSchema = z.enum(["drift"]);

/**
 * Per-obstacle catalog row — one entry from `obstacles.json`.
 *
 * Mirrors `ObstacleDefinition` in `src/types/game.ts`. The compile-time
 * drift guard at the bottom fails tsc if the schema drifts.
 *
 * INVARIANT: `speed > 0`, `hitboxRadius > 0`. Score / credit values do not
 * apply because obstacles are indestructible.
 *
 * @stable
 */
export const ObstacleDefinitionSchema = z.object({
  id: ObstacleIdSchema,
  name: z.string(),
  speed: z.number().positive(),
  behavior: ObstacleBehaviorSchema,
  spriteKey: z.string().min(1),
  collisionDamage: z.number().nonnegative(),
  hitboxRadius: z.number().positive()
});

/**
 * Top-level schema for `src/game/data/obstacles.json`.
 *
 * Wraps the array of `ObstacleDefinitionSchema` and tolerates the optional
 * `$schema` field used for IDE-assisted JSON authoring. Run from the CI
 * drift gate, NOT at module load.
 *
 * @stable
 */
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

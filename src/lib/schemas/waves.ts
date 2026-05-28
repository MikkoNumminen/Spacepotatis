// Runtime schema for src/game/data/waves.json. Mirrors `WaveDefinition` /
// `WaveSpawn` / `MissionWaves` in src/types/game.ts. The JSON itself is
// validated once per `npm test` by
// src/game/data/__tests__/jsonSchemaValidation.test.ts — not at module load.
//
// Cross-file referential integrity (every spawn enemy actually exists in
// enemies.json, every missionId actually exists in missions.json) lives in
// src/game/data/data.test.ts. The schema only verifies that each enemy id is
// a member of the EnemyId enum and each missionId is a member of MissionId.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   See ./README.md for the rationale.

import { z } from "zod";

import type {
  MissionWaves,
  ObstacleSpawn,
  WaveDefinition,
  WaveSpawn
} from "@/types";
import { EnemyIdSchema } from "./enemies";
import { ObstacleIdSchema } from "./obstacles";
import { MissionIdSchema } from "./save";

// @internal
const FormationSchema = z.enum(["line", "vee", "scatter", "column"]);
// @internal — obstacles drop "vee" because rocks in a v-formation read as
// "fleet maneuver", not drifting space junk.
const ObstacleFormationSchema = z.enum(["line", "scatter", "column"]);

/**
 * Per-cohort enemy spawn spec inside a wave.
 *
 * Mirrors `WaveSpawn` in `src/types/game.ts`. `xPercent` is normalized
 * 0..1 across the viewport. Cross-file referential integrity (the enemy
 * id existing in `enemies.json`) is asserted by `data.test.ts`, not here.
 *
 * INVARIANT: `count` is a positive int; `delayMs` / `intervalMs` are
 * nonnegative.
 *
 * @stable
 */
export const WaveSpawnSchema = z.object({
  enemy: EnemyIdSchema,
  count: z.number().int().positive(),
  delayMs: z.number().nonnegative(),
  intervalMs: z.number().nonnegative(),
  formation: FormationSchema,
  xPercent: z.number().min(0).max(1)
});

/**
 * Per-cohort obstacle spawn spec inside a wave.
 *
 * Mirrors `ObstacleSpawn` in `src/types/game.ts`. Same shape as
 * `WaveSpawnSchema` minus the `vee` formation.
 *
 * @stable
 */
export const ObstacleSpawnSchema = z.object({
  obstacle: ObstacleIdSchema,
  count: z.number().int().positive(),
  delayMs: z.number().nonnegative(),
  intervalMs: z.number().nonnegative(),
  formation: ObstacleFormationSchema,
  xPercent: z.number().min(0).max(1)
});

/**
 * One wave inside a mission.
 *
 * Mirrors `WaveDefinition` in `src/types/game.ts`. `durationMs` is
 * positive — a 0-duration wave would auto-advance instantly and softlock
 * the spawn loop on the next wave.
 *
 * @stable
 */
export const WaveDefinitionSchema = z.object({
  id: z.string().min(1),
  durationMs: z.number().positive(),
  spawns: z.array(WaveSpawnSchema),
  obstacleSpawns: z.array(ObstacleSpawnSchema).optional()
});

/**
 * All waves bound to a single mission.
 *
 * Mirrors `MissionWaves` in `src/types/game.ts`. One entry per `MissionId`
 * in `waves.json`.
 *
 * @stable
 */
export const MissionWavesSchema = z.object({
  missionId: MissionIdSchema,
  waves: z.array(WaveDefinitionSchema)
});

/**
 * Top-level schema for `src/game/data/waves.json`.
 *
 * Wraps the array of `MissionWavesSchema` and tolerates the optional
 * `$schema` field used for IDE-assisted JSON authoring. Run from the CI
 * drift gate, NOT at module load.
 *
 * @stable
 */
export const WavesFileSchema = z.object({
  // The JSON has a `$schema` field for IDE-assisted JSON authoring (jsonschema
  // file in src/game/data/schema/). Allow the field through without
  // constraining the path; everything outside `missions` is presentational.
  $schema: z.string().optional(),
  missions: z.array(MissionWavesSchema)
});

// Compile-time drift guard. The function bodies are unused at runtime; their
// only purpose is to make tsc fail if the schema's inferred type stops being
// assignable to the canonical TS interface.
type _WaveSpawn = z.infer<typeof WaveSpawnSchema>;
type _ObstacleSpawn = z.infer<typeof ObstacleSpawnSchema>;
type _WaveDefinition = z.infer<typeof WaveDefinitionSchema>;
type _MissionWaves = z.infer<typeof MissionWavesSchema>;
const _waveSpawnCheck = (x: _WaveSpawn): WaveSpawn => x;
const _obstacleSpawnCheck = (x: _ObstacleSpawn): ObstacleSpawn => x;
const _waveDefCheck = (x: _WaveDefinition): WaveDefinition => x;
const _missionWavesCheck = (x: _MissionWaves): MissionWaves => x;
void _waveSpawnCheck;
void _obstacleSpawnCheck;
void _waveDefCheck;
void _missionWavesCheck;

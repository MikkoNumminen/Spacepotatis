// Runtime schema for src/game/data/waves.json. Mirrors `WaveDefinition` /
// `WaveSpawn` / `MissionWaves` in src/types/game.ts and parses the JSON at
// module load (see src/game/data/waves.ts) so an unknown enemy id or an
// out-of-range xPercent throws at load with a Zod path rather than crashing
// the spawn loop mid-mission.
//
// Cross-file referential integrity (every spawn enemy actually exists in
// enemies.json, every missionId actually exists in missions.json) lives in
// src/game/data/data.test.ts. The schema only verifies that each enemy id is
// a member of the EnemyId enum and each missionId is a member of MissionId.

import { z } from "zod";

import type {
  MissionWaves,
  ObstacleSpawn,
  WaveDefinition,
  WaveSpawn
} from "@/types/game";
import { EnemyIdSchema } from "./enemies";
import { ObstacleIdSchema } from "./obstacles";
import { MissionIdSchema } from "./save";

const FormationSchema = z.enum(["line", "vee", "scatter", "column"]);
// Obstacles drop "vee" — rocks in a v-formation read as fleet maneuver, not
// drifting space junk.
const ObstacleFormationSchema = z.enum(["line", "scatter", "column"]);

export const WaveSpawnSchema = z.object({
  enemy: EnemyIdSchema,
  count: z.number().int().positive(),
  delayMs: z.number().nonnegative(),
  intervalMs: z.number().nonnegative(),
  formation: FormationSchema,
  xPercent: z.number().min(0).max(1)
});

export const ObstacleSpawnSchema = z.object({
  obstacle: ObstacleIdSchema,
  count: z.number().int().positive(),
  delayMs: z.number().nonnegative(),
  intervalMs: z.number().nonnegative(),
  formation: ObstacleFormationSchema,
  xPercent: z.number().min(0).max(1)
});

export const WaveDefinitionSchema = z.object({
  id: z.string().min(1),
  durationMs: z.number().positive(),
  spawns: z.array(WaveSpawnSchema),
  obstacleSpawns: z.array(ObstacleSpawnSchema).optional()
});

export const MissionWavesSchema = z.object({
  missionId: MissionIdSchema,
  waves: z.array(WaveDefinitionSchema)
});

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

// Runtime schema for src/game/data/enemies.json. Mirrors `EnemyDefinition`
// in src/types/game.ts and parses the JSON at module load (see
// src/game/data/enemies.ts) so a hand-edited entry that drifts from the type
// throws at load time with a Zod path ("enemies[3].speed: expected number,
// received string") rather than a silent NaN feeding into the spawn math.
//
// Keep field shapes 1:1 with `EnemyDefinition`. The compile-time guard at
// the bottom of this file fails to typecheck if the schema drifts.

import { z } from "zod";

import type { EnemyBehavior, EnemyDefinition, EnemyId } from "@/types/game";

// Source of truth for the EnemyId enum at runtime. Mirrors the literal union
// in src/types/game.ts; the `satisfies readonly EnemyId[]` clause fails to
// typecheck if the lists drift apart. Lives here (not in save.ts) because
// EnemyId isn't part of the save round-trip — only enemies + waves reference
// it.
export const ENEMY_IDS = [
  "aphid",
  "aphid-giant",
  "aphid-queen",
  "aphid-empress",
  "beetle-scarab",
  "beetle-rhino",
  "beetle-stag",
  "caterpillar-hornworm",
  "caterpillar-army",
  "caterpillar-monarch",
  "spider-wolf",
  "spider-widow",
  "spider-jumper",
  "dragonfly-common",
  "dragonfly-heli",
  "dragonfly-damsel",
  "pirate-skiff",
  "pirate-cutlass",
  "pirate-marauder",
  "pirate-corsair",
  "pirate-frigate",
  "pirate-galleon",
  "pirate-dreadnought"
] as const satisfies readonly EnemyId[];

export const EnemyIdSchema = z.enum(ENEMY_IDS);

const EnemyBehaviorSchema = z.enum(["straight", "zigzag", "homing", "boss"]);

export const EnemyDefinitionSchema = z.object({
  id: EnemyIdSchema,
  name: z.string(),
  hp: z.number().positive(),
  speed: z.number().positive(),
  behavior: EnemyBehaviorSchema,
  scoreValue: z.number().nonnegative(),
  creditValue: z.number().nonnegative(),
  spriteKey: z.string().min(1),
  // `null` signals "this enemy doesn't fire"; a positive number is its
  // bullet cooldown in milliseconds. We reject 0 / negative because the
  // shooter loop divides into it as a frequency and would emit infinite
  // bullets.
  fireRateMs: z.number().positive().nullable(),
  collisionDamage: z.number().nonnegative()
});

export const EnemiesFileSchema = z.object({
  // The JSON has a `$schema` field for IDE-assisted JSON authoring (jsonschema
  // file in src/game/data/schema/). Allow the field through without
  // constraining the path; everything outside `enemies` is presentational.
  $schema: z.string().optional(),
  enemies: z.array(EnemyDefinitionSchema)
});

// Compile-time drift guard. The function bodies are unused at runtime; their
// only purpose is to make tsc fail if the schema's inferred type stops being
// assignable to the canonical TS interface.
type _EnemyBehavior = z.infer<typeof EnemyBehaviorSchema>;
type _EnemyDefinition = z.infer<typeof EnemyDefinitionSchema>;
const _enemyBehaviorCheck = (x: _EnemyBehavior): EnemyBehavior => x;
const _enemyDefCheck = (x: _EnemyDefinition): EnemyDefinition => x;
void _enemyBehaviorCheck;
void _enemyDefCheck;

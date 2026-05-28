// Runtime schema for src/game/data/enemies.json. Mirrors `EnemyDefinition`
// in src/types/game.ts. The JSON itself is validated once per `npm test` by
// src/game/data/__tests__/jsonSchemaValidation.test.ts — not at module load,
// so Zod stays out of every static page's first-load JS (~98 kB saving).
//
// Keep field shapes 1:1 with `EnemyDefinition`. The compile-time guard at
// the bottom of this file fails to typecheck if the schema drifts.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   See ./README.md for the rationale.

import { z } from "zod";

import type { EnemyBehavior, EnemyDefinition, EnemyId } from "@/types";

// INVARIANT: ENEMY_IDS uses `as const satisfies readonly EnemyId[]` so the
//   literal union in src/types/game.ts and this runtime list are locked
//   together at compile time. Drift fails tsc.

/**
 * Runtime list of every `EnemyId` literal.
 *
 * Source of truth for the `EnemyId` enum at runtime. Mirrors the literal
 * union in `src/types/game.ts`; the `satisfies readonly EnemyId[]` clause
 * fails to typecheck if the lists drift apart. Lives here (not in save.ts)
 * because `EnemyId` isn't part of the save round-trip — only enemies +
 * waves reference it.
 *
 * @stable
 */
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

/**
 * Zod enum validator for `EnemyId`.
 *
 * Used by `EnemyDefinitionSchema` and re-imported by `WavesFileSchema` to
 * gate the spawn-side enemy id list.
 *
 * @stable
 */
export const EnemyIdSchema = z.enum(ENEMY_IDS);

// @internal — not exported. Mirrored at compile time by `_EnemyBehavior` /
// `_enemyBehaviorCheck` at the bottom of this file.
const EnemyBehaviorSchema = z.enum(["straight", "zigzag", "homing", "boss"]);

/**
 * Per-enemy catalog row — one entry from `enemies.json`.
 *
 * Mirrors `EnemyDefinition` in `src/types/game.ts`. The compile-time
 * drift guard at the bottom fails tsc if the schema's inferred type
 * stops being assignable to `EnemyDefinition`.
 *
 * INVARIANT: `hp > 0`, `speed > 0`. `fireRateMs` is either positive or
 * `null` ("doesn't fire") — we reject 0 / negative because the shooter
 * loop divides into it as a frequency and would emit infinite bullets.
 *
 * @stable
 */
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

/**
 * Top-level schema for `src/game/data/enemies.json`.
 *
 * Wraps the array of `EnemyDefinitionSchema` and tolerates the optional
 * `$schema` field used for IDE-assisted JSON authoring. Run from the CI
 * drift gate, NOT at module load.
 *
 * @stable
 */
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

// Runtime schema for src/game/data/weapons.json. Mirrors `WeaponDefinition`
// in src/types/game.ts. The JSON itself is validated once per `npm test` by
// src/game/data/__tests__/jsonSchemaValidation.test.ts — not at module load,
// so Zod stays out of every static page's first-load JS (~98 kB saving).
//
// Keep field shapes 1:1 with `WeaponDefinition`. The compile-time guard at
// the bottom of this file fails to typecheck if the schema drifts.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   See ./README.md for the rationale.
//
// AI-NOTE: Do NOT call WeaponsFileSchema.parse(weaponsData) at module load —
//   the data accessor in src/game/data/weapons.ts intentionally uses a
//   single `as` cast and CI is the drift gate. Re-adding a runtime parse
//   regresses the ~98 kB bundle saving.

import { z } from "zod";

import type { WeaponDefinition, WeaponFamily } from "@/types";
import { WeaponIdSchema } from "./save";

const WeaponFamilySchema = z.enum(["potato", "pirate"]);
const WeaponTierSchema = z.union([z.literal(1), z.literal(2)]);

/**
 * Per-weapon catalog row — one entry from `weapons.json`.
 *
 * Mirrors `WeaponDefinition` in `src/types/game.ts`. The compile-time
 * drift guard at the bottom of this file fails tsc if the schema's
 * inferred type stops being assignable to `WeaponDefinition`.
 *
 * INVARIANT: `damage > 0`, `fireRateMs > 0`, `bulletSpeed > 0`. A 0 / negative
 * fireRateMs would yield Infinity DPS in `weaponDps()` and crash the HUD;
 * a 0-damage bullet has no reason to exist.
 *
 * @stable
 */
export const WeaponDefinitionSchema = z.object({
  id: WeaponIdSchema,
  name: z.string(),
  description: z.string(),
  // Damage of 0 (or negative) is never a valid game state — a bullet that
  // can't hurt anything has no reason to exist. Mirrors enemies.ts hp.positive().
  damage: z.number().positive(),
  // Bullets-per-fire cooldown — must be > 0 because weaponDps() divides by
  // it. A typo'd 0 would yield Infinity DPS and crash the HUD.
  fireRateMs: z.number().positive(),
  // A bullet that doesn't move makes no sense. Mirrors enemies.ts speed.positive().
  bulletSpeed: z.number().positive(),
  projectileCount: z.number().int().min(1),
  spreadDegrees: z.number().min(0).max(180),
  cost: z.number().nonnegative(),
  // Hex color string ("#RRGGBB") — the schema is permissive on the exact
  // pattern; UI tint code already tolerates whatever the JSON ships.
  tint: z.string(),
  family: WeaponFamilySchema,
  tier: WeaponTierSchema,
  energyCost: z.number().nonnegative(),
  homing: z.boolean().optional(),
  turnRateRadPerSec: z.number().optional(),
  gravity: z.number().optional(),
  explosionRadius: z.number().nonnegative().optional(),
  explosionDamage: z.number().nonnegative().optional(),
  slowFactor: z.number().positive().max(1).optional(),
  slowDurationMs: z.number().positive().optional(),
  bulletSprite: z.string().optional(),
  podSprite: z.string().optional()
});

/**
 * Top-level schema for `src/game/data/weapons.json`.
 *
 * Wraps the array of `WeaponDefinitionSchema` and tolerates the optional
 * `$schema` field used for IDE-assisted JSON authoring (jsonschema file in
 * `src/game/data/schema/`). Run from the CI drift gate
 * (`src/game/data/__tests__/jsonSchemaValidation.test.ts`), NOT at module
 * load.
 *
 * @stable
 */
export const WeaponsFileSchema = z.object({
  // The JSON has a `$schema` field for IDE-assisted JSON authoring (jsonschema
  // file in src/game/data/schema/). Allow the field through without
  // constraining the path; everything outside `weapons` is presentational.
  $schema: z.string().optional(),
  weapons: z.array(WeaponDefinitionSchema)
});

// Compile-time drift guard. The function bodies are unused at runtime; their
// only purpose is to make tsc fail if the schema's inferred type stops being
// assignable to the canonical TS interface.
type _WeaponFamily = z.infer<typeof WeaponFamilySchema>;
type _WeaponDefinition = z.infer<typeof WeaponDefinitionSchema>;
const _weaponFamilyCheck = (x: _WeaponFamily): WeaponFamily => x;
const _weaponDefCheck = (x: _WeaponDefinition): WeaponDefinition => x;
void _weaponFamilyCheck;
void _weaponDefCheck;

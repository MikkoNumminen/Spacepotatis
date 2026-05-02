// Runtime schema for src/game/data/weapons.json. Mirrors `WeaponDefinition`
// in src/types/game.ts and parses the JSON at module load (see
// src/game/data/weapons.ts) so a hand-edited entry that drifts from the type
// can't slip past tsc's structural-typing-of-JSON gap and explode at runtime
// (e.g. a stringified "120" for fireRateMs would silently divide-by-zero in
// weaponDps()).
//
// Keep field shapes 1:1 with `WeaponDefinition`. The compile-time guard at
// the bottom of this file fails to typecheck if the schema drifts.

import { z } from "zod";

import type { WeaponDefinition, WeaponFamily } from "@/types/game";
import { WeaponIdSchema } from "./save";

const WeaponFamilySchema = z.enum(["potato", "carrot", "turnip"]);

export const WeaponDefinitionSchema = z.object({
  id: WeaponIdSchema,
  name: z.string(),
  description: z.string(),
  damage: z.number(),
  // Bullets-per-fire cooldown — must be > 0 because weaponDps() divides by
  // it. A typo'd 0 would yield Infinity DPS and crash the HUD.
  fireRateMs: z.number().positive(),
  bulletSpeed: z.number(),
  projectileCount: z.number().int().min(1),
  spreadDegrees: z.number().min(0).max(180),
  cost: z.number().nonnegative(),
  // Hex color string ("#RRGGBB") — the schema is permissive on the exact
  // pattern; UI tint code already tolerates whatever the JSON ships.
  tint: z.string(),
  family: WeaponFamilySchema,
  energyCost: z.number().nonnegative(),
  homing: z.boolean().optional(),
  turnRateRadPerSec: z.number().optional(),
  gravity: z.number().optional(),
  bulletSprite: z.string().optional(),
  podSprite: z.string().optional()
});

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

// Runtime schema for src/game/data/solarSystems.json. Mirrors
// `SolarSystemDefinition` in src/types/game.ts. The JSON itself is validated
// once per `npm test` by src/game/data/__tests__/jsonSchemaValidation.test.ts
// — not at module load.
//
// Keep field shapes 1:1 with `SolarSystemDefinition`. The compile-time guard
// at the bottom of this file fails to typecheck if the schema drifts.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   See ./README.md for the rationale.

import { z } from "zod";

import type { SolarSystemDefinition } from "@/types";
import { SolarSystemIdSchema } from "./save";

/**
 * Per-solar-system catalog row — one entry from `solarSystems.json`.
 *
 * Mirrors `SolarSystemDefinition` in `src/types/game.ts`. The compile-time
 * drift guard at the bottom fails tsc if the schema's inferred type stops
 * being assignable to `SolarSystemDefinition`.
 *
 * INVARIANT: `galaxyMusicTrack: z.string().min(1)` — empty string is not
 * allowed because the audio engine treats `""` as "release the slot",
 * which would silently kill the bed for the whole system. Same goes for
 * `name`. `sunSize > 0` because the central star renderer uses it as a
 * radius multiplier.
 *
 * @stable
 */
export const SolarSystemDefinitionSchema = z.object({
  id: SolarSystemIdSchema,
  name: z.string().min(1),
  description: z.string(),
  // Hex color string ("#RRGGBB"). The schema is permissive on the exact
  // pattern; the Three.js sun setup tolerates whatever the JSON ships.
  sunColor: z.string(),
  sunSize: z.number().positive(),
  ambientHue: z.string(),
  // Path under /public/audio/music/. Empty string is not allowed because the
  // Audio engine treats "" as "release the slot" — silently nulling it via a
  // typo would kill the galaxy bed for that whole system.
  galaxyMusicTrack: z.string().min(1)
});

/**
 * Top-level schema for `src/game/data/solarSystems.json`.
 *
 * Wraps the array of `SolarSystemDefinitionSchema` and tolerates the optional
 * `$schema` field used for IDE-assisted JSON authoring. Run from the CI
 * drift gate, NOT at module load.
 *
 * @stable
 */
export const SolarSystemsFileSchema = z.object({
  // The JSON has a `$schema` field for IDE-assisted JSON authoring (jsonschema
  // file in src/game/data/schema/). Allow the field through without
  // constraining the path; everything outside `systems` is presentational.
  $schema: z.string().optional(),
  systems: z.array(SolarSystemDefinitionSchema)
});

// Compile-time drift guard. The function body is unused at runtime; its only
// purpose is to make tsc fail if the schema's inferred type stops being
// assignable to the canonical TS interface.
type _SolarSystemDefinition = z.infer<typeof SolarSystemDefinitionSchema>;
const _solarSystemDefCheck = (x: _SolarSystemDefinition): SolarSystemDefinition => x;
void _solarSystemDefCheck;

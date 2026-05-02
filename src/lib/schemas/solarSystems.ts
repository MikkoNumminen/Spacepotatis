// Runtime schema for src/game/data/solarSystems.json. Mirrors
// `SolarSystemDefinition` in src/types/game.ts and parses the JSON at module
// load (see src/game/data/solarSystems.ts) so a hand-edited entry that drifts
// from the type throws at load with a Zod path rather than passing a missing
// galaxyMusicTrack into the audio engine (which then silently releases the
// music slot when it sees an empty string).
//
// Keep field shapes 1:1 with `SolarSystemDefinition`. The compile-time guard
// at the bottom of this file fails to typecheck if the schema drifts.

import { z } from "zod";

import type { SolarSystemDefinition } from "@/types/game";
import { SolarSystemIdSchema } from "./save";

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

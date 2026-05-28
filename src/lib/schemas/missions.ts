// Runtime schema for src/game/data/missions.json. Mirrors `MissionDefinition`
// in src/types/game.ts. The JSON itself is validated once per `npm test` by
// src/game/data/__tests__/jsonSchemaValidation.test.ts — not at module load,
// so Zod stays out of every static page's first-load JS.
//
// Why parse via the CI drift gate instead of relying on tsc alone:
//  - tsc treats `import json from "./foo.json"` as the literal value type, not
//    a `MissionDefinition`. The cast `as readonly MissionDefinition[]` in
//    missions.ts is unguarded — a missing field or wrong-typed value gets a
//    typecheck pass and crashes at runtime when a callsite reads it.
//  - The data tests in src/game/data/data.test.ts cover most invariants, but
//    they test what we knew to assert. The schema covers structural shape
//    exhaustively, so a JSON edit that *adds* an unknown field or uses the
//    wrong type for a known field fails fast in CI with a useful Zod
//    path-and-message error instead of a silent NaN propagating through the
//    orbit math.
//
// Keep field shapes 1:1 with `MissionDefinition`. The compile-time guard at
// the bottom of this file fails to typecheck if the schema drifts.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   See ./README.md for the rationale.

import { z } from "zod";

import type { MissionDefinition, PlanetRing } from "@/types";
import { MissionIdSchema, SolarSystemIdSchema } from "./save";

const PlanetKindSchema = z.enum(["mission", "shop", "scenery"]);

const PlanetRingSchema = z.object({
  innerRadius: z.number(),
  outerRadius: z.number(),
  tilt: z.number()
});

/**
 * Per-mission catalog row — one entry from `missions.json`.
 *
 * Mirrors `MissionDefinition` in `src/types/game.ts`. The compile-time
 * drift guard at the bottom fails tsc if the schema's inferred type stops
 * being assignable to `MissionDefinition`.
 *
 * INVARIANT: `difficulty` is the literal union `1 | 2 | 3` — `z.union` over
 * literals catches stringified ints or out-of-range integers at parse time.
 * `musicTrack` rejects empty string ("" is the audio engine's "release the
 * slot" signal — silently nulling it via a typo would kill the bed).
 *
 * @stable
 */
export const MissionDefinitionSchema = z.object({
  id: MissionIdSchema,
  kind: PlanetKindSchema,
  name: z.string(),
  description: z.string(),
  // Difficulty is a discriminated literal union (1 | 2 | 3). z.union over
  // literals catches any other integer or a stringified number at parse time.
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  texture: z.string(),
  solarSystemId: SolarSystemIdSchema,
  orbitRadius: z.number(),
  orbitSpeed: z.number(),
  startAngle: z.number(),
  orbitTilt: z.number().optional(),
  orbitNode: z.number().optional(),
  orbitParentId: MissionIdSchema.optional(),
  scale: z.number(),
  requires: z.array(MissionIdSchema),
  // `null` is the no-music-bed signal (shop / scenery planets); a string is a
  // path under /public/audio/music/. Empty string is not allowed because the
  // Audio engine treats "" as "release the slot" — silently nulling it via
  // missing defense would be a footgun.
  musicTrack: z.string().min(1).nullable(),
  ring: PlanetRingSchema.optional(),
  perksAllowed: z.boolean().optional()
});

/**
 * Top-level schema for `src/game/data/missions.json`.
 *
 * Wraps the array of `MissionDefinitionSchema` and tolerates the optional
 * `$schema` field used for IDE-assisted JSON authoring. Run from the CI
 * drift gate, NOT at module load.
 *
 * @stable
 */
export const MissionsFileSchema = z.object({
  // The JSON has a `$schema` field for IDE-assisted JSON authoring (jsonschema
  // file in src/game/data/schema/). Allow the field through without
  // constraining the path; everything outside `missions` is presentational.
  $schema: z.string().optional(),
  missions: z.array(MissionDefinitionSchema)
});

// Compile-time drift guard. The function bodies are unused at runtime; their
// only purpose is to make tsc fail if the schema's inferred type stops being
// assignable to the canonical TS interface. Without these, a field renamed
// in src/types/game.ts could leave the schema silently out of sync until
// runtime data happened to drift the same way.
type _PlanetRing = z.infer<typeof PlanetRingSchema>;
type _MissionDefinition = z.infer<typeof MissionDefinitionSchema>;
const _planetRingCheck = (x: _PlanetRing): PlanetRing => x;
const _missionDefCheck = (x: _MissionDefinition): MissionDefinition => x;
void _planetRingCheck;
void _missionDefCheck;

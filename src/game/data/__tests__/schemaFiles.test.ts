import { describe, it, expect } from "vitest";
import { z } from "zod";
import { EnemiesFileSchema } from "@/lib/schemas/enemies";
import { WeaponsFileSchema } from "@/lib/schemas/weapons";
import { WavesFileSchema } from "@/lib/schemas/waves";
import { MissionsFileSchema } from "@/lib/schemas/missions";
import { SolarSystemsFileSchema } from "@/lib/schemas/solarSystems";
import { ObstaclesFileSchema } from "@/lib/schemas/obstacles";

// Generates and gate-keeps the JSON Schema files under src/game/data/schema/ that
// each data JSON references via its `$schema` pointer (IDE-assisted authoring —
// VS Code reads `$schema` to offer autocomplete + inline validation while editing
// the catalogs by hand). The Zod schemas in src/lib/schemas/ remain the source of
// truth for RUNTIME/CI validation (jsonSchemaValidation.test.ts); these emitted
// files are purely the editor-facing mirror.
//
// One test, two jobs:
//   - `npm run gen:schemas` (vitest -u) regenerates the committed *.schema.json.
//   - `npm test` (vitest run) fails if a committed file drifts from its Zod
//     schema — the "CI drift gate" the schema modules' comments call for, so a
//     Zod edit can't silently leave the editor schema stale.
//
// Uses Zod 4's built-in z.toJSONSchema() — no extra dependency. Filenames match
// the `$schema` pointers already in the data files (note solar-systems is
// hyphenated, unlike the camelCase solarSystems.json source).
const CASES: ReadonlyArray<readonly [string, z.ZodType]> = [
  ["enemies.schema.json", EnemiesFileSchema],
  ["weapons.schema.json", WeaponsFileSchema],
  ["waves.schema.json", WavesFileSchema],
  ["missions.schema.json", MissionsFileSchema],
  ["solar-systems.schema.json", SolarSystemsFileSchema],
  ["obstacles.schema.json", ObstaclesFileSchema]
];

describe("data JSON Schema files stay in sync with the Zod schemas", () => {
  for (const [file, schema] of CASES) {
    it(`${file} matches z.toJSONSchema()`, async () => {
      const json = `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`;
      await expect(json).toMatchFileSnapshot(`../schema/${file}`);
    });
  }
});

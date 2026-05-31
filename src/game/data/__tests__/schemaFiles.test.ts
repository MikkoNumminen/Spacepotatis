import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
//
// NOTE on strictness: z.toJSONSchema emits `additionalProperties: false`, so the
// editor flags unknown keys. This is intentionally STRICTER than the Zod runtime
// schemas (which are non-strict and silently ignore extra keys) — the extra
// strictness is an authoring aid (typo-catching) and is editor-only; it never
// affects runtime/CI validation. If a data file ever needs a presentational key
// the editor shouldn't flag, relax the relevant Zod object (e.g. .loose()) and
// regenerate, rather than hand-editing the emitted schema.
const CASES: ReadonlyArray<readonly [string, z.ZodType]> = [
  ["enemies.schema.json", EnemiesFileSchema],
  ["weapons.schema.json", WeaponsFileSchema],
  ["waves.schema.json", WavesFileSchema],
  ["missions.schema.json", MissionsFileSchema],
  ["solar-systems.schema.json", SolarSystemsFileSchema],
  ["obstacles.schema.json", ObstaclesFileSchema]
];

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("data JSON Schema files stay in sync with the Zod schemas", () => {
  for (const [file, schema] of CASES) {
    it(`${file} matches z.toJSONSchema()`, async () => {
      const json = `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`;
      await expect(json).toMatchFileSnapshot(`../schema/${file}`);
    });
  }

  // CASES is a hand-maintained list, so a new catalog (or a dropped `$schema`
  // pointer) could silently escape the generator + drift gate. Assert a bijection
  // between the data files' actual `$schema` pointers and CASES so the mapping
  // can never drift unnoticed: add a catalog with a pointer → must add to CASES;
  // remove a pointer → must remove from CASES; either way this fails loudly with
  // the offending filename. Also rules out a vacuous empty scan (wrong dir).
  it("CASES exactly mirrors the data files' $schema pointers", () => {
    const referenced = readdirSync(dataDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        // Read the actual `$schema` property (not a regex over the raw text) so a
        // `$schema`-shaped string inside a description field can't false-match.
        const parsed: unknown = JSON.parse(readFileSync(join(dataDir, name), "utf8"));
        const pointer = (parsed as { $schema?: unknown }).$schema;
        return typeof pointer === "string" ? pointer.replace(/^\.\/schema\//, "") : undefined;
      })
      .filter((file): file is string => Boolean(file))
      .sort();
    const cased = CASES.map(([file]) => file).sort();
    expect(referenced).toEqual(cased);
  });
});

import { describe, expect, it } from "vitest";

import {
  SolarSystemDefinitionSchema,
  SolarSystemsFileSchema
} from "./solarSystems";

// Contract tests for the solarSystems.json runtime schema. Two purposes:
//  1. Confirm the schema accepts the real shipped JSON (the accessor in
//     src/game/data/solarSystems.ts already calls .parse() at module load,
//     so a regression there fails imports across the suite — but this keeps
//     the failure scoped and obvious).
//  2. Confirm the schema rejects the obvious drift cases.

const VALID_SYSTEM = {
  id: "tutorial",
  name: "Sol Spudensis",
  description: "Where the potato journey begins.",
  sunColor: "#ffe9b8",
  sunSize: 1.0,
  ambientHue: "#1a1424",
  galaxyMusicTrack: "/audio/music/menu-theme.ogg"
} as const;

describe("SolarSystemDefinitionSchema", () => {
  it("accepts a minimal well-formed solar system", () => {
    expect(() => SolarSystemDefinitionSchema.parse(VALID_SYSTEM)).not.toThrow();
  });

  it("rejects an unknown system id (not in the SolarSystemId enum)", () => {
    const bad = { ...VALID_SYSTEM, id: "andromeda" };
    expect(() => SolarSystemDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects sunSize of 0 (must be positive — Three sun mesh would collapse)", () => {
    const bad = { ...VALID_SYSTEM, sunSize: 0 };
    expect(() => SolarSystemDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects an empty galaxyMusicTrack (audio engine treats '' as 'release the slot')", () => {
    // The Audio engine treats "" as "release the slot" — accepting an empty
    // string here would silently kill the galaxy bed for that whole system.
    const bad = { ...VALID_SYSTEM, galaxyMusicTrack: "" };
    expect(() => SolarSystemDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a stringified number for sunSize", () => {
    const bad = { ...VALID_SYSTEM, sunSize: "1.0" };
    expect(() => SolarSystemDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a missing required field (e.g. galaxyMusicTrack)", () => {
    const { galaxyMusicTrack: _, ...bad } = VALID_SYSTEM;
    void _;
    expect(() => SolarSystemDefinitionSchema.parse(bad)).toThrow();
  });
});

describe("SolarSystemsFileSchema", () => {
  it("accepts a valid wrapper with the optional $schema annotation", () => {
    expect(() =>
      SolarSystemsFileSchema.parse({
        $schema: "./schema/solar-systems.schema.json",
        systems: [VALID_SYSTEM]
      })
    ).not.toThrow();
  });

  it("rejects a wrapper whose `systems` field is missing", () => {
    expect(() => SolarSystemsFileSchema.parse({})).toThrow();
  });
});

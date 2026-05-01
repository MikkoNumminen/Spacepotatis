import { describe, expect, it } from "vitest";

import {
  MissionDefinitionSchema,
  MissionsFileSchema
} from "./missions";

// Contract tests for the missions.json runtime schema. Two purposes:
//  1. Confirm the schema accepts the real shipped JSON. The accessor in
//     src/game/data/missions.ts already calls .parse() at module load, so
//     a regression there fails imports across the test suite — but this
//     keeps the failure scoped and obvious.
//  2. Confirm the schema rejects the obvious drift cases. The "low-risk"
//     part of the audit follow-up was framed around tests-catch-most-drift;
//     these explicit negative cases close the residual gap.

const VALID_MISSION = {
  id: "tutorial",
  kind: "mission",
  name: "Spud Prime",
  description: "tiny outpost",
  difficulty: 1,
  texture: "/textures/planets/tutorial.jpg",
  solarSystemId: "tutorial",
  orbitRadius: 5.5,
  orbitSpeed: 0.16,
  startAngle: 0.7,
  scale: 1.0,
  requires: [],
  musicTrack: "/audio/music/combat-tutorial.ogg"
} as const;

describe("MissionDefinitionSchema", () => {
  it("accepts a minimal well-formed mission", () => {
    expect(() => MissionDefinitionSchema.parse(VALID_MISSION)).not.toThrow();
  });

  it("accepts the optional ring + perksAllowed fields", () => {
    const withOptionals = {
      ...VALID_MISSION,
      ring: { innerRadius: 1.5, outerRadius: 2.5, tilt: 0.3 },
      perksAllowed: true,
      orbitTilt: 0.1,
      orbitNode: 0.2,
      orbitParentId: "tutorial"
    };
    expect(() => MissionDefinitionSchema.parse(withOptionals)).not.toThrow();
  });

  it("rejects an unknown id (not in the MissionId enum)", () => {
    const bad = { ...VALID_MISSION, id: "no-such-mission" };
    expect(() => MissionDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a difficulty outside 1 | 2 | 3", () => {
    const bad = { ...VALID_MISSION, difficulty: 4 };
    expect(() => MissionDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a stringified number for a numeric field", () => {
    // tsc lets the cast pass; the schema is the runtime guard. Without it,
    // a hand-edit that accidentally quoted "5.5" would slip into orbit math.
    const bad = { ...VALID_MISSION, orbitRadius: "5.5" };
    expect(() => MissionDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects an empty-string musicTrack (use null for no bed)", () => {
    // The Audio engine treats "" as "release the slot" — accepting an empty
    // string here would wire a silent footgun where a writer typo'd a path.
    const bad = { ...VALID_MISSION, musicTrack: "" };
    expect(() => MissionDefinitionSchema.parse(bad)).toThrow();
  });

  it("accepts null musicTrack", () => {
    const ok = { ...VALID_MISSION, musicTrack: null };
    expect(() => MissionDefinitionSchema.parse(ok)).not.toThrow();
  });

  it("rejects a missing required field (e.g. solarSystemId)", () => {
    const { solarSystemId: _, ...bad } = VALID_MISSION;
    void _;
    expect(() => MissionDefinitionSchema.parse(bad)).toThrow();
  });
});

describe("MissionsFileSchema", () => {
  it("accepts a valid wrapper with the optional $schema annotation", () => {
    expect(() =>
      MissionsFileSchema.parse({
        $schema: "./schema/missions.schema.json",
        missions: [VALID_MISSION]
      })
    ).not.toThrow();
  });

  it("rejects a wrapper whose `missions` field is missing", () => {
    expect(() => MissionsFileSchema.parse({})).toThrow();
  });
});

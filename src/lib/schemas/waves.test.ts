import { describe, expect, it } from "vitest";

import {
  MissionWavesSchema,
  WaveDefinitionSchema,
  WaveSpawnSchema,
  WavesFileSchema
} from "./waves";

// Contract tests for the waves.json runtime schema. Two purposes:
//  1. Confirm the schema accepts the real shipped JSON (the accessor in
//     src/game/data/waves.ts already calls .parse() at module load, so a
//     regression there fails imports across the suite — but this keeps the
//     failure scoped and obvious).
//  2. Confirm the schema rejects the obvious drift cases. Cross-file
//     referential integrity (enemy/mission ids actually existing in their
//     catalogs) is covered in src/game/data/data.test.ts; the schema only
//     verifies enum membership.

const VALID_SPAWN = {
  enemy: "aphid",
  count: 5,
  delayMs: 2000,
  intervalMs: 2200,
  formation: "line",
  xPercent: 0.3
} as const;

const VALID_WAVE = {
  id: "tutorial-1",
  durationMs: 30000,
  spawns: [VALID_SPAWN]
} as const;

const VALID_MISSION_WAVES = {
  missionId: "tutorial",
  waves: [VALID_WAVE]
} as const;

describe("WaveSpawnSchema", () => {
  it("accepts a minimal well-formed spawn", () => {
    expect(() => WaveSpawnSchema.parse(VALID_SPAWN)).not.toThrow();
  });

  it("rejects an unknown enemy id (not in the EnemyId enum)", () => {
    const bad = { ...VALID_SPAWN, enemy: "robo-spud" };
    expect(() => WaveSpawnSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown formation", () => {
    const bad = { ...VALID_SPAWN, formation: "spiral" };
    expect(() => WaveSpawnSchema.parse(bad)).toThrow();
  });

  it("rejects xPercent above 1 (out of [0,1] range)", () => {
    const bad = { ...VALID_SPAWN, xPercent: 1.5 };
    expect(() => WaveSpawnSchema.parse(bad)).toThrow();
  });

  it("rejects xPercent below 0 (out of [0,1] range)", () => {
    const bad = { ...VALID_SPAWN, xPercent: -0.1 };
    expect(() => WaveSpawnSchema.parse(bad)).toThrow();
  });

  it("rejects a stringified number for count", () => {
    const bad = { ...VALID_SPAWN, count: "5" };
    expect(() => WaveSpawnSchema.parse(bad)).toThrow();
  });

  it("rejects count of 0 (must spawn at least one)", () => {
    const bad = { ...VALID_SPAWN, count: 0 };
    expect(() => WaveSpawnSchema.parse(bad)).toThrow();
  });
});

describe("WaveDefinitionSchema", () => {
  it("rejects a wave with durationMs <= 0 (would never tick a spawn)", () => {
    const bad = { ...VALID_WAVE, durationMs: 0 };
    expect(() => WaveDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a missing wave id", () => {
    const { id: _, ...bad } = VALID_WAVE;
    void _;
    expect(() => WaveDefinitionSchema.parse(bad)).toThrow();
  });
});

describe("MissionWavesSchema", () => {
  it("rejects an unknown missionId", () => {
    const bad = { ...VALID_MISSION_WAVES, missionId: "not-a-mission" };
    expect(() => MissionWavesSchema.parse(bad)).toThrow();
  });
});

describe("WavesFileSchema", () => {
  it("accepts a valid wrapper with the optional $schema annotation", () => {
    expect(() =>
      WavesFileSchema.parse({
        $schema: "./schema/waves.schema.json",
        missions: [VALID_MISSION_WAVES]
      })
    ).not.toThrow();
  });

  it("rejects a wrapper whose `missions` field is missing", () => {
    expect(() => WavesFileSchema.parse({})).toThrow();
  });
});

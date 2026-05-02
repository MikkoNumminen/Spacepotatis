import { describe, expect, it } from "vitest";

import {
  EnemiesFileSchema,
  EnemyDefinitionSchema
} from "./enemies";

// Contract tests for the enemies.json runtime schema. Two purposes:
//  1. Confirm the schema accepts the real shipped JSON (the accessor in
//     src/game/data/enemies.ts already calls .parse() at module load, so a
//     regression there fails imports across the suite — but this keeps the
//     failure scoped and obvious).
//  2. Confirm the schema rejects the obvious drift cases.

const VALID_ENEMY = {
  id: "aphid",
  name: "Aphid",
  hp: 8,
  speed: 70,
  behavior: "straight",
  scoreValue: 30,
  creditValue: 3,
  spriteKey: "enemy-aphid",
  fireRateMs: null,
  collisionDamage: 5
} as const;

describe("EnemyDefinitionSchema", () => {
  it("accepts a minimal well-formed enemy with null fireRateMs", () => {
    expect(() => EnemyDefinitionSchema.parse(VALID_ENEMY)).not.toThrow();
  });

  it("accepts a positive fireRateMs (firing enemy)", () => {
    const firing = { ...VALID_ENEMY, fireRateMs: 1500 };
    expect(() => EnemyDefinitionSchema.parse(firing)).not.toThrow();
  });

  it("rejects an unknown enemy id (not in the EnemyId enum)", () => {
    const bad = { ...VALID_ENEMY, id: "robo-spud" };
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown behavior", () => {
    const bad = { ...VALID_ENEMY, behavior: "teleport" };
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects hp of 0 (must be > 0 — a 0-hp enemy would die before spawn finished)", () => {
    const bad = { ...VALID_ENEMY, hp: 0 };
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects fireRateMs of 0 (must be positive or null — 0 would emit infinite bullets)", () => {
    const bad = { ...VALID_ENEMY, fireRateMs: 0 };
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a stringified number for a numeric field", () => {
    const bad = { ...VALID_ENEMY, hp: "8" };
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a missing required field (e.g. spriteKey)", () => {
    const { spriteKey: _, ...bad } = VALID_ENEMY;
    void _;
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects an empty spriteKey (BootScene wouldn't find a texture)", () => {
    const bad = { ...VALID_ENEMY, spriteKey: "" };
    expect(() => EnemyDefinitionSchema.parse(bad)).toThrow();
  });
});

describe("EnemiesFileSchema", () => {
  it("accepts a valid wrapper with the optional $schema annotation", () => {
    expect(() =>
      EnemiesFileSchema.parse({
        $schema: "./schema/enemies.schema.json",
        enemies: [VALID_ENEMY]
      })
    ).not.toThrow();
  });

  it("rejects a wrapper whose `enemies` field is missing", () => {
    expect(() => EnemiesFileSchema.parse({})).toThrow();
  });
});

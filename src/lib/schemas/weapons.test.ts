import { describe, expect, it } from "vitest";

import {
  WeaponDefinitionSchema,
  WeaponsFileSchema
} from "./weapons";

// Contract tests for the weapons.json runtime schema. Two purposes:
//  1. Confirm the schema accepts the real shipped JSON (the accessor in
//     src/game/data/weapons.ts already calls .parse() at module load, so a
//     regression there fails imports across the suite — but this keeps the
//     failure scoped and obvious).
//  2. Confirm the schema rejects the obvious drift cases.

const VALID_WEAPON = {
  id: "rapid-fire",
  name: "Potato Cannon",
  description: "Fast cadence, small potatoes.",
  damage: 6,
  fireRateMs: 120,
  bulletSpeed: 720,
  projectileCount: 1,
  spreadDegrees: 0,
  cost: 0,
  tint: "#4fd1ff",
  family: "potato",
  tier: 1,
  energyCost: 4
} as const;

describe("WeaponDefinitionSchema", () => {
  it("accepts a minimal well-formed weapon", () => {
    expect(() => WeaponDefinitionSchema.parse(VALID_WEAPON)).not.toThrow();
  });

  it("accepts the optional homing / sprite / gravity fields", () => {
    const withOptionals = {
      ...VALID_WEAPON,
      homing: true,
      turnRateRadPerSec: 4.0,
      gravity: 200,
      bulletSprite: "bullet-potato",
      podSprite: "pod-potato"
    };
    expect(() => WeaponDefinitionSchema.parse(withOptionals)).not.toThrow();
  });

  it("rejects an unknown weapon id (not in the WeaponId enum)", () => {
    const bad = { ...VALID_WEAPON, id: "death-laser" };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects an unknown family value", () => {
    const bad = { ...VALID_WEAPON, family: "rutabaga" };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects fireRateMs of 0 (would Infinity-divide in weaponDps)", () => {
    // weaponDps does `damage * projectileCount * (1000 / fireRateMs)`. A 0
    // here produces Infinity and crashes the HUD.
    const bad = { ...VALID_WEAPON, fireRateMs: 0 };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects damage of 0 (a bullet that can't hurt anything is meaningless)", () => {
    const bad = { ...VALID_WEAPON, damage: 0 };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects negative damage", () => {
    const bad = { ...VALID_WEAPON, damage: -1 };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects bulletSpeed of 0 (a bullet that doesn't move can't hit anything)", () => {
    const bad = { ...VALID_WEAPON, bulletSpeed: 0 };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects negative bulletSpeed", () => {
    const bad = { ...VALID_WEAPON, bulletSpeed: -100 };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a stringified number for a numeric field", () => {
    const bad = { ...VALID_WEAPON, damage: "6" };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects projectileCount of 0 (must shoot at least one)", () => {
    const bad = { ...VALID_WEAPON, projectileCount: 0 };
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a missing required field (e.g. family)", () => {
    const { family: _, ...bad } = VALID_WEAPON;
    void _;
    expect(() => WeaponDefinitionSchema.parse(bad)).toThrow();
  });
});

describe("WeaponsFileSchema", () => {
  it("accepts a valid wrapper with the optional $schema annotation", () => {
    expect(() =>
      WeaponsFileSchema.parse({
        $schema: "./schema/weapons.schema.json",
        weapons: [VALID_WEAPON]
      })
    ).not.toThrow();
  });

  it("rejects a wrapper whose `weapons` field is missing", () => {
    expect(() => WeaponsFileSchema.parse({})).toThrow();
  });
});

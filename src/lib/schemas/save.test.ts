import { describe, expect, it } from "vitest";
import {
  AUGMENT_IDS,
  LegacyOrShipConfigSchema,
  LegacyShipSchema,
  MISSION_IDS,
  ReactorConfigSchema,
  RemoteSaveSchema,
  SOLAR_SYSTEM_IDS,
  SavePayloadSchema,
  ScorePayloadSchema,
  ShipConfigSchema,
  WEAPON_IDS,
  WeaponSlotsSchema
} from "./save";
import type { AugmentId, MissionId, SolarSystemId, WeaponId } from "@/types/game";

// ---------------------------------------------------------------------------
// Structural sanity — these readonly tuples back z.enum(); if the literal
// unions ever drift, TS fails on these assignments.
// ---------------------------------------------------------------------------

const _weaponIds: readonly WeaponId[] = WEAPON_IDS;
const _augmentIds: readonly AugmentId[] = AUGMENT_IDS;
const _missionIds: readonly MissionId[] = MISSION_IDS;
const _systemIds: readonly SolarSystemId[] = SOLAR_SYSTEM_IDS;
void _weaponIds;
void _augmentIds;
void _missionIds;
void _systemIds;

describe("WeaponSlotsSchema", () => {
  it("accepts a fully populated slot map", () => {
    expect(
      WeaponSlotsSchema.safeParse({
        front: "rapid-fire",
        rear: null,
        sidekickLeft: null,
        sidekickRight: null
      }).success
    ).toBe(true);
  });

  it("rejects an unknown weapon id", () => {
    const r = WeaponSlotsSchema.safeParse({
      front: "death-laser",
      rear: null,
      sidekickLeft: null,
      sidekickRight: null
    });
    expect(r.success).toBe(false);
  });

  it("rejects a numeric slot value", () => {
    expect(
      WeaponSlotsSchema.safeParse({
        front: 42,
        rear: null,
        sidekickLeft: null,
        sidekickRight: null
      }).success
    ).toBe(false);
  });
});

describe("ReactorConfigSchema", () => {
  it("accepts non-negative integer levels", () => {
    expect(ReactorConfigSchema.safeParse({ capacityLevel: 0, rechargeLevel: 3 }).success).toBe(
      true
    );
  });

  it("rejects negative or non-integer levels", () => {
    expect(ReactorConfigSchema.safeParse({ capacityLevel: -1, rechargeLevel: 0 }).success).toBe(
      false
    );
    expect(ReactorConfigSchema.safeParse({ capacityLevel: 1.5, rechargeLevel: 0 }).success).toBe(
      false
    );
  });

  it("rejects string levels", () => {
    expect(
      ReactorConfigSchema.safeParse({ capacityLevel: "high", rechargeLevel: 1 }).success
    ).toBe(false);
  });
});

describe("ShipConfigSchema", () => {
  it("accepts a well-formed new-shape ship", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: {
          front: "rapid-fire",
          rear: null,
          sidekickLeft: null,
          sidekickRight: null
        },
        unlockedWeapons: ["rapid-fire"],
        weaponLevels: { "rapid-fire": 3 },
        weaponAugments: { "rapid-fire": ["damage-up"] },
        augmentInventory: ["fire-rate-up"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(true);
  });

  it("rejects unknown weapon ids inside slots", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: {
          front: "death-laser",
          rear: null,
          sidekickLeft: null,
          sidekickRight: null
        },
        unlockedWeapons: [],
        weaponLevels: {},
        weaponAugments: {},
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(false);
  });

  it("rejects unknown augment ids inside augmentInventory", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: {
          front: "rapid-fire",
          rear: null,
          sidekickLeft: null,
          sidekickRight: null
        },
        unlockedWeapons: ["rapid-fire"],
        weaponLevels: {},
        weaponAugments: {},
        augmentInventory: ["bogus-augment"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(false);
  });
});

describe("LegacyShipSchema", () => {
  it("accepts the pre-loadout shape (primaryWeapon, no slots, no reactor)", () => {
    expect(
      LegacyShipSchema.safeParse({
        primaryWeapon: "rapid-fire",
        unlockedWeapons: ["rapid-fire"],
        shieldLevel: 0,
        armorLevel: 0
      }).success
    ).toBe(true);
  });

  it("requires either slots or primaryWeapon", () => {
    expect(
      LegacyShipSchema.safeParse({
        unlockedWeapons: ["rapid-fire"],
        shieldLevel: 0,
        armorLevel: 0
      }).success
    ).toBe(false);
  });

  it("permits unknown weapon strings under slots (migration drops them)", () => {
    expect(
      LegacyShipSchema.safeParse({
        slots: { front: "old-deprecated-weapon", rear: null },
        unlockedWeapons: ["old-deprecated-weapon"],
        shieldLevel: 0,
        armorLevel: 0
      }).success
    ).toBe(true);
  });
});

describe("LegacyOrShipConfigSchema (used for shipConfig round-trip)", () => {
  it("accepts a strict ShipConfig", () => {
    const r = LegacyOrShipConfigSchema.safeParse({
      slots: {
        front: "rapid-fire",
        rear: null,
        sidekickLeft: null,
        sidekickRight: null
      },
      unlockedWeapons: ["rapid-fire"],
      weaponLevels: {},
      weaponAugments: {},
      augmentInventory: [],
      shieldLevel: 0,
      armorLevel: 0,
      reactor: { capacityLevel: 0, rechargeLevel: 0 }
    });
    expect(r.success).toBe(true);
  });

  it("accepts a legacy ship snapshot", () => {
    const r = LegacyOrShipConfigSchema.safeParse({
      primaryWeapon: "rapid-fire",
      unlockedWeapons: ["rapid-fire"],
      shieldLevel: 0,
      armorLevel: 0
    });
    expect(r.success).toBe(true);
  });

  it("rejects null and primitives", () => {
    expect(LegacyOrShipConfigSchema.safeParse(null).success).toBe(false);
    expect(LegacyOrShipConfigSchema.safeParse("rapid-fire").success).toBe(false);
    expect(LegacyOrShipConfigSchema.safeParse(42).success).toBe(false);
  });

  it("rejects objects missing required fields entirely", () => {
    expect(LegacyOrShipConfigSchema.safeParse({}).success).toBe(false);
    expect(
      LegacyOrShipConfigSchema.safeParse({ primaryWeapon: "rapid-fire" }).success
    ).toBe(false);
  });

  it("rejects objects where unlockedWeapons is not an array", () => {
    expect(
      LegacyOrShipConfigSchema.safeParse({
        primaryWeapon: "rapid-fire",
        unlockedWeapons: "rapid-fire",
        shieldLevel: 0,
        armorLevel: 0
      }).success
    ).toBe(false);
  });

  it("rejects when reactor is present but malformed (legacy fallback also rejects)", () => {
    expect(
      LegacyOrShipConfigSchema.safeParse({
        slots: { front: "rapid-fire", rear: null, sidekickLeft: null, sidekickRight: null },
        unlockedWeapons: ["rapid-fire"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: "high", rechargeLevel: 1 }
      }).success
    ).toBe(false);
  });
});

describe("SavePayloadSchema", () => {
  it("accepts a full toSnapshot()-style payload", () => {
    expect(
      SavePayloadSchema.safeParse({
        credits: 0,
        completedMissions: ["tutorial"],
        unlockedPlanets: ["tutorial", "shop"],
        playedTimeSeconds: 0,
        ship: {
          slots: {
            front: "rapid-fire",
            rear: null,
            sidekickLeft: null,
            sidekickRight: null
          },
          unlockedWeapons: ["rapid-fire"],
          weaponLevels: {},
          weaponAugments: {},
          augmentInventory: [],
          shieldLevel: 0,
          armorLevel: 0,
          reactor: { capacityLevel: 0, rechargeLevel: 0 }
        },
        saveSlot: 1,
        currentSolarSystemId: "tutorial",
        unlockedSolarSystems: ["tutorial"]
      }).success
    ).toBe(true);
  });

  it("rejects unknown mission ids in completedMissions", () => {
    expect(
      SavePayloadSchema.safeParse({
        completedMissions: ["totally-fake-mission"]
      }).success
    ).toBe(false);
  });

  it("rejects negative credits", () => {
    expect(SavePayloadSchema.safeParse({ credits: -1 }).success).toBe(false);
  });
});

describe("RemoteSaveSchema", () => {
  it("accepts the canonical shape from GET /api/save", () => {
    expect(
      RemoteSaveSchema.safeParse({
        slot: 1,
        credits: 100,
        currentPlanet: "tutorial",
        shipConfig: {
          slots: {
            front: "rapid-fire",
            rear: null,
            sidekickLeft: null,
            sidekickRight: null
          },
          unlockedWeapons: ["rapid-fire"],
          weaponLevels: {},
          weaponAugments: {},
          augmentInventory: [],
          shieldLevel: 0,
          armorLevel: 0,
          reactor: { capacityLevel: 0, rechargeLevel: 0 }
        },
        completedMissions: [],
        unlockedPlanets: ["tutorial"],
        playedTimeSeconds: 0,
        updatedAt: "2026-04-26T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("accepts a row whose shipConfig is still in the legacy shape", () => {
    expect(
      RemoteSaveSchema.safeParse({
        slot: 1,
        credits: 0,
        currentPlanet: null,
        shipConfig: {
          primaryWeapon: "rapid-fire",
          unlockedWeapons: ["rapid-fire"],
          shieldLevel: 0,
          armorLevel: 0
        },
        completedMissions: [],
        unlockedPlanets: ["tutorial"],
        playedTimeSeconds: 0,
        updatedAt: "2026-04-26T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("rejects when shipConfig is missing entirely", () => {
    expect(
      RemoteSaveSchema.safeParse({
        slot: 1,
        credits: 0,
        currentPlanet: null,
        completedMissions: [],
        unlockedPlanets: [],
        playedTimeSeconds: 0,
        updatedAt: "2026-04-26T00:00:00.000Z"
      }).success
    ).toBe(false);
  });
});

describe("ScorePayloadSchema", () => {
  it("accepts a typical leaderboard submission", () => {
    expect(
      ScorePayloadSchema.safeParse({
        missionId: "combat-1",
        score: 1234,
        timeSeconds: 90
      }).success
    ).toBe(true);
  });

  it("rejects an empty mission id", () => {
    expect(
      ScorePayloadSchema.safeParse({ missionId: "", score: 1 }).success
    ).toBe(false);
  });

  it("rejects a non-integer score", () => {
    expect(
      ScorePayloadSchema.safeParse({ missionId: "combat-1", score: 1.5 }).success
    ).toBe(false);
  });
});

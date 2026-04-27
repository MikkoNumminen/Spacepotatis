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
  it("accepts a single-slot array (the default ship)", () => {
    expect(WeaponSlotsSchema.safeParse(["rapid-fire"]).success).toBe(true);
  });

  it("accepts a multi-slot array with empty slots", () => {
    expect(
      WeaponSlotsSchema.safeParse(["rapid-fire", null, "spread-shot"]).success
    ).toBe(true);
  });

  it("rejects an empty array", () => {
    expect(WeaponSlotsSchema.safeParse([]).success).toBe(false);
  });

  it("rejects an unknown weapon id", () => {
    expect(WeaponSlotsSchema.safeParse(["death-laser"]).success).toBe(false);
  });

  it("rejects a numeric slot value", () => {
    expect(WeaponSlotsSchema.safeParse([42]).success).toBe(false);
  });

  it("rejects an array longer than MAX_WEAPON_SLOTS", () => {
    const oversized = new Array<null>(10).fill(null);
    expect(WeaponSlotsSchema.safeParse(oversized).success).toBe(false);
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
  it("accepts a well-formed new-shape ship (array slots)", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: ["rapid-fire", null],
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

  it("rejects an empty slots array (must always have at least one slot)", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: [],
        unlockedWeapons: ["rapid-fire"],
        weaponLevels: {},
        weaponAugments: {},
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(false);
  });

  it("rejects unknown weapon ids inside slots", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: ["death-laser"],
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
        slots: ["rapid-fire"],
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

  it("accepts a degenerate snapshot — migrateShip fills in defaults", () => {
    // Some old POSTs stored `shipConfig: {}` because of a payload-shape
    // mismatch between client and server. We can't lose those players'
    // credits / completedMissions just because their ship blob is empty;
    // migrateShip seeds DEFAULT_SHIP for any missing field.
    expect(LegacyShipSchema.safeParse({}).success).toBe(true);
    expect(
      LegacyShipSchema.safeParse({
        unlockedWeapons: ["rapid-fire"]
      }).success
    ).toBe(true);
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
  it("accepts a strict ShipConfig (array slots)", () => {
    const r = LegacyOrShipConfigSchema.safeParse({
      slots: ["rapid-fire"],
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

  it("accepts degenerate ship objects so migrateShip can repair them", () => {
    // The legacy fallback is intentionally permissive — every field is
    // optional. Strict cleanup happens in migrateShip, not at the schema
    // boundary, so a malformed shipConfig never costs us valid credits or
    // completedMissions on the same row.
    expect(LegacyOrShipConfigSchema.safeParse({}).success).toBe(true);
    expect(
      LegacyOrShipConfigSchema.safeParse({ primaryWeapon: "rapid-fire" }).success
    ).toBe(true);
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

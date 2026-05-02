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
  WeaponInstanceSchema,
  WeaponInventorySchema,
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

// Hoisted reusable fixtures — these well-formed shapes appear in many
// describes; inlining them per-test obscures the deviation each case is
// testing.
const VALID_INSTANCE = { id: "rapid-fire", level: 1, augments: [] } as const;
const VALID_SHIP_CONFIG = {
  slots: [{ id: "rapid-fire", level: 1, augments: [] }],
  inventory: [],
  augmentInventory: [],
  shieldLevel: 0,
  armorLevel: 0,
  reactor: { capacityLevel: 0, rechargeLevel: 0 }
} as const;
const VALID_REMOTE_SAVE = {
  slot: 1,
  credits: 0,
  currentPlanet: null,
  shipConfig: VALID_SHIP_CONFIG,
  completedMissions: [],
  unlockedPlanets: ["tutorial"],
  playedTimeSeconds: 0,
  updatedAt: "2026-04-26T00:00:00.000Z"
} as const;

describe("WeaponInstanceSchema", () => {
  it("accepts a well-formed instance", () => {
    expect(WeaponInstanceSchema.safeParse(VALID_INSTANCE).success).toBe(true);
  });

  it("accepts an instance with augments", () => {
    expect(
      WeaponInstanceSchema.safeParse({
        id: "pulse-cannon",
        level: 3,
        augments: ["damage-up", "fire-rate-up"]
      }).success
    ).toBe(false); // pulse-cannon isn't a known id
    expect(
      WeaponInstanceSchema.safeParse({
        id: "rapid-fire",
        level: 3,
        augments: ["damage-up", "fire-rate-up"]
      }).success
    ).toBe(true);
  });

  it.each([
    { label: "level 0 (below minimum)", input: { id: "rapid-fire", level: 0, augments: [] } },
    { label: "level above MAX_LEVEL (6 > 5)", input: { id: "rapid-fire", level: 6, augments: [] } },
    { label: "unknown weapon id", input: { id: "death-laser", level: 1, augments: [] } },
    { label: "unknown augment id", input: { id: "rapid-fire", level: 1, augments: ["bogus-augment"] } }
  ])("rejects $label", ({ input }) => {
    expect(WeaponInstanceSchema.safeParse(input).success).toBe(false);
  });
});

describe("WeaponInventorySchema", () => {
  it("accepts an empty inventory", () => {
    expect(WeaponInventorySchema.safeParse([]).success).toBe(true);
  });

  it("accepts an inventory with multiple instances", () => {
    expect(
      WeaponInventorySchema.safeParse([
        { id: "rapid-fire", level: 1, augments: [] },
        { id: "spread-shot", level: 2, augments: ["damage-up"] }
      ]).success
    ).toBe(true);
  });

  it("rejects an inventory containing a malformed instance", () => {
    expect(
      WeaponInventorySchema.safeParse([
        { id: "rapid-fire", level: 1, augments: [] },
        { id: "rapid-fire", level: 99, augments: [] }
      ]).success
    ).toBe(false);
  });
});

describe("WeaponSlotsSchema", () => {
  it("accepts a single-slot array (the default ship)", () => {
    expect(
      WeaponSlotsSchema.safeParse([
        { id: "rapid-fire", level: 1, augments: [] }
      ]).success
    ).toBe(true);
  });

  it("accepts a multi-slot array with empty slots", () => {
    expect(
      WeaponSlotsSchema.safeParse([
        { id: "rapid-fire", level: 1, augments: [] },
        null,
        { id: "spread-shot", level: 3, augments: ["damage-up"] }
      ]).success
    ).toBe(true);
  });

  it.each([
    { label: "an empty array", input: [] },
    { label: "an unknown weapon id", input: [{ id: "death-laser", level: 1, augments: [] }] },
    { label: "a numeric slot value", input: [42] },
    { label: "a bare string slot value (must be an instance object now)", input: ["rapid-fire"] },
    { label: "an array longer than MAX_WEAPON_SLOTS", input: new Array<null>(10).fill(null) }
  ])("rejects $label", ({ input }) => {
    expect(WeaponSlotsSchema.safeParse(input).success).toBe(false);
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
        slots: [
          { id: "rapid-fire", level: 3, augments: ["damage-up"] },
          null
        ],
        inventory: [],
        augmentInventory: ["fire-rate-up"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(true);
  });

  it("accepts a config with a non-empty inventory", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: [{ id: "rapid-fire", level: 1, augments: [] }],
        inventory: [
          { id: "spread-shot", level: 2, augments: [] },
          { id: "rapid-fire", level: 4, augments: ["damage-up"] }
        ],
        augmentInventory: [],
        shieldLevel: 1,
        armorLevel: 2,
        reactor: { capacityLevel: 1, rechargeLevel: 1 }
      }).success
    ).toBe(true);
  });

  it("rejects an empty slots array (must always have at least one slot)", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: [],
        inventory: [],
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
        slots: [{ id: "death-laser", level: 1, augments: [] }],
        inventory: [],
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
        slots: [{ id: "rapid-fire", level: 1, augments: [] }],
        inventory: [],
        augmentInventory: ["bogus-augment"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(false);
  });

  it("rejects when inventory is missing", () => {
    expect(
      ShipConfigSchema.safeParse({
        slots: [{ id: "rapid-fire", level: 1, augments: [] }],
        augmentInventory: [],
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

  it("accepts the OLD id-array slots + unlockedWeapons + weaponLevels + weaponAugments shape", () => {
    // This shape pre-dates the instance refactor. The schema accepts it as
    // legacy data; migrateShip in persistence.ts hoists the per-id state
    // into per-instance state.
    expect(
      LegacyShipSchema.safeParse({
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

  it("accepts the NEW instance shape too (legacy schema is permissive)", () => {
    expect(
      LegacyShipSchema.safeParse({
        slots: [{ id: "rapid-fire", level: 1, augments: [] }, null],
        inventory: [{ id: "spread-shot", level: 2, augments: [] }],
        augmentInventory: ["fire-rate-up"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }).success
    ).toBe(true);
  });
});

describe("LegacyOrShipConfigSchema (used for shipConfig round-trip)", () => {
  it("accepts a strict new-shape ShipConfig (instance array slots)", () => {
    const r = LegacyOrShipConfigSchema.safeParse({
      slots: [{ id: "rapid-fire", level: 1, augments: [] }],
      inventory: [],
      augmentInventory: [],
      shieldLevel: 0,
      armorLevel: 0,
      reactor: { capacityLevel: 0, rechargeLevel: 0 }
    });
    expect(r.success).toBe(true);
  });

  it("accepts the OLD id-array slots + unlockedWeapons shape", () => {
    const r = LegacyOrShipConfigSchema.safeParse({
      slots: ["rapid-fire", null],
      unlockedWeapons: ["rapid-fire"],
      weaponLevels: { "rapid-fire": 3 },
      weaponAugments: { "rapid-fire": ["damage-up"] },
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
  it("accepts a full toSnapshot()-style payload (new instance shape)", () => {
    expect(
      SavePayloadSchema.safeParse({
        credits: 0,
        completedMissions: ["tutorial"],
        unlockedPlanets: ["tutorial", "shop"],
        playedTimeSeconds: 0,
        ship: {
          slots: [{ id: "rapid-fire", level: 1, augments: [] }],
          inventory: [],
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

  // Each row pins one rejected enum / numeric-bound branch in SavePayloadSchema.
  // Nothing here is a "same invariant from a different angle" — every case
  // exercises a distinct field constraint.
  it.each([
    { label: "unknown mission id in completedMissions", input: { completedMissions: ["totally-fake-mission"] } },
    { label: "negative credits", input: { credits: -1 } },
    { label: "negative playedTimeSeconds (z.number().int().nonnegative())", input: { playedTimeSeconds: -1 } },
    { label: "non-integer playedTimeSeconds", input: { playedTimeSeconds: 0.5 } },
    { label: "non-integer saveSlot (z.number().int().positive())", input: { saveSlot: 1.5 } },
    { label: "saveSlot of 0 (must be positive)", input: { saveSlot: 0 } },
    { label: "negative saveSlot", input: { saveSlot: -1 } },
    { label: "unknown currentPlanet (not in MissionId enum)", input: { currentPlanet: "evil" } },
    { label: "unknown currentSolarSystemId", input: { currentSolarSystemId: "nowhere" } },
    { label: "unknown system id inside unlockedSolarSystems", input: { unlockedSolarSystems: ["tutorial", "nowhere"] } }
  ])("rejects $label", ({ input }) => {
    expect(SavePayloadSchema.safeParse(input).success).toBe(false);
  });

  it("accepts currentPlanet: null (the field is nullable)", () => {
    expect(SavePayloadSchema.safeParse({ currentPlanet: null }).success).toBe(true);
  });

  it("round-trips a minimal payload via parse() (no thrown ZodError)", () => {
    const parsed = SavePayloadSchema.parse({ credits: 0 });
    expect(parsed.credits).toBe(0);
  });
});

describe("RemoteSaveSchema additional rejection contracts", () => {
  it.each([
    { label: "updatedAt is not a string (e.g. null)", overrides: { updatedAt: null } },
    {
      // The schema declares updatedAt as z.string() — anything else fails.
      label: "updatedAt is a number (Postgres driver returning epoch ms)",
      overrides: { updatedAt: 1714000000000 }
    },
    { label: "negative credits in a remote save", overrides: { credits: -100 } },
    { label: "non-integer slot", overrides: { slot: 1.5 } }
  ])("rejects when $label", ({ overrides }) => {
    expect(
      RemoteSaveSchema.safeParse({ ...VALID_REMOTE_SAVE, ...overrides }).success
    ).toBe(false);
  });

  it("accepts a malformed-but-string updatedAt at the schema layer (validation deferred to validatePlaytimeDelta)", () => {
    // The schema only checks z.string(); the actual ISO-8601 parsing is
    // deferred to the validators. Pinning this so changing it later is a
    // deliberate decision rather than a quiet drift.
    expect(
      RemoteSaveSchema.safeParse({ ...VALID_REMOTE_SAVE, updatedAt: "not-a-date" }).success
    ).toBe(true);
  });

  it("round-trips a remote save via parse()", () => {
    const parsed = RemoteSaveSchema.parse(VALID_REMOTE_SAVE);
    expect(parsed.slot).toBe(1);
    expect(parsed.unlockedPlanets).toEqual(["tutorial"]);
  });
});

describe("RemoteSaveSchema", () => {
  it("accepts the canonical shape from GET /api/save (new instance shape)", () => {
    expect(
      RemoteSaveSchema.safeParse({
        slot: 1,
        credits: 100,
        currentPlanet: "tutorial",
        shipConfig: {
          slots: [{ id: "rapid-fire", level: 1, augments: [] }],
          inventory: [],
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

  it("accepts a row whose shipConfig is still in the OLD id-array + per-id-state shape", () => {
    expect(
      RemoteSaveSchema.safeParse({
        slot: 1,
        credits: 0,
        currentPlanet: null,
        shipConfig: {
          slots: ["rapid-fire", null],
          unlockedWeapons: ["rapid-fire"],
          weaponLevels: { "rapid-fire": 2 },
          weaponAugments: { "rapid-fire": ["damage-up"] },
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

  it.each([
    { label: "an empty mission id", input: { missionId: "", score: 1 } },
    { label: "a non-integer score", input: { missionId: "combat-1", score: 1.5 } },
    {
      // Closes a hand-crafted POST hole — without the enum check, an attacker
      // could submit fake mission ids to top the leaderboard.
      label: "mission ids not in the enum",
      input: { missionId: "evil-cheat-mission", score: 1 }
    }
  ])("rejects $label", ({ input }) => {
    expect(ScorePayloadSchema.safeParse(input).success).toBe(false);
  });
});

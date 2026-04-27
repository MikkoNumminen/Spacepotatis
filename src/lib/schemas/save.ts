// Runtime schemas for the save round-trip. The TypeScript types in
// src/game/state/ShipConfig.ts and src/types/game.ts stay the canonical
// compile-time source of truth; these schemas mirror them at runtime so the
// /api/save boundary actually rejects malformed payloads instead of writing
// them straight to Postgres jsonb.
//
// Keep schema field shapes 1:1 with the TS types — the matching tests under
// src/lib/schemas/save.test.ts assert structural equality so drift gets
// caught at CI rather than in production.

import { z } from "zod";

import type {
  AugmentId,
  MissionId,
  SolarSystemId,
  WeaponId
} from "@/types/game";
import type {
  ReactorConfig,
  ShipConfig,
  WeaponSlots
} from "@/game/state/ShipConfig";

// ---------------------------------------------------------------------------
// ID enums — mirror the literal unions in src/types/game.ts. If you add a new
// id to either union, add it here too; the test file enforces equality via a
// structural assertion.
// ---------------------------------------------------------------------------

export const WEAPON_IDS = [
  "rapid-fire",
  "spread-shot",
  "heavy-cannon",
  "spud-missile",
  "tater-net",
  "tail-gunner",
  "side-spitter",
  "plasma-whip",
  "hailstorm"
] as const satisfies readonly WeaponId[];

export const AUGMENT_IDS = [
  "damage-up",
  "fire-rate-up",
  "extra-projectile",
  "energy-down",
  "homing-up"
] as const satisfies readonly AugmentId[];

export const MISSION_IDS = [
  "tutorial",
  "combat-1",
  "boss-1",
  "shop",
  "pirate-beacon",
  "ember-run",
  "burnt-spud",
  "tubernovae-outpost"
] as const satisfies readonly MissionId[];

export const SOLAR_SYSTEM_IDS = [
  "tutorial",
  "tubernovae"
] as const satisfies readonly SolarSystemId[];

export const WeaponIdSchema = z.enum(WEAPON_IDS);
export const AugmentIdSchema = z.enum(AUGMENT_IDS);
export const MissionIdSchema = z.enum(MISSION_IDS);
export const SolarSystemIdSchema = z.enum(SOLAR_SYSTEM_IDS);

// ---------------------------------------------------------------------------
// Ship sub-schemas — strict shape for a fully-migrated ShipConfig.
// ---------------------------------------------------------------------------

// New strict shape: variable-length array of (WeaponId | null) entries.
// One slot at minimum (slot 0); the player buys more via buyWeaponSlot().
export const WeaponSlotsSchema = z.array(WeaponIdSchema.nullable()).min(1);

export const ReactorConfigSchema = z.object({
  capacityLevel: z.number().int().nonnegative(),
  rechargeLevel: z.number().int().nonnegative()
});

// Sparse maps keyed by WeaponId — z.partialRecord keeps the key set
// constrained to known weapons without requiring every weapon be present
// (z.record on an enum is exhaustive in Zod 4).
export const WeaponLevelsSchema = z.partialRecord(
  WeaponIdSchema,
  z.number().int().positive()
);

export const WeaponAugmentsSchema = z.partialRecord(
  WeaponIdSchema,
  z.array(AugmentIdSchema)
);

export const ShipConfigSchema = z.object({
  slots: WeaponSlotsSchema,
  unlockedWeapons: z.array(WeaponIdSchema),
  weaponLevels: WeaponLevelsSchema,
  weaponAugments: WeaponAugmentsSchema,
  augmentInventory: z.array(AugmentIdSchema),
  shieldLevel: z.number().int().nonnegative(),
  armorLevel: z.number().int().nonnegative(),
  reactor: ReactorConfigSchema
});

// Compile-time guard rails — these unused locals will fail to typecheck if a
// schema drifts out of structural sync with the canonical TS type. We can't
// use `satisfies z.ZodType<T>` directly on a z.object() because Zod's input
// vs output types make that assertion too narrow on optional/nullable fields.
type _WeaponSlots = z.infer<typeof WeaponSlotsSchema>;
type _ReactorConfig = z.infer<typeof ReactorConfigSchema>;
type _ShipConfig = z.infer<typeof ShipConfigSchema>;
const _weaponSlotsCheck = (x: _WeaponSlots): WeaponSlots => x;
const _reactorCheck = (x: _ReactorConfig): ReactorConfig => x;
const _shipCheck = (x: _ShipConfig): ShipConfig => x;
void _weaponSlotsCheck;
void _reactorCheck;
void _shipCheck;

// ---------------------------------------------------------------------------
// Legacy ship snapshot — the loadout refactor introduced `slots` + `reactor`
// in place of `primaryWeapon`. Old saves still living in Postgres look like
// `{ primaryWeapon, unlockedWeapons, shieldLevel, armorLevel }` with no
// reactor and no slots. They flow through GameState.migrateShip on hydrate,
// which does the strict cleanup (drops unknown ids, clamps levels). The
// schema only needs to accept the loose shape so migration can run.
// ---------------------------------------------------------------------------

export const LegacyShipSchema = z
  .object({
    primaryWeapon: z.string().optional(),
    slots: z
      .union([
        z.array(z.string().nullable()),
        z.object({
          front: z.string().nullable().optional(),
          rear: z.string().nullable().optional(),
          sidekickLeft: z.string().nullable().optional(),
          sidekickRight: z.string().nullable().optional()
        })
      ])
      .optional(),
    unlockedWeapons: z.array(z.string()),
    weaponLevels: z.record(z.string(), z.number().finite()).optional(),
    // Legacy snapshots may carry unknown augment ids; migrateShip filters
    // them. So accept arbitrary string lists here.
    weaponAugments: z.record(z.string(), z.array(z.string())).optional(),
    augmentInventory: z.array(z.string()).optional(),
    shieldLevel: z.number(),
    armorLevel: z.number(),
    reactor: z
      .object({
        capacityLevel: z.number(),
        rechargeLevel: z.number()
      })
      .optional()
  })
  .refine(
    (s) => Boolean(s.slots) || typeof s.primaryWeapon === "string",
    {
      message:
        "ship snapshot must include either `slots` (new shape) or `primaryWeapon` (legacy shape)"
    }
  );

// Discriminated by structural fit: the new strict schema wins when the
// payload is well-formed; otherwise the legacy fallback parses it so
// migrateShip can do the cleanup.
export const LegacyOrShipConfigSchema = ShipConfigSchema.or(LegacyShipSchema);

// ---------------------------------------------------------------------------
// Save payload — body of POST /api/save. Matches what GameState.toSnapshot()
// produces today plus a couple of forward-looking optional fields the route
// accepts. The shape stays permissive on cross-field correlation (e.g. we
// don't assert `currentPlanet` is one of `unlockedPlanets`); the server
// stores the snapshot whole and the client validates again on load.
// ---------------------------------------------------------------------------

export const SavePayloadSchema = z.object({
  credits: z.number().int().nonnegative().optional(),
  currentPlanet: MissionIdSchema.nullable().optional(),
  shipConfig: LegacyOrShipConfigSchema.optional(),
  // Snapshot also carries `ship` (the StateSnapshot field name) — accept
  // both names so toSnapshot() can be sent verbatim. The route only writes
  // `shipConfig`, so we coalesce when reading.
  ship: LegacyOrShipConfigSchema.optional(),
  completedMissions: z.array(MissionIdSchema).optional(),
  unlockedPlanets: z.array(MissionIdSchema).optional(),
  playedTimeSeconds: z.number().int().nonnegative().optional(),
  saveSlot: z.number().int().positive().optional(),
  currentSolarSystemId: SolarSystemIdSchema.optional(),
  unlockedSolarSystems: z.array(SolarSystemIdSchema).optional()
});

export type SavePayload = z.infer<typeof SavePayloadSchema>;

// ---------------------------------------------------------------------------
// Remote save — body of GET /api/save. The Postgres row becomes this JSON
// before the client deserializes it back into a snapshot via hydrate().
// shipConfig comes out of jsonb so it may be either shape; we lean on the
// legacy/new union and let migrateShip clean it up.
// ---------------------------------------------------------------------------

export const RemoteSaveSchema = z.object({
  slot: z.number().int().positive(),
  credits: z.number().int().nonnegative(),
  currentPlanet: MissionIdSchema.nullable(),
  shipConfig: LegacyOrShipConfigSchema,
  completedMissions: z.array(MissionIdSchema),
  unlockedPlanets: z.array(MissionIdSchema),
  playedTimeSeconds: z.number().int().nonnegative(),
  updatedAt: z.string()
});

export type RemoteSave = z.infer<typeof RemoteSaveSchema>;

// ---------------------------------------------------------------------------
// Leaderboard score submission — body of POST /api/leaderboard. Mission ids
// are intentionally permissive (z.string) to match the route's existing
// behavior: legacy mission ids from older deploys still need to be accepted
// because the leaderboard table itself is the source of truth.
// ---------------------------------------------------------------------------

export const ScorePayloadSchema = z.object({
  missionId: z.string().min(1),
  score: z.number().int(),
  timeSeconds: z.number().int().nonnegative().optional()
});

export type ScorePayload = z.infer<typeof ScorePayloadSchema>;

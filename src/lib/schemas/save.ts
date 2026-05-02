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
  SolarSystemId
} from "@/types/game";
import type {
  ReactorConfig,
  ShipConfig,
  WeaponInstance,
  WeaponInventory,
  WeaponSlots
} from "@/game/state/ShipConfig";
import { MAX_LEVEL, MAX_WEAPON_SLOTS } from "@/game/state/ShipConfig";
import { WEAPON_IDS } from "@/game/data/weapons";

// Re-export for tests + back-compat with existing imports.
export { WEAPON_IDS };

// ---------------------------------------------------------------------------
// ID enums — mirror the literal unions in src/types/game.ts. If you add a new
// id to either union, add it here too; the test file enforces equality via a
// structural assertion. WEAPON_IDS lives in src/game/data/weapons.ts so
// client-side persistence helpers can do membership checks without pulling
// Zod into their bundle (~98 kB saving).
// ---------------------------------------------------------------------------

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
  "market",
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

// One owned weapon = one instance with its own level + augments. Two of the
// same weapon id are two independent instances.
export const WeaponInstanceSchema = z.object({
  id: WeaponIdSchema,
  level: z.number().int().min(1).max(MAX_LEVEL),
  augments: z.array(AugmentIdSchema)
});

// Variable-length array of slots. Each entry is either an equipped instance
// or null (slot owned but empty). One slot at minimum (slot 0); the player
// buys more via buyWeaponSlot(), capped at MAX_WEAPON_SLOTS so a tampered
// save can't trash the loadout UI.
export const WeaponSlotsSchema = z
  .array(WeaponInstanceSchema.nullable())
  .min(1)
  .max(MAX_WEAPON_SLOTS);

// Unequipped instances. Order is acquisition order so picker UIs stay stable.
export const WeaponInventorySchema = z.array(WeaponInstanceSchema);

export const ReactorConfigSchema = z.object({
  capacityLevel: z.number().int().nonnegative(),
  rechargeLevel: z.number().int().nonnegative()
});

export const ShipConfigSchema = z.object({
  slots: WeaponSlotsSchema,
  inventory: WeaponInventorySchema,
  augmentInventory: z.array(AugmentIdSchema),
  shieldLevel: z.number().int().nonnegative(),
  armorLevel: z.number().int().nonnegative(),
  reactor: ReactorConfigSchema
});

// Compile-time guard rails — these unused locals will fail to typecheck if a
// schema drifts out of structural sync with the canonical TS type. We can't
// use `satisfies z.ZodType<T>` directly on a z.object() because Zod's input
// vs output types make that assertion too narrow on optional/nullable fields.
type _WeaponInstance = z.infer<typeof WeaponInstanceSchema>;
type _WeaponSlots = z.infer<typeof WeaponSlotsSchema>;
type _WeaponInventory = z.infer<typeof WeaponInventorySchema>;
type _ReactorConfig = z.infer<typeof ReactorConfigSchema>;
type _ShipConfig = z.infer<typeof ShipConfigSchema>;
const _weaponInstanceCheck = (x: _WeaponInstance): WeaponInstance => x;
const _weaponSlotsCheck = (x: _WeaponSlots): WeaponSlots => x;
const _weaponInventoryCheck = (x: _WeaponInventory): WeaponInventory => x;
const _reactorCheck = (x: _ReactorConfig): ReactorConfig => x;
const _shipCheck = (x: _ShipConfig): ShipConfig => x;
void _weaponInstanceCheck;
void _weaponSlotsCheck;
void _weaponInventoryCheck;
void _reactorCheck;
void _shipCheck;

// ---------------------------------------------------------------------------
// Legacy ship snapshot — historic shapes still living in Postgres rows. The
// loadout refactor introduced `slots` + `reactor`; the instance refactor then
// replaced unlockedWeapons + weaponLevels + weaponAugments with per-instance
// state. Old saves can look like any of:
//   - new instance shape: { slots: WeaponInstance[], inventory: WeaponInstance[], ... }
//   - id-array slots: { slots: (WeaponId | null)[], unlockedWeapons, weaponLevels, weaponAugments, ... }
//   - named slots: { slots: { front, rear, sidekickLeft, sidekickRight }, ... }
//   - pre-loadout: { primaryWeapon, ... }
// They all flow through migrateShip on hydrate, which does the strict cleanup
// (drops unknown ids, clamps levels, hoists per-id state into instances). The
// schema only needs to accept the loose shape so migration can run.
// ---------------------------------------------------------------------------

// Permissive instance shape used inside legacy snapshots. id/level/augments
// are all optional because some persisted rows had partial writes; migrateShip
// fills the gaps with newWeaponInstance defaults.
const LegacyWeaponInstanceSchema = z.object({
  id: z.string().optional(),
  level: z.number().optional(),
  augments: z.array(z.string()).optional()
});

// Every field is optional — the schema's job here is just to pass the data
// through to migrateShip, which fills in DEFAULT_SHIP defaults for anything
// missing. We used to require `unlockedWeapons` plus `slots`-or-`primaryWeapon`,
// but that rejected save rows whose `shipConfig` was a degenerate `{}` (an
// older POST bug stored that for some accounts), and the rejection cascaded
// into the entire RemoteSaveSchema parse — losing the player's credits and
// completed missions even though those fields were fine. Permissive shape
// here + strict cleanup in migrateShip is the right split.
export const LegacyShipSchema = z.object({
  primaryWeapon: z.string().optional(),
  slots: z
    .union([
      // New instance-shape slots OR legacy id-string slots — accept both as
      // a single union of nullable entries. migrateShip distinguishes by
      // checking typeof at runtime.
      z.array(z.union([z.string(), LegacyWeaponInstanceSchema, z.null()])),
      z.object({
        front: z.string().nullable().optional(),
        rear: z.string().nullable().optional(),
        sidekickLeft: z.string().nullable().optional(),
        sidekickRight: z.string().nullable().optional()
      })
    ])
    .optional(),
  inventory: z.array(LegacyWeaponInstanceSchema).optional(),
  unlockedWeapons: z.array(z.string()).optional(),
  weaponLevels: z.record(z.string(), z.number().finite()).optional(),
  // Legacy snapshots may carry unknown augment ids; migrateShip filters
  // them. So accept arbitrary string lists here.
  weaponAugments: z.record(z.string(), z.array(z.string())).optional(),
  augmentInventory: z.array(z.string()).optional(),
  shieldLevel: z.number().optional(),
  armorLevel: z.number().optional(),
  reactor: z
    .object({
      capacityLevel: z.number(),
      rechargeLevel: z.number()
    })
    .optional()
});

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
  unlockedSolarSystems: z.array(SolarSystemIdSchema).optional(),
  // Free-form string list — story IDs are validated against the actual
  // catalog inside hydrate() (isKnownStoryId), so the schema only checks
  // the array shape. Unknown ids fall out client-side and never reach
  // the live state.
  seenStoryEntries: z.array(z.string()).optional()
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
  seenStoryEntries: z.array(z.string()).optional(),
  updatedAt: z.string()
});

export type RemoteSave = z.infer<typeof RemoteSaveSchema>;

// ---------------------------------------------------------------------------
// Leaderboard score submission — body of POST /api/leaderboard. Tightened
// to the MissionId enum (was z.string) so a hand-crafted POST can't seed
// the leaderboard with arbitrary strings. Legacy ids in the table itself
// are still readable on GET because that path doesn't parse via this
// schema; only writes are gated.
// ---------------------------------------------------------------------------

export const ScorePayloadSchema = z.object({
  missionId: MissionIdSchema,
  score: z.number().int(),
  timeSeconds: z.number().int().nonnegative().optional()
});

export type ScorePayload = z.infer<typeof ScorePayloadSchema>;

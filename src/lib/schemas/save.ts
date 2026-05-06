// Runtime schemas for the save round-trip. The TypeScript types in
// src/game/state/ShipConfig.ts and src/types/game.ts stay the canonical
// compile-time source of truth; these schemas mirror them at runtime so the
// /api/save boundary actually rejects malformed payloads instead of writing
// them straight to Postgres jsonb.
//
// Keep schema field shapes 1:1 with the TS types — the matching tests under
// src/lib/schemas/save.test.ts assert structural equality so drift gets
// caught at CI rather than in production.
//
// PUBLIC API — every export below is part of the `schemas` module contract.
//   The schemas listed in docs/audit/02-target-architecture.md ("Module:
//   schemas") are @stable. The compile-time drift guards at the bottom are
//   @internal.
//   See ./README.md for the rationale.
//
// AI-NOTE: Do NOT call .parse() on JSON catalogs at module load. Catalog
//   schemas (weapons / enemies / missions / waves / solarSystems) run only
//   from the CI drift gate in src/game/data/__tests__/jsonSchemaValidation.test.ts.
//   Pulling Zod into the static-page bundle costs ~98 kB per route.

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

/**
 * Re-export of the canonical `WEAPON_IDS` runtime list.
 *
 * The list itself lives in `src/game/data/weapons.ts` so client-side
 * persistence helpers can do membership checks without pulling Zod into
 * their bundle (~98 kB saving). Re-exported here for tests + back-compat
 * with existing imports of `WEAPON_IDS` from this file.
 *
 * @stable
 */
export { WEAPON_IDS };

// ---------------------------------------------------------------------------
// ID enums — mirror the literal unions in src/types/game.ts. If you add a new
// id to either union, add it here too; the test file enforces equality via a
// structural assertion. WEAPON_IDS lives in src/game/data/weapons.ts so
// client-side persistence helpers can do membership checks without pulling
// Zod into their bundle (~98 kB saving).
// ---------------------------------------------------------------------------

// INVARIANT: every `*_IDS` constant uses `as const satisfies readonly <Id>[]`
//   so the literal-union ↔ runtime-list lockstep is a compile error if it
//   drifts. Do NOT remove the satisfies clause.

/**
 * Runtime list of every `AugmentId` literal.
 *
 * Locked-in-lockstep with the `AugmentId` union in `src/types/game.ts` via
 * the `satisfies readonly AugmentId[]` clause. Powers `AugmentIdSchema`.
 *
 * @stable
 */
export const AUGMENT_IDS = [
  "damage-up",
  "fire-rate-up",
  "extra-projectile",
  "energy-down",
  "homing-up"
] as const satisfies readonly AugmentId[];

/**
 * Runtime list of every `MissionId` literal.
 *
 * Locked-in-lockstep with the `MissionId` union in `src/types/game.ts` via
 * the `satisfies readonly MissionId[]` clause. Powers `MissionIdSchema`.
 *
 * @stable
 */
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

/**
 * Runtime list of every `SolarSystemId` literal.
 *
 * Locked-in-lockstep with the `SolarSystemId` union in `src/types/game.ts`
 * via the `satisfies readonly SolarSystemId[]` clause. Powers
 * `SolarSystemIdSchema`.
 *
 * @stable
 */
export const SOLAR_SYSTEM_IDS = [
  "tutorial",
  "tubernovae"
] as const satisfies readonly SolarSystemId[];

/**
 * Zod enum validator for `WeaponId`.
 *
 * Used by every catalog schema that references a weapon (waves, save).
 *
 * @stable
 */
export const WeaponIdSchema = z.enum(WEAPON_IDS);

/**
 * Zod enum validator for `AugmentId`. Used inside `WeaponInstanceSchema`.
 *
 * @stable
 */
export const AugmentIdSchema = z.enum(AUGMENT_IDS);

/**
 * Zod enum validator for `MissionId`.
 *
 * Used by `SavePayloadSchema` and `ScorePayloadSchema` to reject hand-crafted
 * POSTs that try to seed unknown mission ids into the leaderboard or save.
 *
 * @stable
 */
export const MissionIdSchema = z.enum(MISSION_IDS);

/**
 * Zod enum validator for `SolarSystemId`.
 *
 * Used inside `SavePayloadSchema` and `RemoteSaveSchema`.
 *
 * @stable
 */
export const SolarSystemIdSchema = z.enum(SOLAR_SYSTEM_IDS);

// ---------------------------------------------------------------------------
// Ship sub-schemas — strict shape for a fully-migrated ShipConfig.
// ---------------------------------------------------------------------------

/**
 * One owned weapon — id + level + bound augments.
 *
 * Two of the same weapon id are two independent instances. `level` is
 * clamped to `MAX_LEVEL` so a tampered save can't push the upgrade math
 * past the curve. Mirrors `WeaponInstance` in `src/game/state/ShipConfig.ts`.
 *
 * @stable
 */
export const WeaponInstanceSchema = z.object({
  id: WeaponIdSchema,
  level: z.number().int().min(1).max(MAX_LEVEL),
  augments: z.array(AugmentIdSchema)
});

/**
 * Variable-length array of weapon slots — each entry is either an equipped
 * instance or `null` (slot owned but empty).
 *
 * One slot at minimum (slot 0); the player buys more via `buyWeaponSlot()`,
 * capped at `MAX_WEAPON_SLOTS` so a tampered save can't trash the loadout
 * UI. Mirrors `WeaponSlots` in `src/game/state/ShipConfig.ts`.
 *
 * @stable
 */
export const WeaponSlotsSchema = z
  .array(WeaponInstanceSchema.nullable())
  .min(1)
  .max(MAX_WEAPON_SLOTS);

/**
 * Unequipped owned-weapon instances.
 *
 * Order is acquisition order so picker UIs stay stable across loads.
 * Mirrors `WeaponInventory` in `src/game/state/ShipConfig.ts`.
 *
 * SEC-022 — bounded at 50 elements (current shop has ~10 weapons; 50 is
 * generous). Defense-in-depth: each element is already validated by
 * WeaponInstanceSchema, but an unbounded array is parseable by Zod at any
 * length — same pattern as SEC-011's seenStoryEntries cap.
 *
 * @stable
 */
export const WeaponInventorySchema = z.array(WeaponInstanceSchema).max(50);

/**
 * Reactor upgrade levels (capacity + recharge).
 *
 * Both nonnegative ints. Mirrors `ReactorConfig` in
 * `src/game/state/ShipConfig.ts`. Effective capacity / recharge values
 * are derived via `getMaxReactorCapacity()` / `getReactorRechargeRate()`.
 *
 * @stable
 */
export const ReactorConfigSchema = z.object({
  capacityLevel: z.number().int().nonnegative(),
  rechargeLevel: z.number().int().nonnegative()
});

/**
 * Strict shape for a fully-migrated `ShipConfig`.
 *
 * Combines slots + inventory + augmentInventory + shield + armor +
 * reactor. Used inside `LegacyOrShipConfigSchema` as the "well-formed"
 * branch. Mirrors `ShipConfig` in `src/game/state/ShipConfig.ts`.
 *
 * @stable
 */
export const ShipConfigSchema = z.object({
  slots: WeaponSlotsSchema,
  inventory: WeaponInventorySchema,
  augmentInventory: z.array(AugmentIdSchema),
  shieldLevel: z.number().int().nonnegative(),
  armorLevel: z.number().int().nonnegative(),
  reactor: ReactorConfigSchema
});

// INVARIANT: the function bodies below have no runtime effect — they exist
//   solely so tsc fails if a schema's inferred type stops being assignable
//   to the canonical TS interface. Removing them lets a renamed / retyped
//   field drift silently until production catches it.
// Compile-time guard rails — these unused locals will fail to typecheck if a
// schema drifts out of structural sync with the canonical TS type. We can't
// use `satisfies z.ZodType<T>` directly on a z.object() because Zod's input
// vs output types make that assertion too narrow on optional/nullable fields.
// @internal
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

// @internal — permissive instance shape used inside legacy snapshots. id /
// level / augments are all optional because some persisted rows had partial
// writes; migrateShip fills the gaps with newWeaponInstance defaults.
const LegacyWeaponInstanceSchema = z.object({
  id: z.string().optional(),
  level: z.number().optional(),
  augments: z.array(z.string()).optional()
});

/**
 * Permissive shape that accepts any historic ship snapshot shape Postgres
 * may still hold.
 *
 * The loadout refactor introduced `slots` + `reactor`; the instance refactor
 * then replaced unlockedWeapons + weaponLevels + weaponAugments with
 * per-instance state. Old saves can look like any of:
 * - new instance shape: `{ slots: WeaponInstance[], inventory, ... }`
 * - id-array slots: `{ slots: (WeaponId | null)[], unlockedWeapons, ... }`
 * - named slots: `{ slots: { front, rear, sidekickLeft, sidekickRight }, ... }`
 * - pre-loadout: `{ primaryWeapon, ... }`
 *
 * AI-NOTE: Every field is optional on purpose — the schema's job here is just
 * to pass the data through to `migrateShip()`, which fills in `DEFAULT_SHIP`
 * defaults. We used to require `unlockedWeapons` plus `slots`-or-`primaryWeapon`,
 * but that rejected save rows whose `shipConfig` was a degenerate `{}` (an
 * older POST bug stored that for some accounts), and the rejection cascaded
 * into the entire `RemoteSaveSchema` parse — losing the player's credits and
 * completed missions even though those fields were fine. Permissive shape
 * here + strict cleanup in `migrateShip` is the right split. **Don't tighten
 * this.**
 *
 * @stable
 */
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
  // SEC-016 — cap at 50 entries; current shop has ~10 weapons, 50 is generous.
  unlockedWeapons: z.array(z.string()).max(50).optional(),
  // SEC-016 — cap at 50 keys via superRefine; z.record has no built-in max().
  weaponLevels: z
    .record(z.string(), z.number().finite())
    .superRefine((rec, ctx) => {
      if (Object.keys(rec).length > 50) {
        ctx.addIssue({
          code: "custom",
          message: "weaponLevels may not exceed 50 keys"
        });
      }
    })
    .optional(),
  // Legacy snapshots may carry unknown augment ids; migrateShip filters
  // them. So accept arbitrary string lists here.
  // SEC-016 — cap at 50 keys via superRefine; same pattern as weaponLevels.
  weaponAugments: z
    .record(z.string(), z.array(z.string()))
    .superRefine((rec, ctx) => {
      if (Object.keys(rec).length > 50) {
        ctx.addIssue({
          code: "custom",
          message: "weaponAugments may not exceed 50 keys"
        });
      }
    })
    .optional(),
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

/**
 * Union accepting either the strict `ShipConfigSchema` or the permissive
 * `LegacyShipSchema`.
 *
 * Discriminated by structural fit: the new strict schema wins when the
 * payload is well-formed; otherwise the legacy fallback parses it so
 * `migrateShip()` can do the cleanup. Used everywhere a ship snapshot
 * crosses the wire (`SavePayloadSchema.shipConfig`, `RemoteSaveSchema.shipConfig`).
 *
 * @stable
 */
export const LegacyOrShipConfigSchema = ShipConfigSchema.or(LegacyShipSchema);

// ---------------------------------------------------------------------------
// Save payload — body of POST /api/save. Matches what GameState.toSnapshot()
// produces today plus a couple of forward-looking optional fields the route
// accepts. The shape stays permissive on cross-field correlation (e.g. we
// don't assert `currentPlanet` is one of `unlockedPlanets`); the server
// stores the snapshot whole and the client validates again on load.
// ---------------------------------------------------------------------------

/**
 * Body of `POST /api/save` — the wire shape the client sends when persisting
 * progression.
 *
 * Matches what `GameState.toSnapshot()` produces today plus a couple of
 * forward-looking optional fields the route accepts. The shape stays
 * permissive on cross-field correlation (e.g. we don't assert
 * `currentPlanet` is one of `unlockedPlanets`); the server stores the
 * snapshot whole and the client validates again on load.
 *
 * AI-NOTE: schemas at the network edge are MANDATORY (CLAUDE.md §11). Do
 * NOT replace this with an `as` cast in the route handler.
 *
 * @stable
 */
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
  //
  // SEC-011 — bounded at 200 entries x 64 chars each. Story IDs today are
  // short (e.g. "great-potato-awakening", "tubernovae-arrival"); the cap
  // is generous for legitimate saves and forecloses the audit-table
  // storage-DoS amplifier (an unbounded 4 MB array would write ~4 MB
  // into save_audit per request without rate limiting).
  seenStoryEntries: z.array(z.string().max(64)).max(200).optional()
});

/**
 * Inferred type for `POST /api/save` request bodies.
 *
 * @stable
 */
export type SavePayload = z.infer<typeof SavePayloadSchema>;

// ---------------------------------------------------------------------------
// Remote save — body of GET /api/save. The Postgres row becomes this JSON
// before the client deserializes it back into a snapshot via hydrate().
// shipConfig comes out of jsonb so it may be either shape; we lean on the
// legacy/new union and let migrateShip clean it up.
// ---------------------------------------------------------------------------

/**
 * Server response shape for `GET /api/save`.
 *
 * The Postgres row becomes this JSON before the client deserializes it
 * back into a snapshot via `hydrate()` in `src/game/state/persistence.ts`.
 * `shipConfig` comes out of jsonb so it may be either shape; we lean on
 * the legacy/new union and let `migrateShip()` clean it up.
 *
 * INVARIANT: `currentSolarSystemId` is nullable+optional because rows that
 * pre-date the column return null. Client falls back to the first unlocked
 * system in that case (see `hydrate()`).
 *
 * @stable
 */
export const RemoteSaveSchema = z.object({
  slot: z.number().int().positive(),
  credits: z.number().int().nonnegative(),
  currentPlanet: MissionIdSchema.nullable(),
  shipConfig: LegacyOrShipConfigSchema,
  completedMissions: z.array(MissionIdSchema),
  unlockedPlanets: z.array(MissionIdSchema),
  playedTimeSeconds: z.number().int().nonnegative(),
  // SEC-011 — same cap as SavePayloadSchema. Server-stored rows are
  // already bounded by the POST schema, but mirroring the constraint here
  // means a future direct-INSERT path (e.g. an admin script) can't seed
  // an unbounded list that the client then dutifully accepts.
  seenStoryEntries: z.array(z.string().max(64)).max(200).optional(),
  // Nullable: rows that pre-date the column return null. Client falls
  // back to the first unlocked system in that case (see hydrate()).
  currentSolarSystemId: SolarSystemIdSchema.nullable().optional(),
  updatedAt: z.string()
});

/**
 * Inferred type for the `GET /api/save` response body.
 *
 * @stable
 */
export type RemoteSave = z.infer<typeof RemoteSaveSchema>;

// ---------------------------------------------------------------------------
// Leaderboard score submission — body of POST /api/leaderboard. Tightened
// to the MissionId enum (was z.string) so a hand-crafted POST can't seed
// the leaderboard with arbitrary strings. Legacy ids in the table itself
// are still readable on GET because that path doesn't parse via this
// schema; only writes are gated.
// ---------------------------------------------------------------------------

/**
 * Body of `POST /api/leaderboard` — leaderboard score submission.
 *
 * Tightened to the `MissionId` enum (was `z.string`) so a hand-crafted POST
 * can't seed the leaderboard with arbitrary strings. Legacy ids in the
 * table itself are still readable on GET because that path doesn't parse
 * via this schema; only writes are gated.
 *
 * INVARIANT: every leaderboard submission goes through the score queue
 * (`enqueueScore` → `drainScoreQueue` in `src/game/state/scoreQueue.ts`).
 * Fire-and-forget POSTs lose scores when the network flakes — never bypass
 * the queue.
 *
 * @stable
 */
// Sanity-cap: any value above this is obviously fabricated. The per-mission
// server-side cap in saveValidation.ts (maxLegitScore) is the real guard;
// this ceiling catches outrageously large values at the Zod parse boundary.
export const SCORE_SANITY_CAP = 10_000_000;

export const ScorePayloadSchema = z.object({
  missionId: MissionIdSchema,
  score: z.number().int().min(0).max(SCORE_SANITY_CAP),
  timeSeconds: z.number().int().nonnegative().optional()
});

/**
 * Inferred type for `POST /api/leaderboard` request bodies.
 *
 * @stable
 */
export type ScorePayload = z.infer<typeof ScorePayloadSchema>;

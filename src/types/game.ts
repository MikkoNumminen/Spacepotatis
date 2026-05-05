// Shared, cross-engine game types. Keep free of Phaser / Three.js imports so
// both engines and the React UI can depend on this file.
//
// PUBLIC API — every export below is the contract for the `types` module.
//   Stable. Breaking changes require a coordinated update of every consumer.
//   See ./README.md for the rationale.
//
// AI-NOTE: this file is the LEAF of the dependency graph. NEVER add an
//   import from src/lib, src/game, src/components, or src/app. Adding one
//   would create a back-edge that breaks the dependency partial order
//   documented in docs/audit/02-target-architecture.md.

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

/**
 * Canonical id for every weapon catalog entry.
 *
 * Every player-facing weapon is keyed by one of these strings. The matching
 * runtime list lives in `src/game/data/weapons.ts` as `WEAPON_IDS` and in
 * `src/lib/schemas/save.ts` as the `WeaponIdSchema` enum. The `satisfies`
 * guard on `WEAPON_IDS` fails to typecheck if the lists drift apart.
 *
 * @stable
 */
export type WeaponId =
  | "rapid-fire"
  | "spread-shot"
  | "heavy-cannon"
  | "corsair-missile"
  | "grapeshot-cannon"
  | "boarding-snare";

/**
 * Permanent weapon modifiers — equippable into a `WeaponInstance`.
 *
 * See `src/game/data/augments.ts` for the catalog and effect math. An
 * augment is bound to a single weapon when installed and is destroyed if
 * that weapon is sold. Lockstep partner: `AUGMENT_IDS` in
 * `src/lib/schemas/save.ts`.
 *
 * @stable
 */
export type AugmentId =
  | "damage-up"
  | "fire-rate-up"
  | "extra-projectile"
  | "energy-down"
  | "homing-up";

/**
 * Canonical id for every ship-upgrade row in the shop.
 *
 * Unlike weapons / augments, the actual numeric behaviour for each
 * upgrade lives in `src/game/state/ShipConfig.ts` (BASE_SHIELD,
 * REACTOR_CAPACITY_PER_LEVEL, the cost curves, etc.); the matching
 * presentation registry — display name, body copy, voice path
 * convention — lives in `src/game/data/upgrades.ts`. The id keys both
 * the body-copy lookup and the per-upgrade Grandma voiceover at
 * `/audio/upgrades/<id>-voice.mp3`, so renaming one is a breaking
 * audio-asset change.
 *
 * @stable
 */
export type UpgradeId =
  | "shield"
  | "armor"
  | "reactor-capacity"
  | "reactor-recharge";

/**
 * Canonical id for every clickable inline-stat chip on a weapon card
 * (DPS, energy-per-shot, augment-slot count). Each id keys both the body
 * copy in `src/game/data/stats.ts` and the per-stat Grandma voiceover at
 * `/audio/stats/<id>-voice.mp3`, so renaming one is a breaking
 * audio-asset change. Same shape as `UpgradeId`.
 *
 * @stable
 */
export type StatId =
  | "dps"
  | "energy"
  | "augment-slots";

/**
 * Catalog family — discriminator for shop / loadout filtering.
 *
 * The tutorial-system shop is gated to `family: "potato"` so pirate
 * weapons hide there until the player warps to tubernovae.
 *
 * @stable
 */
export type WeaponFamily = "potato" | "pirate";

/**
 * Catalog tier — surfaced in shop / loadout UI so the player can see at a
 * glance which set a weapon belongs to.
 *
 * Tier 1 is the potato starter line (everyone gets these); tier 2 is the
 * pirate haul (drops + shop in tubernovae onward, often more destructive
 * at base than tier 1 max-level). Drives the tier badge in shop + loadout
 * and gates the tutorial-system shop filter.
 *
 * @stable
 */
export type WeaponTier = 1 | 2;

/**
 * One row of `weapons.json` — the static catalog entry for a weapon.
 *
 * Every weapon is forward-firing now — slot kinds (rear / sidekick) were
 * removed in the slot-array refactor. Mounted in any open slot on the
 * ship; bullets always fly straight up. Read via `getWeapon(id)` from
 * `src/game/data/weapons.ts`; never hard-code damage / fireRate / cost in
 * code (CLAUDE.md §9).
 *
 * INVARIANT: `fireRateMs > 0` — gameplay code divides into it as a
 * frequency. The matching `WeaponDefinitionSchema.fireRateMs.positive()`
 * in `src/lib/schemas/weapons.ts` enforces this at the JSON edge.
 *
 * @stable
 */
export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly name: string;
  readonly description: string;
  readonly damage: number;
  readonly fireRateMs: number;
  readonly bulletSpeed: number;
  readonly projectileCount: number;
  readonly spreadDegrees: number;
  readonly cost: number;
  readonly tint: string;          // "#RRGGBB" — accent color used in pickup notifications & HUD
  readonly family: WeaponFamily;  // Catalog family — surfaces as a tag in shop/loadout. Tutorial-system shop is gated to tier 1 (see ShopUI), so pirate-family weapons hide there until the player warps to tubernovae.
  readonly tier: WeaponTier;      // 1 = potato starter line, 2 = pirate haul. Drives the tier badge in shop + loadout and gates the tutorial-system shop filter.
  readonly energyCost: number;    // reactor energy spent per FIRE event, not per bullet
  readonly homing?: boolean;      // if true, projectiles steer toward the nearest enemy
  readonly turnRateRadPerSec?: number; // homing turn rate; defaults to 3.5 if homing without explicit value
  readonly gravity?: number;  // px/s² applied as +y acceleration each frame. When set, the bullet arcs (decelerates if firing -y, accelerates if firing +y) and rotates each frame to point along its current motion vector. Defaults to 0 (straight flight).
  // AoE on impact: when explosionRadius > 0, the bullet spawns a damage burst
  // centered on the enemy it hit. Other enemies inside the radius take
  // explosionDamage. Set both fields together — radius alone is a no-op.
  readonly explosionRadius?: number;
  readonly explosionDamage?: number;
  // Slow on impact (paired with explosionRadius). Every enemy in the AoE
  // gets velocity scaled by slowFactor (e.g. 0.5 = half speed) until
  // slowDurationMs elapses. The primary target is included.
  readonly slowFactor?: number;
  readonly slowDurationMs?: number;
  readonly bulletSprite?: string;  // texture key generated in BootScene; defaults to "bullet-friendly" when absent
  readonly podSprite?: string;     // texture key for a side-pod sprite rendered when this weapon is equipped in a non-primary slot. When absent, the slot stays invisible (today's behavior — bullets just spawn at the slot's offset).
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

/**
 * Canonical id for every enemy that can spawn in a wave.
 *
 * Lockstep partner: `ENEMY_IDS` in `src/lib/schemas/enemies.ts`. The
 * `satisfies` guard there fails compile if the lists drift.
 *
 * @stable
 */
export type EnemyId =
  | "aphid"
  | "aphid-giant"
  | "aphid-queen"
  | "aphid-empress"
  | "beetle-scarab"
  | "beetle-rhino"
  | "beetle-stag"
  | "caterpillar-hornworm"
  | "caterpillar-army"
  | "caterpillar-monarch"
  | "spider-wolf"
  | "spider-widow"
  | "spider-jumper"
  | "dragonfly-common"
  | "dragonfly-heli"
  | "dragonfly-damsel"
  | "pirate-skiff"
  | "pirate-cutlass"
  | "pirate-marauder"
  | "pirate-corsair"
  | "pirate-frigate"
  | "pirate-galleon"
  | "pirate-dreadnought";

/**
 * AI mode an enemy picks at spawn.
 *
 * - `straight`: fly down the column, ignore the player.
 * - `zigzag`: sinusoidal x-drift while descending.
 * - `homing`: steer toward the player.
 * - `boss`: scripted multi-phase behavior; one per mission.
 *
 * @stable
 */
export type EnemyBehavior = "straight" | "zigzag" | "homing" | "boss";

/**
 * One row of `enemies.json` — the static catalog entry for an enemy.
 *
 * `fireRateMs` is `null` for non-shooting enemies; a positive number
 * otherwise. Score and credit values feed the per-mission cap derivation
 * in `src/lib/saveValidation.ts` — bumping HP / values rescales the cheat
 * caps automatically (CLAUDE.md §9).
 *
 * INVARIANT: `hp > 0`, `speed > 0`, `fireRateMs > 0` (or `null`). The
 * matching `EnemyDefinitionSchema` in `src/lib/schemas/enemies.ts`
 * enforces these at the JSON edge.
 *
 * @stable
 */
export interface EnemyDefinition {
  readonly id: EnemyId;
  readonly name: string;
  readonly hp: number;
  readonly speed: number;
  readonly behavior: EnemyBehavior;
  readonly scoreValue: number;
  readonly creditValue: number;
  readonly spriteKey: string;
  readonly fireRateMs: number | null;
  readonly collisionDamage: number;
}

// ---------------------------------------------------------------------------
// Obstacles (indestructible space junk — asteroids, structure walls, debris)
// ---------------------------------------------------------------------------
// Obstacles scroll down the playfield like enemies but cannot be destroyed by
// player fire — they absorb bullets (theirs and the player's), block the
// player's ship for collision damage, and act as cover that enemies can hide
// behind. The MVP ships one type ("asteroid-small") and one behavior
// ("drift"); the union is the extension point for future variants.

/**
 * Canonical id for indestructible space junk.
 *
 * Lockstep partner: `OBSTACLE_IDS` in `src/lib/schemas/obstacles.ts`. The
 * MVP ships one type; the union is the extension point.
 *
 * @stable
 */
export type ObstacleId = "asteroid-small";

/**
 * Movement mode for an obstacle.
 *
 * `drift` is the only mode today — straight-down scroll matching enemy
 * speed semantics minus the AI hooks.
 *
 * @stable
 */
export type ObstacleBehavior = "drift";

/**
 * One row of `obstacles.json` — the static catalog entry for indestructible
 * space junk.
 *
 * Obstacles scroll down the playfield like enemies but cannot be destroyed
 * by player fire — they absorb bullets (theirs and the player's), block
 * the player's ship for collision damage, and act as cover that enemies
 * can hide behind. Mission completion never gates on obstacles being
 * cleared.
 *
 * @stable
 */
export interface ObstacleDefinition {
  readonly id: ObstacleId;
  readonly name: string;
  readonly speed: number;            // px/s downward scroll
  readonly behavior: ObstacleBehavior;
  readonly spriteKey: string;
  readonly collisionDamage: number;  // damage dealt to player ship on contact
  readonly hitboxRadius: number;     // physics body radius in px
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------

/**
 * One enemy-cohort spec inside a wave.
 *
 * `xPercent` is normalized 0..1 across the viewport so the spawner can
 * place the cohort responsively. `formation` shapes the cohort layout at
 * spawn time.
 *
 * @stable
 */
export interface WaveSpawn {
  readonly enemy: EnemyId;
  readonly count: number;
  readonly delayMs: number;        // delay from wave start before first spawn
  readonly intervalMs: number;     // spacing between successive spawns
  readonly formation: "line" | "vee" | "scatter" | "column";
  readonly xPercent: number;       // 0..1, horizontal anchor across viewport
}

/**
 * One obstacle-cohort spec inside a wave.
 *
 * Identical shape to `WaveSpawn` minus the `vee` formation — rocks in a
 * v-formation read as "fleet maneuver", not space junk. The scheduler
 * shares its placement helper across both spawn kinds.
 *
 * @stable
 */
export interface ObstacleSpawn {
  readonly obstacle: ObstacleId;
  readonly count: number;
  readonly delayMs: number;
  readonly intervalMs: number;
  readonly formation: "line" | "scatter" | "column";
  readonly xPercent: number;
}

/**
 * One wave inside a mission.
 *
 * Carries an id (for debugging / telemetry), a duration after which the
 * wave auto-advances, the enemy spawns, and an optional obstacle layer.
 * Mission completion gates on enemy clears + duration, never on obstacles.
 *
 * @stable
 */
export interface WaveDefinition {
  readonly id: string;
  readonly durationMs: number;
  readonly spawns: readonly WaveSpawn[];
  // Optional — waves without obstacles omit this entirely. Mission completion
  // never gates on obstacles being cleared (they can't be killed).
  readonly obstacleSpawns?: readonly ObstacleSpawn[];
}

/**
 * All waves bound to a single mission.
 *
 * One entry per `MissionId` in `waves.json`. Read via `getAllMissionWaves()`
 * from `src/game/data/waves.ts`.
 *
 * @stable
 */
export interface MissionWaves {
  readonly missionId: MissionId;
  readonly waves: readonly WaveDefinition[];
}

// ---------------------------------------------------------------------------
// Missions / planets
// ---------------------------------------------------------------------------

/**
 * Canonical id for every mission / shop / scenery planet.
 *
 * Lockstep partner: `MISSION_IDS` in `src/lib/schemas/save.ts`. The mission
 * graph (prereqs via `MissionDefinition.requires`) is validated server-side
 * by `validateMissionGraph` in `src/lib/saveValidation.ts` — a tampered
 * save that claims completion of an unreachable mission is rejected.
 *
 * @stable
 */
export type MissionId =
  | "tutorial"
  | "combat-1"
  | "boss-1"
  | "shop"
  | "market"
  | "pirate-beacon"
  | "ember-run"
  | "burnt-spud"
  | "tubernovae-outpost";

/**
 * Canonical id for each top-level solar system in the galaxy overworld.
 *
 * Lockstep partner: `SOLAR_SYSTEM_IDS` in `src/lib/schemas/save.ts`. Every
 * new system must ship with an on-system-enter cinematic and a dedicated
 * galaxy-bed track (project rule — see `/new-solar-system` skill).
 *
 * @stable
 */
export type SolarSystemId = "tutorial" | "tubernovae";

/**
 * One row of `solarSystems.json` — defines the visual + audio identity of
 * a top-level system.
 *
 * `galaxyMusicTrack` is required (the matching schema rejects empty
 * string) because the audio engine treats `""` as "release the slot",
 * which would silently kill the bed for the whole system.
 *
 * @stable
 */
export interface SolarSystemDefinition {
  readonly id: SolarSystemId;
  readonly name: string;
  readonly description: string;
  readonly sunColor: string;          // "#RRGGBB" — drives the central star tint
  readonly sunSize: number;           // multiplier on the base sun radius
  readonly ambientHue: string;        // "#RRGGBB" — informational; ambient palette hint
  readonly galaxyMusicTrack: string;  // "/audio/music/<systemId>-galaxy.ogg" — bed for the galaxy view of this system
}

/**
 * Discriminator for `MissionDefinition.kind`.
 *
 * - `mission`: combat planet — clicking opens the briefing modal.
 * - `shop`: trading hub — clicking docks the player.
 * - `scenery`: visual-only — non-interactable in the galaxy view.
 *
 * @stable
 */
export type PlanetKind = "mission" | "shop" | "scenery";

/**
 * Optional ring decoration around a planet.
 *
 * Radii are multipliers of the planet's own radius; `tilt` is in radians
 * off horizontal. Pure visual — no gameplay effect.
 *
 * @stable
 */
export interface PlanetRing {
  readonly innerRadius: number;       // multiplier of planet radius
  readonly outerRadius: number;       // multiplier of planet radius
  readonly tilt: number;              // radians off horizontal
}

/**
 * One row of `missions.json` — the static catalog entry for a mission /
 * shop / scenery planet.
 *
 * Carries gameplay tuning (`difficulty`, `requires`), 3D galaxy-view orbit
 * math (`orbitRadius`, `orbitSpeed`, `startAngle`, optional inclination /
 * node / parent), audio + visual identity (`musicTrack`, `texture`,
 * `ring`), and the `perksAllowed` flag that gates mission-only perk drops.
 *
 * INVARIANT: `requires` must reference real `MissionId` values; circular
 * prereq chains are rejected by `validateMissionGraph` server-side. Unique
 * `id` across the catalog is enforced by `runDataIntegrityCheck` at
 * module-load.
 *
 * @stable
 */
export interface MissionDefinition {
  readonly id: MissionId;
  readonly kind: PlanetKind;
  readonly name: string;
  readonly description: string;
  readonly difficulty: 1 | 2 | 3;
  readonly texture: string;           // path under /public/textures/planets/
  readonly solarSystemId: SolarSystemId; // which solar system this planet belongs to
  readonly orbitRadius: number;       // AU-ish, for overworld layout
  readonly orbitSpeed: number;        // radians / second
  readonly startAngle: number;        // radians
  readonly orbitTilt?: number;        // radians, inclination off the reference plane
  readonly orbitNode?: number;        // radians, longitude of ascending node
  readonly orbitParentId?: MissionId; // when set, orbit is centered on this body's
                                      // current world position rather than the system origin
                                      // (parent must share solarSystemId)
  readonly scale: number;             // planet size multiplier
  readonly requires: readonly MissionId[]; // missions that must be completed to unlock this one
  readonly musicTrack: string | null; // path under /public/audio/music/
  readonly ring?: PlanetRing;
  readonly perksAllowed?: boolean;    // if true, mission-only perks may drop here. Default: false.
}

// ---------------------------------------------------------------------------
// Ship / player state
// ---------------------------------------------------------------------------
// ShipConfig, WeaponSlots, and ReactorConfig live in src/game/state/ShipConfig.ts.
// They are gameplay state, not shared cross-engine schema, so they stay alongside
// the helpers that mutate them.

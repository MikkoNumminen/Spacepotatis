// Shared, cross-engine game types. Keep free of Phaser / Three.js imports so
// both engines and the React UI can depend on this file.

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

export type WeaponId =
  | "rapid-fire"
  | "spread-shot"
  | "heavy-cannon"
  | "corsair-missile"
  | "grapeshot-cannon"
  | "boarding-snare";

// Permanent weapon modifiers. See src/game/data/augments.ts for the
// catalog and effect math. An augment is bound to a single weapon when
// installed and is destroyed if that weapon is sold.
export type AugmentId =
  | "damage-up"
  | "fire-rate-up"
  | "extra-projectile"
  | "energy-down"
  | "homing-up";

export type WeaponFamily = "potato" | "pirate";

// Catalog tier — surfaced in shop / loadout UI so the player can see at a
// glance which set a weapon belongs to. Tier 1 is the potato starter line
// (everyone gets these); tier 2 is the pirate haul (drops + shop in
// tubernovae onward, often more destructive at base than tier 1 max-level).
export type WeaponTier = 1 | 2;

// Every weapon is forward-firing now — slot kinds (rear / sidekick) were
// removed in the slot-array refactor. Mounted in any open slot on the
// ship; bullets always fly straight up.
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
export type EnemyBehavior = "straight" | "zigzag" | "homing" | "boss";

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

export type ObstacleId = "asteroid-small";
export type ObstacleBehavior = "drift";

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

export interface WaveSpawn {
  readonly enemy: EnemyId;
  readonly count: number;
  readonly delayMs: number;        // delay from wave start before first spawn
  readonly intervalMs: number;     // spacing between successive spawns
  readonly formation: "line" | "vee" | "scatter" | "column";
  readonly xPercent: number;       // 0..1, horizontal anchor across viewport
}

// Obstacle scheduling parallels WaveSpawn. We drop "vee" — rocks in a v-formation
// reads as "fleet maneuver", not space junk. Otherwise identical shape so the
// scheduler can share the placement helper.
export interface ObstacleSpawn {
  readonly obstacle: ObstacleId;
  readonly count: number;
  readonly delayMs: number;
  readonly intervalMs: number;
  readonly formation: "line" | "scatter" | "column";
  readonly xPercent: number;
}

export interface WaveDefinition {
  readonly id: string;
  readonly durationMs: number;
  readonly spawns: readonly WaveSpawn[];
  // Optional — waves without obstacles omit this entirely. Mission completion
  // never gates on obstacles being cleared (they can't be killed).
  readonly obstacleSpawns?: readonly ObstacleSpawn[];
}

export interface MissionWaves {
  readonly missionId: MissionId;
  readonly waves: readonly WaveDefinition[];
}

// ---------------------------------------------------------------------------
// Missions / planets
// ---------------------------------------------------------------------------

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

export type SolarSystemId = "tutorial" | "tubernovae";

export interface SolarSystemDefinition {
  readonly id: SolarSystemId;
  readonly name: string;
  readonly description: string;
  readonly sunColor: string;          // "#RRGGBB" — drives the central star tint
  readonly sunSize: number;           // multiplier on the base sun radius
  readonly ambientHue: string;        // "#RRGGBB" — informational; ambient palette hint
  readonly galaxyMusicTrack: string;  // "/audio/music/<systemId>-galaxy.ogg" — bed for the galaxy view of this system
}

export type PlanetKind = "mission" | "shop" | "scenery";

export interface PlanetRing {
  readonly innerRadius: number;       // multiplier of planet radius
  readonly outerRadius: number;       // multiplier of planet radius
  readonly tilt: number;              // radians off horizontal
}

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

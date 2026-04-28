// Shared, cross-engine game types. Keep free of Phaser / Three.js imports so
// both engines and the React UI can depend on this file.

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

export type WeaponId =
  | "rapid-fire"
  | "spread-shot"
  | "heavy-cannon"
  | "spud-missile"
  | "tater-net"
  | "tail-gunner"
  | "side-spitter"
  | "plasma-whip"
  | "hailstorm";

// Permanent weapon modifiers. See src/game/data/augments.ts for the
// catalog and effect math. An augment is bound to a single weapon when
// installed and is destroyed if that weapon is sold.
export type AugmentId =
  | "damage-up"
  | "fire-rate-up"
  | "extra-projectile"
  | "energy-down"
  | "homing-up";

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
  readonly energyCost: number;    // reactor energy spent per FIRE event, not per bullet
  readonly homing?: boolean;      // if true, projectiles steer toward the nearest enemy
  readonly turnRateRadPerSec?: number; // homing turn rate; defaults to 3.5 if homing without explicit value
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export type EnemyId = "basic" | "zigzag" | "kamikaze" | "boss-1";
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

export interface WaveDefinition {
  readonly id: string;
  readonly durationMs: number;
  readonly spawns: readonly WaveSpawn[];
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

export interface PlayerProgress {
  credits: number;
  currentPlanet: MissionId | null;
  completedMissions: readonly MissionId[];
  unlockedPlanets: readonly MissionId[];
  playedTimeSeconds: number;
}

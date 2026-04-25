// Shared, cross-engine game types. Keep free of Phaser / Three.js imports so
// both engines and the React UI can depend on this file.

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

export type WeaponId = "rapid-fire" | "spread-shot" | "heavy-cannon";

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
  | "shop";

export type PlanetKind = "mission" | "shop";

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
  readonly orbitRadius: number;       // AU-ish, for overworld layout
  readonly orbitSpeed: number;        // radians / second
  readonly startAngle: number;        // radians
  readonly orbitTilt?: number;        // radians, inclination off the reference plane
  readonly orbitNode?: number;        // radians, longitude of ascending node
  readonly scale: number;             // planet size multiplier
  readonly requires: readonly MissionId[]; // missions that must be completed to unlock this one
  readonly musicTrack: string | null; // path under /public/audio/music/
  readonly ring?: PlanetRing;
}

// ---------------------------------------------------------------------------
// Ship / player state
// ---------------------------------------------------------------------------

export interface ShipConfig {
  primaryWeapon: WeaponId;
  shieldLevel: number;     // 0..max, affects shield capacity + regen
  armorLevel: number;      // 0..max, affects hit points
  powerUps: readonly string[];
}

export interface PlayerProgress {
  credits: number;
  currentPlanet: MissionId | null;
  completedMissions: readonly MissionId[];
  unlockedPlanets: readonly MissionId[];
  playedTimeSeconds: number;
}

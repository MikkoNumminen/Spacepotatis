import type { AugmentId, WeaponId, WeaponSlot } from "@/types/game";

export type SlotName = "front" | "rear" | "sidekickLeft" | "sidekickRight";

export interface WeaponSlots {
  front: WeaponId | null;
  rear: WeaponId | null;
  sidekickLeft: WeaponId | null;
  sidekickRight: WeaponId | null;
}

export interface ReactorConfig {
  capacityLevel: number;
  rechargeLevel: number;
}

// Per-weapon mark levels. Sparse map keyed by WeaponId — missing entries
// default to level 1 (base). Each level adds WEAPON_DAMAGE_PER_LEVEL to the
// damage multiplier; nothing else (fire rate, projectile count, spread) ever
// scales with level. Augments stack on top via WeaponAugments.
export type WeaponLevels = Readonly<Partial<Record<WeaponId, number>>>;

// Per-weapon installed augments. Each weapon can hold up to
// MAX_AUGMENTS_PER_WEAPON (see src/game/data/augments.ts). Augments
// are permanently bound — sellWeapon() destroys both the weapon and its
// augment list together.
export type WeaponAugments = Readonly<Partial<Record<WeaponId, readonly AugmentId[]>>>;

export interface ShipConfig {
  slots: WeaponSlots;
  unlockedWeapons: readonly WeaponId[];
  weaponLevels: WeaponLevels;
  weaponAugments: WeaponAugments;
  // Augments the player owns but has not yet bound to a weapon. Once an
  // augment is installed it leaves this list and joins weaponAugments[wid].
  augmentInventory: readonly AugmentId[];
  shieldLevel: number;
  armorLevel: number;
  reactor: ReactorConfig;
}

export const MAX_LEVEL = 5;
// Per-level additive damage bonus. Level 1 = 1.0× base, level 5 = 1.60×.
const WEAPON_DAMAGE_PER_LEVEL = 0.15;

const BASE_SHIELD = 40;
const BASE_ARMOR = 60;
// Reactor base values. Energy is in arbitrary "joules"; weapon energyCost is
// expressed in the same unit. Capacity grows additively per level so the
// curve stays predictable for shop pricing; recharge grows the same way to
// keep the time-to-full math obvious.
const BASE_REACTOR_CAPACITY = 100;
const REACTOR_CAPACITY_PER_LEVEL = 30;
const BASE_REACTOR_RECHARGE = 25;
const REACTOR_RECHARGE_PER_LEVEL = 8;

export const EMPTY_SLOTS: WeaponSlots = {
  front: null,
  rear: null,
  sidekickLeft: null,
  sidekickRight: null
};

export const DEFAULT_SHIP: ShipConfig = {
  slots: { ...EMPTY_SLOTS, front: "rapid-fire" },
  unlockedWeapons: ["rapid-fire"],
  weaponLevels: {},
  weaponAugments: {},
  augmentInventory: [],
  shieldLevel: 0,
  armorLevel: 0,
  reactor: { capacityLevel: 0, rechargeLevel: 0 }
};

export function getMaxShield(config: ShipConfig): number {
  return Math.round(BASE_SHIELD * (1 + config.shieldLevel * 0.2));
}

export function getMaxArmor(config: ShipConfig): number {
  return BASE_ARMOR + config.armorLevel * 15;
}

export function getReactorCapacity(config: ShipConfig): number {
  return BASE_REACTOR_CAPACITY + config.reactor.capacityLevel * REACTOR_CAPACITY_PER_LEVEL;
}

export function getReactorRecharge(config: ShipConfig): number {
  return BASE_REACTOR_RECHARGE + config.reactor.rechargeLevel * REACTOR_RECHARGE_PER_LEVEL;
}

export function shieldUpgradeCost(level: number): number {
  return 200 * Math.pow(2, level);
}

export function armorUpgradeCost(level: number): number {
  return 300 * Math.pow(2, level);
}

export function reactorCapacityCost(level: number): number {
  return 200 * Math.pow(2, level);
}

export function reactorRechargeCost(level: number): number {
  return 200 * Math.pow(2, level);
}

// Per-weapon level helpers. The level lives in the ShipConfig, not on the
// weapon definition — different players can hold different levels of the
// same weapon, and the JSON catalog stays the canonical "base" stats.
export function getWeaponLevel(config: ShipConfig, id: WeaponId): number {
  return config.weaponLevels[id] ?? 1;
}

export function weaponDamageMultiplier(level: number): number {
  return 1 + WEAPON_DAMAGE_PER_LEVEL * (level - 1);
}

// Level 1 → 2 costs 200; doubles each step. Level 5 is the cap; once there,
// callers should refuse the purchase.
export function weaponUpgradeCost(currentLevel: number): number {
  return 200 * Math.pow(2, currentLevel - 1);
}

// Augment helpers. The actual augment definitions live in
// src/game/data/augments.ts; these helpers just read the per-ship
// installed list, which is the only ShipConfig-coupled piece.
export function getInstalledAugments(config: ShipConfig, id: WeaponId): readonly AugmentId[] {
  return config.weaponAugments[id] ?? [];
}

export function isWeaponUnlocked(config: ShipConfig, id: WeaponId): boolean {
  return config.unlockedWeapons.includes(id);
}

// Slot ↔ WeaponSlot mapping. The two sidekick slots both accept "sidekick"
// weapons. Used by the loadout UI when filtering candidates per slot.
export function slotKindFor(slot: SlotName): WeaponSlot {
  if (slot === "front") return "front";
  if (slot === "rear") return "rear";
  return "sidekick";
}

export function isWeaponEquipped(config: ShipConfig, id: WeaponId): boolean {
  const s = config.slots;
  return s.front === id || s.rear === id || s.sidekickLeft === id || s.sidekickRight === id;
}

export function findEquippedSlot(config: ShipConfig, id: WeaponId): SlotName | null {
  const s = config.slots;
  if (s.front === id) return "front";
  if (s.rear === id) return "rear";
  if (s.sidekickLeft === id) return "sidekickLeft";
  if (s.sidekickRight === id) return "sidekickRight";
  return null;
}

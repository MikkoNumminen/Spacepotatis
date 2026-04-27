import type { AugmentId, WeaponId } from "@/types/game";

// Indices into ShipConfig.slots. Slot 0 is the ship's main weapon mount
// (always present); higher indices are expansion mounts purchased from
// the shop. All slots fire forward — there is no left/right/rear kind
// any more. Use `number` directly at call sites; this alias is just here
// for readability when a function clearly takes "the index of a slot".
export type SlotIndex = number;

// Variable-length array of weapons. Each entry is either a WeaponId
// (equipped) or null (slot owned but empty). A new save starts with one
// slot containing the starter weapon; the player buys additional slots
// at the shop via buyWeaponSlot().
export type WeaponSlots = readonly (WeaponId | null)[];

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

// Soft cap on how many weapon slots a player can buy. The two starter
// solar systems are designed around 1-3 slots; the ceiling exists so the
// loadout UI never has to scroll, and to keep the cost curve bounded.
export const MAX_WEAPON_SLOTS = 6;

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

export const DEFAULT_SHIP: ShipConfig = {
  slots: ["rapid-fire"],
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

// Cost to buy ONE more weapon slot, given how many slots the ship already
// owns. The first expansion (slot #2) is intentionally cheap so a player
// who's cleared the first mission can afford it; from there the curve
// climbs steeply enough that a 4+ slot loadout is real progression.
export function slotPurchaseCost(currentSlotCount: number): number {
  if (currentSlotCount < 1) return 0;
  if (currentSlotCount === 1) return 500;
  if (currentSlotCount === 2) return 2000;
  // Slot 4: 4000, slot 5: 8000, slot 6: 16000 — doubles past slot 3.
  return 4000 * Math.pow(2, currentSlotCount - 3);
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

export function isWeaponEquipped(config: ShipConfig, id: WeaponId): boolean {
  return config.slots.includes(id);
}

// Returns the slot index that currently holds `id`, or -1 if it isn't
// equipped. Indices are stable for a given save (slots only grow at the
// tail when buyWeaponSlot pushes a null on).
export function findEquippedSlot(config: ShipConfig, id: WeaponId): number {
  return config.slots.indexOf(id);
}

// Index of the first empty slot, or -1 if every slot is occupied. Used by
// grantWeapon / buyWeapon to auto-equip the next purchase if there's room.
export function firstEmptySlot(config: ShipConfig): number {
  return config.slots.indexOf(null);
}

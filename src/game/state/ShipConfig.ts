import type { AugmentId, WeaponId } from "@/types/game";

// One physical weapon the player owns. Each instance has its OWN level
// and augment list — owning two Pulse Cannons means each one is upgraded
// independently. Instances live in exactly one place at a time: either a
// slot (equipped) or the inventory (unequipped). The same instance is
// never duplicated across both.
export interface WeaponInstance {
  readonly id: WeaponId;
  readonly level: number;
  readonly augments: readonly AugmentId[];
}

// Variable-length array of weapon slots. Each entry is either an equipped
// WeaponInstance or null (slot owned but empty). A new save starts with
// slot 0 holding the starter weapon; the player buys more via buyWeaponSlot().
export type WeaponSlots = readonly (WeaponInstance | null)[];

// Unequipped weapon instances. Order is the order they were acquired —
// pickers iterate it directly so the UI is stable.
export type WeaponInventory = readonly WeaponInstance[];

export interface ReactorConfig {
  capacityLevel: number;
  rechargeLevel: number;
}

export interface ShipConfig {
  slots: WeaponSlots;
  inventory: WeaponInventory;
  // Augments the player owns but has not yet bound to a weapon. Once an
  // augment is installed it leaves this list and joins the target
  // instance's `augments` array.
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

export function newWeaponInstance(id: WeaponId): WeaponInstance {
  return { id, level: 1, augments: [] };
}

export const DEFAULT_SHIP: ShipConfig = {
  slots: [newWeaponInstance("rapid-fire")],
  inventory: [],
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

export function weaponDamageMultiplier(level: number): number {
  return 1 + WEAPON_DAMAGE_PER_LEVEL * (level - 1);
}

// Level 1 → 2 costs 200; doubles each step. Level 5 is the cap; once there,
// callers should refuse the purchase.
export function weaponUpgradeCost(currentLevel: number): number {
  return 200 * Math.pow(2, currentLevel - 1);
}

// Position references for mutators. Each instance lives in exactly one
// place, so picker UIs and mutators address it via this discriminated union.
export type WeaponPosition =
  | { readonly kind: "slot"; readonly index: number }
  | { readonly kind: "inventory"; readonly index: number };

// Returns the instance at the given position, or null if the position is
// out of range / points at an empty slot. Pure helper; does not mutate.
export function getInstanceAt(ship: ShipConfig, pos: WeaponPosition): WeaponInstance | null {
  if (pos.kind === "slot") {
    return ship.slots[pos.index] ?? null;
  }
  return ship.inventory[pos.index] ?? null;
}

// Index of the first empty slot, or -1 if every slot is occupied. Used by
// grantWeapon / buyWeapon to auto-equip the next acquisition if there's room.
export function firstEmptySlot(ship: ShipConfig): number {
  for (let i = 0; i < ship.slots.length; i++) {
    if (ship.slots[i] === null) return i;
  }
  return -1;
}

// "Has the player ever owned a weapon of this type?" — derived rather than
// stored. Used by content/UI hints; not load-bearing for any gameplay rule.
export function ownsAnyOfType(ship: ShipConfig, id: WeaponId): boolean {
  for (const s of ship.slots) {
    if (s && s.id === id) return true;
  }
  for (const inv of ship.inventory) {
    if (inv.id === id) return true;
  }
  return false;
}

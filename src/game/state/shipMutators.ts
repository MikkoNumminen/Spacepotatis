import type { AugmentId, WeaponId } from "@/types/game";
import {
  MAX_LEVEL,
  MAX_WEAPON_SLOTS,
  armorUpgradeCost,
  firstEmptySlot,
  getInstanceAt,
  newWeaponInstance,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  slotPurchaseCost,
  weaponUpgradeCost,
  type WeaponInstance,
  type WeaponInventory,
  type WeaponPosition,
  type WeaponSlots
} from "./ShipConfig";
import { getWeapon } from "../data/weapons";
import { MAX_AUGMENTS_PER_WEAPON, getAugment } from "../data/augments";
import { getSellPrice } from "./pricing";
import { commit, getState, spendCredits } from "./stateCore";

// Move an inventory weapon into a slot. The slot's previous occupant (if any)
// goes back to inventory at the END of the inventory array. Pass
// inventoryIndex = null to vacate the slot — its instance, if any, falls back
// to inventory so it isn't lost. Returns false on out-of-range indices.
export function equipWeapon(slotIndex: number, inventoryIndex: number | null): boolean {
  const state = getState();
  const ship = state.ship;
  if (slotIndex < 0 || slotIndex >= ship.slots.length) return false;

  if (inventoryIndex === null) {
    const displaced = ship.slots[slotIndex] ?? null;
    if (displaced === null) return true;
    const nextSlots: WeaponSlots = ship.slots.map((entry, i) =>
      i === slotIndex ? null : entry
    );
    const nextInventory: WeaponInventory = [...ship.inventory, displaced];
    commit({
      ...state,
      ship: { ...ship, slots: nextSlots, inventory: nextInventory }
    });
    return true;
  }

  if (inventoryIndex < 0 || inventoryIndex >= ship.inventory.length) return false;

  const incoming = ship.inventory[inventoryIndex];
  if (!incoming) return false;
  const displaced = ship.slots[slotIndex] ?? null;

  const nextSlots: WeaponSlots = ship.slots.map((entry, i) =>
    i === slotIndex ? incoming : entry
  );
  const trimmedInventory: WeaponInstance[] = [
    ...ship.inventory.slice(0, inventoryIndex),
    ...ship.inventory.slice(inventoryIndex + 1)
  ];
  const nextInventory: WeaponInventory = displaced
    ? [...trimmedInventory, displaced]
    : trimmedInventory;

  commit({
    ...state,
    ship: { ...ship, slots: nextSlots, inventory: nextInventory }
  });
  return true;
}

// Mid-mission weapon pickup. Creates a fresh level-1 instance of `id` and
// auto-equips it into the first empty slot if there is one; otherwise the
// fresh instance lands in inventory. Duplicates of an already-owned weapon
// type are allowed — each instance has its own level + augments.
export function grantWeapon(id: WeaponId): void {
  const state = getState();
  const ship = state.ship;
  const fresh = newWeaponInstance(id);
  const target = firstEmptySlot(ship);
  if (target >= 0) {
    const nextSlots: WeaponSlots = ship.slots.map((entry, i) =>
      i === target ? fresh : entry
    );
    commit({ ...state, ship: { ...ship, slots: nextSlots } });
    return;
  }
  commit({
    ...state,
    ship: { ...ship, inventory: [...ship.inventory, fresh] }
  });
}

// Sell the inventory weapon at the given index. Refunds via getSellPrice
// against the weapon's definition. Refuses on out-of-range. Augments
// installed on the destroyed instance vanish with it — augments cannot be
// salvaged from a sold weapon.
export function sellWeapon(inventoryIndex: number): boolean {
  const state = getState();
  const ship = state.ship;
  if (inventoryIndex < 0 || inventoryIndex >= ship.inventory.length) return false;
  const target = ship.inventory[inventoryIndex];
  if (!target) return false;
  const weapon = getWeapon(target.id);
  const refund = getSellPrice(weapon);
  if (refund <= 0) return false;
  const nextInventory: WeaponInventory = [
    ...ship.inventory.slice(0, inventoryIndex),
    ...ship.inventory.slice(inventoryIndex + 1)
  ];
  commit({
    ...state,
    credits: state.credits + refund,
    ship: { ...ship, inventory: nextInventory }
  });
  return true;
}

// Spend credits to acquire a fresh level-1 instance of `id`. Duplicates are
// legal — buying a second Pulse Cannon gives you a second independent
// instance. Auto-equips into the first empty slot if any, else inventory.
export function buyWeapon(id: WeaponId): boolean {
  const weapon = getWeapon(id);
  if (!spendCredits(weapon.cost)) return false;

  const state = getState();
  const ship = state.ship;
  const fresh = newWeaponInstance(id);
  const target = firstEmptySlot(ship);
  if (target >= 0) {
    const nextSlots: WeaponSlots = ship.slots.map((entry, i) =>
      i === target ? fresh : entry
    );
    commit({ ...state, ship: { ...ship, slots: nextSlots } });
    return true;
  }
  commit({
    ...state,
    ship: { ...ship, inventory: [...ship.inventory, fresh] }
  });
  return true;
}

// Buy an additional weapon slot. Refuses at MAX_WEAPON_SLOTS or if the
// player can't afford the next-slot cost. New slot is appended at the tail
// so existing slot indices stay stable.
export function buyWeaponSlot(): boolean {
  const state = getState();
  if (state.ship.slots.length >= MAX_WEAPON_SLOTS) return false;
  const cost = slotPurchaseCost(state.ship.slots.length);
  if (!spendCredits(cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: {
      ...post.ship,
      slots: [...post.ship.slots, null]
    }
  });
  return true;
}

// Shared engine for the 4 ship-stat level upgrades (shield, armor, reactor
// capacity, reactor recharge). Each has a buy-variant (debits credits via
// the matching cost curve) and a grant-variant (free, used by mission-clear
// rewards). MAX_LEVEL cap and credit-affordability check live here once.
type LevelField = "shield" | "armor" | "reactorCapacity" | "reactorRecharge";

function getLevel(state: GameStateForUpgrade, field: LevelField): number {
  const ship = state.ship;
  switch (field) {
    case "shield":
      return ship.shieldLevel;
    case "armor":
      return ship.armorLevel;
    case "reactorCapacity":
      return ship.reactor.capacityLevel;
    case "reactorRecharge":
      return ship.reactor.rechargeLevel;
  }
}

function withIncrementedLevel(
  state: GameStateForUpgrade,
  field: LevelField
): GameStateForUpgrade {
  const ship = state.ship;
  switch (field) {
    case "shield":
      return { ...state, ship: { ...ship, shieldLevel: ship.shieldLevel + 1 } };
    case "armor":
      return { ...state, ship: { ...ship, armorLevel: ship.armorLevel + 1 } };
    case "reactorCapacity":
      return {
        ...state,
        ship: {
          ...ship,
          reactor: { ...ship.reactor, capacityLevel: ship.reactor.capacityLevel + 1 }
        }
      };
    case "reactorRecharge":
      return {
        ...state,
        ship: {
          ...ship,
          reactor: { ...ship.reactor, rechargeLevel: ship.reactor.rechargeLevel + 1 }
        }
      };
  }
}

type GameStateForUpgrade = ReturnType<typeof getState>;

function applyLevelUpgrade(
  field: LevelField,
  costFn: (currentLevel: number) => number,
  charge: boolean
): boolean {
  const state = getState();
  const current = getLevel(state, field);
  if (current >= MAX_LEVEL) return false;
  if (charge) {
    const cost = costFn(current);
    if (!spendCredits(cost)) return false;
  }
  const post = getState();
  commit(withIncrementedLevel(post, field));
  return true;
}

export function buyShieldUpgrade(): boolean {
  return applyLevelUpgrade("shield", shieldUpgradeCost, true);
}

export function buyArmorUpgrade(): boolean {
  return applyLevelUpgrade("armor", armorUpgradeCost, true);
}

export function buyReactorCapacityUpgrade(): boolean {
  return applyLevelUpgrade("reactorCapacity", reactorCapacityCost, true);
}

export function buyReactorRechargeUpgrade(): boolean {
  return applyLevelUpgrade("reactorRecharge", reactorRechargeCost, true);
}

// Free-grant variants used by mission-clear rewards. Same MAX_LEVEL caps
// as the buy-* counterparts; no credit cost. Returns false when already
// maxed so the reward roller can avoid handing out no-op rewards.
export function grantShieldUpgrade(): boolean {
  return applyLevelUpgrade("shield", shieldUpgradeCost, false);
}

export function grantArmorUpgrade(): boolean {
  return applyLevelUpgrade("armor", armorUpgradeCost, false);
}

export function grantReactorCapacityUpgrade(): boolean {
  return applyLevelUpgrade("reactorCapacity", reactorCapacityCost, false);
}

export function grantReactorRechargeUpgrade(): boolean {
  return applyLevelUpgrade("reactorRecharge", reactorRechargeCost, false);
}

// Bump the targeted instance's level by one. Cost scales via
// weaponUpgradeCost(currentLevel). Refuses at MAX_LEVEL or out-of-range.
// Instances are immutable; we replace the instance at the position with a
// fresh object that has level+1.
export function buyWeaponUpgrade(position: WeaponPosition): boolean {
  const state = getState();
  const target = getInstanceAt(state.ship, position);
  if (!target) return false;
  if (target.level >= MAX_LEVEL) return false;
  const cost = weaponUpgradeCost(target.level);
  if (!spendCredits(cost)) return false;

  const post = getState();
  const upgraded: WeaponInstance = { ...target, level: target.level + 1 };
  const nextShip = replaceInstanceAt(post.ship, position, upgraded);
  commit({ ...post, ship: nextShip });
  return true;
}

// Buy an augment from the shop and add it to the player's augment inventory.
// The augment is NOT bound to a weapon yet — that happens via installAugment.
// Augments are permanent resources: once bought, they cannot be sold back.
export function buyAugment(id: AugmentId): boolean {
  const aug = getAugment(id);
  if (aug.cost <= 0) return false;
  if (!spendCredits(aug.cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: {
      ...post.ship,
      augmentInventory: [...post.ship.augmentInventory, id]
    }
  });
  return true;
}

// Mid-mission augment pickup: just add to inventory, no cost.
export function grantAugment(id: AugmentId): void {
  const state = getState();
  commit({
    ...state,
    ship: {
      ...state.ship,
      augmentInventory: [...state.ship.augmentInventory, id]
    }
  });
}

// Move one copy of `augmentId` from augmentInventory onto the targeted
// instance's `augments` list. Refuses on:
//   - position out of range (no instance there)
//   - augment not in inventory
//   - instance already has this augment (no double-stacking)
//   - instance at MAX_AUGMENTS_PER_WEAPON capacity
// On success, the augment leaves inventory and is permanently bound to the
// instance. There is no uninstall — "commit carefully" by design.
export function installAugment(position: WeaponPosition, augmentId: AugmentId): boolean {
  const state = getState();
  const target = getInstanceAt(state.ship, position);
  if (!target) return false;
  const invIndex = state.ship.augmentInventory.indexOf(augmentId);
  if (invIndex < 0) return false;
  if (target.augments.includes(augmentId)) return false;
  if (target.augments.length >= MAX_AUGMENTS_PER_WEAPON) return false;

  const nextAugmentInventory = [
    ...state.ship.augmentInventory.slice(0, invIndex),
    ...state.ship.augmentInventory.slice(invIndex + 1)
  ];
  const upgraded: WeaponInstance = {
    ...target,
    augments: [...target.augments, augmentId]
  };
  const shipWithReplaced = replaceInstanceAt(state.ship, position, upgraded);
  commit({
    ...state,
    ship: { ...shipWithReplaced, augmentInventory: nextAugmentInventory }
  });
  return true;
}

// Internal: produce a new ShipConfig with the instance at `position` swapped
// for `next`. Caller is responsible for ensuring the position points at an
// existing instance — buyWeaponUpgrade / installAugment both check via
// getInstanceAt before calling this.
function replaceInstanceAt(
  ship: ReturnType<typeof getState>["ship"],
  position: WeaponPosition,
  next: WeaponInstance
): ReturnType<typeof getState>["ship"] {
  if (position.kind === "slot") {
    const nextSlots: WeaponSlots = ship.slots.map((entry, i) =>
      i === position.index ? next : entry
    );
    return { ...ship, slots: nextSlots };
  }
  const nextInventory: WeaponInventory = ship.inventory.map((entry, i) =>
    i === position.index ? next : entry
  );
  return { ...ship, inventory: nextInventory };
}

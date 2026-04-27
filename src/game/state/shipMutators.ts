import type { AugmentId, WeaponId } from "@/types/game";
import {
  MAX_LEVEL,
  armorUpgradeCost,
  getInstalledAugments,
  getWeaponLevel,
  isWeaponEquipped,
  isWeaponUnlocked,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  slotKindFor,
  weaponUpgradeCost,
  type SlotName,
  type WeaponSlots
} from "./ShipConfig";
import { getWeapon } from "../data/weapons";
import { MAX_AUGMENTS_PER_WEAPON, getAugment } from "../data/augments";
import { getSellPrice } from "./pricing";
import { commit, getState, spendCredits } from "./stateCore";

// Equip an owned weapon into a slot. The weapon slot kind must match the
// target slot. If the weapon is already equipped elsewhere, it is moved
// (single-instance ownership — no duplicating one weapon across two slots).
// If another weapon is currently in the target slot it gets bumped to null
// (still owned, just unequipped).
export function equipWeapon(slot: SlotName, id: WeaponId | null): boolean {
  const state = getState();
  if (id === null) {
    if (state.ship.slots[slot] === null) return true;
    commit({ ...state, ship: { ...state.ship, slots: { ...state.ship.slots, [slot]: null } } });
    return true;
  }
  if (!isWeaponUnlocked(state.ship, id)) return false;
  const weapon = getWeapon(id);
  if (weapon.slot !== slotKindFor(slot)) return false;
  if (state.ship.slots[slot] === id) return true;

  const nextSlots: WeaponSlots = { ...state.ship.slots };
  // If the weapon is already in another slot, vacate that slot first so we
  // never end up with the same weapon in two places.
  for (const k of Object.keys(nextSlots) as SlotName[]) {
    if (nextSlots[k] === id) nextSlots[k] = null;
  }
  nextSlots[slot] = id;

  commit({ ...state, ship: { ...state.ship, slots: nextSlots } });
  return true;
}

// Mid-mission weapon pickup: unlock the weapon (no cost) and equip it into
// the canonical slot for its kind. Sidekicks default to the left mount; the
// player can rearrange via the loadout UI.
export function grantWeapon(id: WeaponId): void {
  const state = getState();
  const weapon = getWeapon(id);
  const alreadyUnlocked = state.ship.unlockedWeapons.includes(id);

  const nextUnlocked = alreadyUnlocked
    ? state.ship.unlockedWeapons
    : [...state.ship.unlockedWeapons, id];

  const target: SlotName =
    weapon.slot === "front" ? "front" : weapon.slot === "rear" ? "rear" : "sidekickLeft";

  if (alreadyUnlocked && state.ship.slots[target] === id) return;

  const nextSlots: WeaponSlots = { ...state.ship.slots };
  for (const k of Object.keys(nextSlots) as SlotName[]) {
    if (nextSlots[k] === id) nextSlots[k] = null;
  }
  nextSlots[target] = id;

  commit({
    ...state,
    ship: {
      ...state.ship,
      unlockedWeapons: nextUnlocked,
      slots: nextSlots
    }
  });
}

// Sell an owned, non-equipped weapon back for SELL_RATE × original cost.
// Refuses to sell currently-equipped weapons (would silently unarm a slot)
// or the starter weapon (cost 0 → no refund anyway, and it is the safety net).
// Any augments installed on the weapon are destroyed with it — augments are
// permanently bound and cannot be salvaged.
export function sellWeapon(id: WeaponId): boolean {
  const state = getState();
  if (!isWeaponUnlocked(state.ship, id)) return false;
  if (isWeaponEquipped(state.ship, id)) return false;
  const weapon = getWeapon(id);
  const refund = getSellPrice(weapon);
  if (refund <= 0) return false;
  const nextAugments: Record<string, readonly AugmentId[]> = { ...state.ship.weaponAugments };
  delete nextAugments[id];
  commit({
    ...state,
    credits: state.credits + refund,
    ship: {
      ...state.ship,
      unlockedWeapons: state.ship.unlockedWeapons.filter((w) => w !== id),
      weaponAugments: nextAugments
    }
  });
  return true;
}

export function buyWeapon(id: WeaponId): boolean {
  const state = getState();
  if (isWeaponUnlocked(state.ship, id)) return false;
  const weapon = getWeapon(id);
  if (!spendCredits(weapon.cost)) return false;

  // Auto-equip into the first matching slot if it is empty; otherwise leave
  // unequipped in inventory. Keeps the post-purchase UX snappy for new
  // players (their first buy of a slot kind just lands on the ship).
  const post = getState();
  const target: SlotName =
    weapon.slot === "front"
      ? "front"
      : weapon.slot === "rear"
        ? "rear"
        : post.ship.slots.sidekickLeft === null
          ? "sidekickLeft"
          : "sidekickRight";

  const slotIsFree = post.ship.slots[target] === null;
  const nextSlots: WeaponSlots = slotIsFree
    ? { ...post.ship.slots, [target]: id }
    : post.ship.slots;

  commit({
    ...post,
    ship: {
      ...post.ship,
      unlockedWeapons: [...post.ship.unlockedWeapons, id],
      slots: nextSlots
    }
  });
  return true;
}

export function buyShieldUpgrade(): boolean {
  const state = getState();
  if (state.ship.shieldLevel >= MAX_LEVEL) return false;
  const cost = shieldUpgradeCost(state.ship.shieldLevel);
  if (!spendCredits(cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: { ...post.ship, shieldLevel: post.ship.shieldLevel + 1 }
  });
  return true;
}

export function buyArmorUpgrade(): boolean {
  const state = getState();
  if (state.ship.armorLevel >= MAX_LEVEL) return false;
  const cost = armorUpgradeCost(state.ship.armorLevel);
  if (!spendCredits(cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: { ...post.ship, armorLevel: post.ship.armorLevel + 1 }
  });
  return true;
}

export function buyReactorCapacityUpgrade(): boolean {
  const state = getState();
  if (state.ship.reactor.capacityLevel >= MAX_LEVEL) return false;
  const cost = reactorCapacityCost(state.ship.reactor.capacityLevel);
  if (!spendCredits(cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: {
      ...post.ship,
      reactor: { ...post.ship.reactor, capacityLevel: post.ship.reactor.capacityLevel + 1 }
    }
  });
  return true;
}

export function buyReactorRechargeUpgrade(): boolean {
  const state = getState();
  if (state.ship.reactor.rechargeLevel >= MAX_LEVEL) return false;
  const cost = reactorRechargeCost(state.ship.reactor.rechargeLevel);
  if (!spendCredits(cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: {
      ...post.ship,
      reactor: { ...post.ship.reactor, rechargeLevel: post.ship.reactor.rechargeLevel + 1 }
    }
  });
  return true;
}

// Spend credits to bump a single weapon's mark level by one. Refuses on
// non-owned weapons (you can't upgrade something you don't own) and at the
// MAX_LEVEL cap. Cost scales 200, 400, 800, 1600 — same family as shield/armor.
export function buyWeaponUpgrade(id: WeaponId): boolean {
  const state = getState();
  if (!isWeaponUnlocked(state.ship, id)) return false;
  const current = getWeaponLevel(state.ship, id);
  if (current >= MAX_LEVEL) return false;
  const cost = weaponUpgradeCost(current);
  if (!spendCredits(cost)) return false;
  const post = getState();
  commit({
    ...post,
    ship: {
      ...post.ship,
      weaponLevels: { ...post.ship.weaponLevels, [id]: current + 1 }
    }
  });
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

// Install an inventory augment onto a specific owned weapon. Refuses when:
//   - weapon is not owned
//   - augment is not in inventory
//   - weapon already holds the same augment (no double-stacking)
//   - weapon is at MAX_AUGMENTS_PER_WEAPON capacity
// On success the augment leaves inventory and is permanently bound to the
// weapon. There is no uninstall — the design is "commit carefully" by intent.
export function installAugment(weaponId: WeaponId, augmentId: AugmentId): boolean {
  const state = getState();
  if (!isWeaponUnlocked(state.ship, weaponId)) return false;
  const invIndex = state.ship.augmentInventory.indexOf(augmentId);
  if (invIndex < 0) return false;

  const installed = getInstalledAugments(state.ship, weaponId);
  if (installed.length >= MAX_AUGMENTS_PER_WEAPON) return false;
  if (installed.includes(augmentId)) return false;

  // Drop one copy of the augment from the inventory (a player could
  // theoretically own multiple copies of the same augment if drops repeat).
  const nextInventory = [
    ...state.ship.augmentInventory.slice(0, invIndex),
    ...state.ship.augmentInventory.slice(invIndex + 1)
  ];
  const nextAugments: Record<string, readonly AugmentId[]> = { ...state.ship.weaponAugments };
  nextAugments[weaponId] = [...installed, augmentId];

  commit({
    ...state,
    ship: {
      ...state.ship,
      augmentInventory: nextInventory,
      weaponAugments: nextAugments
    }
  });
  return true;
}

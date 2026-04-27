import type { AugmentId, WeaponId } from "@/types/game";
import {
  MAX_LEVEL,
  MAX_WEAPON_SLOTS,
  armorUpgradeCost,
  firstEmptySlot,
  getInstalledAugments,
  getWeaponLevel,
  isWeaponEquipped,
  isWeaponUnlocked,
  reactorCapacityCost,
  reactorRechargeCost,
  shieldUpgradeCost,
  slotPurchaseCost,
  weaponUpgradeCost,
  type WeaponSlots
} from "./ShipConfig";
import { getWeapon } from "../data/weapons";
import { MAX_AUGMENTS_PER_WEAPON, getAugment } from "../data/augments";
import { getSellPrice } from "./pricing";
import { commit, getState, spendCredits } from "./stateCore";

// Equip an owned weapon into a slot by index. Single-instance ownership —
// if the weapon is already equipped in some other slot, that slot is
// vacated first so we never end up with the same weapon in two places.
// Passing null clears the target slot. Returns false if the slot index is
// out of range or the weapon isn't unlocked.
export function equipWeapon(slotIndex: number, id: WeaponId | null): boolean {
  const state = getState();
  if (slotIndex < 0 || slotIndex >= state.ship.slots.length) return false;

  if (id === null) {
    if (state.ship.slots[slotIndex] === null) return true;
    const cleared = [...state.ship.slots];
    cleared[slotIndex] = null;
    commit({ ...state, ship: { ...state.ship, slots: cleared } });
    return true;
  }

  if (!isWeaponUnlocked(state.ship, id)) return false;
  if (state.ship.slots[slotIndex] === id) return true;

  const next: (WeaponId | null)[] = state.ship.slots.map((entry) =>
    entry === id ? null : entry
  );
  next[slotIndex] = id;
  commit({ ...state, ship: { ...state.ship, slots: next } });
  return true;
}

// Mid-mission weapon pickup: unlock the weapon (no cost) and equip it
// into the first empty slot if there is one. If every slot is occupied the
// weapon just lands in inventory and the player can rearrange later.
export function grantWeapon(id: WeaponId): void {
  const state = getState();
  const alreadyUnlocked = state.ship.unlockedWeapons.includes(id);

  const nextUnlocked = alreadyUnlocked
    ? state.ship.unlockedWeapons
    : [...state.ship.unlockedWeapons, id];

  // If the weapon is already equipped somewhere, this is a no-op for slots —
  // the player picked up a duplicate of a weapon they already use.
  if (state.ship.slots.includes(id)) {
    if (alreadyUnlocked) return;
    commit({
      ...state,
      ship: { ...state.ship, unlockedWeapons: nextUnlocked }
    });
    return;
  }

  const target = firstEmptySlot(state.ship);
  const nextSlots: WeaponSlots =
    target >= 0
      ? state.ship.slots.map((entry, i) => (i === target ? id : entry))
      : state.ship.slots;

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

  // Auto-equip into the first empty slot if there is one; otherwise leave
  // unequipped in inventory. Players who haven't bought any expansions yet
  // won't see anything change here — the new weapon shows up in the
  // loadout's INVENTORY section and they can swap it into slot 0 manually.
  const post = getState();
  const target = firstEmptySlot(post.ship);
  const nextSlots: WeaponSlots =
    target >= 0
      ? post.ship.slots.map((entry, i) => (i === target ? id : entry))
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

// Buy an additional weapon slot. Refuses at MAX_WEAPON_SLOTS or if the
// player can't afford the next-slot cost. The new slot is appended at the
// tail so existing slot indices stay stable for everything else (in-flight
// references in the loadout UI, the Player entity's per-slot WeaponSystem
// instances, etc.).
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

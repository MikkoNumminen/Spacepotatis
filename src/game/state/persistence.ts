import { getAllSolarSystems } from "@/game/data/solarSystems";
import type {
  AugmentId,
  MissionId,
  SolarSystemId,
  WeaponId
} from "@/types/game";
import {
  DEFAULT_SHIP,
  MAX_LEVEL,
  MAX_WEAPON_SLOTS,
  type ShipConfig,
  type WeaponAugments,
  type WeaponLevels,
  type WeaponSlots
} from "./ShipConfig";
import { AUGMENT_IDS, MAX_AUGMENTS_PER_WEAPON } from "../data/augments";
import { INITIAL_STATE, commit, getState } from "./stateCore";

export interface StateSnapshot {
  credits: number;
  completedMissions: MissionId[];
  unlockedPlanets: MissionId[];
  playedTimeSeconds: number;
  ship: ShipConfig;
  saveSlot: number;
  currentSolarSystemId: SolarSystemId;
  unlockedSolarSystems: SolarSystemId[];
}

export function toSnapshot(): StateSnapshot {
  const state = getState();
  return {
    credits: state.credits,
    completedMissions: [...state.completedMissions],
    unlockedPlanets: [...state.unlockedPlanets],
    playedTimeSeconds: state.playedTimeSeconds,
    ship: {
      slots: [...state.ship.slots],
      unlockedWeapons: [...state.ship.unlockedWeapons],
      weaponLevels: { ...state.ship.weaponLevels },
      weaponAugments: cloneWeaponAugments(state.ship.weaponAugments),
      augmentInventory: [...state.ship.augmentInventory],
      shieldLevel: state.ship.shieldLevel,
      armorLevel: state.ship.armorLevel,
      reactor: { ...state.ship.reactor }
    },
    saveSlot: state.saveSlot,
    currentSolarSystemId: state.currentSolarSystemId,
    unlockedSolarSystems: [...state.unlockedSolarSystems]
  };
}

// Accepts the new array-based ship snapshot AND legacy snapshots that
// pre-date the slot refactor:
//   - the original `ship.primaryWeapon` shape (pre-loadout refactor)
//   - the four-named-slot `ship.slots: { front, rear, sidekickLeft, sidekickRight }` shape
// Both are flattened into `slots: [WeaponId | null, ...]` here.
export function hydrate(snapshot: Partial<StateSnapshot>): void {
  const knownSystemIds = new Set(getAllSolarSystems().map((s) => s.id));
  const unlockedSystems =
    snapshot.unlockedSolarSystems && snapshot.unlockedSolarSystems.length > 0
      ? snapshot.unlockedSolarSystems.filter((id) => knownSystemIds.has(id))
      : [...INITIAL_STATE.unlockedSolarSystems];
  const fallbackSystem = unlockedSystems[0] ?? INITIAL_STATE.currentSolarSystemId;
  const requestedCurrent = snapshot.currentSolarSystemId;
  const currentSystem =
    requestedCurrent && unlockedSystems.includes(requestedCurrent)
      ? requestedCurrent
      : fallbackSystem;

  commit({
    credits: snapshot.credits ?? INITIAL_STATE.credits,
    completedMissions: snapshot.completedMissions ?? [...INITIAL_STATE.completedMissions],
    unlockedPlanets: snapshot.unlockedPlanets ?? [...INITIAL_STATE.unlockedPlanets],
    playedTimeSeconds: snapshot.playedTimeSeconds ?? INITIAL_STATE.playedTimeSeconds,
    ship: snapshot.ship ? migrateShip(snapshot.ship) : { ...INITIAL_STATE.ship },
    saveSlot: snapshot.saveSlot ?? INITIAL_STATE.saveSlot,
    currentSolarSystemId: currentSystem,
    unlockedSolarSystems: unlockedSystems
  });
}

// Loose snapshot accepted by migrateShip. Covers all historical ship shapes
// the persistence layer may see in a save row:
//   - new array slots: { slots: WeaponSlots, ... }
//   - four-named-slot object: { slots: { front, rear, sidekickLeft, sidekickRight }, ... }
//   - pre-loadout primaryWeapon: { primaryWeapon: WeaponId, ... }
export interface LegacyShipSnapshot {
  primaryWeapon?: WeaponId;
  slots?: WeaponSlots | LegacyNamedSlots;
  unlockedWeapons?: readonly WeaponId[];
  weaponLevels?: WeaponLevels;
  weaponAugments?: WeaponAugments;
  augmentInventory?: readonly AugmentId[];
  shieldLevel?: number;
  armorLevel?: number;
  reactor?: Partial<ShipConfig["reactor"]>;
}

interface LegacyNamedSlots {
  front?: WeaponId | null;
  rear?: WeaponId | null;
  sidekickLeft?: WeaponId | null;
  sidekickRight?: WeaponId | null;
}

export function cloneWeaponAugments(aug: WeaponAugments): WeaponAugments {
  const out: Record<string, readonly AugmentId[]> = {};
  for (const [wid, ids] of Object.entries(aug)) {
    if (ids && ids.length > 0) out[wid] = [...ids];
  }
  return out;
}

export const KNOWN_AUGMENT_IDS = new Set<AugmentId>(AUGMENT_IDS);

export function isKnownAugment(id: unknown): id is AugmentId {
  return typeof id === "string" && KNOWN_AUGMENT_IDS.has(id as AugmentId);
}

export function migrateShip(input: ShipConfig | LegacyShipSnapshot): ShipConfig {
  const raw = input as LegacyShipSnapshot;

  const unlocked: readonly WeaponId[] =
    raw.unlockedWeapons && raw.unlockedWeapons.length > 0
      ? [...raw.unlockedWeapons]
      : DEFAULT_SHIP.unlockedWeapons;

  const ownedSet = new Set<WeaponId>(unlocked);
  const slots = migrateSlots(raw, ownedSet);

  // Filter weaponLevels to entries the player actually owns, clamp to
  // [1, MAX_LEVEL]. Missing or absent → empty map; consumers default to 1.
  const weaponLevels: Record<string, number> = {};
  if (raw.weaponLevels) {
    for (const [id, lvl] of Object.entries(raw.weaponLevels)) {
      if (typeof lvl !== "number" || !Number.isFinite(lvl)) continue;
      if (!ownedSet.has(id as WeaponId)) continue;
      weaponLevels[id] = Math.max(1, Math.min(MAX_LEVEL, Math.trunc(lvl)));
    }
  }

  // weaponAugments: drop entries for weapons the player doesn't own; drop
  // unknown augment ids; cap each list at MAX_AUGMENTS_PER_WEAPON; dedupe.
  const weaponAugments: Record<string, readonly AugmentId[]> = {};
  if (raw.weaponAugments) {
    for (const [wid, list] of Object.entries(raw.weaponAugments)) {
      if (!ownedSet.has(wid as WeaponId)) continue;
      if (!Array.isArray(list)) continue;
      const dedup: AugmentId[] = [];
      for (const aid of list) {
        if (!isKnownAugment(aid)) continue;
        if (dedup.includes(aid)) continue;
        dedup.push(aid);
        if (dedup.length >= MAX_AUGMENTS_PER_WEAPON) break;
      }
      if (dedup.length > 0) weaponAugments[wid] = dedup;
    }
  }

  // augmentInventory: keep only known augment ids; preserve order so a save
  // round-trip is deterministic.
  const augmentInventory: AugmentId[] = [];
  if (Array.isArray(raw.augmentInventory)) {
    for (const aid of raw.augmentInventory) {
      if (isKnownAugment(aid)) augmentInventory.push(aid);
    }
  }

  return {
    slots,
    unlockedWeapons: unlocked,
    weaponLevels,
    weaponAugments,
    augmentInventory,
    shieldLevel: raw.shieldLevel ?? 0,
    armorLevel: raw.armorLevel ?? 0,
    reactor: {
      capacityLevel: raw.reactor?.capacityLevel ?? 0,
      rechargeLevel: raw.reactor?.rechargeLevel ?? 0
    }
  };
}

// Three input shapes funnel into a single WeaponSlots array:
//   1. New array shape — keep entries that resolve to owned weapons or null.
//      Cap length at MAX_WEAPON_SLOTS so a tampered save can't blow up the UI.
//   2. Legacy named-slot object — only the `front` weapon survives. Rear and
//      sidekicks were per-side fire kinds in the old combat model and don't
//      carry over; the player keeps them in inventory (still in unlockedWeapons)
//      and can re-equip them into any slot they buy later.
//   3. Pre-loadout `primaryWeapon` — single weapon, becomes slot 0.
//   4. Nothing parseable — fall back to the DEFAULT_SHIP slot layout.
function migrateSlots(raw: LegacyShipSnapshot, owned: Set<WeaponId>): WeaponSlots {
  const sanitize = (entry: WeaponId | null | undefined): WeaponId | null =>
    typeof entry === "string" && owned.has(entry as WeaponId) ? (entry as WeaponId) : null;

  if (Array.isArray(raw.slots)) {
    const trimmed: (WeaponId | null)[] = raw.slots
      .slice(0, MAX_WEAPON_SLOTS)
      .map((entry) => sanitize(entry ?? null));
    // Always guarantee at least the starter slot — a save with zero slots
    // would leave the player unable to equip the one weapon they own.
    return trimmed.length > 0 ? trimmed : [null];
  }

  if (raw.slots && typeof raw.slots === "object") {
    const named = raw.slots as LegacyNamedSlots;
    return [sanitize(named.front)];
  }

  if (raw.primaryWeapon) {
    return [sanitize(raw.primaryWeapon)];
  }

  return [...DEFAULT_SHIP.slots];
}

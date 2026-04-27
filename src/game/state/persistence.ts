import { getAllSolarSystems } from "@/game/data/solarSystems";
import type {
  AugmentId,
  MissionId,
  SolarSystemId,
  WeaponId
} from "@/types/game";
import {
  DEFAULT_SHIP,
  EMPTY_SLOTS,
  MAX_LEVEL,
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
      slots: { ...state.ship.slots },
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

// Accepts both the new snapshot shape (ship.slots + ship.reactor) AND legacy
// snapshots that pre-date the loadout refactor (ship.primaryWeapon, no reactor
// field). Legacy ships are migrated by parking primaryWeapon in slots.front
// and zeroing the reactor levels.
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

export interface LegacyShipSnapshot {
  primaryWeapon?: WeaponId;
  slots?: Partial<WeaponSlots>;
  unlockedWeapons?: readonly WeaponId[];
  weaponLevels?: WeaponLevels;
  weaponAugments?: WeaponAugments;
  augmentInventory?: readonly AugmentId[];
  shieldLevel?: number;
  armorLevel?: number;
  reactor?: Partial<ShipConfig["reactor"]>;
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

  let slots: WeaponSlots;
  if (raw.slots) {
    slots = {
      front: raw.slots.front ?? null,
      rear: raw.slots.rear ?? null,
      sidekickLeft: raw.slots.sidekickLeft ?? null,
      sidekickRight: raw.slots.sidekickRight ?? null
    };
  } else if (raw.primaryWeapon) {
    slots = { ...EMPTY_SLOTS, front: raw.primaryWeapon };
  } else {
    slots = { ...DEFAULT_SHIP.slots };
  }

  // Filter weaponLevels to entries the player actually owns, clamp to
  // [1, MAX_LEVEL]. Missing or absent → empty map; consumers default to 1.
  const ownedSet = new Set<WeaponId>(unlocked);
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

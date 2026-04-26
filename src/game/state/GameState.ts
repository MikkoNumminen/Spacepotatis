import missionsData from "@/game/phaser/data/missions.json";
import { getAllSolarSystems } from "@/game/phaser/data/solarSystems";
import type {
  AugmentId,
  MissionDefinition,
  MissionId,
  SolarSystemId,
  WeaponDefinition,
  WeaponId
} from "@/types/game";
import {
  DEFAULT_SHIP,
  EMPTY_SLOTS,
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
  type ShipConfig,
  type SlotName,
  type WeaponAugments,
  type WeaponLevels,
  type WeaponSlots
} from "./ShipConfig";
import { getWeapon } from "../phaser/data/weapons";
import {
  AUGMENT_IDS,
  MAX_AUGMENTS_PER_WEAPON,
  getAugment
} from "../phaser/data/augments";

// Sell-back rate. Half the purchase cost — generous enough to encourage
// experimentation, cheap enough that you cannot farm credits by buy/sell churn.
const SELL_RATE = 0.5;

export function getSellPrice(weapon: WeaponDefinition): number {
  return Math.floor(weapon.cost * SELL_RATE);
}

// Module-level singleton. Phaser and React both read/write here. Persistence
// happens at boundaries (mission complete, shop purchase, initial load) — see
// hydrate()/snapshot() and the /api/save route.

export interface GameStateShape {
  readonly credits: number;
  readonly completedMissions: readonly MissionId[];
  readonly unlockedPlanets: readonly MissionId[];
  readonly playedTimeSeconds: number;
  readonly ship: ShipConfig;
  readonly saveSlot: number;
  readonly currentSolarSystemId: SolarSystemId;
  readonly unlockedSolarSystems: readonly SolarSystemId[];
}

const MISSIONS: readonly MissionDefinition[] = missionsData.missions as readonly MissionDefinition[];

const INITIAL_UNLOCKED: readonly MissionId[] = MISSIONS.filter(
  (m) => m.requires.length === 0
).map((m) => m.id);

// Completing one of these missions unlocks the corresponding system the next
// time GameState commits. Keep map small and flat — gating is rare and cheap
// to read on every completeMission call.
const SYSTEM_UNLOCK_GATES: ReadonlyMap<MissionId, SolarSystemId> = new Map([
  ["boss-1", "tubernovae"]
]);

const INITIAL_STATE: GameStateShape = {
  credits: 0,
  completedMissions: [],
  unlockedPlanets: INITIAL_UNLOCKED,
  playedTimeSeconds: 0,
  ship: DEFAULT_SHIP,
  saveSlot: 1,
  currentSolarSystemId: "tutorial",
  unlockedSolarSystems: ["tutorial"]
};

let state: GameStateShape = INITIAL_STATE;
const listeners = new Set<() => void>();

export function getState(): GameStateShape {
  return state;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function commit(next: GameStateShape): void {
  state = next;
  for (const cb of listeners) cb();
}

// ---------- Mutators (keep all state changes through these) ----------

export function addCredits(n: number): void {
  if (n === 0) return;
  commit({ ...state, credits: Math.max(0, state.credits + n) });
}

export function spendCredits(n: number): boolean {
  if (state.credits < n) return false;
  commit({ ...state, credits: state.credits - n });
  return true;
}

export function addPlayedTime(seconds: number): void {
  if (seconds <= 0) return;
  commit({ ...state, playedTimeSeconds: state.playedTimeSeconds + seconds });
}

export function completeMission(id: MissionId): void {
  const already = state.completedMissions.includes(id);
  const completed = already ? state.completedMissions : [...state.completedMissions, id];

  const nextUnlocks = new Set(state.unlockedPlanets);
  for (const m of MISSIONS) {
    if (!nextUnlocks.has(m.id) && m.requires.every((req) => completed.includes(req))) {
      nextUnlocks.add(m.id);
    }
  }

  const gatedSystem = SYSTEM_UNLOCK_GATES.get(id);
  const nextSystems =
    gatedSystem && !state.unlockedSolarSystems.includes(gatedSystem)
      ? [...state.unlockedSolarSystems, gatedSystem]
      : state.unlockedSolarSystems;

  commit({
    ...state,
    completedMissions: completed,
    unlockedPlanets: Array.from(nextUnlocks),
    unlockedSolarSystems: nextSystems
  });
}

// Switch the active solar system shown in the galaxy view. Refuses to switch
// to a system the player has not unlocked yet — the warp UI never offers
// locked systems, so this is a defensive guard against bad callers.
export function setSolarSystem(id: SolarSystemId): boolean {
  if (!state.unlockedSolarSystems.includes(id)) return false;
  if (state.currentSolarSystemId === id) return true;
  commit({ ...state, currentSolarSystemId: id });
  return true;
}

// Equip an owned weapon into a slot. The weapon slot kind must match the
// target slot. If the weapon is already equipped elsewhere, it is moved
// (single-instance ownership — no duplicating one weapon across two slots).
// If another weapon is currently in the target slot it gets bumped to null
// (still owned, just unequipped).
export function equipWeapon(slot: SlotName, id: WeaponId | null): boolean {
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
  if (isWeaponUnlocked(state.ship, id)) return false;
  const weapon = getWeapon(id);
  if (!spendCredits(weapon.cost)) return false;

  // Auto-equip into the first matching slot if it is empty; otherwise leave
  // unequipped in inventory. Keeps the post-purchase UX snappy for new
  // players (their first buy of a slot kind just lands on the ship).
  const target: SlotName =
    weapon.slot === "front"
      ? "front"
      : weapon.slot === "rear"
        ? "rear"
        : state.ship.slots.sidekickLeft === null
          ? "sidekickLeft"
          : "sidekickRight";

  const slotIsFree = state.ship.slots[target] === null;
  const nextSlots: WeaponSlots = slotIsFree
    ? { ...state.ship.slots, [target]: id }
    : state.ship.slots;

  commit({
    ...state,
    ship: {
      ...state.ship,
      unlockedWeapons: [...state.ship.unlockedWeapons, id],
      slots: nextSlots
    }
  });
  return true;
}

export function buyShieldUpgrade(): boolean {
  if (state.ship.shieldLevel >= MAX_LEVEL) return false;
  const cost = shieldUpgradeCost(state.ship.shieldLevel);
  if (!spendCredits(cost)) return false;
  commit({
    ...state,
    ship: { ...state.ship, shieldLevel: state.ship.shieldLevel + 1 }
  });
  return true;
}

export function buyArmorUpgrade(): boolean {
  if (state.ship.armorLevel >= MAX_LEVEL) return false;
  const cost = armorUpgradeCost(state.ship.armorLevel);
  if (!spendCredits(cost)) return false;
  commit({
    ...state,
    ship: { ...state.ship, armorLevel: state.ship.armorLevel + 1 }
  });
  return true;
}

export function buyReactorCapacityUpgrade(): boolean {
  if (state.ship.reactor.capacityLevel >= MAX_LEVEL) return false;
  const cost = reactorCapacityCost(state.ship.reactor.capacityLevel);
  if (!spendCredits(cost)) return false;
  commit({
    ...state,
    ship: {
      ...state.ship,
      reactor: { ...state.ship.reactor, capacityLevel: state.ship.reactor.capacityLevel + 1 }
    }
  });
  return true;
}

export function buyReactorRechargeUpgrade(): boolean {
  if (state.ship.reactor.rechargeLevel >= MAX_LEVEL) return false;
  const cost = reactorRechargeCost(state.ship.reactor.rechargeLevel);
  if (!spendCredits(cost)) return false;
  commit({
    ...state,
    ship: {
      ...state.ship,
      reactor: { ...state.ship.reactor, rechargeLevel: state.ship.reactor.rechargeLevel + 1 }
    }
  });
  return true;
}

// Spend credits to bump a single weapon's mark level by one. Refuses on
// non-owned weapons (you can't upgrade something you don't own) and at the
// MAX_LEVEL cap. Cost scales 200, 400, 800, 1600 — same family as shield/armor.
export function buyWeaponUpgrade(id: WeaponId): boolean {
  if (!isWeaponUnlocked(state.ship, id)) return false;
  const current = getWeaponLevel(state.ship, id);
  if (current >= MAX_LEVEL) return false;
  const cost = weaponUpgradeCost(current);
  if (!spendCredits(cost)) return false;
  commit({
    ...state,
    ship: {
      ...state.ship,
      weaponLevels: { ...state.ship.weaponLevels, [id]: current + 1 }
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
  commit({
    ...state,
    ship: {
      ...state.ship,
      augmentInventory: [...state.ship.augmentInventory, id]
    }
  });
  return true;
}

// Mid-mission augment pickup: just add to inventory, no cost.
export function grantAugment(id: AugmentId): void {
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

export function isMissionCompleted(id: MissionId): boolean {
  return state.completedMissions.includes(id);
}

export function isPlanetUnlocked(id: MissionId): boolean {
  return state.unlockedPlanets.includes(id);
}

// ---------- Persistence boundary ----------

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

interface LegacyShipSnapshot {
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

function cloneWeaponAugments(aug: WeaponAugments): WeaponAugments {
  const out: Record<string, readonly AugmentId[]> = {};
  for (const [wid, ids] of Object.entries(aug)) {
    if (ids && ids.length > 0) out[wid] = [...ids];
  }
  return out;
}

const KNOWN_AUGMENT_IDS = new Set<AugmentId>(AUGMENT_IDS);

function isKnownAugment(id: unknown): id is AugmentId {
  return typeof id === "string" && KNOWN_AUGMENT_IDS.has(id as AugmentId);
}

function migrateShip(input: ShipConfig | LegacyShipSnapshot): ShipConfig {
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

export function resetForTests(): void {
  commit(INITIAL_STATE);
}

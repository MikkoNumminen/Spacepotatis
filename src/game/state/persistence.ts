import { getAllSolarSystems } from "@/game/data/solarSystems";
import { isKnownStoryId, type StoryId } from "@/game/data/story";
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
  newWeaponInstance,
  type ShipConfig,
  type WeaponInstance,
  type WeaponInventory,
  type WeaponSlots
} from "./ShipConfig";
import { AUGMENT_IDS, MAX_AUGMENTS_PER_WEAPON } from "../data/augments";
import { WEAPON_IDS } from "@/lib/schemas/save";
import { INITIAL_STATE, SYSTEM_UNLOCK_GATES, commit, getState } from "./stateCore";

export interface StateSnapshot {
  credits: number;
  completedMissions: MissionId[];
  unlockedPlanets: MissionId[];
  playedTimeSeconds: number;
  ship: ShipConfig;
  saveSlot: number;
  currentSolarSystemId: SolarSystemId;
  unlockedSolarSystems: SolarSystemId[];
  seenStoryEntries: StoryId[];
}

export function toSnapshot(): StateSnapshot {
  const state = getState();
  return {
    credits: state.credits,
    completedMissions: [...state.completedMissions],
    unlockedPlanets: [...state.unlockedPlanets],
    playedTimeSeconds: state.playedTimeSeconds,
    ship: cloneShip(state.ship),
    saveSlot: state.saveSlot,
    currentSolarSystemId: state.currentSolarSystemId,
    unlockedSolarSystems: [...state.unlockedSolarSystems],
    seenStoryEntries: [...state.seenStoryEntries]
  };
}

// Accepts the new instance-based ship snapshot AND every legacy snapshot
// shape that pre-dates the instance refactor:
//   - legacy id-string slots + unlockedWeapons + weaponLevels + weaponAugments
//   - the four-named-slot `slots: { front, rear, sidekickLeft, sidekickRight }` object
//   - the original `primaryWeapon` shape (pre-loadout refactor)
// All of those are folded into `slots: (WeaponInstance | null)[]` plus an
// `inventory` of WeaponInstance here.
export function hydrate(snapshot: Partial<StateSnapshot>): void {
  const knownSystemIds = new Set(getAllSolarSystems().map((s) => s.id));
  const baseUnlockedSystems =
    snapshot.unlockedSolarSystems && snapshot.unlockedSolarSystems.length > 0
      ? snapshot.unlockedSolarSystems.filter((id) => knownSystemIds.has(id))
      : [...INITIAL_STATE.unlockedSolarSystems];

  // Retroactive system-unlock backfill. SYSTEM_UNLOCK_GATES is consulted
  // when completeMission() runs, but a player who cleared the gating
  // mission BEFORE that gate code shipped never got the unlock written
  // to their save. Re-derive from completedMissions on every load so old
  // saves catch up to the current gate map without needing a one-shot
  // migration. Idempotent — already-unlocked systems are deduped via Set.
  const unlockedSystemsSet = new Set(baseUnlockedSystems);
  const completedMissions = snapshot.completedMissions ?? [];
  for (const [gateMissionId, gatedSystemId] of SYSTEM_UNLOCK_GATES) {
    if (!knownSystemIds.has(gatedSystemId)) continue;
    if (completedMissions.includes(gateMissionId)) {
      unlockedSystemsSet.add(gatedSystemId);
    }
  }
  const unlockedSystems = Array.from(unlockedSystemsSet);

  const fallbackSystem = unlockedSystems[0] ?? INITIAL_STATE.currentSolarSystemId;
  const requestedCurrent = snapshot.currentSolarSystemId;
  const currentSystem =
    requestedCurrent && unlockedSystems.includes(requestedCurrent)
      ? requestedCurrent
      : fallbackSystem;

  const seenStoryEntries = Array.isArray(snapshot.seenStoryEntries)
    ? snapshot.seenStoryEntries.filter(isKnownStoryId)
    : [...INITIAL_STATE.seenStoryEntries];

  commit({
    credits: snapshot.credits ?? INITIAL_STATE.credits,
    completedMissions: snapshot.completedMissions ?? [...INITIAL_STATE.completedMissions],
    unlockedPlanets: snapshot.unlockedPlanets ?? [...INITIAL_STATE.unlockedPlanets],
    playedTimeSeconds: snapshot.playedTimeSeconds ?? INITIAL_STATE.playedTimeSeconds,
    ship: snapshot.ship ? migrateShip(snapshot.ship) : cloneShip(INITIAL_STATE.ship),
    saveSlot: snapshot.saveSlot ?? INITIAL_STATE.saveSlot,
    currentSolarSystemId: currentSystem,
    unlockedSolarSystems: unlockedSystems,
    seenStoryEntries
  });
}

// Loose snapshot accepted by migrateShip. Covers every historical ship shape
// the persistence layer may see in a save row. Every field is optional and
// permissive (string / number rather than the union types) because untrusted
// jsonb may carry partial or garbled data — the strict cleanup happens inside
// migrateShip, not at the type boundary.
//
// Supported shapes:
//   - new instance shape: { slots: (WeaponInstance | null)[], inventory: WeaponInstance[], ... }
//   - legacy id-string slots: { slots: (WeaponId | null)[], unlockedWeapons, weaponLevels, weaponAugments, ... }
//   - four-named-slot object: { slots: { front, rear, sidekickLeft, sidekickRight }, ... }
//   - pre-loadout primaryWeapon: { primaryWeapon, ... }
export interface LegacyShipSnapshot {
  primaryWeapon?: WeaponId | string;
  slots?:
    | readonly (WeaponInstance | WeaponId | string | null | LegacyWeaponInstanceLike)[]
    | LegacyNamedSlots;
  inventory?: readonly (WeaponInstance | LegacyWeaponInstanceLike)[];
  unlockedWeapons?: readonly (WeaponId | string)[];
  weaponLevels?: Readonly<Record<string, number>>;
  weaponAugments?: Readonly<Record<string, readonly (AugmentId | string)[]>>;
  augmentInventory?: readonly (AugmentId | string)[];
  shieldLevel?: number;
  armorLevel?: number;
  reactor?: Partial<ShipConfig["reactor"]>;
}

interface LegacyNamedSlots {
  front?: WeaponId | string | null;
  rear?: WeaponId | string | null;
  sidekickLeft?: WeaponId | string | null;
  sidekickRight?: WeaponId | string | null;
}

// Permissive instance shape. A persisted instance may have partial fields if
// it was written by an older client; migrateShip fills the gaps.
interface LegacyWeaponInstanceLike {
  id?: WeaponId | string;
  level?: number;
  augments?: readonly (AugmentId | string)[];
}

export const KNOWN_AUGMENT_IDS = new Set<AugmentId>(AUGMENT_IDS);
const KNOWN_WEAPON_IDS = new Set<WeaponId>(WEAPON_IDS);

export function isKnownAugment(id: unknown): id is AugmentId {
  return typeof id === "string" && KNOWN_AUGMENT_IDS.has(id as AugmentId);
}

function isKnownWeapon(id: unknown): id is WeaponId {
  return typeof id === "string" && KNOWN_WEAPON_IDS.has(id as WeaponId);
}

function clampLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.trunc(value)));
}

function clampUpgradeLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_LEVEL, Math.trunc(value)));
}

function sanitizeAugmentList(input: unknown): AugmentId[] {
  if (!Array.isArray(input)) return [];
  const out: AugmentId[] = [];
  for (const aid of input) {
    if (!isKnownAugment(aid)) continue;
    if (out.includes(aid)) continue;
    out.push(aid);
    if (out.length >= MAX_AUGMENTS_PER_WEAPON) break;
  }
  return out;
}

// Deep clone a ShipConfig. Slots/inventory are arrays of plain objects, so a
// per-instance clone keeps the snapshot immutable from the live state.
function cloneShip(ship: ShipConfig): ShipConfig {
  return {
    slots: ship.slots.map((s) => (s ? cloneInstance(s) : null)),
    inventory: ship.inventory.map(cloneInstance),
    augmentInventory: [...ship.augmentInventory],
    shieldLevel: ship.shieldLevel,
    armorLevel: ship.armorLevel,
    reactor: { ...ship.reactor }
  };
}

function cloneInstance(inst: WeaponInstance): WeaponInstance {
  return { id: inst.id, level: inst.level, augments: [...inst.augments] };
}

// A value looks like a WeaponInstance if it's a non-null object (and not an
// array) with at least an `id` field — even if level/augments are missing.
function looksLikeInstance(value: unknown): value is LegacyWeaponInstanceLike {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in (value as Record<string, unknown>)
  );
}

function buildInstance(raw: LegacyWeaponInstanceLike): WeaponInstance | null {
  if (!isKnownWeapon(raw.id)) return null;
  return {
    id: raw.id,
    level: clampLevel(raw.level),
    augments: sanitizeAugmentList(raw.augments)
  };
}

export function migrateShip(input: ShipConfig | LegacyShipSnapshot): ShipConfig {
  const raw = input as LegacyShipSnapshot;

  const shieldLevel = clampUpgradeLevel(raw.shieldLevel);
  const armorLevel = clampUpgradeLevel(raw.armorLevel);
  const reactor = {
    capacityLevel: clampUpgradeLevel(raw.reactor?.capacityLevel),
    rechargeLevel: clampUpgradeLevel(raw.reactor?.rechargeLevel)
  };
  const augmentInventory = sanitizeStandaloneAugmentInventory(raw.augmentInventory);

  const { slots, inventory } = migrateSlotsAndInventory(raw);

  return {
    slots,
    inventory,
    augmentInventory,
    shieldLevel,
    armorLevel,
    reactor
  };
}

// The free-floating augmentInventory has no per-weapon cap — MAX_AUGMENTS_PER_WEAPON
// only applies once an augment is bound to an instance. So this filter is
// just "drop unknown ids, preserve order".
function sanitizeStandaloneAugmentInventory(
  input: readonly (AugmentId | string)[] | undefined
): AugmentId[] {
  const out: AugmentId[] = [];
  if (!Array.isArray(input)) return out;
  for (const aid of input) {
    if (isKnownAugment(aid)) out.push(aid);
  }
  return out;
}

interface SlotsAndInventory {
  slots: WeaponSlots;
  inventory: WeaponInventory;
}

// Resolves all four input shapes into the canonical (slots, inventory) pair:
//
//   1. NEW SHAPE — slots is an array of (WeaponInstance | null), inventory is
//      an array of WeaponInstance. Validate each instance; drop any with an
//      unknown id (slot becomes null, inventory entry is skipped).
//
//   2. LEGACY SHAPE A — slots is an array of WeaponId strings (or null) and
//      the per-id state lives in unlockedWeapons + weaponLevels + weaponAugments.
//      Synthesize one instance per unique unlocked id, then assign instances
//      to slots by removing them from the inventory pool. The first slot
//      referencing an id wins; subsequent slot references resolve to null
//      because the legacy data only has one instance per id.
//
//   3. LEGACY SHAPE B — slots is the four-named-slot object. Only `front`
//      survives as a slot reference; otherwise treat as Shape A.
//
//   4. LEGACY SHAPE C — pre-loadout, only `primaryWeapon` exists. Treat
//      slots as [primaryWeapon]; otherwise as Shape A.
//
//   5. EMPTY — fall back to a fresh DEFAULT_SHIP slot layout.
//
// In all cases: cap slots at MAX_WEAPON_SLOTS, guarantee at least one slot,
// and if the result has every slot null AND empty inventory, fall back to
// the starter `[newWeaponInstance("rapid-fire")]` so the player isn't
// stranded with no weapons at all.
function migrateSlotsAndInventory(raw: LegacyShipSnapshot): SlotsAndInventory {
  // Path 1: new instance shape — detect by any slot/inventory entry that
  // looks like an instance object. If we see one, the entire ship is
  // assumed to be on the new model; legacy maps are ignored.
  if (looksLikeNewShape(raw)) {
    return migrateNewShape(raw);
  }

  // Path 2/3/4: legacy. Build an instance pool from per-id state, then assign
  // to slots from the slot ids found in the snapshot.
  const instancePool = buildLegacyInstancePool(raw);
  const slotIds = extractLegacySlotIds(raw);

  const slots: (WeaponInstance | null)[] = [];
  const limit = Math.min(slotIds.length, MAX_WEAPON_SLOTS);
  for (let i = 0; i < limit; i++) {
    const id = slotIds[i];
    if (id && isKnownWeapon(id)) {
      const idx = instancePool.findIndex((inst) => inst.id === id);
      if (idx >= 0) {
        const taken = instancePool[idx];
        instancePool.splice(idx, 1);
        slots.push(taken ?? null);
        continue;
      }
    }
    slots.push(null);
  }

  // Always at least one slot.
  if (slots.length === 0) slots.push(null);

  const inventory: WeaponInstance[] = instancePool;

  // Empty / unparseable safety net: if no slot is filled and there's nothing
  // in inventory, the player would be weaponless. Drop in the starter.
  if (slots.every((s) => s === null) && inventory.length === 0) {
    return {
      slots: [newWeaponInstance("rapid-fire")],
      inventory: []
    };
  }

  return { slots, inventory };
}

function looksLikeNewShape(raw: LegacyShipSnapshot): boolean {
  if (Array.isArray(raw.inventory) && raw.inventory.some(looksLikeInstance)) {
    return true;
  }
  if (Array.isArray(raw.slots) && raw.slots.some(looksLikeInstance)) {
    return true;
  }
  return false;
}

function migrateNewShape(raw: LegacyShipSnapshot): SlotsAndInventory {
  const slotInputs = Array.isArray(raw.slots) ? raw.slots : [];
  const slots: (WeaponInstance | null)[] = [];
  for (let i = 0; i < Math.min(slotInputs.length, MAX_WEAPON_SLOTS); i++) {
    const entry = slotInputs[i];
    if (entry === null || entry === undefined) {
      slots.push(null);
      continue;
    }
    if (looksLikeInstance(entry)) {
      slots.push(buildInstance(entry));
      continue;
    }
    // A bare string in the new shape is treated as "id with default level
    // and no augments" — a permissive nicety so a partially-migrated row
    // doesn't lose its slot.
    if (typeof entry === "string") {
      slots.push(isKnownWeapon(entry) ? newWeaponInstance(entry) : null);
      continue;
    }
    slots.push(null);
  }
  if (slots.length === 0) slots.push(null);

  const inventoryInput = Array.isArray(raw.inventory) ? raw.inventory : [];
  const inventory: WeaponInstance[] = [];
  for (const entry of inventoryInput) {
    if (!looksLikeInstance(entry)) continue;
    const inst = buildInstance(entry);
    if (inst) inventory.push(inst);
  }

  // New-shape safety net mirrors the legacy path.
  if (slots.every((s) => s === null) && inventory.length === 0) {
    return {
      slots: [newWeaponInstance("rapid-fire")],
      inventory: []
    };
  }

  return { slots, inventory };
}

// Synthesize one WeaponInstance per unique id in unlockedWeapons, populated
// from weaponLevels / weaponAugments. Dedupes by first occurrence so the
// instance pool reflects "one per unlocked id" — that's the legacy invariant.
function buildLegacyInstancePool(raw: LegacyShipSnapshot): WeaponInstance[] {
  const pool: WeaponInstance[] = [];
  const seen = new Set<WeaponId>();
  if (!Array.isArray(raw.unlockedWeapons)) return pool;
  for (const id of raw.unlockedWeapons) {
    if (!isKnownWeapon(id) || seen.has(id)) continue;
    seen.add(id);
    const level = clampLevel(raw.weaponLevels?.[id]);
    const augments = sanitizeAugmentList(raw.weaponAugments?.[id]);
    pool.push({ id, level, augments });
  }
  return pool;
}

// Returns the ordered list of slot id references in the legacy snapshot.
// Strings (or null) only — instance objects are handled by the new-shape
// branch and never reach here.
function extractLegacySlotIds(raw: LegacyShipSnapshot): (string | null)[] {
  if (Array.isArray(raw.slots)) {
    return raw.slots.map((entry) => {
      if (typeof entry === "string") return entry;
      return null;
    });
  }

  if (raw.slots && typeof raw.slots === "object") {
    const named = raw.slots as LegacyNamedSlots;
    return [typeof named.front === "string" ? named.front : null];
  }

  if (typeof raw.primaryWeapon === "string") {
    return [raw.primaryWeapon];
  }

  return [...DEFAULT_SHIP.slots.map((s) => (s ? s.id : null))];
}

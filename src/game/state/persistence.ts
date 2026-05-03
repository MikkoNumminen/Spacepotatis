import { getAllSolarSystems } from "@/game/data/solarSystems";
import { isKnownStoryId, type StoryId } from "@/game/data/story";
import type {
  MissionId,
  SolarSystemId
} from "@/types/game";
import {
  type ShipConfig,
  type WeaponInstance
} from "./ShipConfig";
import {
  INITIAL_STATE,
  SYSTEM_UNLOCK_GATES,
  commit,
  getState,
  readSeenStoriesLocal
} from "./stateCore";
import {
  clampUpgradeLevel,
  isKnownAugment
} from "./persistence/helpers";
import type { LegacyShipSnapshot, SlotsAndInventory } from "./persistence/types";
import { looksLikeNewShape, migrateNewShape } from "./persistence/migrateNewShape";
import { migrateLegacyIdArray } from "./persistence/migrateLegacyIdArray";
import { migrateNamedSlots } from "./persistence/migrateNamedSlots";
import { migratePrimaryWeapon } from "./persistence/migratePrimaryWeapon";
import { seedStarterIfEmpty } from "./persistence/safetyNet";
import { calculateLegacyRefund } from "./persistence/salvageRemovedWeapons";
import type { AugmentId } from "@/types/game";

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

  // Union the server-side list with the browser-local backup. The local
  // copy is the safety net for the case where the save POST never landed
  // (network drop, missing DB column pre-migration, race on logout) — the
  // popup must NEVER re-fire on the same device after the player has
  // already watched it. Server-side stays authoritative for cross-device.
  const serverSeen = Array.isArray(snapshot.seenStoryEntries)
    ? snapshot.seenStoryEntries.filter(isKnownStoryId)
    : [];
  const localSeen = readSeenStoriesLocal();
  const seenStoryEntries = Array.from(new Set<StoryId>([...serverSeen, ...localSeen]));

  // Salvage step: scan the raw ship snapshot for instances of removed-from-
  // catalog weapon ids BEFORE migrateShip drops them silently (see comment
  // in salvageRemovedWeapons.ts). Refund (cost + per-level upgrades + augment
  // costs) gets added to the player's credits so no progress is lost when a
  // weapon leaves the catalog. No-op when the ship has no removed ids.
  const refundOutcome = snapshot.ship
    ? calculateLegacyRefund(snapshot.ship as LegacyShipSnapshot)
    : { creditRefund: 0, removedIds: [] as readonly string[] };
  const baseCredits = snapshot.credits ?? INITIAL_STATE.credits;

  commit({
    credits: baseCredits + refundOutcome.creditRefund,
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

function migrateShip(input: ShipConfig | LegacyShipSnapshot): ShipConfig {
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

// Resolves all four input shapes into the canonical (slots, inventory) pair
// by dispatching to the per-shape migrator, then applying the empty-ship
// safety net so the player always has at least the starter weapon.
function migrateSlotsAndInventory(raw: LegacyShipSnapshot): SlotsAndInventory {
  const result = dispatchByShape(raw);
  return seedStarterIfEmpty(result);
}

function dispatchByShape(raw: LegacyShipSnapshot): SlotsAndInventory {
  // Path 1: new instance shape — detect by any slot/inventory entry that
  // looks like an instance object. If we see one, the entire ship is
  // assumed to be on the new model; legacy maps are ignored.
  if (looksLikeNewShape(raw)) {
    return migrateNewShape(raw);
  }

  // Path 2: legacy id-array. slots is an array (possibly empty) of strings.
  if (Array.isArray(raw.slots)) {
    return migrateLegacyIdArray(raw);
  }

  // Path 3: legacy named-slots. slots is the four-named-slot object.
  if (raw.slots && typeof raw.slots === "object") {
    return migrateNamedSlots(raw);
  }

  // Path 4: pre-loadout primaryWeapon shape.
  if (typeof raw.primaryWeapon === "string") {
    return migratePrimaryWeapon(raw);
  }

  // Path 5: empty / no recognizable slot reference — fall back to the
  // default ship slot layout via the legacy id-array path. assignSlotsFromPool
  // will resolve it against an empty instance pool.
  return migrateLegacyIdArray(raw);
}


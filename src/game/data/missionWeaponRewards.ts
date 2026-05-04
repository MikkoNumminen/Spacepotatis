// Per-mission weapon-shop unlock map. Each mission-kind mission "owns" a
// single weapon: completing the mission unlocks that weapon for purchase
// in the shop. The shop list is derived from state.completedMissions —
// no save-shape change.
//
// The mapping is total in both directions (every mission-kind mission has
// exactly one weapon; every weapon has exactly one source mission). The
// totality invariant is enforced by missionWeaponRewards.test.ts and by
// the cross-reference checker in integrityCheck.ts.
//
// Tutorial weapon (rapid-fire) is the starter and ships with DEFAULT_SHIP
// (see ShipConfig.ts). The gate is still uniform: a brand-new player who
// hasn't beaten the tutorial sees an empty buy list. They can't afford
// anything anyway, and the rule stays consistent.
import { getAllWeapons } from "./weapons";
import type { MissionId, WeaponId } from "@/types/game";

export const MISSION_WEAPON_REWARDS: ReadonlyMap<MissionId, WeaponId> = new Map<
  MissionId,
  WeaponId
>([
  ["tutorial", "rapid-fire"],
  ["combat-1", "spread-shot"],
  ["boss-1", "heavy-cannon"],
  ["pirate-beacon", "corsair-missile"],
  ["ember-run", "grapeshot-cannon"],
  ["burnt-spud", "boarding-snare"]
]);

// Pure helper. Returns the weapon ids whose source mission is in
// `completed`, in the catalog order from getAllWeapons() so the shop
// list is stable regardless of the order in which missions were beaten.
export function getBuyableWeaponIds(
  completed: ReadonlySet<MissionId>
): readonly WeaponId[] {
  const unlocked = new Set<WeaponId>();
  for (const [missionId, weaponId] of MISSION_WEAPON_REWARDS) {
    if (completed.has(missionId)) unlocked.add(weaponId);
  }
  return getAllWeapons()
    .map((w) => w.id)
    .filter((id) => unlocked.has(id));
}

// Reverse lookup. Returns the mission whose completion unlocks `weaponId`,
// or null if the weapon has no source mission. Useful for tests and any
// future "unlock-source" tooltip.
export function getMissionForWeapon(weaponId: WeaponId): MissionId | null {
  for (const [missionId, w] of MISSION_WEAPON_REWARDS) {
    if (w === weaponId) return missionId;
  }
  return null;
}

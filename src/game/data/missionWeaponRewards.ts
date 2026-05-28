// PUBLIC API — every export from this file is part of the `content` module's contract.
//   Stable. Breaking changes coordinate with state/, ui/, phaser/, three/, app/.
//   See ./README.md for the rationale.
//
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
import type { MissionId, WeaponId } from "@/types";

/**
 * Mission → weapon unlock map. Total in both directions: every combat
 * mission has exactly one weapon reward; every shop-buyable weapon has
 * exactly one source mission. Keys not present here are missions whose
 * completion does not unlock anything in the shop (shop / hub planets).
 *
 * @stable Part of `content` public API.
 */
// INVARIANT: bijection between MissionId (combat-kind) and WeaponId.
// Tested by missionWeaponRewards.test.ts and integrityCheck.ts.
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

/**
 * Returns the weapon ids the player can currently buy, given a set of
 * completed missions. The order is the catalog order from
 * {@link getAllWeapons} — stable regardless of the order in which
 * missions were beaten, so the shop list doesn't shuffle visually.
 *
 * @stable Part of `content` public API.
 */
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

/**
 * Reverse lookup. Returns the mission whose completion unlocks
 * `weaponId`, or `null` if the weapon has no source mission (shouldn't
 * happen for live weapons; the integrity check enforces totality).
 *
 * @stable Part of `content` public API.
 */
export function getMissionForWeapon(weaponId: WeaponId): MissionId | null {
  for (const [missionId, w] of MISSION_WEAPON_REWARDS) {
    if (w === weaponId) return missionId;
  }
  return null;
}

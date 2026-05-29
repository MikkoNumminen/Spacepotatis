// PUBLIC API — part of the `content` module surface.
//   Stable. Breaking changes require a coordinated update of consumers.
//   See ./README.md and ../../../docs/audit/02-target-architecture.md.
//
// Static gate map: completing a mission unlocks the corresponding solar
// system on the next state commit. Lives here (content module) rather than
// in `state/stateCore.ts` so the save-pipeline cheat guards in
// `src/lib/saveValidation.ts` can consume it without a `infra → state`
// back-edge. The map is data, not game logic — it's a tiny static
// declaration that game-balance changes will edit.

import type { MissionId, SolarSystemId } from "@/types";

/**
 * Completing one of these missions unlocks the corresponding system the
 * next time GameState commits. Keep the map small and flat — gating is
 * rare and cheap to read on every completeMission call.
 *
 * Consumed by:
 *   - `src/game/state/persistence.ts#hydrate()` — backfills
 *     `unlockedSolarSystems` from the player's completedMissions.
 *   - `src/game/state/stateCore.ts#completeMission()` — flips a system
 *     to unlocked on the matching completion.
 *   - `src/lib/saveValidation.ts#getReachableSolarSystems()` — derives
 *     the SEC-027 unlock set server-side, never trusting body data.
 *
 * @stable
 */
export const SYSTEM_UNLOCK_GATES: ReadonlyMap<MissionId, SolarSystemId> = new Map([
  ["boss-1", "tubernovae"]
]);

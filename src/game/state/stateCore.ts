import { getAllMissions } from "@/game/data/missions";
import type {
  MissionDefinition,
  MissionId,
  SolarSystemId
} from "@/types/game";
import { isKnownStoryId, type StoryId } from "@/game/data/story";
import { DEFAULT_SHIP, type ShipConfig } from "./ShipConfig";

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
  readonly seenStoryEntries: readonly StoryId[];
}

export const MISSIONS: readonly MissionDefinition[] = getAllMissions();

export const INITIAL_UNLOCKED: readonly MissionId[] = MISSIONS.filter(
  (m) => m.requires.length === 0
).map((m) => m.id);

// Completing one of these missions unlocks the corresponding system the next
// time GameState commits. Keep map small and flat — gating is rare and cheap
// to read on every completeMission call.
export const SYSTEM_UNLOCK_GATES: ReadonlyMap<MissionId, SolarSystemId> = new Map([
  ["boss-1", "tubernovae"]
]);

// Browser-local backup of the seen-story list. Read at module init so
// INITIAL_STATE has the right value before any cloud-save logic runs —
// the popup must NEVER re-fire on the same device after the player has
// already watched it. Hydrate merges this with the server list too, so
// cross-device sync still works once persistence is healthy.
export const SEEN_STORIES_LOCAL_KEY = "spacepotatis:seenStoryEntries";

export function readSeenStoriesLocal(): readonly StoryId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_STORIES_LOCAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isKnownStoryId);
  } catch {
    return [];
  }
}

function writeSeenStoriesLocal(ids: readonly StoryId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_STORIES_LOCAL_KEY, JSON.stringify(ids));
  } catch {
    // localStorage may be disabled (private mode, quota); the in-memory
    // session-level fire-once guard in GameCanvas covers this case.
  }
}

export const INITIAL_STATE: GameStateShape = {
  credits: 0,
  completedMissions: [],
  unlockedPlanets: INITIAL_UNLOCKED,
  playedTimeSeconds: 0,
  ship: DEFAULT_SHIP,
  saveSlot: 1,
  currentSolarSystemId: "tutorial",
  unlockedSolarSystems: ["tutorial"],
  // Without this seed, /api/save → null (brand-new save row, or a 500
  // from the missing seen_story_entries column pre-migration) would skip
  // hydrate entirely and leave seenStoryEntries at [].
  seenStoryEntries: [...readSeenStoriesLocal()]
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

export function commit(next: GameStateShape): void {
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

export function markStorySeen(id: StoryId): void {
  if (state.seenStoryEntries.includes(id)) return;
  const next = [...state.seenStoryEntries, id];
  commit({ ...state, seenStoryEntries: next });
  writeSeenStoriesLocal(next);
}

export function isMissionCompleted(id: MissionId): boolean {
  return state.completedMissions.includes(id);
}

export function isPlanetUnlocked(id: MissionId): boolean {
  return state.unlockedPlanets.includes(id);
}

export function resetForTests(): void {
  commit(INITIAL_STATE);
}

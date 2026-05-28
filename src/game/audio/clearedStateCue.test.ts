import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionId, SolarSystemId } from "@/types";
import { getAllMissions } from "@/game/data/missions";
import type * as UiCuesT from "./uiCues";
import type * as ClearedStateCueT from "./clearedStateCue";

// clearedStateCue decides which of two cleared-state Grandma cues to fire on
// a mission victory. The "everything cleared" flag is localStorage-persisted
// once-per-device; system-cleared fires unconditionally on the matching
// state flip and is suppressed when everythingCleared fired.

const TUTORIAL: SolarSystemId = "tutorial";
const TUBERNOVAE: SolarSystemId = "tubernovae";

// In-memory localStorage shim. The test environment is `node`; jsdom is not
// installed in this repo. The helper's getStorage() reads `window.localStorage`,
// so we attach a minimal Storage-shaped object to globalThis.window for the
// duration of each test.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(i: number): string | null { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, String(v)); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

let uiCues: typeof UiCuesT;
let clearedStateCue: typeof ClearedStateCueT;
let playSpy: ReturnType<typeof vi.fn<(id: UiCuesT.UiCueId) => void>>;
let storage: MemoryStorage;

beforeEach(async () => {
  storage = new MemoryStorage();
  // Attach a minimal window with localStorage so the helper's getStorage()
  // resolves. Keep it scoped to the test — restored in afterEach.
  (globalThis as { window?: unknown }).window = { localStorage: storage };

  vi.resetModules();
  uiCues = await import("./uiCues");
  clearedStateCue = await import("./clearedStateCue");
  playSpy = vi.fn<(id: UiCuesT.UiCueId) => void>();
  vi.spyOn(uiCues, "playUiCue").mockImplementation(playSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

// Mission catalog is static; pull the ids per system once.
function getMissionIds(systemId: SolarSystemId): MissionId[] {
  return getAllMissions()
    .filter((m) => m.solarSystemId === systemId && m.kind === "mission")
    .map((m) => m.id);
}

describe("maybePlayClearedCue", () => {
  it("does nothing when neither system nor everything is cleared", () => {
    clearedStateCue.maybePlayClearedCue({
      justCompletedMissionId: "tutorial" as MissionId,
      completedMissions: [],
      currentSolarSystemId: TUTORIAL,
      unlockedSolarSystems: [TUTORIAL]
    });
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("plays systemCleared when the current system flips cleared but other systems still have open missions", () => {
    const tutorialIds = getMissionIds(TUTORIAL);
    const lastTutorial = tutorialIds[tutorialIds.length - 1];
    if (!lastTutorial) throw new Error("tutorial has no missions to test against");
    const completedBefore = tutorialIds.slice(0, -1);

    clearedStateCue.maybePlayClearedCue({
      justCompletedMissionId: lastTutorial,
      completedMissions: completedBefore,
      currentSolarSystemId: TUTORIAL,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    expect(playSpy).toHaveBeenCalledWith("systemCleared");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("plays everythingCleared (not systemCleared) when the last mission across all unlocked systems completes", () => {
    const all = [...getMissionIds(TUTORIAL), ...getMissionIds(TUBERNOVAE)];
    const last = all[all.length - 1];
    if (!last) throw new Error("no missions to test against");
    const completedBefore = all.slice(0, -1);

    clearedStateCue.maybePlayClearedCue({
      justCompletedMissionId: last,
      completedMissions: completedBefore,
      currentSolarSystemId: TUBERNOVAE,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    expect(playSpy).toHaveBeenCalledWith("everythingCleared");
    expect(playSpy).not.toHaveBeenCalledWith("systemCleared");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("everythingCleared fires only once per device (localStorage flag)", () => {
    const all = [...getMissionIds(TUTORIAL), ...getMissionIds(TUBERNOVAE)];
    const last = all[all.length - 1];
    if (!last) throw new Error("no missions to test against");
    const completedBefore = all.slice(0, -1);
    const input = {
      justCompletedMissionId: last,
      completedMissions: completedBefore,
      currentSolarSystemId: TUBERNOVAE,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    } as const;

    clearedStateCue.maybePlayClearedCue(input);
    clearedStateCue.maybePlayClearedCue(input);
    clearedStateCue.maybePlayClearedCue(input);

    expect(playSpy).toHaveBeenCalledWith("everythingCleared");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("re-arms the everythingCleared flag once the player is back below all-cleared", () => {
    const all = [...getMissionIds(TUTORIAL), ...getMissionIds(TUBERNOVAE)];
    const last = all[all.length - 1];
    if (!last) throw new Error("no missions to test against");

    // First trip to all-cleared: fires.
    clearedStateCue.maybePlayClearedCue({
      justCompletedMissionId: last,
      completedMissions: all.slice(0, -1),
      currentSolarSystemId: TUBERNOVAE,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(storage.getItem("spacepotatis:ui_everything_cleared_fired_v1")).toBe("1");

    // Sim "new content shipped": completing a mission in the current
    // already-completed list while the available-mission set has GROWN —
    // we approximate by passing a smaller completedMissions slice so the
    // helper sees "not everything cleared." This is the re-arm trigger.
    clearedStateCue.maybePlayClearedCue({
      justCompletedMissionId: last,
      completedMissions: all.slice(0, 1), // pretend most missions are now incomplete
      currentSolarSystemId: TUBERNOVAE,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    // Flag should be cleared. No cue fires on this call.
    expect(storage.getItem("spacepotatis:ui_everything_cleared_fired_v1")).toBeNull();

    // Next trip to all-cleared: fires again.
    clearedStateCue.maybePlayClearedCue({
      justCompletedMissionId: last,
      completedMissions: all.slice(0, -1),
      currentSolarSystemId: TUBERNOVAE,
      unlockedSolarSystems: [TUTORIAL, TUBERNOVAE]
    });
    expect(playSpy).toHaveBeenCalledTimes(2);
  });
});

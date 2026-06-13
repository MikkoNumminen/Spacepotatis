import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as UiCuesT from "./uiCues";
import type * as ClearedStateCueT from "./clearedStateCue";

// clearedStateCue decides which of two cleared-state Grandma cues to fire on a
// mission victory, GIVEN the {systemNowCleared, everythingNowCleared} verdict.
// The roster/progress math that produces those booleans lives in content
// (evaluateClearedBoundaries) and is tested in
// src/game/data/clearedState.test.ts — this file stays a pure audio-engine
// test with no @/game/data dependency. The "everything cleared" flag is
// localStorage-persisted once-per-device; system-cleared fires on the matching
// flip and is suppressed when everythingCleared fired.

const FLAG_KEY = "spacepotatis:ui_everything_cleared_fired_v1";

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

describe("maybePlayClearedCue", () => {
  it("does nothing when neither system nor everything is cleared", () => {
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: false, everythingNowCleared: false });
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("plays systemCleared when only the current system flipped cleared", () => {
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: true, everythingNowCleared: false });
    expect(playSpy).toHaveBeenCalledWith("systemCleared");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("plays everythingCleared (not systemCleared) when everything flipped cleared", () => {
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: true, everythingNowCleared: true });
    expect(playSpy).toHaveBeenCalledWith("everythingCleared");
    expect(playSpy).not.toHaveBeenCalledWith("systemCleared");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("everythingCleared fires only once per device (localStorage flag)", () => {
    const input = { systemNowCleared: true, everythingNowCleared: true } as const;
    clearedStateCue.maybePlayClearedCue(input);
    clearedStateCue.maybePlayClearedCue(input);
    clearedStateCue.maybePlayClearedCue(input);

    expect(playSpy).toHaveBeenCalledWith("everythingCleared");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("re-arms the everythingCleared flag once the player is back below all-cleared", () => {
    // First trip to all-cleared: fires + sets the flag.
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: true, everythingNowCleared: true });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(storage.getItem(FLAG_KEY)).toBe("1");

    // New content shipped → no longer all-cleared. Flag drops; no cue fires.
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: false, everythingNowCleared: false });
    expect(storage.getItem(FLAG_KEY)).toBeNull();

    // Next trip to all-cleared: fires again.
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: true, everythingNowCleared: true });
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("does not fire everythingCleared again if it was already cleared (flag set, no flip this victory)", () => {
    // Pre-set the flag as if everything was already cleared on a prior visit.
    storage.setItem(FLAG_KEY, "1");
    // This victory reports everything still cleared (no flip). Neither cue fires.
    clearedStateCue.maybePlayClearedCue({ systemNowCleared: true, everythingNowCleared: true });
    expect(playSpy).not.toHaveBeenCalled();
  });
});

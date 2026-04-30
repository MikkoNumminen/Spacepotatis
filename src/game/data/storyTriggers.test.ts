import { describe, expect, it } from "vitest";
import {
  selectFirstTimeEntry,
  selectOnSystemEnterEntry,
  selectOnMissionSelectEntry,
  selectReadyClearedIdleEntries
} from "./storyTriggers";
import type { StoryId } from "./story";
import type { MissionId } from "@/types/game";

// These tests exercise the pure trigger-selection helpers used by the
// useStoryTriggers hook. They run against the real STORY_ENTRIES catalog
// so adding a new entry that breaks an invariant (e.g. two first-time
// entries) is caught in CI.
//
// Pattern for adding a new trigger kind: write the helper in storyTriggers.ts
// and add a `describe` block here covering: fires-when-fresh, no-fire-when-
// seen, no-fire-when-auto-fired, no-fire-on-mismatch.

const empty = <T>(): ReadonlySet<T> => new Set<T>();

describe("selectFirstTimeEntry", () => {
  it("returns the great-potato-awakening cinematic on a fresh save", () => {
    const entry = selectFirstTimeEntry(empty<StoryId>(), empty<StoryId>());
    expect(entry?.id).toBe("great-potato-awakening");
  });

  it("returns null once the entry is already in the seen-set", () => {
    expect(
      selectFirstTimeEntry(new Set(["great-potato-awakening"]), empty<StoryId>())
    ).toBeNull();
  });

  it("returns null when the entry has already auto-fired this session", () => {
    expect(
      selectFirstTimeEntry(empty<StoryId>(), new Set(["great-potato-awakening"]))
    ).toBeNull();
  });
});

describe("selectOnSystemEnterEntry", () => {
  it("fires the tubernovae cinematic the first time the player enters tubernovae", () => {
    // The user-facing guarantee: any fresh player whose currentSolarSystemId
    // becomes "tubernovae" gets the chapter cinematic.
    const entry = selectOnSystemEnterEntry("tubernovae", empty<StoryId>(), empty<StoryId>());
    expect(entry?.id).toBe("tubernovae-cluster-intro");
    // Audio surface must be wired so the cinematic isn't silent.
    expect(entry?.musicTrack).not.toBeNull();
    expect(entry?.voiceTrack).toMatch(/^\/audio\/story\//);
    expect(entry?.mode).toBe("modal");
  });

  it("returns null in the tutorial system (no on-system-enter entry exists)", () => {
    expect(
      selectOnSystemEnterEntry("tutorial", empty<StoryId>(), empty<StoryId>())
    ).toBeNull();
  });

  it("returns null when the entry is in the seen-set (existing players)", () => {
    expect(
      selectOnSystemEnterEntry(
        "tubernovae",
        new Set(["tubernovae-cluster-intro"]),
        empty<StoryId>()
      )
    ).toBeNull();
  });

  it("returns null when the entry has already auto-fired this session", () => {
    expect(
      selectOnSystemEnterEntry(
        "tubernovae",
        empty<StoryId>(),
        new Set(["tubernovae-cluster-intro"])
      )
    ).toBeNull();
  });
});

describe("selectOnMissionSelectEntry", () => {
  it("returns the spud-prime briefing for the tutorial mission", () => {
    expect(selectOnMissionSelectEntry("tutorial")?.id).toBe("spud-prime-arrival");
  });

  it("returns the yamsteroid briefing for combat-1", () => {
    expect(selectOnMissionSelectEntry("combat-1")?.id).toBe("yamsteroid-belt-arrival");
  });

  it("returns the dreadfruit briefing for boss-1", () => {
    expect(selectOnMissionSelectEntry("boss-1")?.id).toBe("dreadfruit-arrival");
  });

  it("returns null for a mission with no briefing wired up", () => {
    // pirate-beacon has no on-mission-select story today; if you wire one
    // up, this assertion will need updating along with the entry.
    expect(selectOnMissionSelectEntry("pirate-beacon" as MissionId)).toBeNull();
  });
});

describe("selectReadyClearedIdleEntries", () => {
  const ALL_TUTORIAL = new Set<MissionId>(["tutorial", "combat-1", "boss-1"]);

  it("returns empty when no missions completed", () => {
    expect(selectReadyClearedIdleEntries("tutorial", new Set())).toEqual([]);
  });

  it("returns empty when only some tutorial missions completed", () => {
    expect(
      selectReadyClearedIdleEntries("tutorial", new Set<MissionId>(["tutorial"]))
    ).toEqual([]);
  });

  it("returns the cleared entry once every tutorial-system mission is completed", () => {
    const ready = selectReadyClearedIdleEntries("tutorial", ALL_TUTORIAL);
    expect(ready.map((e) => e.id)).toEqual(["sol-spudensis-cleared"]);
  });

  it("returns empty for tubernovae (no cleared-idle entry shipped yet)", () => {
    expect(selectReadyClearedIdleEntries("tubernovae", ALL_TUTORIAL)).toEqual([]);
  });
});

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
  // No entries use the `first-time` trigger anymore — the great-potato-
  // awakening cinematic moved to on-system-enter for `tutorial` so it
  // fires every time the player enters Sol Spudensis (parity with the
  // Tubernovae chapter cinematic). The helper is kept as scaffolding;
  // these assertions guard against accidentally re-introducing a first-
  // time entry without thinking through the implications (it would fire
  // exactly once on the first cold-load forever, which is rarely what
  // a writer actually wants).
  it("returns null on a fresh catalog with no first-time entries", () => {
    expect(selectFirstTimeEntry(empty<StoryId>(), empty<StoryId>())).toBeNull();
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

  it("fires the great-potato-awakening cinematic on entry into tutorial", () => {
    // Sol Spudensis (tutorial) gets its chapter cinematic the same way
    // tubernovae does — on every system entry, repeatable.
    const entry = selectOnSystemEnterEntry("tutorial", empty<StoryId>(), empty<StoryId>());
    expect(entry?.id).toBe("great-potato-awakening");
    expect(entry?.musicTrack).not.toBeNull();
    expect(entry?.voiceTrack).toMatch(/^\/audio\/story\//);
    expect(entry?.mode).toBe("modal");
  });

  it("repeatable entries fire even when in the seen-set (every-entry mode)", () => {
    // tubernovae-cluster-intro is configured `repeatable: true`, which
    // means the QA-friendly behavior of firing every time the player
    // transitions into the system regardless of save state. If you flip
    // that flag back to false (or delete it), this test becomes the
    // mirror image of the existing-players one.
    expect(
      selectOnSystemEnterEntry(
        "tubernovae",
        new Set(["tubernovae-cluster-intro"]),
        empty<StoryId>()
      )?.id
    ).toBe("tubernovae-cluster-intro");
  });

  it("repeatable=true bypass holds even with a fully-loaded seen-set", () => {
    // Stronger pin on the PR #62 contract: regardless of how much save
    // state the player has accumulated, the repeatable on-system-enter
    // cinematic still fires fresh. Uses the real tubernovae-cluster-intro
    // fixture (story.ts:215 ships with `repeatable: true`).
    const everySeenId = new Set<StoryId>([
      "tubernovae-cluster-intro",
      "great-potato-awakening",
      "spud-prime-arrival",
      "yamsteroid-belt-arrival",
      "dreadfruit-arrival",
      "sol-spudensis-cleared"
    ]);
    expect(
      selectOnSystemEnterEntry("tubernovae", everySeenId, empty<StoryId>())?.id
    ).toBe("tubernovae-cluster-intro");
  });

  it("returns null when the entry has already auto-fired this session", () => {
    // Even with repeatable=true, autoFired blocks within the same
    // residency in the system. The hook clears autoFired on system
    // transition so re-entering re-fires.
    expect(
      selectOnSystemEnterEntry(
        "tubernovae",
        empty<StoryId>(),
        new Set(["tubernovae-cluster-intro"])
      )
    ).toBeNull();
  });

  it("autoFired gates a repeatable entry even when seen-set is empty", () => {
    // Mirror of the gate above but with the freshest possible save state:
    // seen-set empty, autoFired populated. Pins the "modal can't loop while
    // idle in-system" guarantee independently of any seen-set interaction.
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

  it("returns null for an unknown missionId — the helper only matches on the trigger's missionId", () => {
    // Pinning the exact invariant: selectOnMissionSelectEntry takes only a
    // missionId. It does NOT consult unlockedPlanets, completedMissions, or
    // any other gating state — that's the hook's job. This test guards
    // against accidentally adding a side-channel filter to the helper.
    expect(
      selectOnMissionSelectEntry("not-a-real-mission" as MissionId)
    ).toBeNull();
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

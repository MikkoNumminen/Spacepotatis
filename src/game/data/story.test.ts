import { describe, expect, it } from "vitest";
import { getStoryEntry, isKnownStoryId, STORY_IDS } from "./story";
import type { StoryId } from "./story";

describe("getStoryEntry", () => {
  it("returns the matching entry for a known id", () => {
    const entry = getStoryEntry("great-potato-awakening");
    expect(entry.id).toBe("great-potato-awakening");
    expect(entry.title).toMatch(/Potato Awakening/);
    expect(entry.body.length).toBeGreaterThan(0);
  });

  it("throws with a descriptive message for an unknown id", () => {
    expect(() => getStoryEntry("not-a-story" as StoryId)).toThrow(/Unknown story id:/);
  });
});

describe("isKnownStoryId", () => {
  it("returns true for an id present in the catalog", () => {
    expect(isKnownStoryId("great-potato-awakening")).toBe(true);
  });

  it("returns false for a string not in the catalog", () => {
    expect(isKnownStoryId("evil")).toBe(false);
  });

  it("returns false for non-string input (typeof guard)", () => {
    expect(isKnownStoryId(42)).toBe(false);
    expect(isKnownStoryId(null)).toBe(false);
    expect(isKnownStoryId(undefined)).toBe(false);
    expect(isKnownStoryId({})).toBe(false);
  });

  it("agrees with STORY_IDS for every catalog entry", () => {
    for (const id of STORY_IDS) {
      expect(isKnownStoryId(id)).toBe(true);
    }
  });
});

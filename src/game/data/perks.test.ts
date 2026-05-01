import { afterEach, describe, expect, it, vi } from "vitest";
import { PERK_IDS, PERKS, randomPerkId } from "./perks";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PERK_IDS", () => {
  it("matches the keys of the PERKS table 1:1", () => {
    expect([...PERK_IDS].sort()).toEqual(Object.keys(PERKS).sort());
    expect(PERK_IDS.length).toBe(Object.keys(PERKS).length);
  });
});

describe("randomPerkId", () => {
  it("always returns a valid PerkId across many samples", () => {
    for (let n = 0; n < 100; n++) {
      const id = randomPerkId();
      expect(PERK_IDS).toContain(id);
    }
  });

  it("indexes the front of the array when Math.random returns 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(randomPerkId()).toBe(PERK_IDS[0]);
  });

  it("indexes the last element when Math.random returns just below 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(randomPerkId()).toBe(PERK_IDS[PERK_IDS.length - 1]);
  });

  it("falls back to overdrive on the arithmetically-impossible Math.random >= 1.0 path", () => {
    // The `?? \"overdrive\"` defensive fallback at perks.ts:47 only triggers
    // if Math.floor(rng * len) lands at or past PERK_IDS.length — which
    // requires rng >= 1.0, something Math.random never returns. Mocking a
    // misbehaving rng is the only way to exercise the branch.
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(randomPerkId()).toBe("overdrive");
  });
});

import { describe, expect, it } from "vitest";
import { bucketMissions } from "./questBuckets";
import { getAllMissions } from "@/game/data/missions";
import type { MissionDefinition } from "@/types/game";

const ALL = getAllMissions();
const TUTORIAL_SYSTEM = "tutorial" as const;
const TUBERNOVAE = "tubernovae" as const;

// A small synthesized fixture so the bucketing tests don't drift if the JSON
// adds new planets later. The shop is intentionally included to exercise the
// shop-stays-separate path without relying on the real `shop` mission.
const fixture: readonly MissionDefinition[] = [
  fakeMission({ id: "tutorial", solarSystemId: TUTORIAL_SYSTEM, requires: [] }),
  fakeMission({ id: "combat-1", solarSystemId: TUTORIAL_SYSTEM, requires: ["tutorial"] }),
  fakeMission({ id: "boss-1", solarSystemId: TUTORIAL_SYSTEM, requires: ["combat-1"] }),
  fakeShop({ id: "shop", solarSystemId: TUTORIAL_SYSTEM }),
  fakeMission({ id: "pirate-beacon", solarSystemId: TUBERNOVAE, requires: [] })
];

function fakeMission(overrides: Partial<MissionDefinition>): MissionDefinition {
  return {
    id: "tutorial",
    kind: "mission",
    name: "Test Mission",
    description: "x",
    difficulty: 1,
    texture: "",
    solarSystemId: TUTORIAL_SYSTEM,
    orbitRadius: 1,
    orbitSpeed: 1,
    startAngle: 0,
    scale: 1,
    requires: [],
    musicTrack: null,
    ...overrides
  } as MissionDefinition;
}

function fakeShop(overrides: Partial<MissionDefinition>): MissionDefinition {
  return fakeMission({ ...overrides, kind: "shop" });
}

describe("bucketMissions", () => {
  it("first unlocked uncleared mission becomes the suggestion", () => {
    const buckets = bucketMissions(fixture, TUTORIAL_SYSTEM, ["tutorial"], []);
    expect(buckets.suggested?.id).toBe("tutorial");
    expect(buckets.available).toEqual([]);
    expect(buckets.locked.map((m) => m.id)).toEqual(["combat-1", "boss-1"]);
    expect(buckets.cleared).toEqual([]);
  });

  it("additional unlocked uncleared missions land in `available`", () => {
    const buckets = bucketMissions(
      fixture,
      TUTORIAL_SYSTEM,
      ["tutorial", "combat-1", "boss-1"],
      ["tutorial"]
    );
    expect(buckets.suggested?.id).toBe("combat-1");
    expect(buckets.available.map((m) => m.id)).toEqual(["boss-1"]);
    expect(buckets.cleared.map((m) => m.id)).toEqual(["tutorial"]);
    expect(buckets.locked).toEqual([]);
  });

  it("returns suggested=null when every combat mission is cleared (the bug fix)", () => {
    // This is the exact state from the reported bug: all three Sol Spudensis
    // missions cleared. The old auto-select hook was happy to surface a
    // cleared mission anyway; the panel relies on suggested=null to flip
    // into the SYSTEM CLEAR / WARP CTA branch.
    const buckets = bucketMissions(
      fixture,
      TUTORIAL_SYSTEM,
      ["tutorial", "combat-1", "boss-1"],
      ["tutorial", "combat-1", "boss-1"]
    );
    expect(buckets.suggested).toBeNull();
    expect(buckets.available).toEqual([]);
    expect(buckets.cleared).toHaveLength(3);
    expect(buckets.locked).toEqual([]);
  });

  it("filters strictly by current solar system", () => {
    const buckets = bucketMissions(fixture, TUTORIAL_SYSTEM, ["tutorial", "pirate-beacon"], []);
    const ids = [
      ...(buckets.suggested ? [buckets.suggested.id] : []),
      ...buckets.available.map((m) => m.id),
      ...buckets.locked.map((m) => m.id),
      ...buckets.cleared.map((m) => m.id)
    ];
    expect(ids).not.toContain("pirate-beacon");
  });

  it("surfaces the shop separately, never in the four mission buckets", () => {
    const buckets = bucketMissions(fixture, TUTORIAL_SYSTEM, [], []);
    expect(buckets.shop?.id).toBe("shop");
    expect(buckets.suggested).toBeNull();
    expect(buckets.locked.map((m) => m.id)).toEqual(["tutorial", "combat-1", "boss-1"]);
    // The shop must never bleed into the combat buckets.
    expect(buckets.locked.some((m) => m.kind === "shop")).toBe(false);
    expect(buckets.cleared.some((m) => m.kind === "shop")).toBe(false);
  });

  it("works against the real missions.json fixture", () => {
    // Smoke check: bucketing the canonical data with no progress should
    // surface tutorial as the suggestion (its requires array is empty).
    const buckets = bucketMissions(ALL, TUTORIAL_SYSTEM, ["tutorial"], []);
    expect(buckets.suggested?.id).toBe("tutorial");
    expect(buckets.shop?.kind).toBe("shop");
  });
});

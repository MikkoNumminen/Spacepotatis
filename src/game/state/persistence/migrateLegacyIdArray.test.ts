import { describe, expect, it } from "vitest";
import { migrateLegacyIdArray } from "./migrateLegacyIdArray";
import { MAX_WEAPON_SLOTS } from "../ShipConfig";

describe("migrateLegacyIdArray", () => {
  it("synthesizes one instance per unique unlocked id and assigns by slot reference", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire", "spread-shot", null],
      unlockedWeapons: ["rapid-fire", "spread-shot", "heavy-cannon"],
      weaponLevels: { "rapid-fire": 3, "spread-shot": 2, "heavy-cannon": 4 },
      weaponAugments: { "rapid-fire": ["damage-up"] }
    });
    expect(result.slots).toHaveLength(3);
    expect(result.slots[0]).toEqual({
      id: "rapid-fire",
      level: 3,
      augments: ["damage-up"]
    });
    expect(result.slots[1]).toEqual({
      id: "spread-shot",
      level: 2,
      augments: []
    });
    expect(result.slots[2]).toBe(null);
    // heavy-cannon was unlocked but not slotted → falls into the inventory.
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]).toEqual({
      id: "heavy-cannon",
      level: 4,
      augments: []
    });
  });

  it("drops unknown weapon ids from the slot array (slot becomes null)", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire", "ghost-weapon", "spread-shot"],
      unlockedWeapons: ["rapid-fire", "spread-shot"]
    });
    expect(result.slots[0]?.id).toBe("rapid-fire");
    expect(result.slots[1]).toBe(null);
    expect(result.slots[2]?.id).toBe("spread-shot");
  });

  it("drops unknown weapon ids from unlockedWeapons (no instance synthesized)", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire"],
      unlockedWeapons: ["rapid-fire", "ghost-weapon"]
    });
    expect(result.slots[0]?.id).toBe("rapid-fire");
    expect(result.inventory).toEqual([]);
  });

  it("returns one null slot when slot array is empty (safety net's job to seed)", () => {
    const result = migrateLegacyIdArray({
      slots: [],
      unlockedWeapons: []
    });
    // assignSlotsFromPool guarantees at least one slot.
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toEqual([]);
  });

  it("preserves order of unlockedWeapons in the inventory", () => {
    const result = migrateLegacyIdArray({
      slots: [null],
      unlockedWeapons: ["heavy-cannon", "rapid-fire", "spread-shot"]
    });
    expect(result.inventory.map((i) => i.id)).toEqual([
      "heavy-cannon",
      "rapid-fire",
      "spread-shot"
    ]);
  });

  it("dedupes duplicate ids in unlockedWeapons (one instance per id)", () => {
    const result = migrateLegacyIdArray({
      slots: [null],
      unlockedWeapons: ["rapid-fire", "rapid-fire", "rapid-fire"]
    });
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]?.id).toBe("rapid-fire");
  });

  it("a second slot reference to the same id resolves to null (only one instance per id)", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire", "rapid-fire"],
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots[0]?.id).toBe("rapid-fire");
    expect(result.slots[1]).toBe(null);
  });

  it("clamps stored levels above MAX_LEVEL to 5", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire"],
      unlockedWeapons: ["rapid-fire"],
      weaponLevels: { "rapid-fire": 99 }
    });
    expect(result.slots[0]?.level).toBe(5);
  });

  it("defaults stored level to 1 when missing", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire"],
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots[0]?.level).toBe(1);
  });

  it("filters unknown augment ids out of stored weaponAugments", () => {
    const result = migrateLegacyIdArray({
      slots: ["rapid-fire"],
      unlockedWeapons: ["rapid-fire"],
      weaponAugments: { "rapid-fire": ["damage-up", "ghost-augment"] }
    });
    expect(result.slots[0]?.augments).toEqual(["damage-up"]);
  });

  it("falls back to the default-ship slot layout when slots field is absent", () => {
    const result = migrateLegacyIdArray({
      unlockedWeapons: ["rapid-fire"]
    });
    // DEFAULT_SHIP has rapid-fire in slot 0 — and unlockedWeapons supplies
    // a matching instance, so it gets equipped.
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.id).toBe("rapid-fire");
  });

  it("treats a non-string slot entry as null", () => {
    const result = migrateLegacyIdArray({
      // @ts-expect-error untrusted jsonb — a number should not appear here
      slots: ["rapid-fire", 42, null],
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots[0]?.id).toBe("rapid-fire");
    expect(result.slots[1]).toBe(null);
    expect(result.slots[2]).toBe(null);
  });

  it("caps the number of slots at MAX_WEAPON_SLOTS", () => {
    const oversized = Array.from({ length: MAX_WEAPON_SLOTS + 3 }, () => "rapid-fire");
    const result = migrateLegacyIdArray({
      slots: oversized,
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots).toHaveLength(MAX_WEAPON_SLOTS);
  });
});

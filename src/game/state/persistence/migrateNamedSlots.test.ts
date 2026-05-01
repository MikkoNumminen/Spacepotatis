import { describe, expect, it } from "vitest";
import { migrateNamedSlots } from "./migrateNamedSlots";

describe("migrateNamedSlots", () => {
  it("uses the `front` field as the single slot when it points at a known weapon", () => {
    const result = migrateNamedSlots({
      slots: {
        front: "rapid-fire",
        rear: "spread-shot",
        sidekickLeft: "heavy-cannon",
        sidekickRight: "spud-missile"
      },
      unlockedWeapons: ["rapid-fire", "spread-shot", "heavy-cannon", "spud-missile"]
    });
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.id).toBe("rapid-fire");
  });

  it("ignores rear / sidekick entries — they only appear in the inventory if unlocked", () => {
    const result = migrateNamedSlots({
      slots: {
        front: "rapid-fire",
        rear: "spread-shot",
        sidekickLeft: "heavy-cannon",
        sidekickRight: "spud-missile"
      },
      unlockedWeapons: ["rapid-fire", "spread-shot", "heavy-cannon", "spud-missile"]
    });
    // rapid-fire is taken by the slot; the other three remain in inventory.
    expect(result.inventory.map((i) => i.id).sort()).toEqual(
      ["heavy-cannon", "spread-shot", "spud-missile"].sort()
    );
  });

  it("treats a missing `front` field as a null slot", () => {
    const result = migrateNamedSlots({
      slots: {
        rear: "spread-shot"
      },
      unlockedWeapons: ["spread-shot"]
    });
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]?.id).toBe("spread-shot");
  });

  it("treats a non-string `front` value as null", () => {
    const result = migrateNamedSlots({
      slots: {
        front: null
      },
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots).toEqual([null]);
    expect(result.inventory[0]?.id).toBe("rapid-fire");
  });

  it("renders the front slot as null when the id is unknown", () => {
    const result = migrateNamedSlots({
      slots: {
        front: "ghost-weapon"
      },
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots).toEqual([null]);
    // rapid-fire still in inventory because it's in unlockedWeapons.
    expect(result.inventory[0]?.id).toBe("rapid-fire");
  });

  it("renders the front slot as null when the id is unlocked-but-unknown", () => {
    const result = migrateNamedSlots({
      slots: {
        front: "rapid-fire"
      },
      unlockedWeapons: []
    });
    // No matching pool instance → slot is null.
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toEqual([]);
  });

  it("preserves stored levels and augments on the equipped front weapon", () => {
    const result = migrateNamedSlots({
      slots: { front: "spread-shot" },
      unlockedWeapons: ["spread-shot"],
      weaponLevels: { "spread-shot": 4 },
      weaponAugments: { "spread-shot": ["fire-rate-up"] }
    });
    expect(result.slots[0]).toEqual({
      id: "spread-shot",
      level: 4,
      augments: ["fire-rate-up"]
    });
  });
});

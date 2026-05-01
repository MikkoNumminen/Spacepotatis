import { describe, expect, it } from "vitest";
import { migratePrimaryWeapon } from "./migratePrimaryWeapon";

describe("migratePrimaryWeapon", () => {
  it("equips the primary-weapon id when it is known and unlocked", () => {
    const result = migratePrimaryWeapon({
      primaryWeapon: "rapid-fire",
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.id).toBe("rapid-fire");
    expect(result.inventory).toEqual([]);
  });

  it("renders a null slot when primaryWeapon is unknown", () => {
    const result = migratePrimaryWeapon({
      primaryWeapon: "ghost-weapon",
      unlockedWeapons: ["rapid-fire"]
    });
    expect(result.slots).toEqual([null]);
    // The unlocked rapid-fire still ends up in the inventory pool.
    expect(result.inventory[0]?.id).toBe("rapid-fire");
  });

  it("renders a null slot when primaryWeapon is missing entirely", () => {
    const result = migratePrimaryWeapon({});
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toEqual([]);
  });

  it("renders a null slot when primaryWeapon is not a string", () => {
    const result = migratePrimaryWeapon({
      // @ts-expect-error untrusted jsonb may have an object here
      primaryWeapon: { id: "rapid-fire" }
    });
    expect(result.slots).toEqual([null]);
  });

  it("renders a null slot when unlockedWeapons is empty (no instance pool)", () => {
    const result = migratePrimaryWeapon({
      primaryWeapon: "rapid-fire",
      unlockedWeapons: []
    });
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toEqual([]);
  });

  it("renders a null slot when unlockedWeapons is absent", () => {
    const result = migratePrimaryWeapon({
      primaryWeapon: "rapid-fire"
    });
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toEqual([]);
  });

  it("preserves stored levels and augments on the equipped primary weapon", () => {
    const result = migratePrimaryWeapon({
      primaryWeapon: "rapid-fire",
      unlockedWeapons: ["rapid-fire"],
      weaponLevels: { "rapid-fire": 5 },
      weaponAugments: { "rapid-fire": ["damage-up", "fire-rate-up"] }
    });
    expect(result.slots[0]).toEqual({
      id: "rapid-fire",
      level: 5,
      augments: ["damage-up", "fire-rate-up"]
    });
  });

  it("relegates other unlocked-but-not-primary ids to the inventory", () => {
    const result = migratePrimaryWeapon({
      primaryWeapon: "rapid-fire",
      unlockedWeapons: ["rapid-fire", "spread-shot", "heavy-cannon"]
    });
    expect(result.slots[0]?.id).toBe("rapid-fire");
    expect(result.inventory.map((i) => i.id)).toEqual([
      "spread-shot",
      "heavy-cannon"
    ]);
  });
});

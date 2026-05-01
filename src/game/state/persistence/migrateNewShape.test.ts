import { describe, expect, it } from "vitest";
import { looksLikeNewShape, migrateNewShape } from "./migrateNewShape";
import { MAX_WEAPON_SLOTS } from "../ShipConfig";

describe("looksLikeNewShape", () => {
  it("returns true when an instance object lives in slots", () => {
    expect(
      looksLikeNewShape({
        slots: [{ id: "rapid-fire", level: 1, augments: [] }]
      })
    ).toBe(true);
  });

  it("returns true when an instance object lives in inventory", () => {
    expect(
      looksLikeNewShape({
        slots: ["rapid-fire"],
        inventory: [{ id: "spread-shot", level: 2, augments: [] }]
      })
    ).toBe(true);
  });

  it("returns false for legacy id-string slot arrays", () => {
    expect(
      looksLikeNewShape({
        slots: ["rapid-fire", "spread-shot"]
      })
    ).toBe(false);
  });

  it("returns false when slots is the named-slots object", () => {
    expect(
      looksLikeNewShape({
        slots: { front: "rapid-fire" }
      })
    ).toBe(false);
  });

  it("returns false for a fully empty raw snapshot", () => {
    expect(looksLikeNewShape({})).toBe(false);
  });

  it("returns false when neither slots nor inventory carry instance objects", () => {
    expect(
      looksLikeNewShape({
        slots: [null, "rapid-fire", null],
        inventory: []
      })
    ).toBe(false);
  });
});

describe("migrateNewShape", () => {
  it("round-trips a well-formed instance ship", () => {
    const result = migrateNewShape({
      slots: [
        { id: "rapid-fire", level: 1, augments: [] },
        { id: "spread-shot", level: 3, augments: ["damage-up"] },
        null
      ],
      inventory: [{ id: "heavy-cannon", level: 2, augments: [] }]
    });
    expect(result.slots).toHaveLength(3);
    expect(result.slots[0]).toEqual({ id: "rapid-fire", level: 1, augments: [] });
    expect(result.slots[1]).toEqual({
      id: "spread-shot",
      level: 3,
      augments: ["damage-up"]
    });
    expect(result.slots[2]).toBe(null);
    expect(result.inventory).toEqual([
      { id: "heavy-cannon", level: 2, augments: [] }
    ]);
  });

  it("drops slot instances with unknown ids (slot becomes null)", () => {
    const result = migrateNewShape({
      slots: [{ id: "not-a-real-weapon", level: 1, augments: [] }],
      inventory: []
    });
    expect(result.slots).toEqual([null]);
  });

  it("drops inventory instances with unknown ids", () => {
    const result = migrateNewShape({
      slots: [{ id: "rapid-fire", level: 1, augments: [] }],
      inventory: [
        { id: "rapid-fire", level: 1, augments: [] },
        { id: "ghost-weapon", level: 5, augments: [] }
      ]
    });
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]?.id).toBe("rapid-fire");
  });

  it("clamps levels above MAX_LEVEL down to 5", () => {
    const result = migrateNewShape({
      slots: [{ id: "rapid-fire", level: 99, augments: [] }],
      inventory: []
    });
    expect(result.slots[0]?.level).toBe(5);
  });

  it("clamps levels below 1 up to 1", () => {
    const result = migrateNewShape({
      slots: [{ id: "rapid-fire", level: 0, augments: [] }],
      inventory: []
    });
    expect(result.slots[0]?.level).toBe(1);
  });

  it("defaults level to 1 when level is missing or non-numeric", () => {
    const result = migrateNewShape({
      slots: [
        { id: "rapid-fire", augments: [] },
        // @ts-expect-error garbage level field, simulating untrusted jsonb
        { id: "spread-shot", level: "garbage", augments: [] }
      ],
      inventory: []
    });
    expect(result.slots[0]?.level).toBe(1);
    expect(result.slots[1]?.level).toBe(1);
  });

  it("filters unknown augment ids out of the augment list", () => {
    const result = migrateNewShape({
      slots: [
        {
          id: "rapid-fire",
          level: 1,
          augments: ["damage-up", "ghost-augment", "fire-rate-up"]
        }
      ],
      inventory: []
    });
    expect(result.slots[0]?.augments).toEqual(["damage-up", "fire-rate-up"]);
  });

  it("dedupes augment ids in the augment list", () => {
    const result = migrateNewShape({
      slots: [
        {
          id: "rapid-fire",
          level: 1,
          augments: ["damage-up", "damage-up", "fire-rate-up"]
        }
      ],
      inventory: []
    });
    expect(result.slots[0]?.augments).toEqual(["damage-up", "fire-rate-up"]);
  });

  it("preserves null entries in slots", () => {
    const result = migrateNewShape({
      slots: [null, { id: "rapid-fire", level: 1, augments: [] }, null],
      inventory: []
    });
    expect(result.slots[0]).toBe(null);
    expect(result.slots[1]?.id).toBe("rapid-fire");
    expect(result.slots[2]).toBe(null);
  });

  it("treats bare-string slot entries as fresh instances when the id is known", () => {
    const result = migrateNewShape({
      slots: [
        { id: "rapid-fire", level: 1, augments: [] },
        "spread-shot"
      ],
      inventory: []
    });
    expect(result.slots[1]).toEqual({
      id: "spread-shot",
      level: 1,
      augments: []
    });
  });

  it("turns bare-string slot entries with unknown ids into null", () => {
    const result = migrateNewShape({
      slots: [
        { id: "rapid-fire", level: 1, augments: [] },
        "ghost-weapon"
      ],
      inventory: []
    });
    expect(result.slots[1]).toBe(null);
  });

  it("caps slots at MAX_WEAPON_SLOTS", () => {
    const oversized = Array.from({ length: MAX_WEAPON_SLOTS + 4 }, () => ({
      id: "rapid-fire",
      level: 1,
      augments: []
    }));
    const result = migrateNewShape({
      slots: oversized,
      inventory: []
    });
    expect(result.slots).toHaveLength(MAX_WEAPON_SLOTS);
  });

  it("ensures at least one slot exists when input slots is empty", () => {
    const result = migrateNewShape({
      slots: [],
      inventory: [{ id: "rapid-fire", level: 1, augments: [] }]
    });
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]).toBe(null);
  });

  it("treats non-array slots as empty (then pads to one null slot)", () => {
    const result = migrateNewShape({
      // slots field is the named-slots object, not an array — looksLikeNewShape
      // returns false in that case but migrateNewShape itself must still cope.
      slots: { front: "rapid-fire" },
      inventory: [{ id: "rapid-fire", level: 1, augments: [] }]
    });
    expect(result.slots).toEqual([null]);
    expect(result.inventory).toHaveLength(1);
  });

  it("treats non-array inventory as empty inventory", () => {
    const result = migrateNewShape({
      slots: [{ id: "rapid-fire", level: 1, augments: [] }],
      // @ts-expect-error untrusted jsonb may carry a non-array inventory
      inventory: { foo: "bar" }
    });
    expect(result.inventory).toEqual([]);
  });

  it("skips inventory entries that aren't instance-shaped", () => {
    const result = migrateNewShape({
      slots: [{ id: "rapid-fire", level: 1, augments: [] }],
      // @ts-expect-error untrusted jsonb mixed bag of garbage
      inventory: ["just-a-string", null, 42, { id: "spread-shot", level: 1, augments: [] }]
    });
    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0]?.id).toBe("spread-shot");
  });
});

// Mixed-shape coercion: inventory carries instance objects (so looksLikeNewShape
// returns true), but slots is a legacy id-string array. Pin current behavior so
// regressions are visible. Wave 2's migrateNewShape promotes a bare known-id
// string to a fresh L1 instance via the bare-string branch — so this case is
// no longer the silent data-loss rake the audit warned about.
describe("migrateNewShape — mixed-shape coercion (legacy id-strings + inventory instances)", () => {
  it("promotes legacy id-string slots to fresh L1 instances", () => {
    const result = migrateNewShape({
      slots: ["rapid-fire", "spread-shot", null],
      inventory: [{ id: "heavy-cannon", level: 4, augments: ["damage-up"] }],
      unlockedWeapons: ["rapid-fire", "spread-shot", "heavy-cannon"],
      weaponLevels: { "rapid-fire": 5, "spread-shot": 3 },
      weaponAugments: { "rapid-fire": ["damage-up"] }
    });

    // Slots get the bare-string treatment: a fresh L1 instance with no augments.
    // The legacy weaponLevels / weaponAugments maps are IGNORED — that's the
    // "silent drop" the audit flagged. Pinning so a future Wave can choose to
    // honor them deliberately.
    expect(result.slots[0]).toEqual({
      id: "rapid-fire",
      level: 1,
      augments: []
    });
    expect(result.slots[1]).toEqual({
      id: "spread-shot",
      level: 1,
      augments: []
    });
    expect(result.slots[2]).toBe(null);

    // Inventory instances themselves DO carry their level + augments through.
    expect(result.inventory[0]).toEqual({
      id: "heavy-cannon",
      level: 4,
      augments: ["damage-up"]
    });
  });
});

import { describe, expect, it } from "vitest";
import { seedStarterIfEmpty } from "./safetyNet";
import { newWeaponInstance } from "../ShipConfig";

describe("seedStarterIfEmpty", () => {
  it("reseeds rapid-fire when both slots and inventory are empty", () => {
    const seeded = seedStarterIfEmpty({ slots: [null], inventory: [] });
    expect(seeded.slots).toHaveLength(1);
    expect(seeded.slots[0]?.id).toBe("rapid-fire");
    expect(seeded.slots[0]?.level).toBe(1);
    expect(seeded.slots[0]?.augments).toEqual([]);
    expect(seeded.inventory).toEqual([]);
  });

  it("reseeds rapid-fire when slots is multi-null and inventory is empty", () => {
    const seeded = seedStarterIfEmpty({ slots: [null, null, null], inventory: [] });
    expect(seeded.slots).toHaveLength(1);
    expect(seeded.slots[0]?.id).toBe("rapid-fire");
  });

  it("returns input unchanged when any slot is filled", () => {
    const heavyInstance = newWeaponInstance("heavy-cannon");
    const input = { slots: [heavyInstance, null], inventory: [] };
    const out = seedStarterIfEmpty(input);
    expect(out).toBe(input);
  });

  it("returns input unchanged when inventory has content (slots empty)", () => {
    const inventoryItem = newWeaponInstance("spread-shot");
    const input = { slots: [null], inventory: [inventoryItem] };
    const out = seedStarterIfEmpty(input);
    expect(out).toBe(input);
  });

  it("returns input unchanged when both slots and inventory have content", () => {
    const slotted = newWeaponInstance("rapid-fire");
    const stored = newWeaponInstance("corsair-missile");
    const input = { slots: [slotted], inventory: [stored] };
    const out = seedStarterIfEmpty(input);
    expect(out).toBe(input);
  });

  it("returns a fresh object each call (not a shared singleton)", () => {
    const a = seedStarterIfEmpty({ slots: [null], inventory: [] });
    const b = seedStarterIfEmpty({ slots: [null], inventory: [] });
    expect(a).not.toBe(b);
    expect(a.slots).not.toBe(b.slots);
    expect(a.slots[0]).not.toBe(b.slots[0]);
  });

  it("returns the original reference when input is non-empty (no clone)", () => {
    const input = { slots: [newWeaponInstance("rapid-fire")], inventory: [] };
    const out = seedStarterIfEmpty(input);
    expect(out).toBe(input);
    expect(out.slots).toBe(input.slots);
  });
});

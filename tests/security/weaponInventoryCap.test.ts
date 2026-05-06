import { describe, expect, it } from "vitest";

import {
  WeaponInventorySchema,
  WEAPON_IDS
} from "../../src/lib/schemas/save";

// SEC-022 — `WeaponInventorySchema` no `.max()`.
//
// `z.array(WeaponInstanceSchema)` accepts an arbitrary number of elements.
// Each element validates, but a 1000-element array is parseable — same
// defense-in-depth pattern as SEC-011's `seenStoryEntries` cap.
//
// Fix: `z.array(WeaponInstanceSchema).max(50)`.
// Current shop has ~10 weapons; 50 is generous.

const VALID_WEAPON_ID = WEAPON_IDS[0];

function makeInstance(id = VALID_WEAPON_ID) {
  return { id, level: 1, augments: [] };
}

describe("SEC-022 — WeaponInventorySchema caps array length at 50", () => {
  it("rejects an inventory with 51 elements", () => {
    const result = WeaponInventorySchema.safeParse(
      Array(51).fill(makeInstance())
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.length === 0 || i.message.toLowerCase().includes("max")
      );
      expect(issue).toBeDefined();
    }
  });

  it("accepts an inventory with exactly 50 elements (boundary)", () => {
    const result = WeaponInventorySchema.safeParse(
      Array(50).fill(makeInstance())
    );
    expect(result.success).toBe(true);
  });

  it("accepts an empty inventory", () => {
    const result = WeaponInventorySchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("accepts a single-element inventory", () => {
    const result = WeaponInventorySchema.safeParse([makeInstance()]);
    expect(result.success).toBe(true);
  });
});

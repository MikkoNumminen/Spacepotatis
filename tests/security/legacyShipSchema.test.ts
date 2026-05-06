import { describe, expect, it } from "vitest";

import { LegacyShipSchema } from "../../src/lib/schemas/save";

// SEC-016 — `LegacyShipSchema` unbounded `record`/`array` fields.
//
// A hand-crafted save body that defeats the strict ShipConfigSchema branch
// falls through to LegacyShipSchema. Without caps, Zod happily parses a
// 100k-key `weaponLevels` record, burning Edge worker memory before any
// downstream validator can reject it.
//
// Fix: add .max(50) caps to `unlockedWeapons` (array) and key-count
// superRefine caps to `weaponLevels` and `weaponAugments` (records).

describe("SEC-016 — LegacyShipSchema caps unbounded array/record fields", () => {
  // --- unlockedWeapons ---

  it("rejects unlockedWeapons with more than 50 entries", () => {
    const result = LegacyShipSchema.safeParse({
      unlockedWeapons: Array(51).fill("laser-1")
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.includes("unlockedWeapons")
      );
      expect(issue).toBeDefined();
    }
  });

  it("accepts unlockedWeapons with exactly 50 entries (boundary)", () => {
    const result = LegacyShipSchema.safeParse({
      unlockedWeapons: Array(50).fill("laser-1")
    });
    expect(result.success).toBe(true);
  });

  it("accepts a normal-sized legacy ship (1 weapon)", () => {
    const result = LegacyShipSchema.safeParse({
      unlockedWeapons: ["laser-1"],
      weaponLevels: { "laser-1": 2 },
      weaponAugments: { "laser-1": ["damage-up"] }
    });
    expect(result.success).toBe(true);
  });

  // --- weaponLevels ---

  it("rejects weaponLevels with more than 50 keys", () => {
    const bigRecord: Record<string, number> = {};
    for (let i = 0; i < 51; i++) bigRecord[`weapon-${i}`] = 1;
    const result = LegacyShipSchema.safeParse({ weaponLevels: bigRecord });
    expect(result.success).toBe(false);
  });

  it("accepts weaponLevels with exactly 50 keys (boundary)", () => {
    const okRecord: Record<string, number> = {};
    for (let i = 0; i < 50; i++) okRecord[`weapon-${i}`] = 1;
    const result = LegacyShipSchema.safeParse({ weaponLevels: okRecord });
    expect(result.success).toBe(true);
  });

  it("rejects a 100k-key weaponLevels (DoS amplification scenario)", () => {
    const attackRecord: Record<string, number> = {};
    for (let i = 0; i < 100_000; i++) attackRecord[`w${i}`] = 1;
    const result = LegacyShipSchema.safeParse({ weaponLevels: attackRecord });
    expect(result.success).toBe(false);
  });

  // --- weaponAugments ---

  it("rejects weaponAugments with more than 50 keys", () => {
    const bigRecord: Record<string, string[]> = {};
    for (let i = 0; i < 51; i++) bigRecord[`weapon-${i}`] = ["damage-up"];
    const result = LegacyShipSchema.safeParse({ weaponAugments: bigRecord });
    expect(result.success).toBe(false);
  });

  it("accepts weaponAugments with exactly 50 keys (boundary)", () => {
    const okRecord: Record<string, string[]> = {};
    for (let i = 0; i < 50; i++) okRecord[`weapon-${i}`] = ["damage-up"];
    const result = LegacyShipSchema.safeParse({ weaponAugments: okRecord });
    expect(result.success).toBe(true);
  });
});

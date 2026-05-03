import { describe, expect, it } from "vitest";
import { getAllLootPools, getLootPool } from "./lootPools";
import type { SolarSystemId } from "@/types/game";

describe("getLootPool", () => {
  it("returns the tutorial pool with expected fields", () => {
    const pool = getLootPool("tutorial");
    expect(pool.systemId).toBe("tutorial");
    expect(pool.weapons).toEqual(["spread-shot", "heavy-cannon"]);
    expect(pool.augments.length).toBeGreaterThan(0);
    expect(pool.upgrades).toEqual(["shield", "armor", "reactor-capacity", "reactor-recharge"]);
    expect(pool.credits.min).toBe(200);
    expect(pool.credits.max).toBe(500);
  });

  it("returns the tubernovae pool with its distinct weapon roster", () => {
    const pool = getLootPool("tubernovae");
    expect(pool.systemId).toBe("tubernovae");
    expect(pool.weapons).toContain("corsair-missile");
    expect(pool.weapons).not.toContain("spread-shot");
    expect(pool.credits.min).toBe(500);
    expect(pool.credits.max).toBe(1000);
  });

  it("throws for an unknown system id", () => {
    expect(() => getLootPool("not-a-system" as SolarSystemId)).toThrow(/Unknown loot pool:/);
  });
});

describe("getAllLootPools", () => {
  it("returns one entry per registered system", () => {
    const all = getAllLootPools();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const ids = all.map((p) => p.systemId).sort();
    expect(ids).toContain("tutorial");
    expect(ids).toContain("tubernovae");
  });

  it("each returned pool round-trips through getLootPool", () => {
    for (const pool of getAllLootPools()) {
      expect(getLootPool(pool.systemId)).toBe(pool);
    }
  });
});

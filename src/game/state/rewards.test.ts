import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMissionReward,
  describeMissionReward,
  rollMissionReward,
  type MissionReward
} from "./rewards";
import {
  DEFAULT_SHIP,
  MAX_LEVEL,
  newWeaponInstance,
  ownsAnyOfType,
  type ShipConfig,
  type WeaponInventory
} from "./ShipConfig";
import { getState, resetForTests } from "./GameState";
import type { WeaponId } from "@/types/game";

beforeEach(() => {
  resetForTests();
});

afterEach(() => {
  resetForTests();
});

// Deterministic RNG factory: cycles through a fixed sequence so the picks
// are predictable regardless of how many times the roller calls it.
function fixedRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0;
    i += 1;
    return v;
  };
}

// Build a ship that owns the given weapon ids by stuffing instances into the
// inventory. The DEFAULT_SHIP starter (rapid-fire in slot 0) is preserved.
function shipWithOwned(extra: readonly WeaponId[]): ShipConfig {
  const inventory: WeaponInventory = extra.map((id) => newWeaponInstance(id));
  return { ...DEFAULT_SHIP, inventory };
}

describe("rollMissionReward", () => {
  it("can roll an unowned weapon from the system pool", () => {
    // Tutorial pool weapons: spread-shot, heavy-cannon, spud-missile, tater-net.
    // DEFAULT_SHIP only owns rapid-fire, so all four are eligible.
    const reward = rollMissionReward("tutorial", DEFAULT_SHIP, fixedRng([0, 0, 0, 0, 0, 0]));
    expect(reward.kind).toBe("weapon");
    if (reward.kind === "weapon") {
      expect(reward.id).toBe("spread-shot");
    }
  });

  it("never rolls a weapon the player already owns", () => {
    // Own every weapon in the tutorial pool — weapon category drops out.
    const ship = shipWithOwned([
      "spread-shot",
      "heavy-cannon",
      "spud-missile",
      "tater-net"
    ]);
    const rng = mulberry32(0xc0ffee);
    for (let n = 0; n < 200; n++) {
      const r = rollMissionReward("tutorial", ship, rng);
      expect(r.kind).not.toBe("weapon");
    }
  });

  it("never rolls an upgrade that is already maxed", () => {
    const ship: ShipConfig = {
      ...DEFAULT_SHIP,
      shieldLevel: MAX_LEVEL,
      armorLevel: MAX_LEVEL,
      reactor: { capacityLevel: MAX_LEVEL, rechargeLevel: MAX_LEVEL }
    };
    const rng = mulberry32(0xdeadbeef);
    for (let n = 0; n < 200; n++) {
      const r = rollMissionReward("tutorial", ship, rng);
      expect(r.kind).not.toBe("upgrade");
    }
  });

  it("falls back to credits when every other category is exhausted", () => {
    const ship: ShipConfig = {
      ...shipWithOwned(["spread-shot", "heavy-cannon", "spud-missile", "tater-net"]),
      shieldLevel: MAX_LEVEL,
      armorLevel: MAX_LEVEL,
      reactor: { capacityLevel: MAX_LEVEL, rechargeLevel: MAX_LEVEL }
    };
    // Tutorial pool still allows augments (no max), so credits is one of two
    // possible outcomes. Roll a bunch and confirm both kinds appear; weapon
    // and upgrade stay out.
    const rng = mulberry32(0x42);
    const seen = new Set<string>();
    for (let n = 0; n < 100; n++) {
      const r = rollMissionReward("tutorial", ship, rng);
      seen.add(r.kind);
      expect(["augment", "credits"]).toContain(r.kind);
    }
    expect(seen.has("credits")).toBe(true);
  });

  it("draws weapons from the tubernovae pool when called for that system", () => {
    const reward = rollMissionReward("tubernovae", DEFAULT_SHIP, fixedRng([0, 0, 0, 0]));
    expect(reward.kind).toBe("weapon");
    if (reward.kind === "weapon") {
      expect(reward.id).toBe("tail-gunner");
    }
  });

  it("credits amount stays inside the system pool range", () => {
    const ship: ShipConfig = {
      ...shipWithOwned(["spread-shot", "heavy-cannon", "spud-missile", "tater-net"]),
      shieldLevel: MAX_LEVEL,
      armorLevel: MAX_LEVEL,
      reactor: { capacityLevel: MAX_LEVEL, rechargeLevel: MAX_LEVEL }
    };
    const rng = mulberry32(0x1234);
    for (let n = 0; n < 50; n++) {
      const r = rollMissionReward("tutorial", ship, rng);
      if (r.kind === "credits") {
        expect(r.amount).toBeGreaterThanOrEqual(200);
        expect(r.amount).toBeLessThanOrEqual(500);
      }
    }
  });
});

describe("applyMissionReward", () => {
  it("credits reward bumps the player's balance", () => {
    const reward: MissionReward = { kind: "credits", amount: 350 };
    const before = getState().credits;
    applyMissionReward(reward);
    expect(getState().credits).toBe(before + 350);
  });

  it("upgrade reward increments the matching ship level", () => {
    const reward: MissionReward = { kind: "upgrade", field: "shield" };
    const before = getState().ship.shieldLevel;
    applyMissionReward(reward);
    expect(getState().ship.shieldLevel).toBe(before + 1);
  });

  it("armor upgrade reward bumps armorLevel by one (rewards.ts applyUpgrade case)", () => {
    const before = getState().ship.armorLevel;
    applyMissionReward({ kind: "upgrade", field: "armor" });
    expect(getState().ship.armorLevel).toBe(before + 1);
  });

  it("reactor-capacity upgrade reward bumps reactor.capacityLevel by one", () => {
    const before = getState().ship.reactor.capacityLevel;
    applyMissionReward({ kind: "upgrade", field: "reactor-capacity" });
    expect(getState().ship.reactor.capacityLevel).toBe(before + 1);
  });

  it("reactor-recharge upgrade reward bumps reactor.rechargeLevel by one", () => {
    const before = getState().ship.reactor.rechargeLevel;
    applyMissionReward({ kind: "upgrade", field: "reactor-recharge" });
    expect(getState().ship.reactor.rechargeLevel).toBe(before + 1);
  });

  it("weapon reward unlocks the weapon", () => {
    const reward: MissionReward = { kind: "weapon", id: "spread-shot" };
    expect(ownsAnyOfType(getState().ship, "spread-shot")).toBe(false);
    applyMissionReward(reward);
    expect(ownsAnyOfType(getState().ship, "spread-shot")).toBe(true);
  });

  it("augment reward adds to inventory", () => {
    const reward: MissionReward = { kind: "augment", id: "damage-up" };
    const before = getState().ship.augmentInventory.length;
    applyMissionReward(reward);
    expect(getState().ship.augmentInventory.length).toBe(before + 1);
    expect(getState().ship.augmentInventory).toContain("damage-up");
  });
});

describe("describeMissionReward", () => {
  it("renders something readable for every reward kind", () => {
    expect(describeMissionReward({ kind: "credits", amount: 250 })).toContain("250");
    expect(describeMissionReward({ kind: "upgrade", field: "shield" })).toContain("Shield");
    expect(describeMissionReward({ kind: "weapon", id: "spread-shot" })).toContain("weapon");
    expect(describeMissionReward({ kind: "augment", id: "damage-up" })).toContain("augment");
  });
});

// Tiny seedable RNG for the "many rolls" assertions. Standard mulberry32.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

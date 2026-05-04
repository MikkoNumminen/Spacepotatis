import { describe, expect, it } from "vitest";
import {
  MISSION_WEAPON_REWARDS,
  getBuyableWeaponIds,
  getMissionForWeapon
} from "./missionWeaponRewards";
import { getAllMissions } from "./missions";
import { getAllWeapons } from "./weapons";
import type { MissionId, WeaponId } from "@/types/game";

describe("MISSION_WEAPON_REWARDS", () => {
  it("covers every mission-kind mission exactly once", () => {
    const combatMissionIds = getAllMissions()
      .filter((m) => m.kind === "mission")
      .map((m) => m.id)
      .sort();
    const mappedMissionIds = Array.from(MISSION_WEAPON_REWARDS.keys()).sort();
    expect(mappedMissionIds).toEqual(combatMissionIds);
  });

  it("covers every weapon exactly once (reverse totality)", () => {
    const weaponIds = getAllWeapons().map((w) => w.id).sort();
    const mappedWeaponIds = Array.from(MISSION_WEAPON_REWARDS.values()).sort();
    expect(mappedWeaponIds).toEqual(weaponIds);
  });

  it("has no duplicate weapon assignments", () => {
    const values = Array.from(MISSION_WEAPON_REWARDS.values());
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("getBuyableWeaponIds", () => {
  it("returns [] when no missions are completed", () => {
    expect(getBuyableWeaponIds(new Set<MissionId>())).toEqual([]);
  });

  it("returns all weapons in catalog order when every mission is completed", () => {
    const completed = new Set<MissionId>(MISSION_WEAPON_REWARDS.keys());
    const buyable = getBuyableWeaponIds(completed);
    const catalogOrder = getAllWeapons().map((w) => w.id);
    expect(buyable).toEqual(catalogOrder);
  });

  it("returns exactly the mapped weapon for a single-mission completion", () => {
    for (const [missionId, weaponId] of MISSION_WEAPON_REWARDS) {
      const buyable = getBuyableWeaponIds(new Set<MissionId>([missionId]));
      expect(buyable).toEqual([weaponId]);
    }
  });

  it("preserves catalog order regardless of completion-set insertion order", () => {
    const allMissions = Array.from(MISSION_WEAPON_REWARDS.keys());
    const reversed = new Set<MissionId>([...allMissions].reverse());
    const buyable = getBuyableWeaponIds(reversed);
    const catalogOrder = getAllWeapons().map((w) => w.id);
    expect(buyable).toEqual(catalogOrder);
  });

  it("ignores ids in `completed` that have no mapped weapon", () => {
    // shop/market/tubernovae-outpost are non-combat missions; they aren't
    // keys in the rewards map. Passing them should not error or pollute output.
    const completed = new Set<MissionId>(["shop", "market", "tubernovae-outpost"]);
    expect(getBuyableWeaponIds(completed)).toEqual([]);
  });
});

describe("getMissionForWeapon", () => {
  it("round-trips for every weapon (forward then reverse yields the source mission)", () => {
    for (const weapon of getAllWeapons()) {
      const mission = getMissionForWeapon(weapon.id);
      expect(mission).not.toBeNull();
      if (mission === null) continue;
      expect(MISSION_WEAPON_REWARDS.get(mission)).toBe(weapon.id);
    }
  });

  it("returns null for a weapon id that has no entry", () => {
    // Synthetic id outside the WeaponId union — kept narrow with a deliberate
    // unsafe cast to exercise the null branch without mutating the catalog.
    const fake = "not-a-weapon" as WeaponId;
    expect(getMissionForWeapon(fake)).toBeNull();
  });
});

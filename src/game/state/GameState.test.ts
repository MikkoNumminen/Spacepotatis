import { beforeEach, describe, expect, it } from "vitest";
import {
  addCredits,
  addPlayedTime,
  buyArmorUpgrade,
  buyAugment,
  buyReactorCapacityUpgrade,
  buyReactorRechargeUpgrade,
  buyShieldUpgrade,
  buyWeapon,
  buyWeaponUpgrade,
  completeMission,
  equipWeapon,
  getState,
  grantAugment,
  grantWeapon,
  hydrate,
  installAugment,
  isMissionCompleted,
  isPlanetUnlocked,
  resetForTests,
  sellWeapon,
  setSolarSystem,
  spendCredits,
  subscribe,
  toSnapshot
} from "./GameState";
import { MAX_AUGMENTS_PER_WEAPON } from "@/game/data/augments";

beforeEach(() => {
  resetForTests();
});

describe("initial state", () => {
  it("starts with zero credits and the entry-point planets unlocked", () => {
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.completedMissions).toEqual([]);
    expect(s.unlockedPlanets).toContain("tutorial");
    expect(s.unlockedPlanets).toContain("shop");
    expect(s.unlockedPlanets).not.toContain("combat-1");
    expect(s.unlockedPlanets).not.toContain("boss-1");
    expect(s.playedTimeSeconds).toBe(0);
    expect(s.saveSlot).toBe(1);
  });

  it("ship boots with rapid-fire equipped to the front slot only", () => {
    const ship = getState().ship;
    expect(ship.slots.front).toBe("rapid-fire");
    expect(ship.slots.rear).toBeNull();
    expect(ship.slots.sidekickLeft).toBeNull();
    expect(ship.slots.sidekickRight).toBeNull();
    expect(ship.reactor.capacityLevel).toBe(0);
    expect(ship.reactor.rechargeLevel).toBe(0);
  });

  it("starts in the tutorial system with only the tutorial system unlocked", () => {
    const s = getState();
    expect(s.currentSolarSystemId).toBe("tutorial");
    expect(s.unlockedSolarSystems).toEqual(["tutorial"]);
  });
});

describe("credits", () => {
  it("addCredits accumulates and clamps the floor at zero", () => {
    addCredits(50);
    expect(getState().credits).toBe(50);
    addCredits(-30);
    expect(getState().credits).toBe(20);
    addCredits(-9999);
    expect(getState().credits).toBe(0);
  });

  it("addCredits is a no-op for zero", () => {
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });
    addCredits(0);
    unsub();
    expect(calls).toBe(0);
  });

  it("spendCredits succeeds when the wallet has enough", () => {
    addCredits(100);
    expect(spendCredits(40)).toBe(true);
    expect(getState().credits).toBe(60);
  });

  it("spendCredits refuses to overdraw and leaves credits untouched", () => {
    addCredits(20);
    expect(spendCredits(50)).toBe(false);
    expect(getState().credits).toBe(20);
  });
});

describe("playedTime", () => {
  it("accumulates positive seconds and ignores zero/negative", () => {
    addPlayedTime(30);
    addPlayedTime(0);
    addPlayedTime(-10);
    addPlayedTime(15);
    expect(getState().playedTimeSeconds).toBe(45);
  });
});

describe("completeMission", () => {
  it("records completion and is idempotent", () => {
    completeMission("tutorial");
    completeMission("tutorial");
    expect(getState().completedMissions).toEqual(["tutorial"]);
    expect(isMissionCompleted("tutorial")).toBe(true);
  });

  it("unlocks downstream missions when prereqs are satisfied", () => {
    expect(isPlanetUnlocked("combat-1")).toBe(false);
    completeMission("tutorial");
    expect(isPlanetUnlocked("combat-1")).toBe(true);
    expect(isPlanetUnlocked("boss-1")).toBe(false);
    completeMission("combat-1");
    expect(isPlanetUnlocked("boss-1")).toBe(true);
  });

  it("does not duplicate planets that were already unlocked", () => {
    completeMission("tutorial");
    completeMission("tutorial");
    const dupes = getState().unlockedPlanets.filter((p) => p === "combat-1");
    expect(dupes).toHaveLength(1);
  });

  it("completing boss-1 unlocks the tubernovae solar system", () => {
    expect(getState().unlockedSolarSystems).not.toContain("tubernovae");
    completeMission("boss-1");
    expect(getState().unlockedSolarSystems).toContain("tubernovae");
  });

  it("completing boss-1 a second time does not duplicate the system unlock", () => {
    completeMission("boss-1");
    completeMission("boss-1");
    const occurrences = getState().unlockedSolarSystems.filter((s) => s === "tubernovae");
    expect(occurrences).toHaveLength(1);
  });
});

describe("setSolarSystem", () => {
  it("refuses to switch to a system the player has not unlocked", () => {
    expect(setSolarSystem("tubernovae")).toBe(false);
    expect(getState().currentSolarSystemId).toBe("tutorial");
  });

  it("switches when the system is unlocked", () => {
    completeMission("boss-1"); // unlocks tubernovae
    expect(setSolarSystem("tubernovae")).toBe(true);
    expect(getState().currentSolarSystemId).toBe("tubernovae");
  });

  it("is a no-op (returns true) when already on the requested system", () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    expect(setSolarSystem("tutorial")).toBe(true);
    unsub();
    expect(count).toBe(0);
    expect(getState().currentSolarSystemId).toBe("tutorial");
  });
});

describe("ship purchases", () => {
  it("buyWeapon refuses when the player cannot afford it", () => {
    expect(buyWeapon("heavy-cannon")).toBe(false);
    expect(getState().ship.unlockedWeapons).toEqual(["rapid-fire"]);
  });

  it("buyWeapon spends credits, unlocks, and leaves the front slot alone when occupied", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.ship.unlockedWeapons).toContain("spread-shot");
    expect(s.ship.slots.front).toBe("rapid-fire");
  });

  it("buyWeapon refuses to re-purchase a weapon already owned", () => {
    expect(buyWeapon("rapid-fire")).toBe(false);
  });

  it("buyShieldUpgrade increments the level and spends credits", () => {
    addCredits(200);
    expect(buyShieldUpgrade()).toBe(true);
    expect(getState().ship.shieldLevel).toBe(1);
    expect(getState().credits).toBe(0);
  });

  it("buyShieldUpgrade refuses past MAX_LEVEL", () => {
    addCredits(1_000_000);
    for (let i = 0; i < 5; i++) buyShieldUpgrade();
    expect(getState().ship.shieldLevel).toBe(5);
    expect(buyShieldUpgrade()).toBe(false);
  });

  it("buyArmorUpgrade has the same gating as shields", () => {
    expect(buyArmorUpgrade()).toBe(false);
    addCredits(300);
    expect(buyArmorUpgrade()).toBe(true);
    expect(getState().ship.armorLevel).toBe(1);
  });

  it("buyReactorCapacityUpgrade increments level when affordable, refuses otherwise", () => {
    expect(buyReactorCapacityUpgrade()).toBe(false);
    addCredits(200);
    expect(buyReactorCapacityUpgrade()).toBe(true);
    expect(getState().ship.reactor.capacityLevel).toBe(1);
    expect(getState().credits).toBe(0);
  });

  it("buyReactorRechargeUpgrade increments and refuses past MAX_LEVEL", () => {
    addCredits(1_000_000);
    for (let i = 0; i < 5; i++) buyReactorRechargeUpgrade();
    expect(getState().ship.reactor.rechargeLevel).toBe(5);
    expect(buyReactorRechargeUpgrade()).toBe(false);
  });
});

describe("equipWeapon", () => {
  it("refuses to equip a weapon the player does not own", () => {
    expect(equipWeapon("front", "heavy-cannon")).toBe(false);
    expect(getState().ship.slots.front).toBe("rapid-fire");
  });

  it("refuses to equip a weapon into a slot of a different kind", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    expect(equipWeapon("rear", "spread-shot")).toBe(false);
    expect(getState().ship.slots.rear).toBeNull();
  });

  it("equips an owned weapon into a matching slot", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    expect(equipWeapon("front", "spread-shot")).toBe(true);
    expect(getState().ship.slots.front).toBe("spread-shot");
  });

  it("equipping a different weapon into a slot replaces what was there", () => {
    addCredits(900);
    buyWeapon("heavy-cannon");
    expect(equipWeapon("front", "heavy-cannon")).toBe(true);
    expect(getState().ship.slots.front).toBe("heavy-cannon");
    expect(equipWeapon("front", "rapid-fire")).toBe(true);
    expect(getState().ship.slots.front).toBe("rapid-fire");
  });

  it("equipping null clears the slot", () => {
    expect(equipWeapon("front", null)).toBe(true);
    expect(getState().ship.slots.front).toBeNull();
  });

  it("equipping a weapon that was in another slot vacates that other slot (no duplication)", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    equipWeapon("front", "spread-shot");
    expect(equipWeapon("front", "rapid-fire")).toBe(true);
    const slots = getState().ship.slots;
    expect(slots.front).toBe("rapid-fire");
    expect(Object.values(slots).filter((s) => s === "spread-shot")).toHaveLength(0);
  });
});

describe("grantWeapon (mission pickup)", () => {
  it("unlocks a new weapon and equips it into its canonical slot (front for front weapons)", () => {
    grantWeapon("heavy-cannon");
    const s = getState();
    expect(s.ship.unlockedWeapons).toContain("heavy-cannon");
    expect(s.ship.slots.front).toBe("heavy-cannon");
  });

  it("is a no-op (no commit) when the weapon is already unlocked AND already in its canonical slot", () => {
    grantWeapon("spread-shot");
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });
    grantWeapon("spread-shot");
    unsub();
    expect(calls).toBe(0);
  });
});

describe("sellWeapon", () => {
  it("refuses to sell a weapon equipped in any slot", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    equipWeapon("front", "spread-shot");
    expect(sellWeapon("spread-shot")).toBe(false);
    expect(getState().ship.unlockedWeapons).toContain("spread-shot");
  });

  it("sells an owned, unequipped weapon for half its purchase price", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    expect(sellWeapon("spread-shot")).toBe(true);
    expect(getState().ship.unlockedWeapons).not.toContain("spread-shot");
    expect(getState().credits).toBe(225);
  });

  it("refuses to sell the starter weapon (cost 0 → no refund)", () => {
    equipWeapon("front", null);
    expect(sellWeapon("rapid-fire")).toBe(false);
  });
});

describe("snapshot / hydrate", () => {
  it("toSnapshot is a deep copy that survives mutating the live state", () => {
    addCredits(123);
    completeMission("tutorial");
    const snap = toSnapshot();
    addCredits(50);
    completeMission("combat-1");
    expect(snap.credits).toBe(123);
    expect(snap.completedMissions).toEqual(["tutorial"]);
    expect(snap.ship.slots.front).toBe("rapid-fire");
    expect(snap.ship.reactor).toEqual({ capacityLevel: 0, rechargeLevel: 0 });
  });

  it("hydrate restores from a partial snapshot using INITIAL defaults for missing fields", () => {
    hydrate({ credits: 999, completedMissions: ["tutorial"] });
    const s = getState();
    expect(s.credits).toBe(999);
    expect(s.completedMissions).toEqual(["tutorial"]);
    expect(s.ship.slots.front).toBe("rapid-fire");
  });

  it("hydrate migrates a legacy snapshot (primaryWeapon, no slots, no reactor)", () => {
    const legacy = {
      credits: 500,
      ship: {
        primaryWeapon: "heavy-cannon",
        unlockedWeapons: ["rapid-fire", "heavy-cannon"],
        shieldLevel: 2,
        armorLevel: 1
      }
    } as unknown as Parameters<typeof hydrate>[0];
    hydrate(legacy);
    const s = getState();
    expect(s.credits).toBe(500);
    expect(s.ship.unlockedWeapons).toEqual(["rapid-fire", "heavy-cannon"]);
    expect(s.ship.slots.front).toBe("heavy-cannon");
    expect(s.ship.slots.rear).toBeNull();
    expect(s.ship.slots.sidekickLeft).toBeNull();
    expect(s.ship.slots.sidekickRight).toBeNull();
    expect(s.ship.shieldLevel).toBe(2);
    expect(s.ship.armorLevel).toBe(1);
    expect(s.ship.reactor).toEqual({ capacityLevel: 0, rechargeLevel: 0 });
  });

  it("hydrate accepts a new-format snapshot directly", () => {
    const snap = {
      credits: 10,
      ship: {
        slots: {
          front: "rapid-fire",
          rear: null,
          sidekickLeft: null,
          sidekickRight: null
        },
        unlockedWeapons: ["rapid-fire"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 3, rechargeLevel: 2 }
      }
    } as unknown as Parameters<typeof hydrate>[0];
    hydrate(snap);
    expect(getState().ship.reactor).toEqual({ capacityLevel: 3, rechargeLevel: 2 });
  });

  it("hydrate defaults solar-system fields when the snapshot predates them", () => {
    // Old snapshots have no currentSolarSystemId / unlockedSolarSystems fields.
    // They should fall back to the tutorial system + only the tutorial unlocked.
    hydrate({ credits: 42, completedMissions: ["tutorial", "combat-1"] });
    const s = getState();
    expect(s.currentSolarSystemId).toBe("tutorial");
    expect(s.unlockedSolarSystems).toEqual(["tutorial"]);
  });

  it("hydrate clamps a saved currentSolarSystemId to one the player has unlocked", () => {
    // Pretend a save was tampered with — currentSolarSystemId says tubernovae
    // but unlockedSolarSystems doesn't list it. Migration should reset.
    hydrate({
      currentSolarSystemId: "tubernovae",
      unlockedSolarSystems: ["tutorial"]
    });
    expect(getState().currentSolarSystemId).toBe("tutorial");
  });

  it("hydrate restores both solar-system fields when present", () => {
    hydrate({
      currentSolarSystemId: "tubernovae",
      unlockedSolarSystems: ["tutorial", "tubernovae"]
    });
    const s = getState();
    expect(s.currentSolarSystemId).toBe("tubernovae");
    expect(s.unlockedSolarSystems).toEqual(["tutorial", "tubernovae"]);
  });

  it("subscribe fires on commit and unsubscribe stops it", () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    addCredits(10);
    addCredits(20);
    expect(count).toBe(2);
    unsub();
    addCredits(30);
    expect(count).toBe(2);
  });
});

describe("buyWeaponUpgrade", () => {
  it("refuses to upgrade a weapon the player does not own", () => {
    addCredits(10000);
    expect(buyWeaponUpgrade("heavy-cannon")).toBe(false);
    expect(getState().credits).toBe(10000);
  });

  it("upgrades the starter weapon from level 1 to 2 for 200 credits", () => {
    addCredits(500);
    expect(buyWeaponUpgrade("rapid-fire")).toBe(true);
    const s = getState();
    expect(s.credits).toBe(300);
    expect(s.ship.weaponLevels["rapid-fire"]).toBe(2);
  });

  it("doubles cost per current level (200, 400, 800, 1600)", () => {
    addCredits(10000);
    buyWeaponUpgrade("rapid-fire"); // 1 -> 2  cost 200
    buyWeaponUpgrade("rapid-fire"); // 2 -> 3  cost 400
    buyWeaponUpgrade("rapid-fire"); // 3 -> 4  cost 800
    buyWeaponUpgrade("rapid-fire"); // 4 -> 5  cost 1600
    const s = getState();
    expect(s.ship.weaponLevels["rapid-fire"]).toBe(5);
    expect(s.credits).toBe(10000 - 200 - 400 - 800 - 1600);
  });

  it("refuses past MAX_LEVEL", () => {
    addCredits(10000);
    for (let i = 0; i < 4; i++) buyWeaponUpgrade("rapid-fire");
    const before = getState().credits;
    expect(buyWeaponUpgrade("rapid-fire")).toBe(false);
    expect(getState().credits).toBe(before);
  });

  it("refuses when the player can't afford the next upgrade", () => {
    addCredits(199);
    expect(buyWeaponUpgrade("rapid-fire")).toBe(false);
    expect(getState().credits).toBe(199);
    expect(getState().ship.weaponLevels["rapid-fire"]).toBeUndefined();
  });
});

describe("hydrate", () => {
  it("defaults weaponLevels to {} when snapshot omits it (legacy save)", () => {
    hydrate({
      ship: {
        slots: { front: "rapid-fire", rear: null, sidekickLeft: null, sidekickRight: null },
        unlockedWeapons: ["rapid-fire"],
        // No weaponLevels here — simulates a pre-Phase-A save
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      } as unknown as ReturnType<typeof toSnapshot>["ship"]
    });
    expect(getState().ship.weaponLevels).toEqual({});
  });

  it("clamps levels to [1, MAX_LEVEL] and drops levels for un-owned weapons", () => {
    hydrate({
      ship: {
        slots: { front: "rapid-fire", rear: null, sidekickLeft: null, sidekickRight: null },
        unlockedWeapons: ["rapid-fire", "spread-shot"],
        weaponLevels: {
          "rapid-fire": 99,           // clamp down to 5
          "spread-shot": 0,            // clamp up to 1
          "heavy-cannon": 3            // dropped — not owned
        },
        weaponAugments: {},
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }
    });
    const lvls = getState().ship.weaponLevels;
    expect(lvls["rapid-fire"]).toBe(5);
    expect(lvls["spread-shot"]).toBe(1);
    expect(lvls["heavy-cannon"]).toBeUndefined();
  });

  it("round-trips weaponLevels through toSnapshot/hydrate", () => {
    addCredits(10000);
    buyWeaponUpgrade("rapid-fire");
    buyWeaponUpgrade("rapid-fire");
    const snap = toSnapshot();
    expect(snap.ship.weaponLevels["rapid-fire"]).toBe(3);
    resetForTests();
    expect(getState().ship.weaponLevels["rapid-fire"]).toBeUndefined();
    hydrate(snap);
    expect(getState().ship.weaponLevels["rapid-fire"]).toBe(3);
  });

  it("weaponAugments: drops unknown ids, drops entries for un-owned weapons, caps and dedupes", () => {
    hydrate({
      ship: {
        slots: { front: "rapid-fire", rear: null, sidekickLeft: null, sidekickRight: null },
        unlockedWeapons: ["rapid-fire", "spread-shot"],
        weaponLevels: {},
        weaponAugments: {
          // Unknown ids filtered, dupes deduped, capped at MAX_AUGMENTS_PER_WEAPON
          "rapid-fire": [
            "damage-up",
            "damage-up",
            "bogus-id",
            "fire-rate-up",
            "extra-projectile"
          ],
          // Dropped — heavy-cannon is not owned
          "heavy-cannon": ["damage-up"]
        },
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      } as unknown as ReturnType<typeof toSnapshot>["ship"]
    });
    const aug = getState().ship.weaponAugments;
    expect(aug["rapid-fire"]).toEqual(["damage-up", "fire-rate-up"]);
    expect(aug["rapid-fire"]?.length).toBe(MAX_AUGMENTS_PER_WEAPON);
    expect(aug["heavy-cannon"]).toBeUndefined();
    expect(aug["spread-shot"]).toBeUndefined();
  });

  it("augmentInventory: keeps only known ids and preserves order", () => {
    hydrate({
      ship: {
        slots: { front: "rapid-fire", rear: null, sidekickLeft: null, sidekickRight: null },
        unlockedWeapons: ["rapid-fire"],
        weaponLevels: {},
        weaponAugments: {},
        augmentInventory: [
          "damage-up",
          "bogus-id",
          "fire-rate-up",
          "another-bogus",
          "extra-projectile"
        ],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      } as unknown as ReturnType<typeof toSnapshot>["ship"]
    });
    expect(getState().ship.augmentInventory).toEqual([
      "damage-up",
      "fire-rate-up",
      "extra-projectile"
    ]);
  });

  it("round-trips weaponAugments + augmentInventory through toSnapshot/hydrate", () => {
    addCredits(10000);
    grantAugment("damage-up");
    grantAugment("fire-rate-up");
    expect(installAugment("rapid-fire", "damage-up")).toBe(true);
    // One augment installed on rapid-fire, one still in inventory.
    expect(getState().ship.weaponAugments["rapid-fire"]).toEqual(["damage-up"]);
    expect(getState().ship.augmentInventory).toEqual(["fire-rate-up"]);

    const snap = toSnapshot();
    resetForTests();
    expect(getState().ship.weaponAugments).toEqual({});
    expect(getState().ship.augmentInventory).toEqual([]);

    hydrate(snap);
    expect(getState().ship.weaponAugments["rapid-fire"]).toEqual(["damage-up"]);
    expect(getState().ship.augmentInventory).toEqual(["fire-rate-up"]);
  });
});

describe("augment mutators", () => {
  describe("buyAugment", () => {
    it("refuses when the player can't afford it; inventory unchanged", () => {
      addCredits(0);
      expect(buyAugment("damage-up")).toBe(false);
      expect(getState().ship.augmentInventory).toEqual([]);
      expect(getState().credits).toBe(0);
    });

    it("on success spends credits and pushes the augment into inventory", () => {
      addCredits(1000);
      expect(buyAugment("damage-up")).toBe(true);
      expect(getState().credits).toBe(0);
      expect(getState().ship.augmentInventory).toEqual(["damage-up"]);
    });

    it("buying the same augment twice stacks two copies in inventory", () => {
      addCredits(2000);
      expect(buyAugment("damage-up")).toBe(true);
      expect(buyAugment("damage-up")).toBe(true);
      expect(getState().ship.augmentInventory).toEqual(["damage-up", "damage-up"]);
    });
  });

  describe("grantAugment", () => {
    it("adds to inventory regardless of credits (no cost check)", () => {
      expect(getState().credits).toBe(0);
      grantAugment("extra-projectile");
      expect(getState().ship.augmentInventory).toEqual(["extra-projectile"]);
      expect(getState().credits).toBe(0);
    });
  });

  describe("installAugment", () => {
    it("refuses when the weapon is not owned", () => {
      grantAugment("damage-up");
      expect(installAugment("heavy-cannon", "damage-up")).toBe(false);
      // Inventory copy is preserved on failure.
      expect(getState().ship.augmentInventory).toEqual(["damage-up"]);
    });

    it("refuses when the augment is not in inventory", () => {
      grantAugment("fire-rate-up");
      expect(installAugment("rapid-fire", "damage-up")).toBe(false);
      expect(getState().ship.weaponAugments["rapid-fire"]).toBeUndefined();
    });

    it("refuses past MAX_AUGMENTS_PER_WEAPON", () => {
      grantAugment("damage-up");
      grantAugment("fire-rate-up");
      grantAugment("extra-projectile");
      expect(installAugment("rapid-fire", "damage-up")).toBe(true);
      expect(installAugment("rapid-fire", "fire-rate-up")).toBe(true);
      expect(installAugment("rapid-fire", "extra-projectile")).toBe(false);
      expect(getState().ship.weaponAugments["rapid-fire"]).toEqual([
        "damage-up",
        "fire-rate-up"
      ]);
      // The extra-projectile copy is still sitting in inventory because the
      // install was rejected before mutation.
      expect(getState().ship.augmentInventory).toEqual(["extra-projectile"]);
    });

    it("refuses when the same augment is already installed on that weapon", () => {
      grantAugment("damage-up");
      grantAugment("damage-up");
      expect(installAugment("rapid-fire", "damage-up")).toBe(true);
      expect(installAugment("rapid-fire", "damage-up")).toBe(false);
      expect(getState().ship.weaponAugments["rapid-fire"]).toEqual(["damage-up"]);
      // The second copy stayed in inventory.
      expect(getState().ship.augmentInventory).toEqual(["damage-up"]);
    });

    it("on success removes ONE copy from inventory and appends to weaponAugments", () => {
      grantAugment("damage-up");
      grantAugment("damage-up");
      grantAugment("fire-rate-up");
      expect(installAugment("rapid-fire", "damage-up")).toBe(true);
      // Only one of the two damage-up copies should leave inventory.
      expect(getState().ship.augmentInventory).toEqual(["damage-up", "fire-rate-up"]);
      expect(getState().ship.weaponAugments["rapid-fire"]).toEqual(["damage-up"]);
    });
  });

  describe("sellWeapon drops augments", () => {
    it("destroys the weapon's augment list and does NOT refund augments back to inventory", () => {
      addCredits(450);
      expect(buyWeapon("spread-shot")).toBe(true);
      grantAugment("damage-up");
      grantAugment("fire-rate-up");
      expect(installAugment("spread-shot", "damage-up")).toBe(true);
      expect(installAugment("spread-shot", "fire-rate-up")).toBe(true);
      expect(getState().ship.weaponAugments["spread-shot"]).toEqual([
        "damage-up",
        "fire-rate-up"
      ]);
      expect(getState().ship.augmentInventory).toEqual([]);

      // sellWeapon refuses equipped weapons. buyWeapon left spread-shot
      // unequipped (front slot was already occupied by rapid-fire), so we can
      // sell it directly.
      expect(sellWeapon("spread-shot")).toBe(true);

      expect(getState().ship.weaponAugments["spread-shot"]).toBeUndefined();
      expect(getState().ship.augmentInventory).toEqual([]);
      expect(getState().ship.unlockedWeapons).not.toContain("spread-shot");
    });
  });
});

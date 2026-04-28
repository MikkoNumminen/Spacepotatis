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
  buyWeaponSlot,
  buyWeaponUpgrade,
  commit,
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
import { newWeaponInstance } from "./ShipConfig";

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

  it("ship boots with one slot containing a fresh rapid-fire instance", () => {
    const ship = getState().ship;
    expect(ship.slots).toHaveLength(1);
    expect(ship.slots[0]?.id).toBe("rapid-fire");
    expect(ship.slots[0]?.level).toBe(1);
    expect(ship.slots[0]?.augments).toEqual([]);
    expect(ship.inventory).toEqual([]);
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
    // Inventory and slots are unchanged: only the starter is owned.
    const s = getState();
    expect(s.ship.inventory).toEqual([]);
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
  });

  it("buyWeapon spends credits and lands the new instance in inventory when slots are full", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    const s = getState();
    expect(s.credits).toBe(0);
    // Default ship has only one slot, occupied by the starter, so the
    // new instance lands in inventory.
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("spread-shot");
    expect(s.ship.inventory[0]?.level).toBe(1);
  });

  it("buyWeapon allows duplicate purchases (each call creates a new instance)", () => {
    addCredits(900);
    expect(buyWeapon("spread-shot")).toBe(true);
    expect(buyWeapon("spread-shot")).toBe(true);
    const s = getState();
    expect(s.credits).toBe(0);
    expect(s.ship.inventory).toHaveLength(2);
    expect(s.ship.inventory[0]?.id).toBe("spread-shot");
    expect(s.ship.inventory[1]?.id).toBe("spread-shot");
    // Independent objects — upgrading one shouldn't touch the other.
    expect(s.ship.inventory[0]).not.toBe(s.ship.inventory[1]);
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
  it("refuses to equip from an out-of-range inventory index", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    expect(equipWeapon(0, 99)).toBe(false);
    // Slot 0 still holds the starter; nothing was disturbed.
    expect(getState().ship.slots[0]?.id).toBe("rapid-fire");
  });

  it("refuses to equip into an out-of-range slot index", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    expect(equipWeapon(5, 0)).toBe(false);
    expect(getState().ship.slots).toHaveLength(1);
  });

  it("equips an inventory weapon into a slot, displacing the previous occupant to the inventory tail", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    // Pre: slot 0 = rapid-fire, inventory = [spread-shot].
    expect(equipWeapon(0, 0)).toBe(true);
    const s = getState();
    expect(s.ship.slots[0]?.id).toBe("spread-shot");
    // The displaced starter is now at the END of inventory.
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("rapid-fire");
  });

  it("equipping null clears the slot and pushes the displaced instance to inventory", () => {
    expect(equipWeapon(0, null)).toBe(true);
    const s = getState();
    expect(s.ship.slots[0]).toBeNull();
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("rapid-fire");
  });

  it("equipping null on an already-empty slot is a no-op success", () => {
    equipWeapon(0, null);
    // Now slot 0 is null, inventory has the starter.
    const before = getState().ship;
    expect(equipWeapon(0, null)).toBe(true);
    const after = getState().ship;
    // Inventory length unchanged — no spurious push.
    expect(after.inventory).toHaveLength(before.inventory.length);
  });
});

describe("buyWeaponSlot", () => {
  it("first expansion costs 500 credits and appends a null slot at the tail", () => {
    addCredits(500);
    expect(buyWeaponSlot()).toBe(true);
    const s = getState();
    expect(s.ship.slots).toHaveLength(2);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[1]).toBeNull();
    expect(s.credits).toBe(0);
  });

  it("refuses when the player can't afford the next slot", () => {
    expect(buyWeaponSlot()).toBe(false);
    expect(getState().ship.slots).toHaveLength(1);
  });

  it("auto-equips the next weapon purchase into the freshly bought slot", () => {
    addCredits(500 + 450);
    expect(buyWeaponSlot()).toBe(true);
    expect(buyWeapon("spread-shot")).toBe(true);
    const s = getState();
    expect(s.ship.slots).toHaveLength(2);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[1]?.id).toBe("spread-shot");
    expect(s.ship.inventory).toEqual([]);
  });
});

describe("grantWeapon (mission pickup)", () => {
  it("lands in inventory when every slot is occupied", () => {
    // Default ship has only one slot, occupied by the starter. The new
    // instance lands in inventory.
    grantWeapon("heavy-cannon");
    const s = getState();
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("heavy-cannon");
  });

  it("auto-equips the new weapon into the first empty slot", () => {
    addCredits(500);
    expect(buyWeaponSlot()).toBe(true);
    grantWeapon("heavy-cannon");
    const s = getState();
    expect(s.ship.slots).toHaveLength(2);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[1]?.id).toBe("heavy-cannon");
    expect(s.ship.inventory).toEqual([]);
  });

  it("re-granting an already-owned weapon ADDS a duplicate instance", () => {
    grantWeapon("rapid-fire");
    grantWeapon("rapid-fire");
    const s = getState();
    // Slot still holds the starter; the two extra grants land in inventory
    // (one per call) because no slot is empty.
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.inventory).toHaveLength(2);
    expect(s.ship.inventory.every((inst) => inst.id === "rapid-fire")).toBe(true);
    // Distinct instances even though they share an id.
    expect(s.ship.inventory[0]).not.toBe(s.ship.inventory[1]);
  });
});

describe("sellWeapon", () => {
  it("refuses when the inventory index is out of range", () => {
    expect(sellWeapon(99)).toBe(false);
    expect(sellWeapon(0)).toBe(false); // empty inventory
    expect(getState().credits).toBe(0);
  });

  it("sells an inventory weapon for half its purchase price", () => {
    addCredits(450);
    expect(buyWeapon("spread-shot")).toBe(true);
    // spread-shot landed in inventory because slot 0 was full.
    expect(getState().ship.inventory).toHaveLength(1);
    expect(sellWeapon(0)).toBe(true);
    const s = getState();
    expect(s.ship.inventory).toEqual([]);
    expect(s.credits).toBe(225);
  });

  it("refuses to sell an instance whose weapon has cost 0 (no refund possible)", () => {
    // Place the starter into inventory by clearing slot 0.
    equipWeapon(0, null);
    expect(getState().ship.inventory).toHaveLength(1);
    expect(getState().ship.inventory[0]?.id).toBe("rapid-fire");
    expect(sellWeapon(0)).toBe(false);
    // Inventory is unchanged.
    expect(getState().ship.inventory).toHaveLength(1);
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
    expect(snap.ship.slots).toHaveLength(1);
    expect(snap.ship.slots[0]?.id).toBe("rapid-fire");
    expect(snap.ship.reactor).toEqual({ capacityLevel: 0, rechargeLevel: 0 });
  });

  it("toSnapshot's ship slots/inventory are independent of the live state", () => {
    addCredits(450);
    buyWeapon("spread-shot");
    const snap = toSnapshot();
    // Mutate the snapshot's arrays — the live state must not be touched.
    (snap.ship.slots as (typeof snap.ship.slots[number])[]).pop();
    (snap.ship.inventory as typeof snap.ship.inventory[number][]).pop();
    expect(getState().ship.slots).toHaveLength(1);
    expect(getState().ship.inventory).toHaveLength(1);
  });

  it("hydrate restores from a partial snapshot using INITIAL defaults for missing fields", () => {
    hydrate({ credits: 999, completedMissions: ["tutorial"] });
    const s = getState();
    expect(s.credits).toBe(999);
    expect(s.completedMissions).toEqual(["tutorial"]);
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
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
    // primaryWeapon "heavy-cannon" lands in slot 0; the leftover unlocked
    // weapon (rapid-fire) becomes an inventory instance.
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("heavy-cannon");
    expect(s.ship.inventory.map((i) => i.id)).toContain("rapid-fire");
    expect(s.ship.shieldLevel).toBe(2);
    expect(s.ship.armorLevel).toBe(1);
    expect(s.ship.reactor).toEqual({ capacityLevel: 0, rechargeLevel: 0 });
  });

  it("hydrate migrates a four-named-slot snapshot (pre-array refactor) — keeps front, drops the rest", () => {
    const named = {
      credits: 50,
      ship: {
        slots: {
          front: "rapid-fire",
          rear: "tail-gunner",
          sidekickLeft: "side-spitter",
          sidekickRight: null
        },
        unlockedWeapons: ["rapid-fire", "tail-gunner", "side-spitter"],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      }
    } as unknown as Parameters<typeof hydrate>[0];
    hydrate(named);
    const s = getState();
    // front weapon survives in slot 0; the other unlocked weapons land in
    // inventory (one instance per unique unlocked id).
    expect(s.ship.slots).toHaveLength(1);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    const invIds = s.ship.inventory.map((i) => i.id).sort();
    expect(invIds).toEqual(["side-spitter", "tail-gunner"]);
  });

  it("hydrate accepts a new-format array snapshot directly", () => {
    const snap = {
      credits: 10,
      ship: {
        slots: [newWeaponInstance("rapid-fire"), null],
        inventory: [newWeaponInstance("spread-shot")],
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 3, rechargeLevel: 2 }
      }
    } as unknown as Parameters<typeof hydrate>[0];
    hydrate(snap);
    const s = getState();
    expect(s.ship.reactor).toEqual({ capacityLevel: 3, rechargeLevel: 2 });
    expect(s.ship.slots).toHaveLength(2);
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[1]).toBeNull();
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("spread-shot");
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
  it("refuses to upgrade an out-of-range position (no instance present)", () => {
    addCredits(10000);
    expect(buyWeaponUpgrade({ kind: "slot", index: 5 })).toBe(false);
    expect(buyWeaponUpgrade({ kind: "inventory", index: 0 })).toBe(false);
    expect(getState().credits).toBe(10000);
  });

  it("upgrades the starter weapon from level 1 to 2 for 200 credits", () => {
    addCredits(500);
    expect(buyWeaponUpgrade({ kind: "slot", index: 0 })).toBe(true);
    const s = getState();
    expect(s.credits).toBe(300);
    expect(s.ship.slots[0]?.level).toBe(2);
  });

  it("doubles cost per current level (200, 400, 800, 1600)", () => {
    addCredits(10000);
    buyWeaponUpgrade({ kind: "slot", index: 0 }); // 1 -> 2  cost 200
    buyWeaponUpgrade({ kind: "slot", index: 0 }); // 2 -> 3  cost 400
    buyWeaponUpgrade({ kind: "slot", index: 0 }); // 3 -> 4  cost 800
    buyWeaponUpgrade({ kind: "slot", index: 0 }); // 4 -> 5  cost 1600
    const s = getState();
    expect(s.ship.slots[0]?.level).toBe(5);
    expect(s.credits).toBe(10000 - 200 - 400 - 800 - 1600);
  });

  it("refuses past MAX_LEVEL", () => {
    addCredits(10000);
    for (let i = 0; i < 4; i++) buyWeaponUpgrade({ kind: "slot", index: 0 });
    const before = getState().credits;
    expect(buyWeaponUpgrade({ kind: "slot", index: 0 })).toBe(false);
    expect(getState().credits).toBe(before);
  });

  it("refuses when the player can't afford the next upgrade", () => {
    addCredits(199);
    expect(buyWeaponUpgrade({ kind: "slot", index: 0 })).toBe(false);
    expect(getState().credits).toBe(199);
    expect(getState().ship.slots[0]?.level).toBe(1);
  });

  it("upgrades a slot instance without touching another instance of the same id", () => {
    // Two rapid-fire instances: one in slot 0 (the starter), one in inventory
    // via a duplicate buyWeapon. Upgrading the slot must NOT bump the
    // inventory entry's level.
    addCredits(10000);
    grantWeapon("rapid-fire"); // duplicate instance lands in inventory
    expect(buyWeaponUpgrade({ kind: "slot", index: 0 })).toBe(true);
    const s = getState();
    expect(s.ship.slots[0]?.level).toBe(2);
    expect(s.ship.inventory[0]?.level).toBe(1);
  });
});

describe("hydrate (legacy weapon level/augment migration)", () => {
  it("clamps levels to [1, MAX_LEVEL] and drops levels for un-owned weapons", () => {
    hydrate({
      ship: {
        slots: ["rapid-fire"],
        unlockedWeapons: ["rapid-fire", "spread-shot"],
        weaponLevels: {
          "rapid-fire": 99, // clamp down to 5
          "spread-shot": 0, // clamp up to 1
          "heavy-cannon": 3 // dropped — not owned
        },
        weaponAugments: {},
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      } as unknown as ReturnType<typeof toSnapshot>["ship"]
    });
    const s = getState();
    // rapid-fire claims the slot (first match wins) at clamped level 5.
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[0]?.level).toBe(5);
    // spread-shot is the leftover instance; it lands in inventory at level 1.
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("spread-shot");
    expect(s.ship.inventory[0]?.level).toBe(1);
    // heavy-cannon was never owned: no instance for it anywhere.
    const allIds = [
      ...s.ship.slots.flatMap((slot) => (slot ? [slot.id] : [])),
      ...s.ship.inventory.map((i) => i.id)
    ];
    expect(allIds).not.toContain("heavy-cannon");
  });

  it("weaponAugments: drops unknown ids, drops entries for un-owned weapons, caps and dedupes", () => {
    hydrate({
      ship: {
        slots: ["rapid-fire"],
        unlockedWeapons: ["rapid-fire", "spread-shot"],
        weaponLevels: {},
        weaponAugments: {
          // Unknown ids filtered, dupes deduped, capped at MAX_AUGMENTS_PER_WEAPON.
          "rapid-fire": [
            "damage-up",
            "damage-up",
            "bogus-id",
            "fire-rate-up",
            "extra-projectile"
          ],
          // Dropped — heavy-cannon is not owned.
          "heavy-cannon": ["damage-up"]
        },
        augmentInventory: [],
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      } as unknown as ReturnType<typeof toSnapshot>["ship"]
    });
    const s = getState();
    // The rapid-fire instance is in slot 0 with the cleaned augment list.
    expect(s.ship.slots[0]?.id).toBe("rapid-fire");
    expect(s.ship.slots[0]?.augments).toEqual(["damage-up", "fire-rate-up"]);
    expect(s.ship.slots[0]?.augments.length).toBe(2);
    // spread-shot lives in inventory with no augments (none were specified
    // for it under the legacy map).
    expect(s.ship.inventory).toHaveLength(1);
    expect(s.ship.inventory[0]?.id).toBe("spread-shot");
    expect(s.ship.inventory[0]?.augments).toEqual([]);
  });

  it("augmentInventory: keeps only known ids and preserves order", () => {
    hydrate({
      ship: {
        slots: ["rapid-fire"],
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

  it("instance level defaults to 1 when missing in legacy snapshot", () => {
    hydrate({
      ship: {
        slots: ["rapid-fire"],
        unlockedWeapons: ["rapid-fire"],
        // No weaponLevels — pre-Phase-A save.
        shieldLevel: 0,
        armorLevel: 0,
        reactor: { capacityLevel: 0, rechargeLevel: 0 }
      } as unknown as ReturnType<typeof toSnapshot>["ship"]
    });
    expect(getState().ship.slots[0]?.id).toBe("rapid-fire");
    expect(getState().ship.slots[0]?.level).toBe(1);
  });

  it("round-trips an instance level through toSnapshot/hydrate", () => {
    // Set up a slot 0 instance with level 4 using commit directly (avoids
    // having to save up the credits for three upgrades).
    const state = getState();
    commit({
      ...state,
      ship: {
        ...state.ship,
        slots: [{ id: "rapid-fire", level: 4, augments: [] }]
      }
    });
    const snap = toSnapshot();
    expect(snap.ship.slots[0]?.level).toBe(4);
    resetForTests();
    expect(getState().ship.slots[0]?.level).toBe(1);
    hydrate(snap);
    expect(getState().ship.slots[0]?.id).toBe("rapid-fire");
    expect(getState().ship.slots[0]?.level).toBe(4);
  });

  it("round-trips per-instance augments + augmentInventory through toSnapshot/hydrate", () => {
    grantAugment("damage-up");
    grantAugment("fire-rate-up");
    expect(installAugment({ kind: "slot", index: 0 }, "damage-up")).toBe(true);
    // One augment installed on slot 0, one still in inventory.
    expect(getState().ship.slots[0]?.augments).toEqual(["damage-up"]);
    expect(getState().ship.augmentInventory).toEqual(["fire-rate-up"]);

    const snap = toSnapshot();
    resetForTests();
    expect(getState().ship.slots[0]?.augments).toEqual([]);
    expect(getState().ship.augmentInventory).toEqual([]);

    hydrate(snap);
    expect(getState().ship.slots[0]?.augments).toEqual(["damage-up"]);
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
    it("refuses when the position has no instance", () => {
      grantAugment("damage-up");
      expect(installAugment({ kind: "slot", index: 5 }, "damage-up")).toBe(false);
      expect(installAugment({ kind: "inventory", index: 0 }, "damage-up")).toBe(false);
      // Inventory copy is preserved on failure.
      expect(getState().ship.augmentInventory).toEqual(["damage-up"]);
    });

    it("refuses when the augment is not in inventory", () => {
      grantAugment("fire-rate-up");
      expect(installAugment({ kind: "slot", index: 0 }, "damage-up")).toBe(false);
      expect(getState().ship.slots[0]?.augments).toEqual([]);
    });

    it("refuses past MAX_AUGMENTS_PER_WEAPON", () => {
      grantAugment("damage-up");
      grantAugment("fire-rate-up");
      grantAugment("extra-projectile");
      expect(installAugment({ kind: "slot", index: 0 }, "damage-up")).toBe(true);
      expect(installAugment({ kind: "slot", index: 0 }, "fire-rate-up")).toBe(true);
      expect(installAugment({ kind: "slot", index: 0 }, "extra-projectile")).toBe(false);
      expect(getState().ship.slots[0]?.augments).toEqual(["damage-up", "fire-rate-up"]);
      // The extra-projectile copy is still sitting in inventory.
      expect(getState().ship.augmentInventory).toEqual(["extra-projectile"]);
    });

    it("refuses when the same augment is already installed on that instance", () => {
      grantAugment("damage-up");
      grantAugment("damage-up");
      expect(installAugment({ kind: "slot", index: 0 }, "damage-up")).toBe(true);
      expect(installAugment({ kind: "slot", index: 0 }, "damage-up")).toBe(false);
      expect(getState().ship.slots[0]?.augments).toEqual(["damage-up"]);
      // The second copy stayed in inventory.
      expect(getState().ship.augmentInventory).toEqual(["damage-up"]);
    });

    it("on success removes ONE copy from inventory and appends to instance.augments", () => {
      grantAugment("damage-up");
      grantAugment("damage-up");
      grantAugment("fire-rate-up");
      expect(installAugment({ kind: "slot", index: 0 }, "damage-up")).toBe(true);
      // Only one of the two damage-up copies should leave inventory.
      expect(getState().ship.augmentInventory).toEqual(["damage-up", "fire-rate-up"]);
      expect(getState().ship.slots[0]?.augments).toEqual(["damage-up"]);
    });

    it("targets an inventory instance independently of any same-id instance in slots", () => {
      // Slot 0 = rapid-fire (starter); inventory[0] = a second rapid-fire.
      grantWeapon("rapid-fire");
      grantAugment("damage-up");
      expect(installAugment({ kind: "inventory", index: 0 }, "damage-up")).toBe(true);
      const s = getState();
      // Only the inventory instance got the augment.
      expect(s.ship.slots[0]?.augments).toEqual([]);
      expect(s.ship.inventory[0]?.augments).toEqual(["damage-up"]);
    });
  });

  describe("sellWeapon drops augments", () => {
    it("destroys the inventory instance's augments and does NOT refund them", () => {
      // Place a non-starter instance into inventory and install two augments.
      addCredits(450);
      expect(buyWeapon("spread-shot")).toBe(true);
      expect(getState().ship.inventory).toHaveLength(1);
      expect(getState().ship.inventory[0]?.id).toBe("spread-shot");

      grantAugment("damage-up");
      grantAugment("fire-rate-up");
      expect(installAugment({ kind: "inventory", index: 0 }, "damage-up")).toBe(true);
      expect(installAugment({ kind: "inventory", index: 0 }, "fire-rate-up")).toBe(true);
      expect(getState().ship.inventory[0]?.augments).toEqual([
        "damage-up",
        "fire-rate-up"
      ]);
      expect(getState().ship.augmentInventory).toEqual([]);

      expect(sellWeapon(0)).toBe(true);

      const s = getState();
      // The instance is gone — no spread-shot anywhere.
      expect(s.ship.inventory).toEqual([]);
      // augmentInventory is unchanged: augments were destroyed, not refunded.
      expect(s.ship.augmentInventory).toEqual([]);
    });
  });
});

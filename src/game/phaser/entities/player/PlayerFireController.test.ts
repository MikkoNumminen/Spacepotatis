import { describe, expect, it, vi } from "vitest";

// PlayerFireController -> WeaponSystem -> getWeapon. The WeaponSystem path
// stays simple (no Phaser imports). We stub WeaponSystem entirely so the
// only thing under test is the energy gate + offset/mods plumbing.

import { PlayerFireController } from "./PlayerFireController";
import type { WeaponSystem } from "../../systems/WeaponSystem";
import type { SlotMods } from "./SlotModResolver";
import type { WeaponId } from "@/types/game";
import { newWeaponInstance, type WeaponInstance } from "@/game/state/ShipConfig";
import type { PlayerCombatant } from "./PlayerCombatant";

interface StubWeaponSystem {
  tryFire: ReturnType<typeof vi.fn>;
}

function makeStub(returns: boolean = true): StubWeaponSystem {
  return { tryFire: vi.fn(() => returns) };
}

function makeMods(over: Partial<SlotMods> = {}): SlotMods {
  return {
    damageMul: 1,
    fireRateMul: 1,
    projectileBonus: 0,
    energyCost: 5,
    turnRateMul: 1,
    ...over
  };
}

function makeCombatant(energy: number) {
  return { energy } as PlayerCombatant;
}

// Fixture: build a fire controller with N stub WeaponSystems indexed by
// slot position. Each slot starts pre-loaded with rapid-fire so the most
// common test path doesn't need to override the weapons array.
function makeRig(opts: {
  weapons?: (WeaponId | null)[];
  mods?: SlotMods[];
  fireResult?: boolean;
}) {
  const weapons = opts.weapons ?? ["rapid-fire"];
  const stubs: StubWeaponSystem[] = weapons.map(() => makeStub(opts.fireResult ?? true));
  const slotMods = opts.mods ?? weapons.map(() => makeMods());
  const slotInstances: (WeaponInstance | null)[] = weapons.map((w) =>
    w === null ? null : newWeaponInstance(w)
  );

  return {
    controller: new PlayerFireController(
      stubs as unknown as WeaponSystem[],
      slotInstances,
      slotMods
    ),
    stubs
  };
}

describe("PlayerFireController.tryFireSlot", () => {
  it("does nothing when the slot is empty (instance is null)", () => {
    const rig = makeRig({ weapons: [null] });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot(0, 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.stubs[0]?.tryFire).not.toHaveBeenCalled();
    expect(combatant.energy).toBe(100);
  });

  it("does NOT fire when energy is below the slot's energy cost", () => {
    const rig = makeRig({ mods: [makeMods({ energyCost: 5 })] });
    const combatant = makeCombatant(4);
    rig.controller.tryFireSlot(0, 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.stubs[0]?.tryFire).not.toHaveBeenCalled();
    expect(combatant.energy).toBe(4);
  });

  it("fires when energy equals the slot's energy cost (boundary case)", () => {
    const rig = makeRig({ mods: [makeMods({ energyCost: 5 })] });
    const combatant = makeCombatant(5);
    rig.controller.tryFireSlot(0, 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.stubs[0]?.tryFire).toHaveBeenCalled();
    expect(combatant.energy).toBe(0);
  });

  it("deducts energy ONLY when WeaponSystem.tryFire reports a fire (cooldown gate)", () => {
    const rig = makeRig({ fireResult: false });
    const combatant = makeCombatant(50);
    rig.controller.tryFireSlot(0, 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.stubs[0]?.tryFire).toHaveBeenCalled();
    expect(combatant.energy).toBe(50); // unchanged
  });

  it("never lets energy go below zero (defensive clamp)", () => {
    const rig = makeRig({ mods: [makeMods({ energyCost: 5 })] });
    const combatant = makeCombatant(5);
    rig.controller.tryFireSlot(0, 1000, 1, { x: 0, y: 0 }, combatant);
    expect(combatant.energy).toBe(0);
  });

  it("forwards the instance's weapon id and damage/fire-rate/projectile/turn mods to WeaponSystem", () => {
    const rig = makeRig({
      mods: [
        makeMods({
          damageMul: 2,
          fireRateMul: 0.5,
          projectileBonus: 1,
          turnRateMul: 1.5
        })
      ]
    });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot(0, 5000, 1, { x: 0, y: 0 }, combatant);

    expect(rig.stubs[0]?.tryFire).toHaveBeenCalledWith(
      "rapid-fire",
      0, // x + offset (slot 0 offset = 0)
      -18, // y + SPAWN_Y_OFFSET
      5000,
      true,
      {
        damageMul: 2,
        fireRateMul: 0.5, // overdrive multiplier is 1 here
        projectileBonus: 1,
        turnRateMul: 1.5
      }
    );
  });

  it("multiplies the fire-rate modifier by the overdrive multiplier (stacking cooldown bonuses)", () => {
    const rig = makeRig({ mods: [makeMods({ fireRateMul: 0.7 })] });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot(0, 1000, 0.66, { x: 0, y: 0 }, combatant);
    const call = rig.stubs[0]?.tryFire.mock.calls[0];
    expect(call?.[5]?.fireRateMul).toBeCloseTo(0.7 * 0.66, 6);
  });

  it("uses the per-slot x-offset (slot 1 at -36, slot 2 at +36 — wide enough for visible side pods)", () => {
    const rig = makeRig({
      weapons: ["rapid-fire", "tail-gunner", "side-spitter"]
    });

    rig.controller.tryFireSlot(1, 0, 1, { x: 100, y: 200 }, makeCombatant(100));
    expect(rig.stubs[1]?.tryFire).toHaveBeenCalledWith(
      "tail-gunner",
      64, // x - 36
      182, // y + SPAWN_Y_OFFSET (-18)
      0,
      true,
      expect.any(Object)
    );

    rig.controller.tryFireSlot(2, 0, 1, { x: 100, y: 200 }, makeCombatant(100));
    expect(rig.stubs[2]?.tryFire).toHaveBeenCalledWith(
      "side-spitter",
      136, // x + 36
      182,
      0,
      true,
      expect.any(Object)
    );
  });

  it("returns false (no fire) for an out-of-range slot index", () => {
    const rig = makeRig({});
    const combatant = makeCombatant(100);
    expect(rig.controller.tryFireSlot(5, 1000, 1, { x: 0, y: 0 }, combatant)).toBe(false);
  });
});

describe("PlayerFireController.fireAll", () => {
  it("attempts every slot in order and plays the laser sfx once when any slot fires", () => {
    const rig = makeRig({ weapons: ["rapid-fire", "spread-shot"] });
    const combatant = makeCombatant(100);
    rig.controller.fireAll(1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.stubs[0]?.tryFire).toHaveBeenCalledTimes(1);
    expect(rig.stubs[1]?.tryFire).toHaveBeenCalledTimes(1);
  });

  it("skips empty slots and still attempts the populated ones", () => {
    const rig = makeRig({ weapons: ["rapid-fire", null, "spread-shot"] });
    const combatant = makeCombatant(100);
    rig.controller.fireAll(1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.stubs[0]?.tryFire).toHaveBeenCalledTimes(1);
    expect(rig.stubs[1]?.tryFire).not.toHaveBeenCalled();
    expect(rig.stubs[2]?.tryFire).toHaveBeenCalledTimes(1);
  });
});

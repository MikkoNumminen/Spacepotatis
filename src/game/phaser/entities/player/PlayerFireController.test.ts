import { describe, expect, it, vi } from "vitest";

// PlayerFireController -> WeaponSystem -> getWeapon. The WeaponSystem path
// stays simple (no Phaser imports). We stub WeaponSystem entirely so the
// only thing under test is the energy gate + offset/mods plumbing.

import { PlayerFireController } from "./PlayerFireController";
import type { WeaponSystem } from "../../systems/WeaponSystem";
import type { SlotMods } from "./SlotModResolver";
import type { SlotName } from "@/game/state/ShipConfig";
import type { WeaponId } from "@/types/game";
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

function makeRig(opts: {
  weapons?: Partial<Record<SlotName, WeaponId | null>>;
  mods?: Partial<Record<SlotName, SlotMods>>;
  fireResult?: boolean;
}) {
  const front = makeStub(opts.fireResult ?? true);
  const rear = makeStub(opts.fireResult ?? true);
  const sLeft = makeStub(opts.fireResult ?? true);
  const sRight = makeStub(opts.fireResult ?? true);

  const weaponsBySlot = {
    front,
    rear,
    sidekickLeft: sLeft,
    sidekickRight: sRight
  } as unknown as Record<SlotName, WeaponSystem>;

  const slotWeapons: Record<SlotName, WeaponId | null> = {
    front: "rapid-fire",
    rear: null,
    sidekickLeft: null,
    sidekickRight: null,
    ...opts.weapons
  };

  const slotMods: Record<SlotName, SlotMods> = {
    front: makeMods(),
    rear: makeMods(),
    sidekickLeft: makeMods(),
    sidekickRight: makeMods(),
    ...opts.mods
  };

  return {
    controller: new PlayerFireController(weaponsBySlot, slotWeapons, slotMods),
    weaponsBySlot,
    front,
    rear,
    sLeft,
    sRight
  };
}

describe("PlayerFireController.tryFireSlot", () => {
  it("does nothing when the slot is empty (weapon id is null)", () => {
    const rig = makeRig({ weapons: { front: null } });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot("front", 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.front.tryFire).not.toHaveBeenCalled();
    expect(combatant.energy).toBe(100);
  });

  it("does NOT fire when energy is below the slot's energy cost", () => {
    const rig = makeRig({ mods: { front: makeMods({ energyCost: 5 }) } });
    const combatant = makeCombatant(4);
    rig.controller.tryFireSlot("front", 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.front.tryFire).not.toHaveBeenCalled();
    expect(combatant.energy).toBe(4);
  });

  it("fires when energy equals the slot's energy cost (boundary case)", () => {
    const rig = makeRig({ mods: { front: makeMods({ energyCost: 5 }) } });
    const combatant = makeCombatant(5);
    rig.controller.tryFireSlot("front", 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.front.tryFire).toHaveBeenCalled();
    expect(combatant.energy).toBe(0);
  });

  it("deducts energy ONLY when WeaponSystem.tryFire reports a fire (cooldown gate)", () => {
    const rig = makeRig({ fireResult: false });
    const combatant = makeCombatant(50);
    rig.controller.tryFireSlot("front", 1000, 1, { x: 0, y: 0 }, combatant);
    expect(rig.front.tryFire).toHaveBeenCalled();
    expect(combatant.energy).toBe(50); // unchanged
  });

  it("never lets energy go below zero (defensive clamp)", () => {
    const rig = makeRig({ mods: { front: makeMods({ energyCost: 5 }) } });
    const combatant = makeCombatant(5);
    rig.controller.tryFireSlot("front", 1000, 1, { x: 0, y: 0 }, combatant);
    expect(combatant.energy).toBe(0);
  });

  it("forwards the weapon id, slot, and damage/fire-rate/projectile/turn mods to WeaponSystem", () => {
    const rig = makeRig({
      mods: {
        front: makeMods({
          damageMul: 2,
          fireRateMul: 0.5,
          projectileBonus: 1,
          turnRateMul: 1.5
        })
      }
    });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot("front", 5000, 1, { x: 0, y: 0 }, combatant);

    expect(rig.front.tryFire).toHaveBeenCalledWith(
      "rapid-fire",
      "front",
      0, // x + offset.x (front offset.x = 0)
      -18, // y + offset.y (front offset.y = -18)
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
    const rig = makeRig({ mods: { front: makeMods({ fireRateMul: 0.7 }) } });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot("front", 1000, 0.66, { x: 0, y: 0 }, combatant);
    const call = rig.front.tryFire.mock.calls[0];
    expect(call?.[6]?.fireRateMul).toBeCloseTo(0.7 * 0.66, 6);
  });

  it("uses the per-slot offset (rear at +18, sidekickLeft at -16/0, sidekickRight at +16/0)", () => {
    const rig = makeRig({
      weapons: {
        rear: "tail-gunner",
        sidekickLeft: "side-spitter",
        sidekickRight: "side-spitter"
      }
    });
    const combatant = makeCombatant(100);
    rig.controller.tryFireSlot("rear", 0, 1, { x: 100, y: 200 }, combatant);
    expect(rig.rear.tryFire).toHaveBeenCalledWith(
      "tail-gunner",
      "rear",
      100,   // x + 0
      218,   // y + 18
      0,
      true,
      expect.any(Object)
    );

    rig.controller.tryFireSlot("sidekickLeft", 0, 1, { x: 100, y: 200 }, makeCombatant(100));
    expect(rig.sLeft.tryFire).toHaveBeenCalledWith(
      "side-spitter",
      "sidekickLeft",
      84,   // x - 16
      200,
      0,
      true,
      expect.any(Object)
    );

    rig.controller.tryFireSlot("sidekickRight", 0, 1, { x: 100, y: 200 }, makeCombatant(100));
    expect(rig.sRight.tryFire).toHaveBeenCalledWith(
      "side-spitter",
      "sidekickRight",
      116,  // x + 16
      200,
      0,
      true,
      expect.any(Object)
    );
  });
});

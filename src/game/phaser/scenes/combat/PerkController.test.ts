import { describe, expect, it, vi } from "vitest";

// PerkController only touches Phaser for the BlendModes.ADD constant in
// detonateEmp's flash visual. Stub it to keep the test node-clean.
vi.mock("phaser", () => ({
  BlendModes: { ADD: 1 }
}));

import { PerkController } from "./PerkController";
import { createFakeScene } from "../../__tests__/fakeScene";
import type { Player } from "../../entities/Player";
import type { BulletPool } from "../../entities/Bullet";

interface FakePlayer {
  x: number;
  y: number;
  hasOverdrive: boolean;
  hasHardened: boolean;
}

function makePlayer(): FakePlayer {
  return { x: 100, y: 200, hasOverdrive: false, hasHardened: false };
}

interface BulletChild {
  active: boolean;
  disableBody: ReturnType<typeof vi.fn>;
}

function makeBulletPool(children: BulletChild[]): {
  pool: BulletPool;
  iterate: ReturnType<typeof vi.fn>;
} {
  const iterate = vi.fn((cb: (child: BulletChild) => boolean) => {
    for (const c of children) cb(c);
  });
  const pool = { children: { iterate } } as unknown as BulletPool;
  return { pool, iterate };
}

function setup(opts: { bullets?: BulletChild[] } = {}) {
  const scene = createFakeScene();
  const player = makePlayer();
  const { pool, iterate } = makeBulletPool(opts.bullets ?? []);
  const onPickup = vi.fn();
  const onChange = vi.fn();
  const controller = new PerkController(
    scene as never,
    () => player as unknown as Player,
    () => pool,
    onPickup,
    onChange
  );
  return { scene, player, pool, iterate, onPickup, onChange, controller };
}

describe("PerkController.apply", () => {
  it("overdrive flips the player's hasOverdrive flag", () => {
    const { controller, player, onPickup, onChange } = setup();
    controller.apply("overdrive", 50, 60);
    expect(player.hasOverdrive).toBe(true);
    expect(onPickup).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it("hardened flips the player's hasHardened flag", () => {
    const { controller, player } = setup();
    controller.apply("hardened", 0, 0);
    expect(player.hasHardened).toBe(true);
  });

  it("emp grants a charge but does NOT touch passive flags", () => {
    const { controller, player } = setup();
    controller.apply("emp", 0, 0);
    expect(controller.getState().empCharges).toBe(1);
    expect(player.hasOverdrive).toBe(false);
    expect(player.hasHardened).toBe(false);
  });

  it("repeated emp pickups stack charges", () => {
    const { controller } = setup();
    controller.apply("emp", 0, 0);
    controller.apply("emp", 0, 0);
    controller.apply("emp", 0, 0);
    expect(controller.getState().empCharges).toBe(3);
  });

  it("forwards the perk's display name and tint to the onPickup callback", () => {
    const { controller, onPickup } = setup();
    controller.apply("overdrive", 50, 60);
    // PERKS.overdrive.name = "Overdrive", tint = 0xffaa33.
    expect(onPickup).toHaveBeenCalledWith("+ OVERDRIVE", 0xffaa33, 50, 60);
  });

  it("activePerks set tracks every distinct perk id picked up", () => {
    const { controller } = setup();
    controller.apply("overdrive", 0, 0);
    controller.apply("hardened", 0, 0);
    controller.apply("emp", 0, 0);
    const ids = Array.from(controller.getState().activePerks);
    expect(ids.sort()).toEqual(["emp", "hardened", "overdrive"]);
  });
});

describe("PerkController.triggerActive", () => {
  it("does nothing when there are no EMP charges", () => {
    const { controller, iterate, onChange } = setup();
    controller.triggerActive();
    expect(iterate).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("consumes one EMP charge per call", () => {
    const { controller } = setup();
    controller.apply("emp", 0, 0);
    controller.apply("emp", 0, 0);
    controller.triggerActive();
    expect(controller.getState().empCharges).toBe(1);
    controller.triggerActive();
    expect(controller.getState().empCharges).toBe(0);
  });

  it("removes 'emp' from activePerks once charges hit zero", () => {
    const { controller } = setup();
    controller.apply("emp", 0, 0);
    controller.triggerActive();
    expect(controller.getState().activePerks.has("emp")).toBe(false);
  });

  it("disables every active enemy bullet when EMP detonates", () => {
    const bullets: BulletChild[] = [
      { active: true, disableBody: vi.fn() },
      { active: true, disableBody: vi.fn() },
      { active: false, disableBody: vi.fn() }
    ];
    const { controller, iterate } = setup({ bullets });
    controller.apply("emp", 0, 0);
    controller.triggerActive();
    expect(iterate).toHaveBeenCalled();
    expect(bullets[0]?.disableBody).toHaveBeenCalledWith(true, true);
    expect(bullets[1]?.disableBody).toHaveBeenCalledWith(true, true);
    // Inactive bullet is left alone.
    expect(bullets[2]?.disableBody).not.toHaveBeenCalled();
  });

  it("flashes the camera and creates a flash graphic on EMP detonation", () => {
    const { controller, scene } = setup();
    controller.apply("emp", 0, 0);
    controller.triggerActive();
    expect(scene.cameras.main.flash).toHaveBeenCalled();
    expect(scene.add.graphics).toHaveBeenCalled();
    expect(scene.tweens.add).toHaveBeenCalled();
  });
});

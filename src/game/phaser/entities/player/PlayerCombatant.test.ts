import { describe, expect, it } from "vitest";
import {
  PlayerCombatant,
  SHIELD_REGEN_DELAY_MS,
  SHIELD_REGEN_PER_SEC
} from "./PlayerCombatant";
import { DEFAULT_SHIP, type ShipConfig } from "@/game/state/ShipConfig";
import { createFakeScene, createFakeSprite } from "../../__tests__/fakeScene";

// Combatant doesn't import Phaser types at runtime — it only uses the scene
// and sprite for tint/shake/event-emit side effects. We pass the FakeScene
// and a minimal sprite stub.

function freshCombatant(overrides: Partial<ShipConfig> = {}): PlayerCombatant {
  const ship = { ...DEFAULT_SHIP, ...overrides };
  return new PlayerCombatant(ship);
}

describe("PlayerCombatant constructor", () => {
  it("initialises shield/armor/energy to their max from ShipConfig", () => {
    const c = freshCombatant();
    expect(c.shield).toBe(c.maxShield);
    expect(c.armor).toBe(c.maxArmor);
    expect(c.energy).toBe(c.maxEnergy);
  });

  it("respects shieldLevel and armorLevel from the ship config", () => {
    const c = freshCombatant({ shieldLevel: 5, armorLevel: 5 });
    // BASE_SHIELD 40 * (1 + 5*0.2) = 40 * 2 = 80
    expect(c.maxShield).toBe(80);
    // BASE_ARMOR 60 + 5*15 = 135
    expect(c.maxArmor).toBe(135);
  });
});

describe("PlayerCombatant.takeDamage", () => {
  it("absorbs damage with shield first, leaves armor untouched while shield > 0", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();

    const startShield = c.shield;
    const startArmor = c.armor;
    c.takeDamage(10, false, sprite as never, scene as never);

    expect(c.shield).toBe(startShield - 10);
    expect(c.armor).toBe(startArmor);
  });

  it("cascades overflow damage from shield into armor when shield is depleted", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    const startArmor = c.armor;
    const totalDamage = c.shield + 5;
    c.takeDamage(totalDamage, false, sprite as never, scene as never);
    expect(c.shield).toBe(0);
    expect(c.armor).toBe(startArmor - 5);
  });

  it("hasHardened applies a 0.7× damage multiplier before the shield/armor cascade", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    const startShield = c.shield;
    c.takeDamage(10, true, sprite as never, scene as never);
    expect(c.shield).toBeCloseTo(startShield - 7, 6);
  });

  it("clamps armor at zero when overshoot exceeds remaining armor", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    c.takeDamage(c.shield + c.armor + 999, false, sprite as never, scene as never);
    expect(c.armor).toBe(0);
  });

  it("emits playerDied when armor hits zero", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    c.takeDamage(c.shield + c.armor, false, sprite as never, scene as never);
    expect(scene.events.emit).toHaveBeenCalledWith("playerDied", { type: "playerDied" });
  });

  it("does NOT emit playerDied while armor remains above zero", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    c.takeDamage(5, false, sprite as never, scene as never);
    expect(scene.events.emit).not.toHaveBeenCalledWith("playerDied", expect.anything());
  });

  it("triggers a camera shake and tint flash on hit", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    c.takeDamage(1, false, sprite as never, scene as never);
    expect(scene.cameras.main.shake).toHaveBeenCalled();
    expect(sprite.setTint).toHaveBeenCalledWith(0xff4d6d);
    // delayedCall(80, () => clearTint) is registered.
    expect(scene.time.delayedCall).toHaveBeenCalledWith(80, expect.any(Function));
  });
});

describe("PlayerCombatant.isDead", () => {
  it("is false at full HP", () => {
    expect(freshCombatant().isDead()).toBe(false);
  });

  it("is true when armor is exactly zero", () => {
    const c = freshCombatant();
    c.armor = 0;
    expect(c.isDead()).toBe(true);
  });
});

describe("PlayerCombatant.tickRegen — energy", () => {
  it("recharges energy proportional to delta", () => {
    const c = freshCombatant();
    c.energy = 0;
    // energyRechargePerSec at base = 25, delta = 1000ms → +25 energy
    c.tickRegen(0, 1000);
    expect(c.energy).toBeCloseTo(25, 6);
  });

  it("clamps energy at maxEnergy", () => {
    const c = freshCombatant();
    c.energy = c.maxEnergy - 1;
    c.tickRegen(0, 100000);
    expect(c.energy).toBe(c.maxEnergy);
  });

  it("does not decrease energy when already full", () => {
    const c = freshCombatant();
    const start = c.energy;
    c.tickRegen(0, 1000);
    expect(c.energy).toBe(start);
  });
});

describe("PlayerCombatant.tickRegen — shield", () => {
  it("does NOT regen the shield while inside the post-damage delay window", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    // Damage at t=1000, then attempt regen at t=2000 → only 1000ms since hit,
    // less than SHIELD_REGEN_DELAY_MS (2000) so no shield regen.
    scene.time.now = 1000;
    c.takeDamage(10, false, sprite as never, scene as never);
    const shieldAfterHit = c.shield;
    c.tickRegen(2000, 1000);
    expect(c.shield).toBe(shieldAfterHit);
  });

  it("regens the shield once the regen-delay has elapsed", () => {
    const c = freshCombatant();
    const scene = createFakeScene();
    const sprite = createFakeSprite();
    scene.time.now = 1000;
    c.takeDamage(10, false, sprite as never, scene as never);
    const shieldAfterHit = c.shield;
    // SHIELD_REGEN_DELAY_MS = 2000. tick at t=4000 → 3000ms gap, plenty.
    // delta = 1000ms → +SHIELD_REGEN_PER_SEC = +6 shield.
    c.tickRegen(4000, 1000);
    expect(c.shield).toBeCloseTo(shieldAfterHit + SHIELD_REGEN_PER_SEC, 6);
  });

  it("clamps shield regen at maxShield", () => {
    const c = freshCombatant();
    c.shield = c.maxShield - 1;
    // No prior damage, so lastDamageAt is 0 — ticking at any time satisfies the delay.
    c.tickRegen(SHIELD_REGEN_DELAY_MS + 1000, 100000);
    expect(c.shield).toBe(c.maxShield);
  });
});

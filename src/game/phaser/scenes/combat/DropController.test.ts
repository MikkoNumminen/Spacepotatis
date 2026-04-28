import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DropController transitively imports PowerUp / Player (both extend
// Phaser.Physics.Arcade.Sprite at evaluation time). Stub the few constructors
// they touch with no-op classes so module evaluation succeeds without booting
// real Phaser.
vi.mock("phaser", () => {
  class StubSprite {}
  class StubGroup {}
  return {
    Physics: { Arcade: { Sprite: StubSprite, Group: StubGroup } },
    GameObjects: { Sprite: StubSprite },
    Input: { Keyboard: { KeyCodes: { SPACE: 32, ALT: 18, CTRL: 17 } } },
    BlendModes: { ADD: 1 },
    Math: { Clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)) }
  };
});

import { DropController, DROP_CHANCE, PERK_DROP_SHARE } from "./DropController";
import { createFakeScene } from "../../__tests__/fakeScene";
import * as GameState from "@/game/state/GameState";
import { ownsAnyOfType } from "@/game/state/ShipConfig";
import { isPerkKind, type PowerUp, type PowerUpPool } from "../../entities/PowerUp";
import type { Player } from "../../entities/Player";
import type { ScoreSystem } from "../../systems/ScoreSystem";
import type { Enemy } from "../../entities/Enemy";

interface FakePlayer {
  shield: number;
  maxShield: number;
  setSlotWeapon: ReturnType<typeof vi.fn>;
}

function makePlayer(overrides: Partial<FakePlayer> = {}): FakePlayer {
  return {
    shield: 10,
    maxShield: 100,
    setSlotWeapon: vi.fn(),
    ...overrides
  };
}

function makeScore(): { score: ScoreSystem; addCredits: ReturnType<typeof vi.fn> } {
  const addCredits = vi.fn();
  const score = { addCredits } as unknown as ScoreSystem;
  return { score, addCredits };
}

function makePool(): { pool: PowerUpPool; spawn: ReturnType<typeof vi.fn> } {
  const spawn = vi.fn(() => ({}));
  const pool = { spawn } as unknown as PowerUpPool;
  return { pool, spawn };
}

function setup(missionId: "tutorial" | "combat-1" = "tutorial") {
  const scene = createFakeScene();
  const { pool, spawn } = makePool();
  const player = makePlayer();
  const { score, addCredits } = makeScore();
  const onPerk = vi.fn();
  const controller = new DropController(
    scene as never,
    missionId,
    pool,
    () => player as unknown as Player,
    () => score,
    onPerk
  );
  return { scene, controller, pool, spawn, player, score, addCredits, onPerk };
}

beforeEach(() => {
  GameState.resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  GameState.resetForTests();
});

describe("DropController.maybeDrop", () => {
  it("skips dropping when Math.random returns above DROP_CHANCE threshold", () => {
    const { controller, spawn } = setup();
    vi.spyOn(Math, "random").mockReturnValue(DROP_CHANCE + 0.01);
    const enemy = { x: 100, y: 50 } as unknown as Enemy;
    controller.maybeDrop(enemy);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("drops a powerup at the enemy's position when the roll is under DROP_CHANCE", () => {
    const { controller, spawn } = setup();
    // First Math.random gates the drop (must be < DROP_CHANCE), subsequent
    // calls feed rollDrop's permanent-kind selector.
    const roll = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)        // gate: 0 < 0.18 → drop
      .mockReturnValueOnce(0.1);     // permanent kind selector
    const enemy = { x: 50, y: 75 } as unknown as Enemy;
    controller.maybeDrop(enemy);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("credit", 50, 75);
    expect(roll).toHaveBeenCalled();
  });
});

describe("DropController.rollDrop", () => {
  it("returns 'credit' when the random roll is < 0.5 (50% share)", () => {
    const { controller } = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(controller.rollDrop()).toBe("credit");
  });

  it("returns 'shield' when the roll is in [0.5, 0.8)", () => {
    const { controller } = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    expect(controller.rollDrop()).toBe("shield");
  });

  it("returns 'weapon' when the roll is >= 0.8", () => {
    const { controller } = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(controller.rollDrop()).toBe("weapon");
  });

  it("never returns a perk drop on missions where perksAllowed is unset (the current default)", () => {
    const { controller } = setup("tutorial");
    // First call decides perk vs permanent share — even at 0 (would-be perk),
    // tutorial mission has perksAllowed undefined so perks are skipped.
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0);
    const result = controller.rollDrop();
    expect(typeof result).toBe("string");
  });
});

describe("DropController.applyPowerUp — credit", () => {
  it("adds 25 credits and never mutates the player", () => {
    const { controller, addCredits, player } = setup();
    const startShield = player.shield;
    const power = { kind: "credit" as const, x: 0, y: 0 } as unknown as PowerUp;
    controller.applyPowerUp(power);
    expect(addCredits).toHaveBeenCalledWith(25);
    expect(player.shield).toBe(startShield);
  });
});

describe("DropController.applyPowerUp — shield", () => {
  it("restores 50% of maxShield", () => {
    const { controller, player } = setup();
    player.shield = 10;
    player.maxShield = 100;
    const power = { kind: "shield" as const, x: 0, y: 0 } as unknown as PowerUp;
    controller.applyPowerUp(power);
    expect(player.shield).toBe(60); // 10 + 100 * 0.5
  });

  it("clamps at maxShield instead of overflowing", () => {
    const { controller, player } = setup();
    player.shield = 90;
    player.maxShield = 100;
    const power = { kind: "shield" as const, x: 0, y: 0 } as unknown as PowerUp;
    controller.applyPowerUp(power);
    expect(player.shield).toBe(100);
  });
});

describe("DropController.applyPowerUp — weapon", () => {
  it("on first weapon pickup, grants the next missing weapon", () => {
    const { controller, player } = setup();
    const power = { kind: "weapon" as const, x: 0, y: 0 } as unknown as PowerUp;
    controller.applyPowerUp(power);
    // Default ship only owns rapid-fire; the next in the upgrade ladder is rapid-fire→spread-shot→heavy-cannon.
    // rapid-fire is owned, so the next pickup grants spread-shot.
    expect(ownsAnyOfType(GameState.getState().ship, "spread-shot")).toBe(true);
    // The default ship has only one slot (occupied by rapid-fire), so the
    // new weapon lands in inventory and the live Player has nothing to
    // mirror — setSlotWeapon stays uncalled.
    expect(player.setSlotWeapon).not.toHaveBeenCalled();
  });

  it("when a slot is open, mirrors grantWeapon onto the player at the right slot index", () => {
    const { controller, player } = setup();
    // Buy an expansion slot so the new weapon has somewhere to land.
    GameState.addCredits(500);
    GameState.buyWeaponSlot();
    const power = { kind: "weapon" as const, x: 0, y: 0 } as unknown as PowerUp;
    controller.applyPowerUp(power);
    // spread-shot got auto-equipped into slot 1 (the first empty one).
    const slots = GameState.getState().ship.slots;
    expect(slots[0]?.id).toBe("rapid-fire");
    expect(slots[1]?.id).toBe("spread-shot");
    // The mirror call passes the freshly-minted instance, not the raw id.
    expect(player.setSlotWeapon).toHaveBeenCalledWith(1, slots[1]);
  });

  it("converts to credits (50) once the weapon ladder is exhausted", () => {
    const { controller, addCredits } = setup();
    // Pre-grant the full ladder so the next pickup has nothing left to give.
    GameState.grantWeapon("rapid-fire");
    GameState.grantWeapon("spread-shot");
    GameState.grantWeapon("heavy-cannon");
    const power = { kind: "weapon" as const, x: 0, y: 0 } as unknown as PowerUp;
    controller.applyPowerUp(power);
    expect(addCredits).toHaveBeenCalledWith(50);
  });
});

describe("DropController.applyPowerUp — perk", () => {
  it("forwards perk pickups to the onPerk callback with the power's coordinates", () => {
    const { controller, onPerk, addCredits } = setup();
    const power = {
      kind: { perk: "overdrive" as const },
      x: 80,
      y: 90
    } as unknown as PowerUp;
    controller.applyPowerUp(power);
    expect(onPerk).toHaveBeenCalledWith("overdrive", 80, 90);
    // Non-permanent path: must not also award credits.
    expect(addCredits).not.toHaveBeenCalled();
  });

  it("isPerkKind correctly tags the perk variant of PowerUpKind", () => {
    expect(isPerkKind({ perk: "emp" })).toBe(true);
    expect(isPerkKind("credit")).toBe(false);
    expect(isPerkKind("shield")).toBe(false);
    expect(isPerkKind("weapon")).toBe(false);
  });
});

describe("DropController constants", () => {
  it("DROP_CHANCE is between 0 and 1 (sanity)", () => {
    expect(DROP_CHANCE).toBeGreaterThan(0);
    expect(DROP_CHANCE).toBeLessThan(1);
  });

  it("PERK_DROP_SHARE is between 0 and 1 (sanity)", () => {
    expect(PERK_DROP_SHARE).toBeGreaterThan(0);
    expect(PERK_DROP_SHARE).toBeLessThan(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { wireCollisions, type CollisionHandlers } from "./CollisionSystem";
import { createFakeScene } from "../__tests__/fakeScene";
import type { Player } from "../entities/Player";
import type { BulletPool, Bullet } from "../entities/Bullet";
import type { EnemyPool, Enemy } from "../entities/Enemy";
import type { Obstacle, ObstaclePool } from "../entities/Obstacle";
import type { PowerUpPool, PowerUp } from "../entities/PowerUp";

// CollisionSystem is mostly registration glue. The valuable tests are:
//   1. that it registers exactly four overlap pairs in the right order
//      (seven when an obstacle pool is passed), and
//   2. that the callbacks it wires up correctly delegate to the handlers and
//      mutate the colliding entities (deactivate bullet, damage enemy, etc).

interface OverlapCall {
  readonly groupA: object;
  readonly groupB: object;
  readonly cb: (a: object, b: object) => void;
}

function captureOverlaps(): OverlapCall[] {
  return [];
}

describe("wireCollisions", () => {
  function setup(opts: { withObstacles?: boolean } = {}) {
    const scene = createFakeScene();
    const captured: OverlapCall[] = captureOverlaps();
    scene.physics.add.overlap.mockImplementation(
      (groupA: object, groupB: object, cb: (a: object, b: object) => void) => {
        captured.push({ groupA, groupB, cb });
      }
    );

    const player = { kind: "player" } as unknown as Player;
    const playerBullets = { kind: "playerBullets" } as unknown as BulletPool;
    const enemyBullets = { kind: "enemyBullets" } as unknown as BulletPool;
    const enemies = { kind: "enemies" } as unknown as EnemyPool;
    const powerUps = { kind: "powerUps" } as unknown as PowerUpPool;
    const obstacles = opts.withObstacles
      ? ({ kind: "obstacles" } as unknown as ObstaclePool)
      : null;

    const handlers: CollisionHandlers = {
      onEnemyHit: vi.fn(),
      onPlayerHitByBullet: vi.fn(),
      onPlayerTouchEnemy: vi.fn(),
      onPlayerGetPowerUp: vi.fn(),
      onPlayerHitByObstacle: vi.fn()
    };

    wireCollisions(
      scene as never,
      player,
      playerBullets,
      enemyBullets,
      enemies,
      powerUps,
      handlers,
      obstacles
    );

    return {
      scene,
      captured,
      player,
      playerBullets,
      enemyBullets,
      enemies,
      powerUps,
      obstacles,
      handlers
    };
  }

  it("registers four overlap pairs when no obstacle pool is provided", () => {
    const { captured } = setup();
    expect(captured).toHaveLength(4);
  });

  it("wires the bullet→enemy overlap as the first registration", () => {
    const { captured, playerBullets, enemies } = setup();
    expect(captured[0]?.groupA).toBe(playerBullets);
    expect(captured[0]?.groupB).toBe(enemies);
  });

  it("wires the player↔enemyBullets overlap second", () => {
    const { captured, player, enemyBullets } = setup();
    expect(captured[1]?.groupA).toBe(player);
    expect(captured[1]?.groupB).toBe(enemyBullets);
  });

  it("wires the player↔enemy and player↔powerups overlaps third and fourth", () => {
    const { captured, player, enemies, powerUps } = setup();
    expect(captured[2]?.groupA).toBe(player);
    expect(captured[2]?.groupB).toBe(enemies);
    expect(captured[3]?.groupA).toBe(player);
    expect(captured[3]?.groupB).toBe(powerUps);
  });

  it("player-bullet→enemy callback damages enemy, deactivates bullet, and reports kill flag", () => {
    const { captured, handlers } = setup();
    const bullet = {
      active: true,
      damage: 14,
      deactivate: vi.fn()
    } as unknown as Bullet;
    const enemy = {
      active: true,
      takeDamage: vi.fn(() => true)
    } as unknown as Enemy;

    captured[0]?.cb(bullet, enemy);

    expect(enemy.takeDamage).toHaveBeenCalledWith(14);
    expect(bullet.deactivate).toHaveBeenCalled();
    expect(handlers.onEnemyHit).toHaveBeenCalledWith(enemy, bullet, true);
  });

  it("player-bullet→enemy callback skips inactive bullets/enemies and never invokes the handler", () => {
    const { captured, handlers } = setup();
    const inactiveBullet = { active: false, deactivate: vi.fn(), damage: 1 } as unknown as Bullet;
    const enemy = { active: true, takeDamage: vi.fn() } as unknown as Enemy;
    captured[0]?.cb(inactiveBullet, enemy);
    expect(enemy.takeDamage).not.toHaveBeenCalled();
    expect(handlers.onEnemyHit).not.toHaveBeenCalled();

    const bullet = { active: true, deactivate: vi.fn(), damage: 1 } as unknown as Bullet;
    const inactiveEnemy = { active: false, takeDamage: vi.fn() } as unknown as Enemy;
    captured[0]?.cb(bullet, inactiveEnemy);
    expect(inactiveEnemy.takeDamage).not.toHaveBeenCalled();
    expect(handlers.onEnemyHit).not.toHaveBeenCalled();
  });

  it("propagates the survived flag (false) from enemy.takeDamage", () => {
    const { captured, handlers } = setup();
    const bullet = { active: true, damage: 1, deactivate: vi.fn() } as unknown as Bullet;
    const enemy = { active: true, takeDamage: vi.fn(() => false) } as unknown as Enemy;
    captured[0]?.cb(bullet, enemy);
    expect(handlers.onEnemyHit).toHaveBeenCalledWith(enemy, bullet, false);
  });

  it("player↔enemy-bullet callback deactivates the bullet and notifies the handler", () => {
    const { captured, handlers, player } = setup();
    const bullet = { active: true, deactivate: vi.fn() } as unknown as Bullet;
    captured[1]?.cb(player, bullet);
    expect(bullet.deactivate).toHaveBeenCalled();
    expect(handlers.onPlayerHitByBullet).toHaveBeenCalledWith(bullet);
  });

  it("player↔enemy-bullet callback does nothing when bullet is inactive", () => {
    const { captured, handlers, player } = setup();
    const bullet = { active: false, deactivate: vi.fn() } as unknown as Bullet;
    captured[1]?.cb(player, bullet);
    expect(bullet.deactivate).not.toHaveBeenCalled();
    expect(handlers.onPlayerHitByBullet).not.toHaveBeenCalled();
  });

  it("player↔enemy callback notifies handler then nukes the enemy via 9999 damage", () => {
    const { captured, handlers, player } = setup();
    const enemy = { active: true, takeDamage: vi.fn() } as unknown as Enemy;
    captured[2]?.cb(player, enemy);
    expect(handlers.onPlayerTouchEnemy).toHaveBeenCalledWith(enemy);
    expect(enemy.takeDamage).toHaveBeenCalledWith(9999);
  });

  it("player↔enemy callback skips inactive enemies", () => {
    const { captured, handlers, player } = setup();
    const enemy = { active: false, takeDamage: vi.fn() } as unknown as Enemy;
    captured[2]?.cb(player, enemy);
    expect(handlers.onPlayerTouchEnemy).not.toHaveBeenCalled();
    expect(enemy.takeDamage).not.toHaveBeenCalled();
  });

  it("player↔powerup callback notifies handler and disables the powerup body", () => {
    const { captured, handlers, player } = setup();
    const power = { active: true, disableBody: vi.fn() } as unknown as PowerUp;
    captured[3]?.cb(player, power);
    expect(handlers.onPlayerGetPowerUp).toHaveBeenCalledWith(power);
    expect(power.disableBody).toHaveBeenCalledWith(true, true);
  });

  it("player↔powerup callback skips inactive powerups", () => {
    const { captured, handlers, player } = setup();
    const power = { active: false, disableBody: vi.fn() } as unknown as PowerUp;
    captured[3]?.cb(player, power);
    expect(handlers.onPlayerGetPowerUp).not.toHaveBeenCalled();
    expect(power.disableBody).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Obstacle pairs (registered only when an ObstaclePool is passed). They
  // come AFTER the four base pairs so the indices 0..3 above stay stable.
  // -------------------------------------------------------------------------

  it("registers seven overlap pairs when an obstacle pool is provided", () => {
    const { captured } = setup({ withObstacles: true });
    expect(captured).toHaveLength(7);
  });

  it("wires playerBullets↔obstacles fifth, enemyBullets↔obstacles sixth, player↔obstacles seventh", () => {
    const { captured, playerBullets, enemyBullets, player, obstacles } = setup({
      withObstacles: true
    });
    expect(captured[4]?.groupA).toBe(playerBullets);
    expect(captured[4]?.groupB).toBe(obstacles);
    expect(captured[5]?.groupA).toBe(enemyBullets);
    expect(captured[5]?.groupB).toBe(obstacles);
    expect(captured[6]?.groupA).toBe(player);
    expect(captured[6]?.groupB).toBe(obstacles);
  });

  it("playerBullet↔obstacle absorbs the bullet without damaging the obstacle", () => {
    const { captured } = setup({ withObstacles: true });
    const bullet = { active: true, deactivate: vi.fn() } as unknown as Bullet;
    // Obstacles are indestructible by type — Obstacle.ts has no takeDamage
    // method. We attach a never-called spy here so the indestructibility
    // contract is asserted explicitly rather than implied by absence.
    const takeDamage = vi.fn();
    const obstacle = {
      active: true,
      lastHitPlayerAt: 0,
      takeDamage
    } as unknown as Obstacle;
    captured[4]?.cb(bullet, obstacle);
    expect(bullet.deactivate).toHaveBeenCalled();
    expect(takeDamage).not.toHaveBeenCalled();
  });

  it("playerBullet↔obstacle skips inactive bullets/obstacles", () => {
    const { captured } = setup({ withObstacles: true });
    const inactive = { active: false, deactivate: vi.fn() } as unknown as Bullet;
    const obstacle = { active: true, lastHitPlayerAt: 0 } as unknown as Obstacle;
    captured[4]?.cb(inactive, obstacle);
    expect(inactive.deactivate).not.toHaveBeenCalled();
  });

  it("enemyBullet↔obstacle absorbs the bullet (cover blocks both directions)", () => {
    const { captured } = setup({ withObstacles: true });
    const bullet = { active: true, deactivate: vi.fn() } as unknown as Bullet;
    const obstacle = { active: true, lastHitPlayerAt: 0 } as unknown as Obstacle;
    captured[5]?.cb(bullet, obstacle);
    expect(bullet.deactivate).toHaveBeenCalled();
  });

  it("player↔obstacle calls onPlayerHitByObstacle and stamps lastHitPlayerAt", () => {
    const { scene, captured, handlers, player } = setup({ withObstacles: true });
    scene.time.now = 1000;
    const obstacle = {
      active: true,
      lastHitPlayerAt: Number.NEGATIVE_INFINITY
    } as unknown as Obstacle;
    captured[6]?.cb(player, obstacle);
    expect(handlers.onPlayerHitByObstacle).toHaveBeenCalledWith(obstacle);
    expect(obstacle.lastHitPlayerAt).toBe(1000);
  });

  it("player↔obstacle: first hit lands at scene.time.now=0 (cooldown init must be -Infinity)", () => {
    const { scene, captured, handlers, player } = setup({ withObstacles: true });
    scene.time.now = 0;
    // Real Obstacle.ts initializes lastHitPlayerAt to NEGATIVE_INFINITY for
    // exactly this reason — at scene start, the first collision must fire
    // even though `now - 0 = 0 < 400` would gate it.
    const obstacle = {
      active: true,
      lastHitPlayerAt: Number.NEGATIVE_INFINITY
    } as unknown as Obstacle;
    captured[6]?.cb(player, obstacle);
    expect(handlers.onPlayerHitByObstacle).toHaveBeenCalledWith(obstacle);
  });

  it("player↔obstacle gates re-fires within the cooldown window", () => {
    const { scene, captured, handlers, player } = setup({ withObstacles: true });
    scene.time.now = 1000;
    const obstacle = {
      active: true,
      lastHitPlayerAt: Number.NEGATIVE_INFINITY
    } as unknown as Obstacle;
    captured[6]?.cb(player, obstacle);
    expect(handlers.onPlayerHitByObstacle).toHaveBeenCalledTimes(1);

    // Within cooldown — no re-fire.
    scene.time.now = 1300;
    captured[6]?.cb(player, obstacle);
    expect(handlers.onPlayerHitByObstacle).toHaveBeenCalledTimes(1);

    // Past 400ms cooldown — fires again.
    scene.time.now = 1500;
    captured[6]?.cb(player, obstacle);
    expect(handlers.onPlayerHitByObstacle).toHaveBeenCalledTimes(2);
  });

  it("player↔obstacle skips inactive obstacles without bumping the cooldown", () => {
    const { scene, captured, handlers, player } = setup({ withObstacles: true });
    scene.time.now = 1000;
    const initial = Number.NEGATIVE_INFINITY;
    const obstacle = { active: false, lastHitPlayerAt: initial } as unknown as Obstacle;
    captured[6]?.cb(player, obstacle);
    expect(handlers.onPlayerHitByObstacle).not.toHaveBeenCalled();
    expect(obstacle.lastHitPlayerAt).toBe(initial);
  });
});

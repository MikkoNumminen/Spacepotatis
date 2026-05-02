import * as Phaser from "phaser";
import type { Bullet, BulletPool } from "../entities/Bullet";
import type { Enemy, EnemyPool } from "../entities/Enemy";
import type { Obstacle, ObstaclePool } from "../entities/Obstacle";
import type { Player } from "../entities/Player";
import type { PowerUp, PowerUpPool } from "../entities/PowerUp";

// Per-obstacle damage cooldown. A stationary rock resting against the player
// would otherwise deal collisionDamage every physics tick (~60Hz), draining
// shield in a frame. 400ms gates a single hit per "brush" without making
// glancing contact feel forgiving.
const OBSTACLE_HIT_COOLDOWN_MS = 400;

export interface CollisionHandlers {
  onEnemyHit: (enemy: Enemy, bullet: Bullet, killed: boolean) => void;
  onPlayerHitByBullet: (bullet: Bullet) => void;
  onPlayerTouchEnemy: (enemy: Enemy) => void;
  onPlayerGetPowerUp: (power: PowerUp) => void;
  onPlayerHitByObstacle: (obstacle: Obstacle) => void;
}

export function wireCollisions(
  scene: Phaser.Scene,
  player: Player,
  playerBullets: BulletPool,
  enemyBullets: BulletPool,
  enemies: EnemyPool,
  powerUps: PowerUpPool,
  handlers: CollisionHandlers,
  obstacles: ObstaclePool | null = null
): void {
  scene.physics.add.overlap(playerBullets, enemies, (bulletObj, enemyObj) => {
    const bullet = bulletObj as Bullet;
    const enemy = enemyObj as Enemy;
    if (!bullet.active || !enemy.active) return;
    const killed = enemy.takeDamage(bullet.damage);
    bullet.deactivate();
    handlers.onEnemyHit(enemy, bullet, killed);
  });

  scene.physics.add.overlap(player, enemyBullets, (_playerObj, bulletObj) => {
    const bullet = bulletObj as Bullet;
    if (!bullet.active) return;
    bullet.deactivate();
    handlers.onPlayerHitByBullet(bullet);
  });

  scene.physics.add.overlap(player, enemies, (_playerObj, enemyObj) => {
    const enemy = enemyObj as Enemy;
    if (!enemy.active) return;
    handlers.onPlayerTouchEnemy(enemy);
    enemy.takeDamage(9999);
  });

  scene.physics.add.overlap(player, powerUps, (_playerObj, powerObj) => {
    const power = powerObj as PowerUp;
    if (!power.active) return;
    handlers.onPlayerGetPowerUp(power);
    power.disableBody(true, true);
  });

  if (!obstacles) return;

  // Obstacle pairs come last so the existing 0..3 indices in
  // CollisionSystem.test.ts stay stable. Bullets are absorbed (deactivated)
  // on overlap; the obstacle is untouched — it's indestructible by design.
  scene.physics.add.overlap(playerBullets, obstacles, (bulletObj, obstacleObj) => {
    const bullet = bulletObj as Bullet;
    const obstacle = obstacleObj as Obstacle;
    if (!bullet.active || !obstacle.active) return;
    bullet.deactivate();
  });

  scene.physics.add.overlap(enemyBullets, obstacles, (bulletObj, obstacleObj) => {
    const bullet = bulletObj as Bullet;
    const obstacle = obstacleObj as Obstacle;
    if (!bullet.active || !obstacle.active) return;
    bullet.deactivate();
  });

  scene.physics.add.overlap(player, obstacles, (_playerObj, obstacleObj) => {
    const obstacle = obstacleObj as Obstacle;
    if (!obstacle.active) return;
    const now = scene.time.now;
    if (now - obstacle.lastHitPlayerAt < OBSTACLE_HIT_COOLDOWN_MS) return;
    obstacle.lastHitPlayerAt = now;
    handlers.onPlayerHitByObstacle(obstacle);
  });
}

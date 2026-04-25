import * as Phaser from "phaser";
import type { Bullet, BulletPool } from "../entities/Bullet";
import type { Enemy, EnemyPool } from "../entities/Enemy";
import type { Player } from "../entities/Player";
import type { PowerUp, PowerUpPool } from "../entities/PowerUp";

export interface CollisionHandlers {
  onEnemyHit: (enemy: Enemy, bullet: Bullet, killed: boolean) => void;
  onPlayerHitByBullet: (bullet: Bullet) => void;
  onPlayerTouchEnemy: (enemy: Enemy) => void;
  onPlayerGetPowerUp: (power: PowerUp) => void;
}

export function wireCollisions(
  scene: Phaser.Scene,
  player: Player,
  playerBullets: BulletPool,
  enemyBullets: BulletPool,
  enemies: EnemyPool,
  powerUps: PowerUpPool,
  handlers: CollisionHandlers
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
}

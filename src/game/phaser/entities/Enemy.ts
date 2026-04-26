import * as Phaser from "phaser";
import type { EnemyDefinition, EnemyId } from "@/types/game";
import { BulletPool } from "./Bullet";
import { getEnemy } from "../../data/enemies";

export { getEnemy };

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  definition: EnemyDefinition = getEnemy("basic");
  hp = 0;
  private spawnX = 0;
  private elapsedMs = 0;
  private lastShotAt = 0;
  private getPlayer: () => { x: number; y: number } | null = () => null;
  private enemyPool?: BulletPool;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "enemy-basic");
  }

  spawn(
    definition: EnemyDefinition,
    x: number,
    y: number,
    opts: {
      getPlayer: () => { x: number; y: number } | null;
      enemyBullets: BulletPool;
    }
  ): void {
    this.definition = definition;
    this.hp = definition.hp;
    this.spawnX = x;
    this.elapsedMs = 0;
    this.lastShotAt = 0;
    this.getPlayer = opts.getPlayer;
    this.enemyPool = opts.enemyBullets;

    this.enableBody(true, x, y, true, true);
    this.setTexture(definition.spriteKey);
    this.setActive(true);
    this.setVisible(true);
    this.clearTint();

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.7, this.height * 0.7);
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.setTint(0xffffff);
    this.scene.time.delayedCall(40, () => this.clearTint());
    if (this.hp <= 0) {
      this.scene.events.emit("enemyKilled", this);
      this.disableBody(true, true);
      return true;
    }
    return false;
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.elapsedMs += delta;

    const def = this.definition;
    switch (def.behavior) {
      case "straight":
        this.setVelocity(0, def.speed);
        break;
      case "zigzag": {
        const ox = Math.sin(this.elapsedMs / 400) * 160;
        this.setVelocity(ox, def.speed);
        this.x = this.spawnX + ox;
        break;
      }
      case "homing": {
        const target = this.getPlayer();
        if (target) {
          const dx = target.x - this.x;
          const dy = target.y - this.y;
          const len = Math.hypot(dx, dy) || 1;
          this.setVelocity((dx / len) * def.speed, (dy / len) * def.speed);
        } else {
          this.setVelocity(0, def.speed);
        }
        break;
      }
      case "boss":
        this.updateBoss(time);
        return; // boss owns its own despawn rules
    }

    if (this.y > this.scene.physics.world.bounds.bottom + 40) {
      this.disableBody(true, true);
    }

    if (def.fireRateMs !== null && this.enemyPool && time - this.lastShotAt >= def.fireRateMs) {
      this.lastShotAt = time;
      this.enemyPool.spawn(this.x, this.y + 12, 0, 360, 8, false);
    }
  }

  // ---------- Boss phases (driven by HP ratio) ----------

  private bossPhase(): 1 | 2 | 3 {
    const ratio = this.hp / this.definition.hp;
    if (ratio > 0.66) return 1;
    if (ratio > 0.33) return 2;
    return 3;
  }

  private updateBoss(time: number): void {
    const phase = this.bossPhase();

    // Movement: side-to-side with increasing amplitude + frequency per phase.
    const params =
      phase === 1
        ? { ax: 140, fx: 900, ay: 30, fy: 2000, yBias: 0 }
        : phase === 2
          ? { ax: 180, fx: 600, ay: 60, fy: 1500, yBias: 10 }
          : { ax: 240, fx: 280, ay: 90, fy: 900, yBias: 20 };

    const vx = Math.sin(this.elapsedMs / params.fx) * params.ax;
    const vy = Math.sin(this.elapsedMs / params.fy) * params.ay + params.yBias;
    this.setVelocity(vx, vy);

    // Clamp vertical drift so the boss never leaves the top third of the arena.
    const bounds = this.scene.physics.world.bounds;
    const minY = 60;
    const maxY = bounds.height * 0.35;
    if (this.y < minY) this.y = minY;
    if (this.y > maxY) this.y = maxY;

    this.maybeFireBossShot(time, phase);
  }

  private maybeFireBossShot(time: number, phase: 1 | 2 | 3): void {
    if (!this.enemyPool) return;
    // Tutorial-tier boss: slowed phase intervals + reduced bullet damage so
    // newcomers can learn the encounter. Tighter values fit a later, harder boss.
    const interval = phase === 1 ? 1400 : phase === 2 ? 900 : 600;
    if (time - this.lastShotAt < interval) return;
    this.lastShotAt = time;

    const ox = this.x;
    const oy = this.y + 40;

    if (phase === 1) {
      this.enemyPool.spawn(ox, oy, 0, 320, 6, false);
      return;
    }

    if (phase === 2) {
      for (const dx of [-0.35, 0, 0.35] as const) {
        this.enemyPool.spawn(ox, oy, dx * 300, 300, 6, false);
      }
      return;
    }

    // Phase 3: aimed shot + 4-way fan.
    const target = this.getPlayer();
    if (target) {
      const dx = target.x - ox;
      const dy = Math.max(target.y - oy, 1);
      const len = Math.hypot(dx, dy);
      const speed = 340;
      this.enemyPool.spawn(ox, oy, (dx / len) * speed, (dy / len) * speed, 8, false);
    }
    for (const dx of [-0.6, -0.2, 0.2, 0.6] as const) {
      this.enemyPool.spawn(ox, oy, dx * 300, 320, 6, false);
    }
  }
}

export class EnemyPool extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: Enemy,
      maxSize: -1,
      runChildUpdate: true
    });
  }

  spawn(
    id: EnemyId,
    x: number,
    y: number,
    opts: { getPlayer: () => { x: number; y: number } | null; enemyBullets: BulletPool }
  ): Enemy | null {
    const enemy = this.get(x, y) as Enemy | null;
    if (!enemy) return null;
    enemy.spawn(getEnemy(id), x, y, opts);
    return enemy;
  }
}

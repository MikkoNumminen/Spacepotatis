import * as Phaser from "phaser";

export const BULLET_TEXTURE_FRIENDLY = "bullet-friendly";
export const BULLET_TEXTURE_HOSTILE = "bullet-hostile";

// Optional steering config the BulletPool layers on top of fire(). When set,
// the bullet adjusts its heading each tick toward whatever findTarget returns,
// capped at turnRate radians/second so missiles arc gracefully instead of
// snapping to face the target.
interface HomingConfig {
  readonly turnRateRadPerSec: number;
  readonly findTarget: (x: number, y: number) => { readonly x: number; readonly y: number } | null;
}

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  friendly = true;
  damage = 0;
  private homing: HomingConfig | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, BULLET_TEXTURE_FRIENDLY);
  }

  fire(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    friendly: boolean,
    homing: HomingConfig | null = null
  ): void {
    this.friendly = friendly;
    this.damage = damage;
    this.homing = homing;
    this.setTexture(friendly ? BULLET_TEXTURE_FRIENDLY : BULLET_TEXTURE_HOSTILE);

    this.enableBody(true, x, y, true, true);
    this.setVelocity(vx, vy);

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.6, this.height * 0.8);
  }

  deactivate(): void {
    this.homing = null;
    this.disableBody(true, true);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (this.homing) {
      this.steerTowardTarget(delta);
    }

    const bounds = this.scene.physics.world.bounds;
    if (
      this.y < bounds.y - 32 ||
      this.y > bounds.bottom + 32 ||
      this.x < bounds.x - 32 ||
      this.x > bounds.right + 32
    ) {
      this.deactivate();
    }
  }

  private steerTowardTarget(delta: number): void {
    if (!this.homing) return;
    const target = this.homing.findTarget(this.x, this.y);
    if (!target) return;

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed === 0) return;

    const desired = Math.atan2(target.y - this.y, target.x - this.x);
    const current = Math.atan2(body.velocity.y, body.velocity.x);
    // Wrap angle delta into [-PI, PI] so we always turn the short way around.
    let diff = desired - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const maxStep = (this.homing.turnRateRadPerSec * delta) / 1000;
    const step = Math.max(-maxStep, Math.min(maxStep, diff));
    const next = current + step;

    this.setVelocity(Math.cos(next) * speed, Math.sin(next) * speed);
    this.setRotation(next + Math.PI / 2);
  }
}

export interface BulletPoolOptions {
  // Provided by CombatScene at construction. Friendly pools point at
  // findClosestEnemy; hostile pools point at the player. Required for any
  // bullet that wants to home — straight bullets ignore it entirely.
  readonly findTarget?: (x: number, y: number) => { readonly x: number; readonly y: number } | null;
}

export class BulletPool extends Phaser.Physics.Arcade.Group {
  private readonly findTarget?: (x: number, y: number) => { readonly x: number; readonly y: number } | null;

  constructor(scene: Phaser.Scene, size = 160, opts: BulletPoolOptions = {}) {
    super(scene.physics.world, scene, {
      classType: Bullet,
      maxSize: size,
      runChildUpdate: true
    });
    this.findTarget = opts.findTarget;
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    friendly: boolean,
    homing: { readonly turnRateRadPerSec: number } | null = null
  ): Bullet | null {
    const bullet = this.get() as Bullet | null;
    if (!bullet) return null;
    const homingConfig =
      homing && this.findTarget
        ? { turnRateRadPerSec: homing.turnRateRadPerSec, findTarget: this.findTarget }
        : null;
    bullet.fire(x, y, vx, vy, damage, friendly, homingConfig);
    return bullet;
  }
}

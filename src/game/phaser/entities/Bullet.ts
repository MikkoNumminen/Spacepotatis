import * as Phaser from "phaser";
import { steerVelocity } from "../systems/weaponMath";

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
  private gravity = 0;

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
    homing: HomingConfig | null = null,
    spriteKey?: string,
    gravity: number = 0
  ): void {
    this.friendly = friendly;
    this.damage = damage;
    this.homing = homing;
    this.gravity = gravity;
    this.setTexture(spriteKey ?? (friendly ? BULLET_TEXTURE_FRIENDLY : BULLET_TEXTURE_HOSTILE));

    this.enableBody(true, x, y, true, true);
    this.setVelocity(vx, vy);
    // Tumble policy:
    //   - gravity > 0: motion-aligned rotation each frame (set in preUpdate);
    //     skip the tumble so the carrot-tip points along the arc.
    //   - spriteKey set, no gravity: cosmetic tumble (potato-style).
    //   - default cyan bullet: no rotation.
    if (gravity > 0) {
      this.setAngularVelocity(0);
      this.setRotation(Math.atan2(vy, vx) + Math.PI / 2);
    } else {
      this.setAngularVelocity(spriteKey ? 720 : 0);
    }

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.6, this.height * 0.8);
  }

  deactivate(): void {
    this.homing = null;
    this.gravity = 0;
    this.setAngularVelocity(0);
    this.setRotation(0);
    this.disableBody(true, true);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    if (this.gravity !== 0) {
      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        body.velocity.y += this.gravity * delta / 1000;
        this.setRotation(Math.atan2(body.velocity.y, body.velocity.x) + Math.PI / 2);
      }
    }

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

    const next = steerVelocity(
      body.velocity.x,
      body.velocity.y,
      this.x,
      this.y,
      target.x,
      target.y,
      this.homing.turnRateRadPerSec,
      delta
    );
    this.setVelocity(next.vx, next.vy);
    // Sprite forward axis is up (-Y), so rotate so the bullet's nose faces
    // its motion vector regardless of which way the bullet texture points.
    this.setRotation(Math.atan2(next.vy, next.vx) + Math.PI / 2);
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
    homing: { readonly turnRateRadPerSec: number } | null = null,
    spriteKey?: string,
    gravity?: number
  ): Bullet | null {
    const bullet = this.get() as Bullet | null;
    if (!bullet) return null;
    const homingConfig =
      homing && this.findTarget
        ? { turnRateRadPerSec: homing.turnRateRadPerSec, findTarget: this.findTarget }
        : null;
    bullet.fire(x, y, vx, vy, damage, friendly, homingConfig, spriteKey, gravity);
    return bullet;
  }
}

import * as Phaser from "phaser";

export const BULLET_TEXTURE_FRIENDLY = "bullet-friendly";
export const BULLET_TEXTURE_HOSTILE = "bullet-hostile";

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  friendly = true;
  damage = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, BULLET_TEXTURE_FRIENDLY);
  }

  fire(x: number, y: number, vx: number, vy: number, damage: number, friendly: boolean): void {
    this.friendly = friendly;
    this.damage = damage;
    this.setTexture(friendly ? BULLET_TEXTURE_FRIENDLY : BULLET_TEXTURE_HOSTILE);

    this.enableBody(true, x, y, true, true);
    this.setVelocity(vx, vy);

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.6, this.height * 0.8);
  }

  deactivate(): void {
    this.disableBody(true, true);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
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
}

export class BulletPool extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene, size = 160) {
    super(scene.physics.world, scene, {
      classType: Bullet,
      maxSize: size,
      runChildUpdate: true
    });
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    friendly: boolean
  ): Bullet | null {
    const bullet = this.get() as Bullet | null;
    if (!bullet) return null;
    bullet.fire(x, y, vx, vy, damage, friendly);
    return bullet;
  }
}

import * as Phaser from "phaser";

export type PowerUpKind = "shield" | "credit" | "weapon";

export class PowerUp extends Phaser.Physics.Arcade.Sprite {
  kind: PowerUpKind = "credit";

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "powerup-credit");
  }

  spawn(kind: PowerUpKind, x: number, y: number): void {
    this.kind = kind;
    this.enableBody(true, x, y, true, true);
    this.setTexture(`powerup-${kind}`);
    this.setVelocity(0, 120);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.y > this.scene.physics.world.bounds.bottom + 40) {
      this.disableBody(true, true);
    }
  }
}

export class PowerUpPool extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: PowerUp,
      maxSize: -1,
      runChildUpdate: true
    });
  }

  spawn(kind: PowerUpKind, x: number, y: number): PowerUp | null {
    const pu = this.get(x, y) as PowerUp | null;
    if (!pu) return null;
    pu.spawn(kind, x, y);
    return pu;
  }
}

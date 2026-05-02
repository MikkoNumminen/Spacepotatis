import * as Phaser from "phaser";
import type { ObstacleDefinition, ObstacleId } from "@/types/game";
import { getObstacle } from "../../data/obstacles";
import { OBSTACLE_DEPTH } from "../config";

export { getObstacle };

// Indestructible space junk. Mirrors the Enemy.ts pattern minus everything
// related to combat (no hp, no takeDamage, no firing, no boss phases). The
// CollisionSystem (CollisionSystem.ts) is what enforces indestructibility:
// player + enemy bullet overlaps deactivate the bullet without touching the
// obstacle. Player contact deals collision damage on a per-obstacle cooldown
// so a rock resting against the ship doesn't drain shield in one frame.
export class Obstacle extends Phaser.Physics.Arcade.Sprite {
  definition: ObstacleDefinition = getObstacle("asteroid-small");
  // Last time (scene.time.now) this obstacle hit the player. Used by
  // CollisionSystem to gate per-obstacle damage so a stationary rock can't
  // drain shield at frame rate. Initialized to -Infinity so the FIRST hit
  // always lands regardless of how small scene.time.now is.
  lastHitPlayerAt = Number.NEGATIVE_INFINITY;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "obstacle-asteroid-small");
  }

  spawn(definition: ObstacleDefinition, x: number, y: number): void {
    this.definition = definition;
    this.lastHitPlayerAt = Number.NEGATIVE_INFINITY;

    this.enableBody(true, x, y, true, true);
    this.setTexture(definition.spriteKey);
    this.setActive(true);
    this.setVisible(true);
    this.setDepth(OBSTACLE_DEPTH);
    // Each rock starts at a random angle so a scatter doesn't read as a
    // synced batch of clones. The slow tumble layer is cosmetic only —
    // Arcade Physics is AABB and ignores sprite rotation.
    this.setAngle(Math.random() * 360);
    this.setAngularVelocity(20);
    // Drift straight down at the obstacle's configured speed. Behavior is a
    // single value today ("drift"); future variants (tumbling, static-wall,
    // wreckage) extend the switch in preUpdate.
    this.setVelocity(0, definition.speed);

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      const r = definition.hitboxRadius;
      body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    }
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    // Single-behavior switch is the extension seam for future variants.
    switch (this.definition.behavior) {
      case "drift":
        // Velocity already set in spawn; no per-tick steering.
        break;
    }
    if (this.y > this.scene.physics.world.bounds.bottom + 40) {
      this.disableBody(true, true);
    }
  }
}

export class ObstaclePool extends Phaser.Physics.Arcade.Group {
  constructor(scene: Phaser.Scene) {
    super(scene.physics.world, scene, {
      classType: Obstacle,
      maxSize: -1,
      runChildUpdate: true
    });
  }

  spawn(id: ObstacleId, x: number, y: number): Obstacle | null {
    const obstacle = this.get(x, y) as Obstacle | null;
    if (!obstacle) return null;
    obstacle.spawn(getObstacle(id), x, y);
    return obstacle;
  }
}

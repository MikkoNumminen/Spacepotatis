import * as Phaser from "phaser";
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../../config";
import type { EnemyPool } from "../../entities/Enemy";

// Visual + targeting helpers for CombatScene. None of these mutate gameplay
// state — they only create transient display objects or read-only scans.
export class CombatVfx {
  constructor(private readonly scene: Phaser.Scene) {}

  drawBackground(): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0x0b0d1c, 1);
    g.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    // Simple starfield underlay.
    g.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 80; i++) {
      g.fillCircle(Math.random() * VIRTUAL_WIDTH, Math.random() * VIRTUAL_HEIGHT, Math.random() * 1.4);
    }
  }

  floatDamageNumber(x: number, y: number, amount: number): void {
    // Random sign + jitter on horizontal drift so rapid bursts fan out around
    // the target instead of stacking into one bold blob.
    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const startX = x + sideSign * (8 + Math.random() * 6);
    const endX = x + sideSign * (44 + Math.random() * 14);
    const text = this.scene.add.text(startX, y - 12, String(Math.round(amount)), {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffe066",
      stroke: "#000000",
      strokeThickness: 3
    });
    text.setOrigin(0.5, 1);
    text.setDepth(1000);
    this.scene.tweens.add({
      targets: text,
      x: { value: endX, ease: "Cubic.easeOut" },
      y: { value: y - 48, ease: "Cubic.easeOut" },
      // Quad.easeIn keeps alpha near 1 most of the way, then fades fast at
      // the end — staying readable for the whole 1s instead of fading early.
      alpha: { value: 0, ease: "Quad.easeIn" },
      duration: 1000,
      onComplete: () => text.destroy()
    });
  }

  emitExplosionParticles(x: number, y: number, count: number): void {
    const emitter = this.scene.add.particles(x, y, "particle-spark", {
      speed: { min: 60, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 240, max: 520 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: count,
      emitting: false
    });
    emitter.explode(count);
    this.scene.time.delayedCall(700, () => emitter.destroy());
  }

  // Squared-distance scan over the active enemy group. Used by friendly
  // homing bullets — keeping it here (not on EnemyPool) because target
  // selection might evolve to factor in HP, threat, or screen position.
  findClosestEnemyTo(
    enemies: EnemyPool,
    x: number,
    y: number
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDistSq = Infinity;
    enemies.children.iterate((child) => {
      const e = child as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = { x: e.x, y: e.y };
      }
      return true;
    });
    return best;
  }
}

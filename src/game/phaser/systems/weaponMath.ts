// Pure math helpers backing WeaponSystem. Extracted so the rate-limit and
// spread computations can be tested without instantiating Phaser.
import type { SlotName } from "@/game/state/ShipConfig";

export function canFire(now: number, lastFireMs: number, fireRateMs: number): boolean {
  return now - lastFireMs >= fireRateMs;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface BulletVector {
  readonly vx: number;
  readonly vy: number;
}

export function spreadVectors(
  count: number,
  spreadDegrees: number,
  speed: number,
  direction: 1 | -1
): readonly BulletVector[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ vx: 0, vy: speed * direction }];
  }
  const spreadRad = degToRad(spreadDegrees);
  const startAngle = -spreadRad / 2;
  const step = spreadRad / (count - 1);
  const out: BulletVector[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + step * i;
    out.push({
      vx: Math.sin(angle) * speed,
      vy: Math.cos(angle) * speed * direction
    });
  }
  return out;
}

// Slot-aware vector generator. The slot is the actual mount POSITION, not
// the weapon kind — direction depends on where on the ship the bullet
// emerges from. Front uses straight spreadVectors. Rear flips the friendly
// base direction so bullets fly downward. Each sidekick pod emits its own
// stream rotated 45 deg outward (left pod fires up-and-left, right pod
// fires up-and-right). projectileCount + spreadDegrees still apply — a
// 3-bullet sidekick fires a 3-cone at 45 deg outward, not just one bullet.
const SIDEKICK_DEGREES = 45;

export function slotVectors(
  slot: SlotName,
  count: number,
  spreadDegrees: number,
  speed: number,
  friendly: boolean
): readonly BulletVector[] {
  const friendlyDir: 1 | -1 = friendly ? -1 : 1;
  if (slot === "front") {
    return spreadVectors(count, spreadDegrees, speed, friendlyDir);
  }
  if (slot === "rear") {
    const flipped: 1 | -1 = friendly ? 1 : -1;
    return spreadVectors(count, spreadDegrees, speed, flipped);
  }
  // Sidekick pods: build the spread in the friendly frame (straight up),
  // rotate ±45° depending on which mount, then mirror Y for hostile fire so
  // "left = negative vx" stays the same regardless of who's shooting. If we
  // rotated the already-flipped hostile baseline directly, the rotation
  // would swap left↔right because the baseline now points down.
  const direction = slot === "sidekickLeft" ? -1 : 1;
  const rad = degToRad(SIDEKICK_DEGREES) * direction;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const yFlip = friendly ? 1 : -1;
  return spreadVectors(count, spreadDegrees, speed, -1).map((v) => {
    const vx = v.vx * cos - v.vy * sin;
    const vy = v.vx * sin + v.vy * cos;
    return { vx, vy: vy * yFlip };
  });
}

// Pure homing-steering math used by Bullet. Takes the bullet's current
// velocity + position and a target, returns the next velocity capped at
// turnRateRadPerSec. Magnitude is preserved — only the direction rotates.
export function steerVelocity(
  vx: number,
  vy: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  turnRateRadPerSec: number,
  deltaMs: number
): BulletVector {
  const speed = Math.hypot(vx, vy);
  if (speed === 0) return { vx, vy };
  const desired = Math.atan2(toY - fromY, toX - fromX);
  const current = Math.atan2(vy, vx);
  // Wrap the angle delta into [-PI, PI] so we always turn the short way
  // around. Single subtraction is enough because both atan2 outputs are in
  // [-PI, PI], so their difference is in [-2*PI, 2*PI].
  let diff = desired - current;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  else if (diff < -Math.PI) diff += 2 * Math.PI;
  const maxStep = (turnRateRadPerSec * deltaMs) / 1000;
  const step = Math.max(-maxStep, Math.min(maxStep, diff));
  const next = current + step;
  return { vx: Math.cos(next) * speed, vy: Math.sin(next) * speed };
}

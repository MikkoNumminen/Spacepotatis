// Pure math helpers backing WeaponSystem. Extracted so the rate-limit and
// spread computations can be tested without instantiating Phaser.

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

// Build a horizontally-spread set of bullet velocities. `direction` flips
// the y axis: friendly fire flies up (-1), hostile fire flies down (+1).
// Slot-aware variants (rear-fire, sidekick angles, etc.) were removed in
// the slot-array refactor — every weapon now emits straight forward.
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

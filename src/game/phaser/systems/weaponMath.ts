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

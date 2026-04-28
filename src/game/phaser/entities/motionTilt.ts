// Pure-math helper for "lean into your motion" rotation + squash/stretch.
// Used by Enemy each frame to make movement feel like a vehicle reacting to
// its trajectory instead of a sprite sliding rigidly. Same idea as the
// potato player ship in Player.preUpdate — the math here mirrors that block,
// just sign-flipped because enemies face south on screen.
//
// Pure so it's unit-testable without instantiating a Phaser sprite.

export interface MotionTiltState {
  readonly angle: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const MAX_BANK_DEG = 22;
const MIN_REFERENCE_SPEED = 80;
// Pitch is deviation from "moving at exactly the catalog speed". At baseline
// scaleY is 1.0 (neutral); faster (diving forward) stretches Y, slower or
// negative (a homing enemy pulling up) squashes Y.
const PITCH_SLOPE = 0.18;
const PITCH_MIN = 0.86;
const PITCH_MAX = 1.16;
const BANK_NARROW = 0.07;
const EASE_PER_MS = 0.012;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// Returns the next angle/scale state given the current values, the body's
// velocity, the enemy's nominal speed (from EnemyDefinition), and the
// frame delta in ms. The result is eased toward a target — converges in
// roughly 5 frames at 60 fps so direction reversals look like a tumble,
// not a snap.
export function computeMotionTilt(
  current: MotionTiltState,
  vx: number,
  vy: number,
  speed: number,
  deltaMs: number
): MotionTiltState {
  // Bank divisor uses a floor so very-slow enemies still lean visibly when
  // their lateral velocity is large in absolute terms. Pitch ratio uses the
  // raw catalog speed so vy === speed always lands at scaleY 1.0 (neutral).
  const bankDivisor = Math.max(MIN_REFERENCE_SPEED, speed) * 0.7;
  const pitchDivisor = Math.max(1, speed);
  // Bank: vx normalized to [-1, 1] of "fast lateral motion", scaled to the
  // max bank angle. Sign flipped because enemies face south — banking right
  // while moving right reads as a counterclockwise roll on screen.
  const targetAngle = -clamp(vx / bankDivisor, -1, 1) * MAX_BANK_DEG;
  // Pitch (squash/stretch on Y): vy faster than baseline = stretched
  // (diving forward), slower = squashed (pulling up). Clamped so a homing
  // enemy that flips vy to negative doesn't invert.
  const targetScaleY = clamp(
    1 + (vy / pitchDivisor - 1) * PITCH_SLOPE,
    PITCH_MIN,
    PITCH_MAX
  );
  // Banking narrows X slightly to fake the depth foreshortening of a roll.
  const targetScaleX = 1 - Math.abs(targetAngle / MAX_BANK_DEG) * BANK_NARROW;

  const t = Math.min(1, deltaMs * EASE_PER_MS);
  return {
    angle: current.angle + (targetAngle - current.angle) * t,
    scaleX: current.scaleX + (targetScaleX - current.scaleX) * t,
    scaleY: current.scaleY + (targetScaleY - current.scaleY) * t
  };
}

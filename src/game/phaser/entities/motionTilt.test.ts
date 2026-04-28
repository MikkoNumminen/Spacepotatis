import { describe, expect, it } from "vitest";
import { computeMotionTilt, type MotionTiltState } from "./motionTilt";

const NEUTRAL: MotionTiltState = { angle: 0, scaleX: 1, scaleY: 1 };

// Saturation: drive the easing for many frames so we converge on the target,
// then assert against the steady-state value.
function settle(
  current: MotionTiltState,
  vx: number,
  vy: number,
  speed: number,
  steps = 60,
  deltaMs = 16
): MotionTiltState {
  let s = current;
  for (let i = 0; i < steps; i++) {
    s = computeMotionTilt(s, vx, vy, speed, deltaMs);
  }
  return s;
}

describe("computeMotionTilt", () => {
  it("zero velocity at baseline → angle 0, scale ~1", () => {
    // vy=speed is the baseline (constant downward motion); pitch should
    // settle near 1.0, not at the slack baseline of 0.93.
    const settled = settle(NEUTRAL, 0, 70, 70);
    expect(settled.angle).toBeCloseTo(0, 5);
    expect(settled.scaleY).toBeCloseTo(1.0, 2);
    expect(settled.scaleX).toBeCloseTo(1.0, 5);
  });

  it("positive vx leans counterclockwise (negative angle, sign-flipped vs Player)", () => {
    // Enemies face south, so banking right reads as a counterclockwise roll.
    // vx must dominate baseline*0.7 (= 49 for speed 70) to saturate the bank.
    const settled = settle(NEUTRAL, 200, 70, 70);
    expect(settled.angle).toBeLessThan(-15);
    expect(settled.angle).toBeGreaterThanOrEqual(-22);
  });

  it("negative vx leans clockwise (positive angle)", () => {
    const settled = settle(NEUTRAL, -200, 70, 70);
    expect(settled.angle).toBeGreaterThan(15);
    expect(settled.angle).toBeLessThanOrEqual(22);
  });

  it("vy faster than baseline stretches Y (diving forward)", () => {
    const settled = settle(NEUTRAL, 0, 140, 70);
    expect(settled.scaleY).toBeGreaterThan(1.0);
    expect(settled.scaleY).toBeLessThanOrEqual(1.16);
  });

  it("vy below baseline (or negative) squashes Y", () => {
    const settled = settle(NEUTRAL, 0, -70, 70);
    expect(settled.scaleY).toBeLessThan(1.0);
    expect(settled.scaleY).toBeGreaterThanOrEqual(0.86);
  });

  it("banking narrows X (fakes depth foreshortening)", () => {
    const settled = settle(NEUTRAL, 200, 70, 70);
    expect(settled.scaleX).toBeLessThan(1.0);
  });

  it("eases gradually — one frame produces a partial step, not the full target", () => {
    const oneFrame = computeMotionTilt(NEUTRAL, 200, 70, 70, 16);
    // Saturated target is ≈ -22°; one 16 ms frame of easing should land
    // somewhere between 0 and the target, not past the target.
    expect(oneFrame.angle).toBeLessThan(0);
    expect(oneFrame.angle).toBeGreaterThan(-22);
  });

  it("clamps lateral input — runaway vx doesn't blow past the bank cap", () => {
    const settled = settle(NEUTRAL, 10000, 70, 70);
    expect(settled.angle).toBeGreaterThanOrEqual(-22.0001);
  });

  it("low-speed enemies still get visible bank (MIN_REFERENCE_SPEED floor)", () => {
    // An enemy with speed 30 (< MIN_REFERENCE_SPEED of 80) should still
    // saturate the bank when vx is, e.g., 100 — otherwise tiny enemies
    // would never lean.
    const settled = settle(NEUTRAL, 100, 30, 30);
    expect(Math.abs(settled.angle)).toBeGreaterThan(15);
  });
});

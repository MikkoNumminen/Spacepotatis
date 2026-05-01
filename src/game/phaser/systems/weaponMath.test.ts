import { describe, expect, it } from "vitest";
import { canFire, degToRad, spreadVectors, steerVelocity } from "./weaponMath";

describe("canFire", () => {
  it("blocks firing while the cooldown is still active", () => {
    expect(canFire(100, 0, 200)).toBe(false);
  });

  it("allows firing exactly at the cooldown boundary", () => {
    expect(canFire(200, 0, 200)).toBe(true);
  });

  it("allows firing once the cooldown elapses", () => {
    expect(canFire(500, 100, 200)).toBe(true);
  });

  it("with lastFire never set (sentinel 0), still gates the first shot by elapsed time since t=0", () => {
    expect(canFire(0, 0, 100)).toBe(false);
    expect(canFire(100, 0, 100)).toBe(true);
  });
});

describe("degToRad", () => {
  it("converts a few canonical angles", () => {
    expect(degToRad(0)).toBe(0);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe("spreadVectors", () => {
  it("returns a single forward vector for count === 1", () => {
    const v = spreadVectors(1, 22, 600, -1);
    expect(v).toHaveLength(1);
    expect(v[0]?.vx).toBe(0);
    expect(v[0]?.vy).toBe(-600);
  });

  it("returns nothing for count <= 0", () => {
    expect(spreadVectors(0, 22, 600, -1)).toEqual([]);
  });

  it("for count === 3 the middle bullet is dead-ahead and outer pair is symmetric", () => {
    const v = spreadVectors(3, 22, 600, -1);
    expect(v).toHaveLength(3);
    const [left, mid, right] = v;
    expect(left).toBeDefined();
    expect(mid).toBeDefined();
    expect(right).toBeDefined();
    if (!left || !mid || !right) return;
    expect(mid.vx).toBeCloseTo(0, 10);
    expect(mid.vy).toBeCloseTo(-600, 10);
    expect(left.vx).toBeCloseTo(-right.vx, 10);
    expect(left.vy).toBeCloseTo(right.vy, 10);
  });

  it("flips vy when direction is +1 (enemy fire)", () => {
    const v = spreadVectors(1, 0, 400, 1);
    expect(v[0]?.vy).toBe(400);
  });

  it("preserves bullet speed magnitude per vector", () => {
    const speed = 720;
    for (const v of spreadVectors(5, 40, speed, -1)) {
      expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(speed, 6);
    }
  });
});


describe("steerVelocity", () => {
  const SPEED = 400;
  const TURN = 3.5;
  const DT = 16; // one ~60fps frame

  it("preserves speed magnitude across the steer", () => {
    const next = steerVelocity(0, -SPEED, 0, 0, 100, -100, TURN, DT);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(SPEED, 6);
  });

  it("steers toward a target dead ahead with no rotation needed", () => {
    const next = steerVelocity(0, -SPEED, 0, 100, 0, 0, TURN, DT);
    expect(next.vx).toBeCloseTo(0, 4);
    expect(next.vy).toBeCloseTo(-SPEED, 4);
  });

  it("clamps the turn step to turnRateRadPerSec * deltaMs / 1000", () => {
    // Target is dead behind (180° away). One frame at 3.5 rad/s for 16ms
    // can only turn 0.056 rad — so the bullet barely budges.
    const next = steerVelocity(0, -SPEED, 0, 0, 0, 100, TURN, DT);
    const angle = Math.atan2(next.vy, next.vx);
    // Started at -PI/2 (pointing up). Maximum step this frame:
    const maxStep = (TURN * DT) / 1000;
    expect(Math.abs(angle - -Math.PI / 2)).toBeLessThanOrEqual(maxStep + 1e-6);
  });

  it("does not over-rotate past the target when the angle delta is small", () => {
    // Tiny target offset to the right of straight ahead. Big enough turn
    // budget that one frame would over-rotate if not clamped.
    const next = steerVelocity(0, -SPEED, 0, 0, 1, -1000, TURN, 1000);
    const angle = Math.atan2(next.vy, next.vx);
    const desired = Math.atan2(-1000, 1);
    expect(angle).toBeCloseTo(desired, 6);
  });

  it("wraps the angle delta the short way around (positive crossover)", () => {
    // Bullet pointing slightly past +PI, target slightly past -PI. Naively
    // the delta would be ~-2*PI; properly wrapped it should be a tiny
    // positive turn.
    const startAngle = Math.PI - 0.05;
    const startVx = Math.cos(startAngle) * SPEED;
    const startVy = Math.sin(startAngle) * SPEED;
    const targetAngle = -Math.PI + 0.05;
    const tx = Math.cos(targetAngle) * 1000;
    const ty = Math.sin(targetAngle) * 1000;
    const next = steerVelocity(startVx, startVy, 0, 0, tx, ty, TURN, DT);
    // The new angle should be CLOSER to targetAngle than to (targetAngle - 2*PI).
    const newAngle = Math.atan2(next.vy, next.vx);
    const distShort = Math.abs(newAngle - targetAngle);
    const distLong = Math.abs(newAngle - (targetAngle - 2 * Math.PI));
    expect(distShort).toBeLessThan(distLong);
  });

  it("returns the input velocity unchanged when speed is zero", () => {
    const next = steerVelocity(0, 0, 0, 0, 100, 100, TURN, DT);
    expect(next.vx).toBe(0);
    expect(next.vy).toBe(0);
  });
});

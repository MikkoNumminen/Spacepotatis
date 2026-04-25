import { describe, expect, it } from "vitest";
import { canFire, degToRad, spreadVectors } from "./weaponMath";

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

  it("allows firing on the very first attempt (lastFire never set)", () => {
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

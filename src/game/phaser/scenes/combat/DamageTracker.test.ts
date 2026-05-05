import { describe, it, expect } from "vitest";
import { DamageTracker } from "./DamageTracker";

describe("DamageTracker", () => {
  it("starts empty — total is 0 and snapshot has no entries", () => {
    const t = new DamageTracker();
    expect(t.total()).toBe(0);
    expect(Object.keys(t.snapshot())).toHaveLength(0);
  });

  it("accumulates per-weapon damage and total in lockstep", () => {
    const t = new DamageTracker();
    t.record("rapid-fire", 30);
    t.record("rapid-fire", 12);
    t.record("corsair-missile", 80);

    expect(t.total()).toBe(122);
    expect(t.snapshot()).toEqual({
      "rapid-fire": 42,
      "corsair-missile": 80
    });
  });

  it("ignores null weaponId (hostile bullets / out-of-band damage)", () => {
    const t = new DamageTracker();
    t.record(null, 9999);
    expect(t.total()).toBe(0);
    expect(Object.keys(t.snapshot())).toHaveLength(0);
  });

  it("ignores zero / negative applied damage", () => {
    const t = new DamageTracker();
    t.record("rapid-fire", 0);
    t.record("rapid-fire", -5);
    t.record("rapid-fire", 7);
    expect(t.total()).toBe(7);
    expect(t.snapshot()).toEqual({ "rapid-fire": 7 });
  });

  it("reset() clears both the per-weapon map and the total", () => {
    const t = new DamageTracker();
    t.record("rapid-fire", 100);
    t.record("heavy-cannon", 200);
    t.reset();
    expect(t.total()).toBe(0);
    expect(Object.keys(t.snapshot())).toHaveLength(0);
    // After reset, fresh records work normally.
    t.record("rapid-fire", 50);
    expect(t.total()).toBe(50);
  });

  it("snapshot returns a frozen-shaped Record (independent of internal Map)", () => {
    const t = new DamageTracker();
    t.record("rapid-fire", 10);
    const snap = t.snapshot();
    t.record("rapid-fire", 5);
    // The first snapshot does not reflect the later record. Each call
    // produces a fresh object so callers can stash it without
    // mutation surprises.
    expect(snap).toEqual({ "rapid-fire": 10 });
    expect(t.snapshot()).toEqual({ "rapid-fire": 15 });
  });
});

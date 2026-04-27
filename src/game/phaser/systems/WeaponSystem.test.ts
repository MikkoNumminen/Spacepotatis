import { describe, expect, it, vi } from "vitest";
import { WeaponSystem } from "./WeaponSystem";
import type { BulletPool } from "../entities/Bullet";

// WeaponSystem owns per-slot fire cooldown and projectile spawn dispatch.
// Tests use a fake BulletPool that records every spawn so we can assert on
// projectile count, damage, and homing config without needing a Phaser group.

interface SpawnCall {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly friendly: boolean;
  readonly homing: { readonly turnRateRadPerSec: number } | null;
}

function makeFakePool() {
  const calls: SpawnCall[] = [];
  const pool = {
    spawn: vi.fn((x, y, vx, vy, damage, friendly, homing) => {
      calls.push({ x, y, vx, vy, damage, friendly, homing });
      return { active: true };
    })
  };
  return { pool: pool as unknown as BulletPool, calls };
}

describe("WeaponSystem.tryFire", () => {
  it("spawns one projectile for rapid-fire and reports success", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    const ok = ws.tryFire("rapid-fire", "front", 100, 200, 1000, true);
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.x).toBe(100);
    expect(calls[0]?.y).toBe(200);
    expect(calls[0]?.friendly).toBe(true);
    // rapid-fire damage = 6
    expect(calls[0]?.damage).toBe(6);
    expect(calls[0]?.homing).toBeNull();
  });

  it("spawns three projectiles for spread-shot (projectileCount = 3)", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    // canFire compares now - lastFireMs (initial 0) against cooldown — supply a
    // `now` past the cooldown so the very first shot is allowed to fire.
    ws.tryFire("spread-shot", "front", 0, 0, 1000, true);
    expect(calls).toHaveLength(3);
  });

  it("blocks consecutive fires inside the cooldown window", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    // rapid-fire fireRateMs = 120
    expect(ws.tryFire("rapid-fire", "front", 0, 0, 1000, true)).toBe(true);
    expect(ws.tryFire("rapid-fire", "front", 0, 0, 1050, true)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("permits a follow-up fire once the cooldown elapses", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    expect(ws.tryFire("rapid-fire", "front", 0, 0, 1000, true)).toBe(true);
    expect(ws.tryFire("rapid-fire", "front", 0, 0, 1120, true)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("applies fireRateMul: lower multiplier shortens cooldown, higher lengthens it", () => {
    const fast = makeFakePool();
    const fastWs = new WeaponSystem(fast.pool);
    // fireRateMul 0.5 → cooldown halves to 60ms; t=1000 then t=1060 should both fire.
    expect(fastWs.tryFire("rapid-fire", "front", 0, 0, 1000, true, { fireRateMul: 0.5 })).toBe(true);
    expect(fastWs.tryFire("rapid-fire", "front", 0, 0, 1060, true, { fireRateMul: 0.5 })).toBe(true);

    const slow = makeFakePool();
    const slowWs = new WeaponSystem(slow.pool);
    // fireRateMul 2.0 → cooldown doubles to 240ms; second fire at +120 should fail.
    expect(slowWs.tryFire("rapid-fire", "front", 0, 0, 1000, true, { fireRateMul: 2 })).toBe(true);
    expect(slowWs.tryFire("rapid-fire", "front", 0, 0, 1120, true, { fireRateMul: 2 })).toBe(false);
  });

  it("applies damageMul to every spawned projectile", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    ws.tryFire("rapid-fire", "front", 0, 0, 1000, true, { damageMul: 1.5 });
    expect(calls[0]?.damage).toBe(9); // 6 * 1.5
  });

  it("applies projectileBonus additively, never below 1 projectile", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    ws.tryFire("rapid-fire", "front", 0, 0, 1000, true, { projectileBonus: 2 });
    expect(calls).toHaveLength(3);
  });

  it("clamps projectile count to a minimum of 1 even with negative bonus", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    ws.tryFire("rapid-fire", "front", 0, 0, 1000, true, { projectileBonus: -10 });
    expect(calls).toHaveLength(1);
  });

  it("forwards homing config when the weapon is homing (spud-missile)", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    ws.tryFire("spud-missile", "front", 0, 0, 1000, true);
    expect(calls[0]?.homing).toEqual({ turnRateRadPerSec: 3.5 });
  });

  it("scales the homing turn rate via turnRateMul", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    ws.tryFire("spud-missile", "front", 0, 0, 1000, true, { turnRateMul: 2 });
    expect(calls[0]?.homing?.turnRateRadPerSec).toBeCloseTo(7);
  });

  it("never sends homing config for a non-homing weapon", () => {
    const { pool, calls } = makeFakePool();
    const ws = new WeaponSystem(pool);
    ws.tryFire("rapid-fire", "front", 0, 0, 1000, true, { turnRateMul: 999 });
    expect(calls[0]?.homing).toBeNull();
  });

  it("isolates cooldowns: a separate WeaponSystem instance has its own clock", () => {
    const a = makeFakePool();
    const b = makeFakePool();
    const wsA = new WeaponSystem(a.pool);
    const wsB = new WeaponSystem(b.pool);
    expect(wsA.tryFire("rapid-fire", "front", 0, 0, 1000, true)).toBe(true);
    expect(wsB.tryFire("rapid-fire", "front", 0, 0, 1000, true)).toBe(true);
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
  });

  it("identity-mods (no modifier object) match an explicit empty mods bag", () => {
    const a = makeFakePool();
    const b = makeFakePool();
    new WeaponSystem(a.pool).tryFire("rapid-fire", "front", 0, 0, 1000, true);
    new WeaponSystem(b.pool).tryFire("rapid-fire", "front", 0, 0, 1000, true, {});
    expect(a.calls[0]?.damage).toBe(b.calls[0]?.damage);
    expect(a.calls.length).toBe(b.calls.length);
  });
});

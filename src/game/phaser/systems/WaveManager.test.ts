import { describe, expect, it, vi } from "vitest";

// Phaser drags `window` in via its device-detection module on certain import
// orders (varies between vitest runs). WaveManager only consumes Phaser.Math.Clamp
// from the namespace, so a tiny stub keeps the test fully node-friendly.
vi.mock("phaser", () => ({
  Math: {
    Clamp: (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value))
  }
}));

import { WaveManager } from "./WaveManager";
import { createFakeScene, type FakeScene } from "../__tests__/fakeScene";
import type { BulletPool } from "../entities/Bullet";
import type { EnemyPool } from "../entities/Enemy";
import { getWavesForMission } from "../../data/waves";

// WaveManager schedules every spawn through scene.time.delayedCall and emits
// `allWavesComplete` once the final wave's timer trips. Tests use the
// fakeScene's controllable delayedCall queue and verify both the schedule
// shape and the lifecycle predicates.

function setup(missionId: "tutorial" | "combat-1" | "boss-1") {
  const scene = createFakeScene();
  const enemySpawn = vi.fn();
  const enemies = { spawn: enemySpawn } as unknown as EnemyPool;
  const enemyBullets = {} as unknown as BulletPool;
  const wm = new WaveManager(
    scene as never,
    enemies,
    enemyBullets,
    () => ({ x: 0, y: 0 }),
    missionId
  );
  return { scene, wm, enemySpawn };
}

function emittedTypes(scene: FakeScene): readonly string[] {
  return scene.events.emitted.map((e) => e.type);
}

describe("WaveManager.start", () => {
  it("on the tutorial mission, schedules every spawn from wave 0 plus a wave-end timer", () => {
    const { scene, wm } = setup("tutorial");
    wm.start();
    // tutorial wave 0 has two spawns of count 4 each = 8 enemy delayedCalls,
    // plus one wave-duration delayedCall at the end.
    const tutorialWaves = getWavesForMission("tutorial");
    const firstWave = tutorialWaves[0];
    expect(firstWave).toBeDefined();
    if (!firstWave) return;
    const totalSpawns = firstWave.spawns.reduce((sum, s) => sum + s.count, 0);
    expect(scene.time.delayedCall).toHaveBeenCalledTimes(totalSpawns + 1);
  });

  it("does not advance to wave 1 until the wave 0 duration elapses", () => {
    const { scene, wm } = setup("combat-1");
    wm.start();
    const waves = getWavesForMission("combat-1");
    const wave0 = waves[0];
    expect(wave0).toBeDefined();
    if (!wave0) return;
    const wave0SpawnCount = wave0.spawns.reduce((s, x) => s + x.count, 0);
    // Schedule shape: every spawn for wave 0 (each its own delayedCall) + one
    // wave-end timer for wave 0.
    expect(scene.time.delayedCall).toHaveBeenCalledTimes(wave0SpawnCount + 1);
  });
});

describe("WaveManager.hasMoreWaves / isOnLastWave", () => {
  it("tutorial has a single wave: after start, hasMoreWaves=false, isOnLastWave=true", () => {
    const { wm } = setup("tutorial");
    wm.start();
    expect(wm.hasMoreWaves()).toBe(false);
    expect(wm.isOnLastWave()).toBe(true);
  });

  it("combat-1 has three waves; on the first wave, hasMoreWaves=true and isOnLastWave=false", () => {
    const { wm } = setup("combat-1");
    wm.start();
    expect(wm.hasMoreWaves()).toBe(true);
    expect(wm.isOnLastWave()).toBe(false);
  });
});

describe("WaveManager.allSpawnsFired", () => {
  it("returns false until every scheduled spawn callback has fired", () => {
    const { scene, wm } = setup("tutorial");
    wm.start();
    expect(wm.allSpawnsFired()).toBe(false);

    // Fire every scheduled callback (both enemy spawns and the wave-end timer).
    scene.time.fireAll();
    expect(wm.allSpawnsFired()).toBe(true);
  });

  it("counts each fired spawn against the scheduled total", () => {
    const { scene, wm, enemySpawn } = setup("tutorial");
    wm.start();
    const wave = getWavesForMission("tutorial")[0];
    expect(wave).toBeDefined();
    if (!wave) return;
    const totalSpawns = wave.spawns.reduce((sum, s) => sum + s.count, 0);

    // Manually fire just the spawn entries (skip the wave-end timer).
    const spawnEntries = scene.time.queue.slice(0, totalSpawns);
    for (const entry of spawnEntries) {
      entry.fired = true;
      entry.callback();
    }
    expect(enemySpawn).toHaveBeenCalledTimes(totalSpawns);
    expect(wm.allSpawnsFired()).toBe(true);
  });
});

describe("WaveManager.finishEarly", () => {
  it("emits allWavesComplete exactly once even when called multiple times", () => {
    const { scene, wm } = setup("tutorial");
    wm.finishEarly();
    wm.finishEarly();
    wm.finishEarly();
    expect(emittedTypes(scene).filter((t) => t === "allWavesComplete")).toHaveLength(1);
  });

  it("emits the typed event with the matching payload shape", () => {
    const { scene, wm } = setup("tutorial");
    wm.finishEarly();
    const evt = scene.events.emitted.find((e) => e.type === "allWavesComplete");
    expect(evt).toBeDefined();
    expect(evt?.payload).toEqual({ type: "allWavesComplete" });
  });
});

describe("WaveManager wave progression", () => {
  it("advances from wave 0 to wave 1 once the wave-duration timer fires", () => {
    const { scene, wm } = setup("combat-1");
    wm.start();
    const waves = getWavesForMission("combat-1");
    const wave0 = waves[0];
    const wave1 = waves[1];
    expect(wave0).toBeDefined();
    expect(wave1).toBeDefined();
    if (!wave0 || !wave1) return;

    const wave0Spawns = wave0.spawns.reduce((s, x) => s + x.count, 0);
    const callsBefore = scene.time.delayedCall.mock.calls.length;
    expect(callsBefore).toBe(wave0Spawns + 1);

    // Fire only the wave-end timer (last enqueued).
    const waveEnd = scene.time.queue[wave0Spawns];
    expect(waveEnd).toBeDefined();
    if (!waveEnd) return;
    waveEnd.fired = true;
    waveEnd.callback();

    // After advance, wave 1's spawns + wave-end timer should be enqueued.
    const wave1Spawns = wave1.spawns.reduce((s, x) => s + x.count, 0);
    const callsAfter = scene.time.delayedCall.mock.calls.length;
    expect(callsAfter).toBe(callsBefore + wave1Spawns + 1);
    expect(wm.hasMoreWaves()).toBe(true); // still one more wave (wave 2)
  });

  it("emits allWavesComplete only after the last wave's timer fires", () => {
    const { scene, wm } = setup("tutorial");
    wm.start();
    expect(emittedTypes(scene)).not.toContain("allWavesComplete");
    scene.time.fireAll();
    expect(emittedTypes(scene)).toContain("allWavesComplete");
  });

  it("does not re-emit allWavesComplete if finishEarly raced the wave-end timer", () => {
    const { scene, wm } = setup("tutorial");
    wm.start();
    wm.finishEarly();
    scene.time.fireAll();
    expect(emittedTypes(scene).filter((t) => t === "allWavesComplete")).toHaveLength(1);
  });
});

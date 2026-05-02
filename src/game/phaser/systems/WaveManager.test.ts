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
import type { ObstaclePool } from "../entities/Obstacle";
import { getWavesForMission } from "../../data/waves";

// WaveManager schedules every spawn through scene.time.delayedCall and emits
// `allWavesComplete` once the final wave's timer trips. Tests use the
// fakeScene's controllable delayedCall queue and verify both the schedule
// shape and the lifecycle predicates.

type SetupOpts = { withObstacles?: boolean };

function setup(
  missionId: "tutorial" | "combat-1" | "boss-1" | "pirate-beacon",
  opts: SetupOpts = {}
) {
  const scene = createFakeScene();
  const enemySpawn = vi.fn();
  const enemies = { spawn: enemySpawn } as unknown as EnemyPool;
  const enemyBullets = {} as unknown as BulletPool;
  const obstacleSpawn = vi.fn();
  const obstacles = opts.withObstacles
    ? ({ spawn: obstacleSpawn } as unknown as ObstaclePool)
    : null;
  const wm = new WaveManager(
    scene as never,
    enemies,
    enemyBullets,
    () => ({ x: 0, y: 0 }),
    missionId,
    obstacles
  );
  return { scene, wm, enemySpawn, obstacleSpawn };
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
    if (!firstWave) throw new Error("expected firstWave to be defined; fixture broken");
    const totalSpawns = firstWave.spawns.reduce((sum, s) => sum + s.count, 0);
    expect(scene.time.delayedCall).toHaveBeenCalledTimes(totalSpawns + 1);
  });

  it("does not advance to wave 1 until the wave 0 duration elapses", () => {
    const { scene, wm } = setup("combat-1");
    wm.start();
    const waves = getWavesForMission("combat-1");
    const wave0 = waves[0];
    if (!wave0) throw new Error("expected wave0 to be defined; fixture broken");
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
    if (!wave) throw new Error("expected wave to be defined; fixture broken");
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
    if (!wave0 || !wave1) throw new Error("expected wave0 and wave1 to be defined; fixture broken");

    const wave0Spawns = wave0.spawns.reduce((s, x) => s + x.count, 0);
    const callsBefore = scene.time.delayedCall.mock.calls.length;
    expect(callsBefore).toBe(wave0Spawns + 1);

    // Fire only the wave-end timer (last enqueued).
    const waveEnd = scene.time.queue[wave0Spawns];
    if (!waveEnd) throw new Error("expected waveEnd to be defined; fixture broken");
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

describe("WaveManager obstacle scheduling", () => {
  it("schedules pirate-beacon wave 0's obstacleSpawns when an ObstaclePool is provided", () => {
    const { scene, wm, obstacleSpawn } = setup("pirate-beacon", { withObstacles: true });
    wm.start();

    const waves = getWavesForMission("pirate-beacon");
    const wave0 = waves[0];
    if (!wave0) throw new Error("expected pirate-beacon wave 0; fixture broken");
    const enemyTotal = wave0.spawns.reduce((s, x) => s + x.count, 0);
    const obstacleTotal = (wave0.obstacleSpawns ?? []).reduce((s, x) => s + x.count, 0);
    // enemy spawn callbacks + obstacle spawn callbacks + 1 wave-end timer
    expect(scene.time.delayedCall).toHaveBeenCalledTimes(enemyTotal + obstacleTotal + 1);

    // Fire all queued callbacks; obstacles.spawn should have been called once per
    // obstacle scheduled in this wave (we don't advance to wave 1 — fireAll keeps
    // tripping callbacks but the obstacle count we care about is wave 0's).
    scene.time.fireAll();
    expect(obstacleSpawn.mock.calls.length).toBeGreaterThanOrEqual(obstacleTotal);
  });

  it("ignores obstacleSpawns when no ObstaclePool is provided (graceful fallback)", () => {
    const { scene, wm } = setup("pirate-beacon");
    wm.start();
    const waves = getWavesForMission("pirate-beacon");
    const wave0 = waves[0];
    if (!wave0) throw new Error("expected pirate-beacon wave 0; fixture broken");
    const enemyTotal = wave0.spawns.reduce((s, x) => s + x.count, 0);
    // Obstacle spawns are skipped entirely when obstacles=null — only enemy
    // spawns + the wave-end timer hit the queue.
    expect(scene.time.delayedCall).toHaveBeenCalledTimes(enemyTotal + 1);
  });

  it("obstacle scheduling does not bump enemy-completion counters", () => {
    const { scene, wm } = setup("pirate-beacon", { withObstacles: true });
    wm.start();
    // Fire only obstacle delayed calls — fast-path check by firing the FIRST
    // obstacle entry and confirming allSpawnsFired stays consumer of enemy
    // counters only. We can't cleanly isolate obstacle entries from enemy
    // entries in the queue, so instead we fire all spawn callbacks and confirm
    // allSpawnsFired matches enemy count progression.
    const waves = getWavesForMission("pirate-beacon");
    const wave0 = waves[0];
    if (!wave0) throw new Error("expected pirate-beacon wave 0; fixture broken");
    const enemyTotal = wave0.spawns.reduce((s, x) => s + x.count, 0);
    const obstacleTotal = (wave0.obstacleSpawns ?? []).reduce((s, x) => s + x.count, 0);

    // Fire only enemy-spawn entries: they are scheduled BEFORE obstacle entries
    // in advance(), so the first `enemyTotal` items are enemy spawns.
    const enemyEntries = scene.time.queue.slice(0, enemyTotal);
    for (const entry of enemyEntries) {
      entry.fired = true;
      entry.callback();
    }
    // Obstacles haven't fired yet, but allSpawnsFired only tracks enemies.
    expect(wm.allSpawnsFired()).toBe(true);
    expect(obstacleTotal).toBeGreaterThan(0); // sanity: the fixture really has obstacles
  });
});

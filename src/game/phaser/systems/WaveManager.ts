import * as Phaser from "phaser";
import type {
  MissionId,
  ObstacleSpawn,
  WaveDefinition,
  WaveSpawn
} from "@/types/game";
import type { BulletPool } from "../entities/Bullet";
import type { EnemyPool } from "../entities/Enemy";
import type { ObstaclePool } from "../entities/Obstacle";
import { VIRTUAL_WIDTH } from "../config";
import { emit } from "../events";
import { getWavesForMission } from "../../data/waves";

export { getWavesForMission };

export class WaveManager {
  private readonly scene: Phaser.Scene;
  private readonly enemies: EnemyPool;
  private readonly enemyBullets: BulletPool;
  private readonly obstacles: ObstaclePool | null;
  private readonly getPlayer: () => { x: number; y: number } | null;
  private readonly waves: readonly WaveDefinition[];
  private waveIndex = -1;
  // Counters for the current wave so CombatScene can short-circuit the
  // wave's durationMs once nothing is pending and the field is clear.
  // Critical for boss fights: the boss wave used to be padded to 110s so
  // the boss had time to die, which left the player staring at an empty
  // sky for ~80s after killing it.
  // Counters track ENEMY spawns only — obstacles can't be killed and don't
  // gate wave completion. The "clear" condition is "all enemies dead",
  // unchanged by obstacles.
  private scheduledThisWave = 0;
  private firedThisWave = 0;
  private completed = false;

  constructor(
    scene: Phaser.Scene,
    enemies: EnemyPool,
    enemyBullets: BulletPool,
    getPlayer: () => { x: number; y: number } | null,
    missionId: MissionId,
    obstacles: ObstaclePool | null = null
  ) {
    this.scene = scene;
    this.enemies = enemies;
    this.enemyBullets = enemyBullets;
    this.obstacles = obstacles;
    this.getPlayer = getPlayer;
    this.waves = getWavesForMission(missionId);
  }

  start(): void {
    this.advance();
  }

  hasMoreWaves(): boolean {
    return this.waveIndex < this.waves.length - 1;
  }

  isOnLastWave(): boolean {
    return this.waveIndex >= this.waves.length - 1;
  }

  // Every spawn scheduled by the current wave has fired. Once this is true
  // and no enemies remain on screen, the wave can be considered over —
  // CombatScene polls this in its update loop.
  allSpawnsFired(): boolean {
    return this.firedThisWave >= this.scheduledThisWave;
  }

  // Idempotent fast-forward to allWavesComplete. Used by CombatScene when
  // it detects the last wave's spawns are exhausted and the field is clear,
  // so we don't wait for the durationMs timer.
  finishEarly(): void {
    if (this.completed) return;
    this.completed = true;
    emit(this.scene, { type: "allWavesComplete" });
  }

  private advance(): void {
    this.waveIndex += 1;
    const wave = this.waves[this.waveIndex];
    if (!wave) {
      this.finishEarly();
      return;
    }

    this.scheduledThisWave = 0;
    this.firedThisWave = 0;
    for (const spawn of wave.spawns) this.schedule(spawn);
    if (this.obstacles) {
      for (const spawn of wave.obstacleSpawns ?? []) this.scheduleObstacle(spawn);
    }

    this.scene.time.delayedCall(wave.durationMs, () => {
      // Per-wave completion has no live consumer; only the terminal
      // allWavesComplete is observed by CombatScene.
      if (this.completed) return;
      if (this.hasMoreWaves()) {
        this.advance();
      } else {
        this.finishEarly();
      }
    });
  }

  private schedule(spawn: WaveSpawn): void {
    for (let i = 0; i < spawn.count; i++) {
      this.scheduledThisWave += 1;
      const delay = spawn.delayMs + i * spawn.intervalMs;
      this.scene.time.delayedCall(delay, () => {
        this.spawnOne(spawn, i);
        this.firedThisWave += 1;
      });
    }
  }

  private scheduleObstacle(spawn: ObstacleSpawn): void {
    // Obstacles do NOT increment scheduledThisWave / firedThisWave — the
    // wave-complete predicate gates on enemies only.
    for (let i = 0; i < spawn.count; i++) {
      const delay = spawn.delayMs + i * spawn.intervalMs;
      this.scene.time.delayedCall(delay, () => {
        this.spawnOneObstacle(spawn, i);
      });
    }
  }

  private spawnOne(spawn: WaveSpawn, index: number): void {
    const baseX = spawn.xPercent * VIRTUAL_WIDTH;
    let x = baseX;
    const y = -30;

    switch (spawn.formation) {
      case "line":
        x = baseX - 60 + (index % 5) * 30;
        break;
      case "vee":
        x = baseX + ((index % 2 === 0 ? 1 : -1) * Math.ceil(index / 2) * 50);
        break;
      case "scatter":
        x = baseX - 180 + Math.random() * 360;
        break;
      case "column":
        x = baseX;
        break;
    }

    const clampedX = Phaser.Math.Clamp(x, 40, VIRTUAL_WIDTH - 40);
    this.enemies.spawn(spawn.enemy, clampedX, y, {
      getPlayer: this.getPlayer,
      enemyBullets: this.enemyBullets
    });
  }

  private spawnOneObstacle(spawn: ObstacleSpawn, index: number): void {
    if (!this.obstacles) return;
    const baseX = spawn.xPercent * VIRTUAL_WIDTH;
    let x = baseX;
    const y = -40;

    switch (spawn.formation) {
      case "line":
        x = baseX - 60 + (index % 5) * 30;
        break;
      case "scatter":
        x = baseX - 180 + Math.random() * 360;
        break;
      case "column":
        x = baseX;
        break;
    }

    const clampedX = Phaser.Math.Clamp(x, 40, VIRTUAL_WIDTH - 40);
    this.obstacles.spawn(spawn.obstacle, clampedX, y);
  }
}

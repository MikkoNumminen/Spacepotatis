import * as Phaser from "phaser";
import type { MissionId, WaveDefinition, WaveSpawn } from "@/types/game";
import type { BulletPool } from "../entities/Bullet";
import type { EnemyPool } from "../entities/Enemy";
import { VIRTUAL_WIDTH } from "../config";
import { getWavesForMission } from "../../data/waves";

export { getWavesForMission };

export class WaveManager {
  private readonly scene: Phaser.Scene;
  private readonly enemies: EnemyPool;
  private readonly enemyBullets: BulletPool;
  private readonly getPlayer: () => { x: number; y: number } | null;
  private readonly waves: readonly WaveDefinition[];
  private waveIndex = -1;

  constructor(
    scene: Phaser.Scene,
    enemies: EnemyPool,
    enemyBullets: BulletPool,
    getPlayer: () => { x: number; y: number } | null,
    missionId: MissionId
  ) {
    this.scene = scene;
    this.enemies = enemies;
    this.enemyBullets = enemyBullets;
    this.getPlayer = getPlayer;
    this.waves = getWavesForMission(missionId);
  }

  start(): void {
    this.advance();
  }

  hasMoreWaves(): boolean {
    return this.waveIndex < this.waves.length - 1;
  }

  private advance(): void {
    this.waveIndex += 1;
    const wave = this.waves[this.waveIndex];
    if (!wave) {
      this.scene.events.emit("allWavesComplete");
      return;
    }

    for (const spawn of wave.spawns) this.schedule(spawn);

    this.scene.time.delayedCall(wave.durationMs, () => {
      this.scene.events.emit("waveComplete", wave.id);
      if (this.hasMoreWaves()) {
        this.advance();
      } else {
        this.scene.events.emit("allWavesComplete");
      }
    });
  }

  private schedule(spawn: WaveSpawn): void {
    for (let i = 0; i < spawn.count; i++) {
      const delay = spawn.delayMs + i * spawn.intervalMs;
      this.scene.time.delayedCall(delay, () => this.spawnOne(spawn, i));
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
}

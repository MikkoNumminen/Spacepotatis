import * as Phaser from "phaser";
import type { CombatSummary, BootData } from "../config";
import { SCENE_KEYS, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";
import { BulletPool } from "../entities/Bullet";
import { EnemyPool } from "../entities/Enemy";
import type { Enemy } from "../entities/Enemy";
import { Player } from "../entities/Player";
import * as GameState from "@/game/state/GameState";
import { PAUSE_SCENE_KEY } from "./PauseScene";
import { sfx } from "@/game/audio/sfx";
import { PowerUpPool, type PowerUp, type PowerUpKind } from "../entities/PowerUp";
import { WaveManager } from "../systems/WaveManager";
import { wireCollisions } from "../systems/CollisionSystem";
import { ScoreSystem } from "../systems/ScoreSystem";

const DROP_CHANCE = 0.18;

export class CombatScene extends Phaser.Scene {
  private bootData!: BootData;
  private player!: Player;
  private playerBullets!: BulletPool;
  private enemyBullets!: BulletPool;
  private enemies!: EnemyPool;
  private powerUps!: PowerUpPool;
  private waves!: WaveManager;
  private score!: ScoreSystem;

  private startedAt = 0;
  private allWavesDone = false;
  private finished = false;

  // HUD
  private scoreText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private shieldBar!: Phaser.GameObjects.Graphics;
  private armorBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE_KEYS.Combat);
  }

  init(data: BootData): void {
    this.bootData = data;
    this.allWavesDone = false;
    this.finished = false;
  }

  create(): void {
    this.physics.world.setBounds(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    this.drawBackground();

    this.playerBullets = new BulletPool(this, 200);
    this.enemyBullets = new BulletPool(this, 160);
    this.enemies = new EnemyPool(this);
    this.powerUps = new PowerUpPool(this);

    this.player = new Player(
      this,
      VIRTUAL_WIDTH / 2,
      VIRTUAL_HEIGHT - 100,
      this.playerBullets,
      GameState.getState().ship
    );

    this.score = new ScoreSystem();

    const getPlayerPos = () => (this.player.active ? { x: this.player.x, y: this.player.y } : null);

    wireCollisions(
      this,
      this.player,
      this.playerBullets,
      this.enemyBullets,
      this.enemies,
      this.powerUps,
      {
        onEnemyHit: (enemy, _bullet, killed) => {
          if (killed) this.handleEnemyKilled(enemy);
        },
        onPlayerHitByBullet: (bullet) => this.player.takeDamage(bullet.damage),
        onPlayerTouchEnemy: (enemy) => this.player.takeDamage(enemy.definition.collisionDamage),
        onPlayerGetPowerUp: (power) => this.applyPowerUp(power)
      }
    );

    this.waves = new WaveManager(
      this,
      this.enemies,
      this.enemyBullets,
      getPlayerPos,
      this.bootData.missionId
    );

    this.events.on("allWavesComplete", () => {
      this.allWavesDone = true;
    });

    this.events.on("playerDied", () => this.finish(false));
    this.events.on("abandon", () => this.finish(false));

    this.input.keyboard?.on("keydown-P", () => this.togglePause());
    this.input.keyboard?.on("keydown-ESC", () => this.togglePause());

    this.buildHud();

    this.startedAt = this.time.now;
    this.waves.start();
  }

  override update(time: number, _delta: number): void {
    if (this.finished) return;
    this.score.tick(time);
    this.updateHud();

    if (this.allWavesDone && this.enemies.countActive(true) === 0) {
      this.finish(true);
    }
  }

  private drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0b0d1c, 1);
    g.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    // Simple starfield underlay.
    g.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 80; i++) {
      g.fillCircle(Math.random() * VIRTUAL_WIDTH, Math.random() * VIRTUAL_HEIGHT, Math.random() * 1.4);
    }
  }

  private buildHud(): void {
    this.scoreText = this.add.text(16, 12, "SCORE 0", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#5effa7"
    });
    this.creditsText = this.add.text(16, 32, "¢ 0", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffcc33"
    });
    this.shieldBar = this.add.graphics();
    this.armorBar = this.add.graphics();
  }

  private updateHud(): void {
    this.scoreText.setText(`SCORE ${this.score.score}  x${this.score.combo}`);
    this.creditsText.setText(`¢ ${this.score.credits}`);

    const barX = VIRTUAL_WIDTH - 220;
    const barY = 16;
    const barW = 200;
    const barH = 10;

    this.shieldBar.clear();
    this.shieldBar.fillStyle(0x1f2340, 1);
    this.shieldBar.fillRect(barX, barY, barW, barH);
    this.shieldBar.fillStyle(0x4fd1ff, 1);
    this.shieldBar.fillRect(
      barX,
      barY,
      (this.player.shield / this.player.maxShield) * barW,
      barH
    );

    this.armorBar.clear();
    this.armorBar.fillStyle(0x1f2340, 1);
    this.armorBar.fillRect(barX, barY + 14, barW, barH);
    this.armorBar.fillStyle(0xff4d6d, 1);
    this.armorBar.fillRect(
      barX,
      barY + 14,
      (this.player.armor / this.player.maxArmor) * barW,
      barH
    );
  }

  private handleEnemyKilled(enemy: Enemy): void {
    const def = enemy.definition;
    this.score.addKill(def.scoreValue, def.creditValue, this.time.now);

    sfx.explosion();

    if (Math.random() < DROP_CHANCE) {
      const roll = Math.random();
      const kind: PowerUpKind = roll < 0.5 ? "credit" : roll < 0.8 ? "shield" : "weapon";
      this.powerUps.spawn(kind, enemy.x, enemy.y);
    }

    this.emitExplosionParticles(enemy.x, enemy.y, def.behavior === "boss" ? 48 : 14);
  }

  private emitExplosionParticles(x: number, y: number, count: number): void {
    const emitter = this.add.particles(x, y, "particle-spark", {
      speed: { min: 60, max: 260 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 240, max: 520 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: count,
      emitting: false
    });
    emitter.explode(count);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  private applyPowerUp(power: PowerUp): void {
    sfx.pickup();
    switch (power.kind) {
      case "shield":
        this.player.shield = Math.min(
          this.player.maxShield,
          this.player.shield + this.player.maxShield * 0.5
        );
        break;
      case "credit":
        this.score.addCredits(25);
        break;
      case "weapon":
        this.player.setWeapon(this.nextWeapon());
        break;
    }
  }

  private nextWeapon(): "rapid-fire" | "spread-shot" | "heavy-cannon" {
    const cycle: Array<"rapid-fire" | "spread-shot" | "heavy-cannon"> = [
      "rapid-fire",
      "spread-shot",
      "heavy-cannon"
    ];
    const idx = cycle.indexOf(this.player.getWeapon());
    return cycle[(idx + 1) % cycle.length] ?? "rapid-fire";
  }

  private togglePause(): void {
    if (this.finished) return;
    if (this.scene.isPaused()) return; // PauseScene owns the resume key
    this.scene.launch(PAUSE_SCENE_KEY, { combatKey: SCENE_KEYS.Combat });
    this.scene.pause();
  }

  private finish(victory: boolean): void {
    if (this.finished) return;
    this.finished = true;

    const timeSeconds = Math.round((this.time.now - this.startedAt) / 1000);
    const summary: CombatSummary = {
      missionId: this.bootData.missionId,
      score: this.score.score,
      credits: this.score.credits,
      timeSeconds,
      victory
    };
    this.registry.set("summary", summary);

    GameState.addPlayedTime(timeSeconds);
    if (victory) {
      GameState.addCredits(this.score.credits);
      GameState.completeMission(this.bootData.missionId);
    }

    this.time.delayedCall(500, () => {
      this.scene.start(SCENE_KEYS.Result, this.bootData);
    });
  }
}

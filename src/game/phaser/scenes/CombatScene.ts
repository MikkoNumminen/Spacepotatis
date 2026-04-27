import * as Phaser from "phaser";
import type { CombatSummary, BootData } from "../config";
import { SCENE_KEYS, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";
import { BulletPool } from "../entities/Bullet";
import { EnemyPool } from "../entities/Enemy";
import type { Enemy } from "../entities/Enemy";
import { Player } from "../entities/Player";
import * as GameState from "@/game/state/GameState";
import { on } from "../events";
import { setSummary } from "../registry";
import { sfx } from "@/game/audio/sfx";
import { PowerUpPool } from "../entities/PowerUp";
import { PERKS, type PerkId } from "../../data/perks";
import { WaveManager } from "../systems/WaveManager";
import { wireCollisions } from "../systems/CollisionSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { CombatVfx } from "./combat/CombatVfx";
import { CombatHud } from "./combat/CombatHud";
import { DropController } from "./combat/DropController";

export class CombatScene extends Phaser.Scene {
  private bootData!: BootData;
  private player!: Player;
  private playerBullets!: BulletPool;
  private enemyBullets!: BulletPool;
  private enemies!: EnemyPool;
  private powerUps!: PowerUpPool;
  private waves!: WaveManager;
  private score!: ScoreSystem;
  private vfx!: CombatVfx;
  private hud!: CombatHud;
  private dropController!: DropController;

  private startedAt = 0;
  private allWavesDone = false;
  private finished = false;

  // Mission-only perk state. Reset on every CombatScene boot.
  private empCharges = 0;
  private activePerks: Set<PerkId> = new Set();

  constructor() {
    super(SCENE_KEYS.Combat);
  }

  init(data: BootData): void {
    this.bootData = data;
    this.allWavesDone = false;
    this.finished = false;
    this.empCharges = 0;
    this.activePerks = new Set();
  }

  create(): void {
    this.physics.world.setBounds(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    this.vfx = new CombatVfx(this);
    this.vfx.drawBackground();

    // Friendly bullets (Spud Missile etc.) home toward the closest active
    // enemy; the closure resolves `this.enemies` lazily so construction order
    // here doesn't matter.
    this.playerBullets = new BulletPool(this, 200, {
      findTarget: (x, y) => this.vfx.findClosestEnemyTo(this.enemies, x, y)
    });
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

    this.dropController = new DropController(
      this,
      this.bootData.missionId,
      this.powerUps,
      () => this.player,
      () => this.score,
      (perkId, x, y) => this.applyPerk(perkId, x, y)
    );

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
        onPlayerGetPowerUp: (power) => this.dropController.applyPowerUp(power)
      }
    );

    this.waves = new WaveManager(
      this,
      this.enemies,
      this.enemyBullets,
      getPlayerPos,
      this.bootData.missionId
    );

    on(this, "allWavesComplete", () => {
      this.allWavesDone = true;
    });

    on(this, "playerDied", () => this.finish(false));
    on(this, "abandon", () => this.finish(false));

    this.input.keyboard?.on("keydown-P", () => this.togglePause());
    this.input.keyboard?.on("keydown-ESC", () => this.togglePause());
    this.input.keyboard?.on("keydown-CTRL", () => this.useActivePerk());

    this.hud = new CombatHud(this, () => ({
      score: this.score.score,
      combo: this.score.combo,
      credits: this.score.credits,
      shield: this.player.shield,
      maxShield: this.player.maxShield,
      armor: this.player.armor,
      maxArmor: this.player.maxArmor,
      energy: this.player.energy,
      maxEnergy: this.player.maxEnergy,
      activePerks: this.activePerks,
      empCharges: this.empCharges
    }));
    this.hud.build();

    this.startedAt = this.time.now;
    this.waves.start();
  }

  override update(time: number, _delta: number): void {
    if (this.finished) return;
    this.score.tick(time);
    this.hud.update();

    if (this.allWavesDone && this.enemies.countActive(true) === 0) {
      this.finish(true);
    } else if (
      this.waves.isOnLastWave() &&
      this.waves.allSpawnsFired() &&
      this.enemies.countActive(true) === 0
    ) {
      // Boss missions used to pad the boss wave's durationMs to ~110s so the
      // boss had time to die. After the kill, the player would stare at an
      // empty sky for the rest of the timer. Short-circuit it here: if the
      // last wave's spawns are all out and the field is clear, finish now.
      this.waves.finishEarly();
    }
  }

  private handleEnemyKilled(enemy: Enemy): void {
    const def = enemy.definition;
    this.score.addKill(def.scoreValue, def.creditValue, this.time.now);

    sfx.explosion();

    this.dropController.maybeDrop(enemy);

    this.vfx.emitExplosionParticles(enemy.x, enemy.y, def.behavior === "boss" ? 48 : 14);
  }

  private applyPerk(perkId: PerkId, x: number, y: number): void {
    const def = PERKS[perkId];
    switch (perkId) {
      case "overdrive":
        this.player.hasOverdrive = true;
        break;
      case "hardened":
        this.player.hasHardened = true;
        break;
      case "emp":
        this.empCharges += 1;
        break;
    }
    this.activePerks.add(perkId);
    this.dropController.flashPickup(`+ ${def.name.toUpperCase()}`, def.tint, x, y, "mission");
    this.hud.refreshPerkChips();
  }

  private useActivePerk(): void {
    if (this.empCharges <= 0) return;
    this.empCharges -= 1;
    this.detonateEmp();
    if (this.empCharges <= 0) this.activePerks.delete("emp");
    this.hud.refreshPerkChips();
  }

  private detonateEmp(): void {
    // Clear every active enemy bullet on screen.
    this.enemyBullets.children.iterate((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.active) b.disableBody(true, true);
      return true;
    });
    // Visual flash centred on the player.
    const flash = this.add.graphics();
    flash.fillStyle(PERKS.emp.tint, 0.45);
    flash.fillCircle(this.player.x, this.player.y, 24);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      scale: 28,
      alpha: 0,
      duration: 480,
      ease: "cubic.out",
      onComplete: () => flash.destroy()
    });
    this.cameras.main.flash(120, 255, 200, 240, false);
    sfx.explosion();
  }

  private togglePause(): void {
    if (this.finished) return;
    if (this.scene.isPaused()) return; // PauseScene owns the resume key
    this.scene.launch(SCENE_KEYS.Pause, { combatKey: SCENE_KEYS.Combat });
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
    setSummary(this.game, summary);

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

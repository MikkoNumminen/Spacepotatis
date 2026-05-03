import * as Phaser from "phaser";
import type { CombatSummary, BootData } from "../config";
import { SCENE_KEYS, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from "../config";
import { BulletPool } from "../entities/Bullet";
import type { Bullet } from "../entities/Bullet";
import { EnemyPool } from "../entities/Enemy";
import type { Enemy } from "../entities/Enemy";
import { ObstaclePool } from "../entities/Obstacle";
import { Player } from "../entities/Player";
import * as GameState from "@/game/state/GameState";
import { on } from "../events";
import { setSummary } from "../registry";
import { sfx } from "@/game/audio/sfx";
import { combatMusic } from "@/game/audio/music";
import { getMission } from "@/game/data/missions";
import { applyMissionReward, rollMissionReward } from "@/game/state/rewards";
import { PowerUpPool } from "../entities/PowerUp";
import { WaveManager } from "../systems/WaveManager";
import { wireCollisions } from "../systems/CollisionSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { CombatVfx } from "./combat/CombatVfx";
import { CombatHud } from "./combat/CombatHud";
import { DropController } from "./combat/DropController";
import { PerkController } from "./combat/PerkController";

export class CombatScene extends Phaser.Scene {
  private bootData!: BootData;
  private player!: Player;
  private playerBullets!: BulletPool;
  private enemyBullets!: BulletPool;
  private enemies!: EnemyPool;
  private obstacles!: ObstaclePool;
  private powerUps!: PowerUpPool;
  private waves!: WaveManager;
  private score!: ScoreSystem;
  private vfx!: CombatVfx;
  private hud!: CombatHud;
  private dropController!: DropController;
  private perks!: PerkController;

  private startedAt = 0;
  private allWavesDone = false;
  private finished = false;

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
    this.obstacles = new ObstaclePool(this);
    this.powerUps = new PowerUpPool(this);

    this.player = new Player(
      this,
      VIRTUAL_WIDTH / 2,
      VIRTUAL_HEIGHT - 100,
      this.playerBullets,
      GameState.getState().ship
    );

    this.score = new ScoreSystem();

    // PerkController and DropController have a circular handshake: drops can
    // grant perks (perk pickup), and applying a perk uses dropController's
    // pickup-flash routine. Both controllers receive lazy accessors for the
    // pieces they didn't construct yet.
    this.perks = new PerkController(
      this,
      () => this.player,
      () => this.enemyBullets,
      (text, color, x, y) => this.dropController.flashPickup(text, color, x, y, "mission"),
      () => this.hud.refreshPerkChips()
    );
    this.dropController = new DropController(
      this,
      this.bootData.missionId,
      this.powerUps,
      () => this.player,
      () => this.score,
      (perkId, x, y) => this.perks.apply(perkId, x, y)
    );

    this.hud = new CombatHud(this, () => {
      const perkState = this.perks.getState();
      return {
        score: this.score.score,
        combo: this.score.combo,
        credits: this.score.credits,
        shield: this.player.shield,
        maxShield: this.player.maxShield,
        armor: this.player.armor,
        maxArmor: this.player.maxArmor,
        energy: this.player.energy,
        maxEnergy: this.player.maxEnergy,
        activePerks: perkState.activePerks,
        empCharges: perkState.empCharges
      };
    });
    this.hud.build();

    const getPlayerPos = () => (this.player.active ? { x: this.player.x, y: this.player.y } : null);

    wireCollisions(
      this,
      this.player,
      this.playerBullets,
      this.enemyBullets,
      this.enemies,
      this.powerUps,
      {
        onEnemyHit: (enemy, bullet, killed) => {
          this.vfx.floatDamageNumber(enemy.x, enemy.y, bullet.damage);
          // Secondary effect: AoE explosion + slow tag. Runs even when the
          // direct hit killed the primary target — pirate explosives are
          // supposed to clear adjacent threats whether or not the bullet's
          // target survives.
          if (bullet.effect.explosionRadius > 0 || bullet.effect.slowFactor > 0) {
            this.applyBulletAoE(enemy, bullet);
          }
          if (killed) this.handleEnemyKilled(enemy);
        },
        onPlayerHitByBullet: (bullet) => this.player.takeDamage(bullet.damage),
        onPlayerTouchEnemy: (enemy) => this.player.takeDamage(enemy.definition.collisionDamage),
        onPlayerGetPowerUp: (power) => this.dropController.applyPowerUp(power),
        onPlayerHitByObstacle: (obstacle) =>
          this.player.takeDamage(obstacle.definition.collisionDamage)
      },
      this.obstacles
    );

    this.waves = new WaveManager(
      this,
      this.enemies,
      this.enemyBullets,
      getPlayerPos,
      this.bootData.missionId,
      this.obstacles
    );

    on(this, "allWavesComplete", () => {
      this.allWavesDone = true;
    });
    on(this, "playerDied", () => this.finish(false));
    on(this, "abandon", () => this.finish(false));

    this.input.keyboard?.on("keydown-P", () => this.togglePause());
    this.input.keyboard?.on("keydown-ESC", () => this.togglePause());
    this.input.keyboard?.on("keydown-CTRL", () => this.perks.triggerActive());

    // Start the mission's music bed if one is declared. loadTrack() handles
    // the cross-fade if the previous mission left a track loaded; missing
    // audio files (mission has musicTrack but no asset shipped yet) fail
    // silently in startPlayback().
    const mission = getMission(this.bootData.missionId);
    combatMusic.loadTrack(mission.musicTrack);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => combatMusic.stop());

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

  // AoE pass: damages OTHER enemies inside bullet.effect.explosionRadius and
  // (when slowFactor > 0) re-stamps a slow on every enemy in radius including
  // the primary target — the snare's whole point is "everything around the
  // impact slows down". Runs once per friendly bullet hit; the bullet is
  // already deactivated by CollisionSystem before this fires, so there's no
  // chance of double-counting.
  private applyBulletAoE(primary: Enemy, bullet: Bullet): void {
    const { explosionRadius, explosionDamage, slowFactor, slowDurationMs } = bullet.effect;
    const now = this.time.now;
    if (explosionRadius <= 0) {
      // Slow-only path (no current weapon uses it; keeps the engine honest).
      if (slowFactor > 0 && slowDurationMs > 0) {
        primary.applySlow(slowFactor, slowDurationMs, now);
      }
      return;
    }
    const radiusSq = explosionRadius * explosionRadius;
    const cx = primary.x;
    const cy = primary.y;
    if (slowFactor > 0 && slowDurationMs > 0) {
      primary.applySlow(slowFactor, slowDurationMs, now);
    }
    this.enemies.children.iterate((child) => {
      const e = child as Enemy;
      if (!e.active || e === primary) return true;
      const dx = e.x - cx;
      const dy = e.y - cy;
      if (dx * dx + dy * dy > radiusSq) return true;
      if (explosionDamage > 0) {
        const killed = e.takeDamage(explosionDamage);
        this.vfx.floatDamageNumber(e.x, e.y, explosionDamage);
        if (killed) this.handleEnemyKilled(e);
      }
      if (slowFactor > 0 && slowDurationMs > 0) {
        e.applySlow(slowFactor, slowDurationMs, now);
      }
      return true;
    });
    // Visual: small particle burst at the impact center so AoE is legible.
    this.vfx.emitExplosionParticles(cx, cy, 12);
  }

  private handleEnemyKilled(enemy: Enemy): void {
    const def = enemy.definition;
    this.score.addKill(def.scoreValue, def.creditValue, this.time.now);

    sfx.explosion();

    this.dropController.maybeDrop(enemy);

    this.vfx.emitExplosionParticles(enemy.x, enemy.y, def.behavior === "boss" ? 48 : 14);
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

    GameState.addPlayedTime(timeSeconds);
    if (victory) {
      GameState.addCredits(this.score.credits);
      // First clear pulls a random reward from the mission's solar-system
      // loot pool; replays still earn the kill credits above but no bonus.
      // Order matters: roll BEFORE completeMission so the freshness check
      // sees the pre-completion state.
      if (!GameState.isMissionCompleted(this.bootData.missionId)) {
        const mission = getMission(this.bootData.missionId);
        const reward = rollMissionReward(
          mission.solarSystemId,
          GameState.getState().ship
        );
        applyMissionReward(reward);
        summary.firstClearReward = reward;
      }
      GameState.completeMission(this.bootData.missionId);
    }
    setSummary(this.game, summary);

    this.time.delayedCall(350, () => {
      this.bootData.onComplete();
    });
  }
}

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
import {
  PowerUpPool,
  isPerkKind,
  type PowerUp,
  type PowerUpKind,
  type PermanentPowerUpKind
} from "../entities/PowerUp";
import { PERKS, randomPerkId, type PerkId } from "../data/perks";
import { WaveManager } from "../systems/WaveManager";
import { wireCollisions } from "../systems/CollisionSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { getWeapon } from "../data/weapons";
import missionsData from "../data/missions.json";
import type { MissionDefinition } from "@/types/game";

const MISSIONS = missionsData.missions as readonly MissionDefinition[];

function hexToInt(hex: string): number {
  return parseInt(hex.replace(/^#/, ""), 16);
}

const DROP_CHANCE = 0.18;
// Of any drop, 25% is a mission perk (rare). Remaining 75% splits across
// the permanent powerups with the existing weights.
const PERK_DROP_SHARE = 0.25;

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
  private energyBar!: Phaser.GameObjects.Graphics;
  private energyText!: Phaser.GameObjects.Text;
  private perkChipsLayer!: Phaser.GameObjects.Container;

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

    this.drawBackground();

    // Friendly bullets (Spud Missile etc.) home toward the closest active
    // enemy; the closure resolves `this.enemies` lazily so construction order
    // here doesn't matter.
    this.playerBullets = new BulletPool(this, 200, {
      findTarget: (x, y) => this.findClosestEnemyTo(x, y)
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
    this.input.keyboard?.on("keydown-CTRL", () => this.useActivePerk());

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
    this.energyBar = this.add.graphics();
    this.energyText = this.add.text(VIRTUAL_WIDTH - 220, 44, "", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffcc33"
    });
    this.perkChipsLayer = this.add.container(VIRTUAL_WIDTH - 188, 62);
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

    // Reactor energy bar. Color shifts amber -> orange -> red as energy
    // drains, and the bar pulses below 25% so the player notices BEFORE
    // they spam-fire and find a slot mute on cooldown.
    const energyRatio = this.player.energy / this.player.maxEnergy;
    const energyColor =
      energyRatio > 0.5 ? 0xffcc33 : energyRatio > 0.25 ? 0xff9933 : 0xff4d6d;
    const lowEnergy = energyRatio < 0.25;
    const pulse = lowEnergy ? 0.55 + 0.45 * Math.sin(this.time.now / 120) : 1;

    this.energyBar.clear();
    this.energyBar.fillStyle(0x1f2340, 1);
    this.energyBar.fillRect(barX, barY + 28, barW, barH);
    this.energyBar.fillStyle(energyColor, pulse);
    this.energyBar.fillRect(barX, barY + 28, energyRatio * barW, barH);
    // Thin outline so the bar reads as a discrete UI element rather than a
    // floating colored rectangle.
    this.energyBar.lineStyle(1, 0x444a6a, 0.8);
    this.energyBar.strokeRect(barX, barY + 28, barW, barH);

    // ASCII-only label so the readout renders identically on every platform —
    // the previous bolt glyph (U+26A1) needed an emoji-capable font that
    // monospace fallbacks don't always provide.
    this.energyText.setText(
      `EN ${Math.round(this.player.energy)} / ${this.player.maxEnergy}`
    );
    this.energyText.setColor(lowEnergy ? "#ff8888" : "#ffcc33");
  }

  private handleEnemyKilled(enemy: Enemy): void {
    const def = enemy.definition;
    this.score.addKill(def.scoreValue, def.creditValue, this.time.now);

    sfx.explosion();

    if (Math.random() < DROP_CHANCE) {
      const kind: PowerUpKind = this.rollDrop();
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
    if (isPerkKind(power.kind)) {
      this.applyPerk(power.kind.perk, power.x, power.y);
      return;
    }
    switch (power.kind) {
      case "shield":
        this.player.shield = Math.min(
          this.player.maxShield,
          this.player.shield + this.player.maxShield * 0.5
        );
        this.flashPickup("+ SHIELD", 0x4fd1ff, power.x, power.y, "potato");
        break;
      case "credit":
        this.score.addCredits(25);
        this.flashPickup("+ ¢25", 0xffcc33, power.x, power.y, "potato");
        break;
      case "weapon": {
        const upgrade = this.nextWeaponUpgrade();
        if (upgrade) {
          // grantWeapon equips into the canonical slot for the weapon kind
          // (front for the existing pickup ladder). Mirror it onto the live
          // Player so the change takes effect without rebuilding the entity.
          GameState.grantWeapon(upgrade.id);
          this.player.setSlotWeapon("front", upgrade.id);
          this.flashPickup(`+ ${upgrade.name.toUpperCase()}`, hexToInt(upgrade.tint), power.x, power.y, "potato");
        } else {
          // Already maxed on weapons — convert pickup to credits so the player
          // is never penalized by a duplicate.
          this.score.addCredits(50);
          this.flashPickup("+ ¢50", 0xffcc33, power.x, power.y, "potato");
        }
        break;
      }
    }
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
    this.flashPickup(`+ ${def.name.toUpperCase()}`, def.tint, x, y, "mission");
    this.refreshPerkChips();
  }

  private rollDrop(): PowerUpKind {
    const mission = MISSIONS.find((m) => m.id === this.bootData.missionId);
    const perksAllowed = mission?.perksAllowed === true;
    if (perksAllowed && Math.random() < PERK_DROP_SHARE) {
      return { perk: randomPerkId() };
    }
    const roll = Math.random();
    const kind: PermanentPowerUpKind = roll < 0.5 ? "credit" : roll < 0.8 ? "shield" : "weapon";
    return kind;
  }

  private useActivePerk(): void {
    if (this.empCharges <= 0) return;
    this.empCharges -= 1;
    this.detonateEmp();
    if (this.empCharges <= 0) this.activePerks.delete("emp");
    this.refreshPerkChips();
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

  private flashPickup(
    text: string,
    color: number,
    x: number,
    y: number,
    category: "potato" | "mission" = "potato"
  ): void {
    const hex = `#${color.toString(16).padStart(6, "0")}`;
    const tag = category === "potato" ? "POTATO UPGRADE" : "MISSION ONLY";
    const tagColor = category === "potato" ? "#ffd66b" : "#ff66cc";

    const name = this.add.text(x, y - 14, text, {
      fontFamily: "monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: hex
    });
    name.setOrigin(0.5, 1);

    const subtitle = this.add.text(x, y, tag, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: tagColor
    });
    subtitle.setOrigin(0.5, 1);

    this.tweens.add({
      targets: [name, subtitle],
      y: `-=44`,
      alpha: 0,
      duration: 1100,
      ease: "cubic.out",
      onComplete: () => {
        name.destroy();
        subtitle.destroy();
      }
    });
  }

  private refreshPerkChips(): void {
    if (!this.perkChipsLayer) return;
    this.perkChipsLayer.removeAll(true);
    const chipHeight = 22;
    let y = 0;
    for (const perkId of this.activePerks) {
      const def = PERKS[perkId];
      const chip = this.add.container(0, y);
      const bg = this.add.graphics();
      bg.fillStyle(0x05060f, 0.85);
      bg.fillRoundedRect(0, 0, 168, chipHeight, 4);
      bg.lineStyle(1, def.tint, 0.9);
      bg.strokeRoundedRect(0, 0, 168, chipHeight, 4);
      const icon = this.add.image(14, chipHeight / 2, def.textureKey).setScale(0.7);
      const name = this.add.text(30, 4, def.name, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: `#${def.tint.toString(16).padStart(6, "0")}`
      });
      const hintText =
        def.type === "active"
          ? `CTRL × ${perkId === "emp" ? this.empCharges : 1}`
          : "PASSIVE";
      const hint = this.add.text(166, 4, hintText, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#a3b1c2"
      });
      hint.setOrigin(1, 0);
      chip.add([bg, icon, name, hint]);
      this.perkChipsLayer.add(chip);
      y += chipHeight + 4;
    }
  }

  // Weapon pickup progression: rapid → spread → heavy. Returns the next
  // weapon the player has NOT yet unlocked, or null if all are owned.
  // Future ship-weapon-modules slot into a separate side-mount system, not
  // this primary cycle.
  private nextWeaponUpgrade() {
    const order: Array<"rapid-fire" | "spread-shot" | "heavy-cannon"> = [
      "rapid-fire",
      "spread-shot",
      "heavy-cannon"
    ];
    const owned = new Set(GameState.getState().ship.unlockedWeapons);
    for (const id of order) {
      if (!owned.has(id)) return getWeapon(id);
    }
    return null;
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

  // Squared-distance scan over the active enemy group. Used by friendly
  // homing bullets — keeping it here (not on EnemyPool) because target
  // selection might evolve to factor in HP, threat, or screen position.
  private findClosestEnemyTo(x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDistSq = Infinity;
    this.enemies.children.iterate((child) => {
      const e = child as Phaser.Physics.Arcade.Sprite;
      if (!e.active) return true;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = { x: e.x, y: e.y };
      }
      return true;
    });
    return best;
  }
}

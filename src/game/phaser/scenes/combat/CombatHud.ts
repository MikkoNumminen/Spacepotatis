import * as Phaser from "phaser";
import { VIRTUAL_WIDTH } from "../../config";
import { PERKS, type PerkId } from "../../../data/perks";

export interface HudSnapshot {
  readonly score: number;
  readonly combo: number;
  readonly credits: number;
  readonly shield: number;
  readonly maxShield: number;
  readonly armor: number;
  readonly maxArmor: number;
  readonly energy: number;
  readonly maxEnergy: number;
  // Iteration order matches insertion — the chip stack mirrors the order the
  // player picked the perks up.
  readonly activePerks: ReadonlySet<PerkId>;
  readonly empCharges: number;
}

export class CombatHud {
  private scoreText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private shieldBar!: Phaser.GameObjects.Graphics;
  private armorBar!: Phaser.GameObjects.Graphics;
  private energyBar!: Phaser.GameObjects.Graphics;
  private energyText!: Phaser.GameObjects.Text;
  private perkChipsLayer!: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly snapshot: () => HudSnapshot
  ) {}

  build(): void {
    this.scoreText = this.scene.add.text(16, 12, "SCORE 0", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#5effa7"
    });
    this.creditsText = this.scene.add.text(16, 32, "¢ 0", {
      fontFamily: "monospace",
      fontSize: "14px",
      color: "#ffcc33"
    });
    this.shieldBar = this.scene.add.graphics();
    this.armorBar = this.scene.add.graphics();
    this.energyBar = this.scene.add.graphics();
    this.energyText = this.scene.add.text(VIRTUAL_WIDTH - 220, 44, "", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffcc33"
    });
    this.perkChipsLayer = this.scene.add.container(VIRTUAL_WIDTH - 188, 62);
  }

  update(): void {
    const s = this.snapshot();
    this.scoreText.setText(`SCORE ${s.score}  x${s.combo}`);
    this.creditsText.setText(`¢ ${s.credits}`);

    const barX = VIRTUAL_WIDTH - 220;
    const barY = 16;
    const barW = 200;
    const barH = 10;

    this.shieldBar.clear();
    this.shieldBar.fillStyle(0x1f2340, 1);
    this.shieldBar.fillRect(barX, barY, barW, barH);
    this.shieldBar.fillStyle(0x4fd1ff, 1);
    this.shieldBar.fillRect(barX, barY, (s.shield / s.maxShield) * barW, barH);

    this.armorBar.clear();
    this.armorBar.fillStyle(0x1f2340, 1);
    this.armorBar.fillRect(barX, barY + 14, barW, barH);
    this.armorBar.fillStyle(0xff4d6d, 1);
    this.armorBar.fillRect(barX, barY + 14, (s.armor / s.maxArmor) * barW, barH);

    // Reactor energy bar. Color shifts amber -> orange -> red as energy
    // drains, and the bar pulses below 25% so the player notices BEFORE
    // they spam-fire and find a slot mute on cooldown.
    const energyRatio = s.energy / s.maxEnergy;
    const energyColor =
      energyRatio > 0.5 ? 0xffcc33 : energyRatio > 0.25 ? 0xff9933 : 0xff4d6d;
    const lowEnergy = energyRatio < 0.25;
    const pulse = lowEnergy ? 0.55 + 0.45 * Math.sin(this.scene.time.now / 120) : 1;

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
    this.energyText.setText(`EN ${Math.round(s.energy)} / ${s.maxEnergy}`);
    this.energyText.setColor(lowEnergy ? "#ff8888" : "#ffcc33");
  }

  refreshPerkChips(): void {
    if (!this.perkChipsLayer) return;
    this.perkChipsLayer.removeAll(true);
    const s = this.snapshot();
    const chipHeight = 22;
    let y = 0;
    for (const perkId of s.activePerks) {
      const def = PERKS[perkId];
      const chip = this.scene.add.container(0, y);
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x05060f, 0.85);
      bg.fillRoundedRect(0, 0, 168, chipHeight, 4);
      bg.lineStyle(1, def.tint, 0.9);
      bg.strokeRoundedRect(0, 0, 168, chipHeight, 4);
      const icon = this.scene.add.image(14, chipHeight / 2, def.textureKey).setScale(0.7);
      const name = this.scene.add.text(30, 4, def.name, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: `#${def.tint.toString(16).padStart(6, "0")}`
      });
      const hintText =
        def.type === "active"
          ? `CTRL × ${perkId === "emp" ? s.empCharges : 1}`
          : "PASSIVE";
      const hint = this.scene.add.text(166, 4, hintText, {
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
}

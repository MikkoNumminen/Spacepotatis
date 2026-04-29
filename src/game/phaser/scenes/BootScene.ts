import * as Phaser from "phaser";
import { SCENE_KEYS, type BootData } from "../config";

// Generates placeholder textures programmatically so the game runs without
// any art assets shipped in /public. Drop real PNGs into public/sprites and
// this file becomes a proper asset preloader.
export class BootScene extends Phaser.Scene {
  private bootData!: BootData;

  constructor() {
    super(SCENE_KEYS.Boot);
  }

  init(data: BootData): void {
    this.bootData = data;
  }

  create(): void {
    this.generateTextures();
    this.scene.start(SCENE_KEYS.Combat, this.bootData);
  }

  private generateTextures(): void {
    this.drawPotatoShip("player-ship");

    this.drawBullet("bullet-friendly", 0x4fd1ff, 6, 18);
    this.drawBullet("bullet-hostile", 0xff4d6d, 8, 14);
    this.drawPotatoBullet("bullet-potato");
    this.drawIdahoPotatoBullet("bullet-potato-idaho");
    this.drawPotatoPod("pod-potato");

    this.drawAphid("enemy-aphid",       { size: 32, body: 0x9acd32, accent: 0x5a7d1a });
    this.drawAphid("enemy-aphid-giant", { size: 50, body: 0x88c020, accent: 0x3e5c10 });
    this.drawAphid("enemy-aphid-queen", { size: 60, body: 0x6fb320, accent: 0x3a4f0e, crown: 0xffcc33 });
    this.drawAphid("enemy-aphid-empress", { size: 110, body: 0xc8e030, accent: 0x4a5e10, crown: 0xffd84a });

    this.drawBeetle("enemy-beetle-scarab", { size: 44, body: 0x4a6b3a, accent: 0x223018, ornament: "dome",      ornamentColor: 0xb8d488 });
    this.drawBeetle("enemy-beetle-rhino",  { size: 46, body: 0x8b3a2a, accent: 0x4d1f15, ornament: "horn",      ornamentColor: 0x1a1008 });
    this.drawBeetle("enemy-beetle-stag",   { size: 50, body: 0x4a3a6b, accent: 0x231a36, ornament: "mandibles", ornamentColor: 0x140a22 });

    this.drawCaterpillar("enemy-caterpillar-hornworm", { segR: 9,  body: 0x6fb02a, accent: 0x2f4a14, segments: 6, hornColor: 0x2f4a14 });
    this.drawCaterpillar("enemy-caterpillar-army",     { segR: 8,  body: 0x4a5c1a, accent: 0x1f2810, segments: 5, stripeColor: 0xc0d050 });
    this.drawCaterpillar("enemy-caterpillar-monarch",  { segR: 18, body: 0xffd64a, accent: 0x1a1a1a, segments: 7, stripeColor: 0x1a1a1a });

    this.drawSpider("enemy-spider-wolf",   { size: 18, body: 0x6b4a2a, accent: 0x2e1f10 });
    this.drawSpider("enemy-spider-widow",  { size: 20, body: 0x141420, accent: 0x05050a, marking: { color: 0xd02020, kind: "hourglass" } });
    this.drawSpider("enemy-spider-jumper", { size: 12, body: 0x4a6a5a, accent: 0x1e2c25, marking: { color: 0x4fd1ff, kind: "eyes-large" } });

    this.drawDragonfly("enemy-dragonfly-common", { size: 38, body: 0x4fc1cf, accent: 0x1f5560, wing: 0xb0f0ff, wings: 2 });
    this.drawDragonfly("enemy-dragonfly-heli",   { size: 46, body: 0x2a8cb0, accent: 0x103040, wing: 0x80d8e8, wings: 4 });
    this.drawDragonfly("enemy-dragonfly-damsel", { size: 36, body: 0xc060d0, accent: 0x4a1a55, wing: 0xf5c8ff, wings: 2, slim: true });

    this.drawPotatoPowerUp("powerup-shield", 0x4fd1ff, "ring");
    this.drawPotatoPowerUp("powerup-credit", 0xffcc33, "coin");
    this.drawPotatoPowerUp("powerup-weapon", 0x5effa7, "gear");

    this.drawMissionPerk("perk-overdrive", 0xffaa33, "bolt");
    this.drawMissionPerk("perk-hardened", 0x66aaff, "hex");
    this.drawMissionPerk("perk-emp", 0xff66cc, "pulse");

    this.drawSpark("particle-spark", 6);
  }

  private drawPotatoPowerUp(
    key: string,
    iconColor: number,
    icon: "ring" | "coin" | "gear"
  ): void {
    const size = 36;
    const g = this.add.graphics();
    // Bright gold "potato seal" frame — signals permanent ship upgrade.
    g.fillStyle(0x05060f, 0.85);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.lineStyle(3, 0xffd66b, 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - 1);
    g.lineStyle(1, 0xffd66b, 0.4);
    g.strokeCircle(size / 2, size / 2, size / 2 - 4);
    // Tiny "P" tab at bottom-right to mark permanent.
    g.fillStyle(0xffd66b, 1);
    g.fillTriangle(size - 6, size - 6, size + 2, size - 2, size - 2, size + 2);
    // Inner icon.
    const cx = size / 2;
    const cy = size / 2 - 1;
    if (icon === "ring") {
      g.lineStyle(3, iconColor, 1);
      g.strokeCircle(cx, cy, 7);
    } else if (icon === "coin") {
      g.fillStyle(iconColor, 1);
      g.fillCircle(cx, cy, 7);
      g.lineStyle(1.5, 0x05060f, 0.6);
      g.strokeCircle(cx, cy, 7);
    } else {
      g.fillStyle(iconColor, 1);
      g.fillCircle(cx, cy, 7.5);
      g.fillStyle(0x05060f, 1);
      g.fillCircle(cx, cy, 3);
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawMissionPerk(
    key: string,
    iconColor: number,
    icon: "bolt" | "hex" | "pulse"
  ): void {
    const size = 36;
    const g = this.add.graphics();
    // Magenta star-like frame — signals temporary mission-only perk.
    g.fillStyle(0x05060f, 0.85);
    g.fillCircle(size / 2, size / 2, size / 2);
    const cx = size / 2;
    const cy = size / 2;
    // 8-point spiked frame instead of plain circle.
    g.lineStyle(2, 0xff66cc, 1);
    g.beginPath();
    const outerR = size / 2 - 1;
    const innerR = size / 2 - 4;
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / 8) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokePath();
    // Tiny "M" tab at bottom-right to mark mission-only.
    g.fillStyle(0xff66cc, 1);
    g.fillCircle(size - 4, size - 4, 3.5);
    // Inner icon.
    const ix = cx;
    const iy = cy;
    if (icon === "bolt") {
      g.fillStyle(iconColor, 1);
      g.beginPath();
      g.moveTo(ix + 2, iy - 8);
      g.lineTo(ix - 5, iy + 1);
      g.lineTo(ix - 1, iy + 1);
      g.lineTo(ix - 4, iy + 8);
      g.lineTo(ix + 5, iy - 1);
      g.lineTo(ix + 1, iy - 1);
      g.lineTo(ix + 4, iy - 8);
      g.closePath();
      g.fillPath();
    } else if (icon === "hex") {
      g.fillStyle(iconColor, 1);
      g.beginPath();
      const hr = 7;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = ix + Math.cos(a) * hr;
        const y = iy + Math.sin(a) * hr;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fillPath();
    } else {
      g.lineStyle(1.5, iconColor, 1);
      g.strokeCircle(ix, iy, 7);
      g.strokeCircle(ix, iy, 4);
      g.fillStyle(iconColor, 1);
      g.fillCircle(ix, iy, 1.5);
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawSpark(key: string, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  // Attach hitbox metadata to a generated enemy texture so Enemy.ts can
  // size its physics body from the texture's `customData` field instead of
  // hard-coding a per-key match. Stored as plain numbers in pixels relative
  // to the texture's top-left.
  private setEnemyHitbox(
    key: string,
    hitboxWidth: number,
    hitboxHeight: number,
    hitboxOffsetX: number,
    hitboxOffsetY: number
  ): void {
    this.textures.get(key).customData = {
      hitboxWidth,
      hitboxHeight,
      hitboxOffsetX,
      hitboxOffsetY,
    };
  }

  // The player ship is a Spacepotato — a slightly lumpy tuber with a tiny
  // green sprout pointing forward (up-screen) and a faint cyan space-rim glow.
  // Drawn into a padded canvas so the rim glow is captured by generateTexture.
  private drawPotatoShip(key: string): void {
    const PAD = 6;
    const innerW = 50;
    const innerH = 42;
    const W = innerW + PAD * 2;
    const H = innerH + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Atmospheric rim — two soft cyan halos so it reads as "in space".
    g.fillStyle(0x4fd1ff, 0.10);
    g.fillEllipse(cx, cy, innerW + PAD * 2, innerH + PAD * 2);
    g.fillStyle(0x4fd1ff, 0.18);
    g.fillEllipse(cx, cy, innerW + PAD, innerH + PAD);

    // Lumpy silhouette — pre-baked noise so the shape is identical every boot.
    const noise = [0.07, -0.04, 0.05, -0.03, 0.02, -0.05, 0.04, 0.01, -0.06, 0.03, 0.05, -0.02, 0.04, -0.05, 0.03, 0.0, 0.05, -0.03];
    const steps = 18;
    const baseRx = innerW / 2;
    const baseRy = innerH / 2;
    const body: { x: number; y: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      const wobble = 1 + (noise[i] ?? 0);
      body.push({ x: cx + Math.cos(a) * baseRx * wobble, y: cy + Math.sin(a) * baseRy * wobble });
    }

    const tracePath = (): void => {
      const first = body[0];
      if (!first) return;
      g.beginPath();
      g.moveTo(first.x, first.y);
      for (let i = 1; i < body.length; i++) {
        const p = body[i];
        if (p) g.lineTo(p.x, p.y);
      }
      g.closePath();
    };

    g.fillStyle(0xa86b3d, 1);
    tracePath();
    g.fillPath();

    g.fillStyle(0x6b3f1f, 0.55);
    g.fillEllipse(cx + 5, cy + 6, innerW - 14, innerH - 16);

    g.fillStyle(0xd9a378, 0.7);
    g.fillEllipse(cx - 7, cy - 7, innerW - 22, innerH - 22);

    g.fillStyle(0xffe6b8, 0.9);
    g.fillEllipse(cx - 9, cy - 10, 7, 4);

    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 4, cy - 4, 1.4);
    g.fillCircle(cx - 6, cy + 5, 1.6);
    g.fillCircle(cx + 9, cy + 3, 1.2);
    g.fillCircle(cx - 2, cy + 8, 1.3);
    g.fillCircle(cx + 11, cy - 7, 1.0);
    g.fillCircle(cx - 11, cy - 2, 1.2);

    // Tiny green sprout on top — points to the front of the ship.
    g.lineStyle(1.5, 0x4caa55, 1);
    g.beginPath();
    g.moveTo(cx + 5, cy - innerH / 2 + 1);
    g.lineTo(cx + 5, cy - innerH / 2 - 4);
    g.strokePath();
    g.fillStyle(0x6fdc6f, 1);
    g.fillEllipse(cx + 2, cy - innerH / 2 - 4, 5, 2.5);
    g.fillEllipse(cx + 8, cy - innerH / 2 - 3, 5, 2.5);

    g.lineStyle(1.2, 0x2a1808, 0.7);
    tracePath();
    g.strokePath();

    g.generateTexture(key, W, H);
    g.destroy();
  }

  private drawBullet(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Small tumbling potato projectile. Asymmetric ellipse + 2 dark eye
  // dots + a small white sheen — small enough to read as a thrown spud
  // at combat speed but distinctive against the cyan default bullet.
  private drawPotatoBullet(key: string): void {
    const PAD = 2;
    const W = 14 + PAD * 2;
    const H = 16 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Asymmetric body — slightly off-center so the silhouette doesn't
    // read as a generic pill.
    g.fillStyle(0xc8d878, 1); // peeled-potato lime
    g.fillEllipse(cx, cy, 12, 14);

    // Shadow wash on lower-right for a hint of volume.
    g.fillStyle(0x6e7f2c, 0.5);
    g.fillEllipse(cx + 1.5, cy + 2, 9, 10);

    // Two-stage highlight — matches drawPotatoShip's discipline.
    g.fillStyle(0xeaffd0, 0.55);
    g.fillEllipse(cx - 2, cy - 3, 6, 5);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(cx - 3, cy - 4, 2, 1.2);

    // Two potato eyes.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 2, cy - 1, 0.9);
    g.fillCircle(cx - 1, cy + 3, 0.8);

    // 1px outline at 70% opacity over a re-stroked ellipse so the
    // silhouette stays crisp at small size.
    g.lineStyle(1, 0x4a3a14, 0.7);
    g.strokeEllipse(cx, cy, 12, 14);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Idaho-russet potato projectile — same shape as drawPotatoBullet
  // but the player-ship russet palette instead of the lime peeled
  // variety, so a player firing the Idaho Potato Rifle alongside the
  // Potato Cannon can read the two streams apart instantly.
  private drawIdahoPotatoBullet(key: string): void {
    const PAD = 2;
    const W = 14 + PAD * 2;
    const H = 16 + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Russet body.
    g.fillStyle(0xb87a4a, 1);
    g.fillEllipse(cx, cy, 12, 14);

    // Shadow wash on lower-right for a hint of volume.
    g.fillStyle(0x6b3f1f, 0.55);
    g.fillEllipse(cx + 1.5, cy + 2, 9, 10);

    // Two-stage highlight, warm tan.
    g.fillStyle(0xd9a378, 0.55);
    g.fillEllipse(cx - 2, cy - 3, 6, 5);
    g.fillStyle(0xffe6b8, 0.8);
    g.fillEllipse(cx - 3, cy - 4, 2, 1.2);

    // Two potato eyes — same dark brown as the Potato Cannon's so the
    // tuber-eye motif stays consistent across spud weapons.
    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 2, cy - 1, 0.9);
    g.fillCircle(cx - 1, cy + 3, 0.8);

    // 1px outline at 70% opacity over a re-stroked ellipse so the
    // silhouette stays crisp at small size.
    g.lineStyle(1, 0x4a2810, 0.7);
    g.strokeEllipse(cx, cy, 12, 14);

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Half-scale player potato. Same body recipe as drawPotatoShip, no
  // rim glow, no sprout — just the silhouette + dimensional shading +
  // outline. Used as a visible "side pod" attached to the main ship
  // when an additional slot is equipped with any potato-themed weapon.
  private drawPotatoPod(key: string): void {
    const PAD = 4;
    const innerW = 26;
    const innerH = 22;
    const W = innerW + PAD * 2;
    const H = innerH + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Lumpy silhouette — pre-baked noise so the shape is identical
    // every boot. Matches drawPotatoShip's noise pattern at half scale.
    const noise = [0.07, -0.04, 0.05, -0.03, 0.02, -0.05, 0.04, 0.01, -0.06, 0.03, 0.05, -0.02, 0.04, -0.05, 0.03, 0.0, 0.05, -0.03];
    const steps = 18;
    const baseRx = innerW / 2;
    const baseRy = innerH / 2;
    const body: { x: number; y: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      const wobble = 1 + (noise[i] ?? 0);
      body.push({ x: cx + Math.cos(a) * baseRx * wobble, y: cy + Math.sin(a) * baseRy * wobble });
    }

    const tracePath = (): void => {
      const first = body[0];
      if (!first) return;
      g.beginPath();
      g.moveTo(first.x, first.y);
      for (let i = 1; i < body.length; i++) {
        const p = body[i];
        if (p) g.lineTo(p.x, p.y);
      }
      g.closePath();
    };

    g.fillStyle(0xa86b3d, 1);
    tracePath();
    g.fillPath();

    g.fillStyle(0x6b3f1f, 0.55);
    g.fillEllipse(cx + 3, cy + 3, innerW - 8, innerH - 9);

    g.fillStyle(0xd9a378, 0.7);
    g.fillEllipse(cx - 3, cy - 4, innerW - 12, innerH - 12);

    g.fillStyle(0xffe6b8, 0.9);
    g.fillEllipse(cx - 4, cy - 5, 4, 2);

    g.fillStyle(0x3d2210, 1);
    g.fillCircle(cx + 2, cy - 2, 0.9);
    g.fillCircle(cx - 3, cy + 2, 1.0);
    g.fillCircle(cx + 5, cy + 1, 0.8);

    g.lineStyle(1, 0x2a1808, 0.7);
    tracePath();
    g.strokePath();

    g.generateTexture(key, W, H);
    g.destroy();
  }

  // Pear-shaped sap-sucker. Head points DOWN since enemies fall toward
  // the player. Same layered-ellipse + accent dots + outline language as
  // drawPotatoShip so player and bug feel like the same biome. The
  // optional `crown` paints 5 amber spikes fanning from the rear of the
  // abdomen (queen variant only).
  private drawAphid(
    key: string,
    opts: { size: number; body: number; accent: number; crown?: number }
  ): void {
    const { size, body, accent, crown } = opts;
    const PAD = 4;
    const W = size + PAD * 2;
    const H = size + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    const bodyRx = size * 0.42;
    const bodyRy = size * 0.40;
    const bodyCy = cy - size * 0.06;
    const headRx = size * 0.28;
    const headRy = size * 0.22;
    const headCy = cy + size * 0.22;

    g.fillStyle(body, 1);
    g.fillEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.fillEllipse(cx, headCy, headRx * 2, headRy * 2);

    g.fillStyle(accent, 0.45);
    g.fillEllipse(cx + size * 0.06, bodyCy + size * 0.07, bodyRx * 1.55, bodyRy * 1.45);

    g.fillStyle(0xeaffd0, 0.35);
    g.fillEllipse(cx - size * 0.12, bodyCy - size * 0.13, bodyRx * 1.05, bodyRy * 0.85);
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(cx - size * 0.16, bodyCy - size * 0.18, size * 0.14, size * 0.07);

    const legR = Math.max(1, size * 0.045);
    const legXOffset = bodyRx * 0.92;
    const legYs = [bodyCy - bodyRy * 0.45, bodyCy, bodyCy + bodyRy * 0.5];
    g.fillStyle(accent, 1);
    for (const ly of legYs) {
      g.fillCircle(cx - legXOffset, ly, legR);
      g.fillCircle(cx + legXOffset, ly, legR);
    }

    // Phaser Graphics has no quadraticCurveTo here, so antennae are 3-segment polylines.
    const antLen = size * 0.22;
    const antBaseY = headCy + headRy * 0.55;
    const antBaseX = headRx * 0.55;
    g.lineStyle(Math.max(1, size * 0.035), accent, 0.95);
    g.beginPath();
    g.moveTo(cx - antBaseX, antBaseY);
    g.lineTo(cx - antBaseX - antLen * 0.35, antBaseY + antLen * 0.45);
    g.lineTo(cx - antBaseX - antLen * 0.85, antBaseY + antLen * 0.95);
    g.strokePath();
    g.beginPath();
    g.moveTo(cx + antBaseX, antBaseY);
    g.lineTo(cx + antBaseX + antLen * 0.35, antBaseY + antLen * 0.45);
    g.lineTo(cx + antBaseX + antLen * 0.85, antBaseY + antLen * 0.95);
    g.strokePath();

    const eyeR = Math.max(1.5, size * 0.085);
    const eyeY = headCy + headRy * 0.15;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx, eyeY, eyeR);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeR * 0.35, eyeY - eyeR * 0.35, Math.max(0.8, eyeR * 0.32));

    if (crown !== undefined) {
      const crownBaseY = bodyCy - bodyRy * 0.92;
      const spikes = 5;
      const spread = Math.PI * 0.55;
      const spikeLen = size * 0.15;
      const spikeHalfBase = Math.max(1.2, size * 0.04);
      g.fillStyle(crown, 1);
      for (let i = 0; i < spikes; i++) {
        const t = i / (spikes - 1);
        const a = -Math.PI / 2 + (t - 0.5) * spread;
        const baseR = bodyRy * 0.95;
        const bx = cx + Math.cos(a) * bodyRx * 0.7;
        const by = crownBaseY + (Math.sin(a) + 1) * baseR * 0.05;
        const tx = bx + Math.cos(a) * spikeLen;
        const ty = by + Math.sin(a) * spikeLen;
        const px = -Math.sin(a) * spikeHalfBase;
        const py = Math.cos(a) * spikeHalfBase;
        g.fillTriangle(tx, ty, bx + px, by + py, bx - px, by - py);
      }
    }

    g.lineStyle(1, accent, 0.7);
    g.strokeEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.strokeEllipse(cx, headCy, headRx * 2, headRy * 2);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the body+head silhouette. Antennae, crown spikes, and
    // legs are all too thin to count as fair targets, so they're excluded.
    const hitboxWidth = size * 0.84;
    const hitboxHeight = size * 0.90;
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = bodyCy - bodyRy;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Armored beetle. Wide oval carapace with a center elytra split line,
  // a small head segment at the front (down-screen), 6 legs along the
  // sides, and a variant ornament at the head: scarab gets a dome boss
  // on the carapace, rhino gets a forward-pointing horn, stag gets two
  // forking mandibles. Outline + carapace shine sell the "armored" read.
  private drawBeetle(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      ornament: "dome" | "horn" | "mandibles";
      ornamentColor: number;
    }
  ): void {
    const { size, body, accent, ornament, ornamentColor } = opts;
    const PAD = 5;
    const W = size + PAD * 2;
    const H = size + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    const bodyRx = size * 0.46;
    const bodyRy = size * 0.40;
    const bodyCy = cy - size * 0.05;
    const headRx = size * 0.22;
    const headRy = size * 0.13;
    const headCy = cy + size * 0.32;

    // Carapace + head silhouette.
    g.fillStyle(body, 1);
    g.fillEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.fillEllipse(cx, headCy, headRx * 2, headRy * 2);

    // Right-side shadow wash for volume.
    g.fillStyle(accent, 0.55);
    g.fillEllipse(cx + size * 0.10, bodyCy + size * 0.04, bodyRx * 1.4, bodyRy * 1.55);

    // Carapace shine — bright crescent on the upper-left, sells "polished armor".
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(cx - size * 0.16, bodyCy - size * 0.16, bodyRx * 1.0, bodyRy * 0.55);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(cx - size * 0.18, bodyCy - size * 0.20, size * 0.10, size * 0.05);

    // Elytra split — vertical seam down the carapace, the signature beetle tell.
    g.lineStyle(Math.max(1, size * 0.04), accent, 0.85);
    g.beginPath();
    g.moveTo(cx, bodyCy - bodyRy * 0.95);
    g.lineTo(cx, bodyCy + bodyRy * 0.95);
    g.strokePath();

    // 6 legs as short angled slashes outside the carapace.
    const legLen = size * 0.13;
    const legXOffset = bodyRx * 0.95;
    const legYs = [bodyCy - bodyRy * 0.55, bodyCy - bodyRy * 0.05, bodyCy + bodyRy * 0.45];
    g.lineStyle(Math.max(1, size * 0.045), accent, 0.95);
    for (const ly of legYs) {
      g.beginPath();
      g.moveTo(cx - legXOffset, ly);
      g.lineTo(cx - legXOffset - legLen, ly + legLen * 0.4);
      g.strokePath();
      g.beginPath();
      g.moveTo(cx + legXOffset, ly);
      g.lineTo(cx + legXOffset + legLen, ly + legLen * 0.4);
      g.strokePath();
    }

    // Small black eye dots on the head with a 1px white gleam each.
    const eyeR = Math.max(1.2, size * 0.055);
    const eyeY = headCy + headRy * 0.05;
    const eyeX = headRx * 0.55;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - eyeX, eyeY, eyeR);
    g.fillCircle(cx + eyeX, eyeY, eyeR);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));
    g.fillCircle(cx + eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));

    // Variant ornament.
    if (ornament === "dome") {
      // Scarab: a domed boss in the center of the carapace.
      g.fillStyle(ornamentColor, 0.9);
      g.fillCircle(cx, bodyCy, size * 0.11);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(cx - size * 0.04, bodyCy - size * 0.04, size * 0.04);
    } else if (ornament === "horn") {
      // Rhino: single forward horn extending from the head.
      const hornBaseY = headCy + headRy * 0.6;
      const hornTipY = hornBaseY + size * 0.22;
      const hornHalfBase = size * 0.07;
      g.fillStyle(ornamentColor, 1);
      g.fillTriangle(cx, hornTipY, cx - hornHalfBase, hornBaseY, cx + hornHalfBase, hornBaseY);
      // Tiny upward kink at the base for "rhino horn" character.
      g.fillTriangle(
        cx, hornBaseY - size * 0.04,
        cx - hornHalfBase * 0.6, hornBaseY,
        cx + hornHalfBase * 0.6, hornBaseY
      );
    } else {
      // Stag: two forking mandibles diverging from the head.
      const mandBaseY = headCy + headRy * 0.55;
      const mandBaseX = headRx * 0.45;
      const mandTipY = mandBaseY + size * 0.18;
      const mandTipX = headRx * 1.4;
      const mandHalfBase = size * 0.04;
      g.fillStyle(ornamentColor, 1);
      g.fillTriangle(
        cx - mandTipX, mandTipY,
        cx - mandBaseX - mandHalfBase, mandBaseY,
        cx - mandBaseX + mandHalfBase, mandBaseY
      );
      g.fillTriangle(
        cx + mandTipX, mandTipY,
        cx + mandBaseX - mandHalfBase, mandBaseY,
        cx + mandBaseX + mandHalfBase, mandBaseY
      );
    }

    // Outline last over re-stroked silhouettes.
    g.lineStyle(1, accent, 0.75);
    g.strokeEllipse(cx, bodyCy, bodyRx * 2, bodyRy * 2);
    g.strokeEllipse(cx, headCy, headRx * 2, headRy * 2);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the carapace+head mass. Short leg slashes and small
    // ornaments (dome/horn/mandibles) are excluded as cosmetic detail.
    const hitboxWidth = size * 0.92;
    const hitboxHeight = size * 0.90;
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = bodyCy - bodyRy;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Segmented caterpillar — chain of overlapping circles with a smaller
  // head segment at the front (down-screen). Optional posterior horn
  // (hornworm) and per-segment horizontal stripes (army worm, monarch).
  // The boss-tier monarch reuses this helper at large segR + segment count
  // so the worm reads as a long undulating threat.
  private drawCaterpillar(
    key: string,
    opts: {
      segR: number;
      body: number;
      accent: number;
      segments: number;
      stripeColor?: number;
      hornColor?: number;
    }
  ): void {
    const { segR, body, accent, segments, stripeColor, hornColor } = opts;
    const PAD = 4;
    const headR = segR * 0.85;
    const spacing = segR;

    const W = segR * 2 + PAD * 2;
    // Length spans the head (2*headR) plus the chain of body segments.
    // Each segment is one diameter (2*segR) and successive centers sit
    // `spacing` apart (= segR), so N segments take (N+1)*segR of vertical
    // run from the bottom of the chain to the top of the topmost segment.
    const totalLen = 2 * headR + (segments + 1) * segR;
    const hornExtra = hornColor !== undefined ? segR * 0.7 : 0;
    const H = totalLen + hornExtra + PAD * 2;

    const cx = W / 2;
    const g = this.add.graphics();

    // Head sits at the BOTTOM of the texture (enemies fall toward player);
    // segments stack upward away from the head. Center positions:
    const headCy = H - PAD - headR;
    const segCenters: number[] = [];
    for (let i = 0; i < segments; i++) {
      segCenters.push(headCy - headR - segR - i * spacing);
    }

    // Posterior horn — extends UP from the topmost segment.
    if (hornColor !== undefined) {
      const top = segCenters[segCenters.length - 1] ?? 0;
      g.fillStyle(hornColor, 1);
      g.fillTriangle(
        cx, top - segR - segR * 0.7,
        cx - segR * 0.4, top - segR + segR * 0.05,
        cx + segR * 0.4, top - segR + segR * 0.05
      );
    }

    // Body segments — back to front so the head sits visually on top.
    g.fillStyle(body, 1);
    for (const yc of segCenters) g.fillCircle(cx, yc, segR);

    // Right-side shadow on each segment for volume.
    g.fillStyle(accent, 0.4);
    for (const yc of segCenters) {
      g.fillEllipse(cx + segR * 0.22, yc + segR * 0.1, segR * 1.4, segR * 1.4);
    }

    // Top-left highlight on each segment.
    g.fillStyle(0xffffff, 0.18);
    for (const yc of segCenters) {
      g.fillEllipse(cx - segR * 0.3, yc - segR * 0.32, segR * 0.95, segR * 0.5);
    }

    // Stripes — two thin horizontal bands per segment for army/monarch.
    if (stripeColor !== undefined) {
      g.fillStyle(stripeColor, 0.85);
      for (const yc of segCenters) {
        g.fillEllipse(cx, yc - segR * 0.32, segR * 1.65, segR * 0.20);
        g.fillEllipse(cx, yc + segR * 0.32, segR * 1.65, segR * 0.20);
      }
    }

    // Head — slightly smaller circle, drawn last so it overlaps the
    // first body segment at the base of the chain.
    g.fillStyle(body, 1);
    g.fillCircle(cx, headCy, headR);
    g.fillStyle(accent, 0.5);
    g.fillEllipse(cx + headR * 0.22, headCy + headR * 0.15, headR * 1.4, headR * 1.3);

    // Eyes — two black dots with white gleams on the head.
    const eyeR = Math.max(1.2, segR * 0.18);
    const eyeY = headCy + headR * 0.1;
    const eyeX = headR * 0.45;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - eyeX, eyeY, eyeR);
    g.fillCircle(cx + eyeX, eyeY, eyeR);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));
    g.fillCircle(cx + eyeX - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.6, eyeR * 0.32));

    // Outline last over re-stroked silhouettes.
    g.lineStyle(1, accent, 0.75);
    for (const yc of segCenters) g.strokeCircle(cx, yc, segR);
    g.strokeCircle(cx, headCy, headR);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox is the worm's column: the full segR-wide strip from below the
    // optional posterior horn down to the bottom edge of the head. PAD on
    // the X axis matches drawing offsets; PAD + hornExtra on the Y axis
    // skips the cosmetic horn at the top.
    const hitboxWidth = 2 * segR;
    const hitboxHeight = totalLen;
    const hitboxOffsetX = PAD;
    const hitboxOffsetY = PAD + hornExtra;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Spider — bulbous abdomen (top, rear) + smaller cephalothorax (bottom,
  // leading the fall) with 4 multi-segment legs per side. The widow gets
  // a red hourglass marking on the abdomen; the jumping spider gets a
  // glowing accent ring around its big front eyes (jumping spiders are
  // famous for their oversized forward-facing eyes).
  private drawSpider(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      marking?: { color: number; kind: "hourglass" | "eyes-large" };
    }
  ): void {
    const { size, body, accent, marking } = opts;
    const PAD = 5;
    const legSpan = size * 1.05;
    const cephR = size * 0.62;
    const W = (size + legSpan) * 2 + PAD * 2;
    const H = 2 * size + 2 * cephR + PAD * 2;
    const cx = W / 2;
    const g = this.add.graphics();

    // Layout: abdomen on top (rear), cephalothorax overlaps below (front).
    const abdomenCy = PAD + size;
    const cephCy = abdomenCy + size * 0.7 + cephR * 0.45;

    // 8 legs first so the body covers their roots. 4 per side, fanning
    // outward and slightly forward (down-screen).
    g.lineStyle(Math.max(1, size * 0.10), accent, 1);
    for (let i = 0; i < 8; i++) {
      const isLeft = i < 4;
      const idx = isLeft ? i : i - 4;
      const sign = isLeft ? -1 : 1;

      const rootX = cx + sign * cephR * 0.7;
      const rootY = cephCy - cephR * 0.55 + idx * cephR * 0.35;

      // Knee: outward + slight up/down variation per leg pair.
      const kneeX = rootX + sign * legSpan * 0.55;
      const kneeY = rootY + (idx - 1.5) * cephR * 0.18;

      // Foot tip: full leg span outward + slight forward bias.
      const footX = rootX + sign * legSpan * 0.95;
      const footY = rootY + cephR * 0.4 + idx * cephR * 0.18;

      g.beginPath();
      g.moveTo(rootX, rootY);
      g.lineTo(kneeX, kneeY);
      g.lineTo(footX, footY);
      g.strokePath();
    }

    // Abdomen.
    g.fillStyle(body, 1);
    g.fillCircle(cx, abdomenCy, size);
    g.fillStyle(accent, 0.45);
    g.fillEllipse(cx + size * 0.2, abdomenCy + size * 0.15, size * 1.5, size * 1.5);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(cx - size * 0.3, abdomenCy - size * 0.3, size * 0.95, size * 0.5);

    // Hourglass marking — two triangles meeting at a waist (widow).
    if (marking?.kind === "hourglass") {
      g.fillStyle(marking.color, 1);
      g.fillTriangle(
        cx - size * 0.28, abdomenCy - size * 0.30,
        cx + size * 0.28, abdomenCy - size * 0.30,
        cx, abdomenCy
      );
      g.fillTriangle(
        cx - size * 0.28, abdomenCy + size * 0.30,
        cx + size * 0.28, abdomenCy + size * 0.30,
        cx, abdomenCy
      );
    }

    // Cephalothorax (head segment).
    g.fillStyle(body, 1);
    g.fillCircle(cx, cephCy, cephR);
    g.fillStyle(accent, 0.5);
    g.fillEllipse(cx + cephR * 0.2, cephCy + cephR * 0.15, cephR * 1.4, cephR * 1.3);

    // 4-eye cluster (2 large central + 2 smaller side eyes).
    const eyeR = Math.max(1.0, cephR * 0.16);
    const eyeY = cephCy + cephR * 0.25;
    const eyeXBig = cephR * 0.25;
    const eyeXSmall = cephR * 0.55;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - eyeXBig, eyeY, eyeR * 1.3);
    g.fillCircle(cx + eyeXBig, eyeY, eyeR * 1.3);
    g.fillCircle(cx - eyeXSmall, eyeY - eyeR * 0.3, eyeR * 0.7);
    g.fillCircle(cx + eyeXSmall, eyeY - eyeR * 0.3, eyeR * 0.7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - eyeXBig - eyeR * 0.4, eyeY - eyeR * 0.4, Math.max(0.6, eyeR * 0.4));
    g.fillCircle(cx + eyeXBig - eyeR * 0.4, eyeY - eyeR * 0.4, Math.max(0.6, eyeR * 0.4));

    // Jumping-spider tell — glowing ring around the big eyes.
    if (marking?.kind === "eyes-large") {
      g.lineStyle(1.5, marking.color, 0.85);
      g.strokeCircle(cx - eyeXBig, eyeY, eyeR * 1.7);
      g.strokeCircle(cx + eyeXBig, eyeY, eyeR * 1.7);
    }

    // Outline last.
    g.lineStyle(1, accent, 0.7);
    g.strokeCircle(cx, abdomenCy, size);
    g.strokeCircle(cx, cephCy, cephR);

    g.generateTexture(key, W, H);
    g.destroy();

    // Hitbox covers the abdomen+cephalothorax body mass. Legs are thin
    // lines that barely extend past `size` and would inflate the box
    // unfairly, so they're excluded.
    const hitboxWidth = 2 * size;
    const hitboxHeight = (cephCy + cephR) - (abdomenCy - size);
    const hitboxOffsetX = (W - hitboxWidth) / 2;
    const hitboxOffsetY = abdomenCy - size;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

  // Dragonfly — long thin body with the head pointing DOWN, large
  // semi-transparent wings extending sideways from the upper third, and
  // a pair of compound eyes on the head. `wings: 4` paints a second
  // wing pair behind the first (helicopter dragonfly); `slim: true`
  // narrows everything for the damselfly variant.
  private drawDragonfly(
    key: string,
    opts: {
      size: number;
      body: number;
      accent: number;
      wing: number;
      wings: 2 | 4;
      slim?: boolean;
    }
  ): void {
    const { size, body, accent, wing, wings, slim } = opts;
    const PAD = 5;
    const bodyLen = size;
    const bodyHalfW = size * (slim ? 0.06 : 0.09);
    const wingLen = size * (slim ? 0.55 : 0.72);
    const wingHalfH = size * (slim ? 0.08 : 0.11);
    const W = (bodyHalfW + wingLen) * 2 + PAD * 2;
    const H = bodyLen + (wings === 4 ? wingHalfH * 0.8 : 0) + PAD * 2;
    const cx = W / 2;
    const cy = H / 2;
    const g = this.add.graphics();

    // Wings draw first so the body covers their roots. Wing center sits
    // in the upper third of the body (toward the rear). For the
    // 4-winged variant a second slightly-smaller pair sits behind.
    const wingCy = cy - bodyLen * 0.20;
    const drawWingPair = (yOffset: number, scale: number, alpha: number): void => {
      g.fillStyle(wing, alpha);
      g.fillEllipse(
        cx - bodyHalfW - wingLen * 0.5 * scale,
        wingCy + yOffset,
        wingLen * scale,
        wingHalfH * 2 * scale
      );
      g.fillEllipse(
        cx + bodyHalfW + wingLen * 0.5 * scale,
        wingCy + yOffset,
        wingLen * scale,
        wingHalfH * 2 * scale
      );
      // Wing veins — a thin accent stroke along the wing centerline.
      g.lineStyle(Math.max(0.8, size * 0.012), accent, 0.5);
      g.beginPath();
      g.moveTo(cx - bodyHalfW, wingCy + yOffset);
      g.lineTo(cx - bodyHalfW - wingLen * scale, wingCy + yOffset);
      g.strokePath();
      g.beginPath();
      g.moveTo(cx + bodyHalfW, wingCy + yOffset);
      g.lineTo(cx + bodyHalfW + wingLen * scale, wingCy + yOffset);
      g.strokePath();
    };
    if (wings === 4) {
      drawWingPair(wingHalfH * 1.3, 0.85, 0.55);
    }
    drawWingPair(0, 1, 0.7);

    // Long thin body — three stacked ellipses (tail, thorax, head) that
    // collectively read as one cigar-shape.
    const tailCy = cy - bodyLen * 0.32;
    const thoraxCy = cy;
    const headCy = cy + bodyLen * 0.36;
    g.fillStyle(body, 1);
    g.fillEllipse(cx, tailCy, bodyHalfW * 1.6, bodyLen * 0.42);
    g.fillEllipse(cx, thoraxCy, bodyHalfW * 2.4, bodyLen * 0.40);
    g.fillEllipse(cx, headCy, bodyHalfW * 2.6, bodyLen * 0.20);

    // Subtle body shadow (right side).
    g.fillStyle(accent, 0.5);
    g.fillEllipse(cx + bodyHalfW * 0.4, thoraxCy + bodyLen * 0.05, bodyHalfW * 1.8, bodyLen * 0.32);

    // Compound eyes — two large dark domes on the head, dragonfly signature.
    const eyeR = bodyHalfW * 1.6;
    const eyeY = headCy + bodyLen * 0.05;
    g.fillStyle(0x000000, 1);
    g.fillCircle(cx - bodyHalfW * 1.1, eyeY, eyeR);
    g.fillCircle(cx + bodyHalfW * 1.1, eyeY, eyeR);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(cx - bodyHalfW * 1.1 - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.7, eyeR * 0.3));
    g.fillCircle(cx + bodyHalfW * 1.1 - eyeR * 0.3, eyeY - eyeR * 0.3, Math.max(0.7, eyeR * 0.3));

    // Outline — re-stroke each body section.
    g.lineStyle(1, accent, 0.7);
    g.strokeEllipse(cx, tailCy, bodyHalfW * 1.6, bodyLen * 0.42);
    g.strokeEllipse(cx, thoraxCy, bodyHalfW * 2.4, bodyLen * 0.40);
    g.strokeEllipse(cx, headCy, bodyHalfW * 2.6, bodyLen * 0.20);

    g.generateTexture(key, W, H);
    g.destroy();

    // Wings ARE the dragonfly's signature visual — players will shoot at
    // the wide silhouette, so the hitbox includes the full wingspan and
    // body length. Effectively the entire texture minus the PAD border.
    const hitboxWidth = (bodyHalfW + wingLen) * 2;
    const hitboxHeight = bodyLen + (wings === 4 ? wingHalfH * 0.8 : 0);
    const hitboxOffsetX = PAD;
    const hitboxOffsetY = PAD;
    this.setEnemyHitbox(key, hitboxWidth, hitboxHeight, hitboxOffsetX, hitboxOffsetY);
  }

}

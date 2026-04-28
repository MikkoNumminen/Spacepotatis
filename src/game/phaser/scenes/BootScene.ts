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

    this.drawEnemyBasic("enemy-basic", 0x8f9cff, 40);
    this.drawEnemyDiamond("enemy-zigzag", 0xff66cc, 42);
    this.drawTriangleDown("enemy-kamikaze", 0xffa040, 36, 44);
    this.drawBoss("boss-1", 0xff4d6d, 140, 100);

    this.drawAphid("enemy-aphid",       { size: 32, body: 0x9acd32, accent: 0x5a7d1a });
    this.drawAphid("enemy-aphid-giant", { size: 50, body: 0x88c020, accent: 0x3e5c10 });
    this.drawAphid("enemy-aphid-queen", { size: 60, body: 0x6fb320, accent: 0x3a4f0e, crown: 0xffcc33 });

    this.drawBeetle("enemy-beetle-scarab", { size: 44, body: 0x4a6b3a, accent: 0x223018, ornament: "dome",      ornamentColor: 0xb8d488 });
    this.drawBeetle("enemy-beetle-rhino",  { size: 46, body: 0x8b3a2a, accent: 0x4d1f15, ornament: "horn",      ornamentColor: 0x1a1008 });
    this.drawBeetle("enemy-beetle-stag",   { size: 50, body: 0x4a3a6b, accent: 0x231a36, ornament: "mandibles", ornamentColor: 0x140a22 });

    this.drawCaterpillar("enemy-caterpillar-hornworm", { segR: 9,  body: 0x6fb02a, accent: 0x2f4a14, segments: 6, hornColor: 0x2f4a14 });
    this.drawCaterpillar("enemy-caterpillar-army",     { segR: 8,  body: 0x4a5c1a, accent: 0x1f2810, segments: 5, stripeColor: 0xc0d050 });
    this.drawCaterpillar("enemy-caterpillar-monarch",  { segR: 18, body: 0xffd64a, accent: 0x1a1a1a, segments: 7, stripeColor: 0x1a1a1a });

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

  private drawTriangleUp(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokePath();
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private drawTriangleDown(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    g.lineTo(w / 2, h);
    g.closePath();
    g.fillPath();
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private drawBullet(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private drawEnemyBasic(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x1b2040, 1);
    g.fillRoundedRect(0, 0, size, size, 6);
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, size * 0.3);
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeRoundedRect(1, 1, size - 2, size - 2, 6);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawEnemyDiamond(key: string, color: number, size: number): void {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(size / 2, 0);
    g.lineTo(size, size / 2);
    g.lineTo(size / 2, size);
    g.lineTo(0, size / 2);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokePath();
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private drawBoss(key: string, color: number, w: number, h: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x2a0a14, 1);
    g.fillRoundedRect(0, 0, w, h, 14);
    g.fillStyle(color, 1);
    g.fillRoundedRect(10, 10, w - 20, h - 20, 10);
    g.fillStyle(0xffcc33, 1);
    g.fillCircle(w / 2, h / 2, 14);
    g.lineStyle(3, 0xffffff, 0.8);
    g.strokeRoundedRect(0, 0, w, h, 14);
    g.generateTexture(key, w, h);
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
    const totalLen = 2 * headR + (segments - 1) * spacing + segR;
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
  }

}

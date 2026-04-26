import * as THREE from "three";
import type { MissionId } from "@/types/game";

const TEX_W = 384;
const TEX_H = 192;

type Rgb = readonly [number, number, number];

interface SurfaceStyle {
  readonly noiseScale: number;
  readonly octaves: number;
  readonly bandStrength: number;
  readonly featureColor: Rgb | null;
  readonly featureThreshold: number;
  readonly featureMix: number;
  readonly craters: number;
  readonly craterSizeRange: readonly [number, number];
}

export interface ProceduralPlanet {
  readonly map: THREE.CanvasTexture;
  readonly bumpMap: THREE.CanvasTexture;
}

export function generatePlanetSurface(missionId: MissionId, baseColor: number): ProceduralPlanet {
  const seed = hashString(missionId);
  const palette = derivePalette(baseColor);
  const style = styleFor(missionId);
  const heights = new Float32Array(TEX_W * TEX_H);
  const map = paintDiffuse(seed, palette, style, heights);
  const bumpMap = paintBump(heights);
  return { map, bumpMap };
}

function styleFor(id: MissionId): SurfaceStyle {
  switch (id) {
    case "tutorial":
      return {
        noiseScale: 2.6,
        octaves: 5,
        bandStrength: 0,
        featureColor: [210, 178, 128],
        featureThreshold: 0.58,
        featureMix: 0.55,
        craters: 22,
        craterSizeRange: [3, 11]
      };
    case "combat-1":
      return {
        noiseScale: 3.2,
        octaves: 5,
        bandStrength: 0,
        featureColor: [70, 40, 30],
        featureThreshold: 0.62,
        featureMix: 0.6,
        craters: 36,
        craterSizeRange: [2, 14]
      };
    case "boss-1":
      return {
        noiseScale: 2.0,
        octaves: 5,
        bandStrength: 0,
        featureColor: [255, 170, 60],
        featureThreshold: 0.7,
        featureMix: 0.85,
        craters: 6,
        craterSizeRange: [4, 9]
      };
    case "shop":
      // Tutorial Market — cool banded ice giant.
      return {
        noiseScale: 2.4,
        octaves: 4,
        bandStrength: 0.35,
        featureColor: [240, 250, 255],
        featureThreshold: 0.72,
        featureMix: 0.7,
        craters: 0,
        craterSizeRange: [0, 0]
      };
    case "tubernovae-outpost":
      // Tubernovae Outpost — heavily-banded blue-grey gas giant with a
      // tighter, stormier band pattern than the tutorial shop.
      return {
        noiseScale: 2.0,
        octaves: 4,
        bandStrength: 0.55,
        featureColor: [220, 230, 245],
        featureThreshold: 0.7,
        featureMix: 0.65,
        craters: 0,
        craterSizeRange: [0, 0]
      };
    case "pirate-beacon":
      // Jungle moon — dense vegetation patches at high altitude, heavy
      // crater pockmarking from past pirate raids.
      return {
        noiseScale: 2.8,
        octaves: 5,
        bandStrength: 0,
        featureColor: [40, 120, 70],
        featureThreshold: 0.55,
        featureMix: 0.55,
        craters: 26,
        craterSizeRange: [3, 11]
      };
    case "ember-run":
      // Active lava world — bright molten ridges erupting through cooled
      // black crust, faint convective banding.
      return {
        noiseScale: 3.0,
        octaves: 5,
        bandStrength: 0.2,
        featureColor: [255, 200, 80],
        featureThreshold: 0.55,
        featureMix: 0.85,
        craters: 14,
        craterSizeRange: [3, 12]
      };
    case "burnt-spud":
      // Volcanic ruin — deep red veins of cooling magma cracking through
      // a dark charcoal surface. Heavy cratering from the boss fight.
      return {
        noiseScale: 2.2,
        octaves: 5,
        bandStrength: 0,
        featureColor: [255, 80, 30],
        featureThreshold: 0.62,
        featureMix: 0.9,
        craters: 34,
        craterSizeRange: [4, 14]
      };
  }
}

function derivePalette(baseColor: number): readonly [Rgb, Rgb, Rgb, Rgb] {
  const c = new THREE.Color(baseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const stops: THREE.Color[] = [
    new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.5), 0.04),
    new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.75), Math.max(0.10, hsl.l * 0.3)),
    new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.max(0.22, hsl.l * 0.55)),
    new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.7), Math.max(0.55, Math.min(0.85, hsl.l * 0.95)))
  ];
  return stops.map((s) => [
    Math.round(s.r * 255),
    Math.round(s.g * 255),
    Math.round(s.b * 255)
  ] as Rgb) as unknown as readonly [Rgb, Rgb, Rgb, Rgb];
}

function paintDiffuse(
  seed: number,
  palette: readonly [Rgb, Rgb, Rgb, Rgb],
  style: SurfaceStyle,
  heightsOut: Float32Array
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const img = ctx.createImageData(TEX_W, TEX_H);
  const data = img.data;

  for (let y = 0; y < TEX_H; y++) {
    const v = (y + 0.5) / TEX_H;
    const lat = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let x = 0; x < TEX_W; x++) {
      const u = (x + 0.5) / TEX_W;
      const lon = u * 2 * Math.PI;
      const px = cosLat * Math.cos(lon);
      const py = sinLat;
      const pz = cosLat * Math.sin(lon);

      let n = fbm3(
        px * style.noiseScale,
        py * style.noiseScale,
        pz * style.noiseScale,
        seed,
        style.octaves
      );

      if (style.bandStrength > 0) {
        const band = Math.sin(lat * 7 + n * 4) * 0.5 + 0.5;
        n = n * (1 - style.bandStrength * 0.6) + band * style.bandStrength * 0.6;
      }

      n = Math.max(0, Math.min(1, n));
      heightsOut[y * TEX_W + x] = n;

      const baseRgb = sampleRamp(palette, n);
      let r = baseRgb[0];
      let g = baseRgb[1];
      let b = baseRgb[2];

      if (style.featureColor && n > style.featureThreshold) {
        const t = ((n - style.featureThreshold) / (1 - style.featureThreshold)) * style.featureMix;
        r = r + (style.featureColor[0] - r) * t;
        g = g + (style.featureColor[1] - g) * t;
        b = b + (style.featureColor[2] - b) * t;
      }

      const idx = (y * TEX_W + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  if (style.craters > 0) {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    for (let i = 0; i < style.craters; i++) {
      const cx = rng() * TEX_W;
      const cy = TEX_H * 0.15 + rng() * TEX_H * 0.7;
      const radius =
        style.craterSizeRange[0] + rng() * (style.craterSizeRange[1] - style.craterSizeRange[0]);
      stampCrater(data, heightsOut, TEX_W, TEX_H, cx, cy, radius);
    }
  }

  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintBump(heights: Float32Array): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const img = ctx.createImageData(TEX_W, TEX_H);
  const data = img.data;
  for (let i = 0; i < heights.length; i++) {
    const hv = heights[i] ?? 0;
    const h = Math.round(hv * 255);
    const idx = i * 4;
    data[idx] = h;
    data[idx + 1] = h;
    data[idx + 2] = h;
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function stampCrater(
  data: Uint8ClampedArray,
  heights: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number
): void {
  const r2 = r * r;
  const yMin = Math.max(0, Math.floor(cy - r));
  const yMax = Math.min(h - 1, Math.ceil(cy + r));
  const xMin = Math.max(0, Math.floor(cx - r));
  const xMax = Math.min(w - 1, Math.ceil(cx + r));
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const t = Math.sqrt(d2) / r;
      const factor = t < 0.78 ? 0.55 + t * 0.35 : 1.18 - (t - 0.78) * 0.55;
      const heightDelta = t < 0.78 ? -0.2 * (1 - t / 0.78) : 0.18 * (1 - (t - 0.78) / 0.22);
      const idx = (y * w + x) * 4;
      data[idx] = clamp255((data[idx] ?? 0) * factor);
      data[idx + 1] = clamp255((data[idx + 1] ?? 0) * factor);
      data[idx + 2] = clamp255((data[idx + 2] ?? 0) * factor);
      const hi = y * w + x;
      heights[hi] = Math.max(0, Math.min(1, (heights[hi] ?? 0) + heightDelta));
    }
  }
}

function sampleRamp(palette: readonly [Rgb, Rgb, Rgb, Rgb], t: number): Rgb {
  const [p0, p1, p2, p3] = palette;
  const f = Math.max(0, Math.min(1, t)) * 3;
  const i = Math.min(Math.floor(f), 2);
  const k = f - i;
  const a = i === 0 ? p0 : i === 1 ? p1 : p2;
  const b = i === 0 ? p1 : i === 1 ? p2 : p3;
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k
  ];
}

function fbm3(x: number, y: number, z: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 131);
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / max;
}

function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = smooth(xf);
  const v = smooth(yf);
  const w = smooth(zf);
  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 16777216) / 16777216;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

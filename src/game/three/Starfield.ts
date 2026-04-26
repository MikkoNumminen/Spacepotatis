import * as THREE from "three";

const STAR_COUNT = 2000;
const INNER_RADIUS = 80;
const OUTER_RADIUS = 220;

export class Starfield {
  readonly object: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly geometry: THREE.BufferGeometry;

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const color = new THREE.Color();

    for (let i = 0; i < STAR_COUNT; i++) {
      const r = INNER_RADIUS + Math.random() * (OUTER_RADIUS - INNER_RADIUS);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Slight hue variation: cyan → white → amber.
      const t = Math.random();
      if (t < 0.15) color.setRGB(1.0, 0.85, 0.55);
      else if (t < 0.45) color.setRGB(0.65, 0.9, 1.0);
      else color.setRGB(1.0, 1.0, 1.0);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.9,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      // Additive so stars never overwrite the sun's halo with a dim square —
      // they just add light, which makes them naturally fade against bright
      // backgrounds (no "black star" artifacts).
      blending: THREE.AdditiveBlending,
      map: createStarSprite(),
      alphaTest: 0.01
    });

    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
  }

  update(dt: number): void {
    this.object.rotation.y += dt * 0.01;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}

// Soft circular gradient → stars render as round glow dots instead of the
// default opaque square sprite. Cached as a single CanvasTexture for all stars.
function createStarSprite(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Starfield: 2D canvas context unavailable");
  const cx = size / 2;
  const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  gradient.addColorStop(0.0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

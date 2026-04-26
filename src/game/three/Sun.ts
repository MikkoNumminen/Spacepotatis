import * as THREE from "three";

const BASE_SUN_RADIUS = 1.6;
const DEFAULT_CORE_COLOR = "#fff1c4";

export interface SunOptions {
  readonly coreColor?: string;     // "#RRGGBB"; tints all three sun layers
  readonly sizeScale?: number;     // multiplier on the base radius (default 1.0)
}

export class Sun {
  readonly object: THREE.Group;
  readonly light: THREE.PointLight;
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  private readonly flare: THREE.Sprite;
  private readonly coreMaterial: THREE.MeshBasicMaterial;
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly flareMaterial: THREE.SpriteMaterial;
  private readonly haloTexture: THREE.CanvasTexture;
  private readonly flareTexture: THREE.CanvasTexture;
  private readonly geometry: THREE.SphereGeometry;
  private readonly radius: number;
  private t = 0;

  constructor(opts: SunOptions = {}) {
    this.object = new THREE.Group();

    const sizeScale = opts.sizeScale ?? 1;
    this.radius = BASE_SUN_RADIUS * sizeScale;
    const coreHex = opts.coreColor ?? DEFAULT_CORE_COLOR;
    const coreColor = new THREE.Color(coreHex);
    // Halo is the same hue, slightly darker; light is a pale, warmer wash so
    // planet shading still has a believable key light regardless of star tint.
    const haloColor = coreColor.clone().multiplyScalar(0.85);
    const lightColor = coreColor.clone().lerp(new THREE.Color(0xffffff), 0.35);

    this.geometry = new THREE.SphereGeometry(this.radius, 48, 32);
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: coreColor,
      toneMapped: false
    });
    this.core = new THREE.Mesh(this.geometry, this.coreMaterial);
    this.core.renderOrder = 1;

    this.haloTexture = createRadialTexture([
      [0.0, "rgba(255, 240, 200, 1.00)"],
      [0.18, "rgba(255, 200, 110, 0.55)"],
      [0.45, "rgba(255, 140, 60, 0.18)"],
      [1.0, "rgba(255, 100, 40, 0.0)"]
    ]);
    this.haloMaterial = new THREE.SpriteMaterial({
      map: this.haloTexture,
      color: haloColor,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.halo = new THREE.Sprite(this.haloMaterial);
    this.halo.scale.set(this.radius * 7, this.radius * 7, 1);

    this.flareTexture = createRadialTexture([
      [0.0, "rgba(255, 255, 240, 0.95)"],
      [0.25, "rgba(255, 230, 170, 0.35)"],
      [0.6, "rgba(255, 180, 90, 0.06)"],
      [1.0, "rgba(255, 140, 60, 0.0)"]
    ]);
    this.flareMaterial = new THREE.SpriteMaterial({
      map: this.flareTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.flare = new THREE.Sprite(this.flareMaterial);
    this.flare.scale.set(this.radius * 18, this.radius * 18, 1);

    this.light = new THREE.PointLight(lightColor, 2.4, 0, 0);
    this.light.position.set(0, 0, 0);

    this.object.add(this.flare);
    this.object.add(this.halo);
    this.object.add(this.core);
    this.object.add(this.light);
  }

  update(dt: number): void {
    this.t += dt;
    const pulse = 1 + Math.sin(this.t * 1.4) * 0.04;
    const haloS = this.radius * 7 * pulse;
    this.halo.scale.set(haloS, haloS, 1);
    const flarePulse = 1 + Math.sin(this.t * 0.8 + 1.3) * 0.06;
    const flareS = this.radius * 18 * flarePulse;
    this.flare.scale.set(flareS, flareS, 1);
    this.core.rotation.y += dt * 0.05;
  }

  dispose(): void {
    this.geometry.dispose();
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
    this.flareMaterial.dispose();
    this.haloTexture.dispose();
    this.flareTexture.dispose();
  }
}

function createRadialTexture(stops: ReadonlyArray<readonly [number, string]>): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [t, color] of stops) {
      grad.addColorStop(t, color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

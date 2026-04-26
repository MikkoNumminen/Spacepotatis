import * as THREE from "three";
import missionsData from "@/game/data/missions.json";
import { getSolarSystem } from "@/game/data/solarSystems";
import type { MissionDefinition } from "@/types/game";
import { Planet } from "./Planet";
import { Starfield } from "./Starfield";
import { Sun } from "./Sun";

// Cinematic, non-interactive galaxy used as the landing-page backdrop.
// Distinct from GalaxyScene because it intentionally drops all input handling
// (raycaster, pointer/click, OrbitControls) and replaces them with an
// auto-orbiting camera. Reusing GalaxyScene would have meant either tearing
// out half its features or letting it eat hover state every frame on a page
// where there's nothing to hover.

const MISSIONS = missionsData.missions as readonly MissionDefinition[];

// Speed multiplier on planet orbit angular velocity. The gameplay scene runs
// at the catalog's natural pace, which is glacial when nothing else is moving;
// at 2.2x the outer planets sweep visibly within a few seconds without looking
// silly on the inner ones.
const ORBIT_SPEED_BOOST = 2.2;

// Camera auto-orbit. One revolution every ~90s — slow enough to feel ambient,
// fast enough that the parallax against the starfield is obvious.
const CAMERA_ORBIT_SECONDS = 90;
const CAMERA_RADIUS = 38;
const CAMERA_POLAR = Math.PI / 2.6; // ~69° off vertical → tilted top-down

export class LandingScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly starfield: Starfield;
  private readonly sun: Sun;
  private readonly planets: Planet[] = [];

  private running = false;
  private rafId = 0;
  private lastMs = 0;
  private azimuth = Math.random() * Math.PI * 2;

  private readonly onResize = () => this.resize();
  private readonly onVisibility = () => this.handleVisibility();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "low-power"
    });
    // Cap DPR lower than the gameplay scene — this is decorative, not gameplay.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setClearColor(0x05060f, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060f, 0.008);

    this.camera = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );

    this.starfield = new Starfield();
    this.scene.add(this.starfield.object);

    // Borrow the tutorial sun for the landing visual — bright warm core reads
    // well as the focal point. We only ever show one sun; this isn't tied to
    // gameplay state.
    const system = getSolarSystem("tutorial");
    this.sun = new Sun({
      coreColor: system.sunColor,
      sizeScale: system.sunSize * 1.1
    });
    this.scene.add(this.sun.object);

    const ambient = new THREE.AmbientLight(0x1a2440, 0.07);
    const rimLight = new THREE.DirectionalLight(0x3a5b8c, 0.10);
    rimLight.position.set(-10, -2, -8);
    this.scene.add(ambient, rimLight);

    // Pull every planet from every system — the landing visual benefits from
    // a busier orbit field than any single system shows in gameplay.
    for (const def of MISSIONS) {
      const planet = new Planet(def);
      // Hide the floating name labels; they'd compete with the SPACEPOTATIS
      // wordmark and tagline.
      this.setPlanetLabelVisible(planet, false);
      this.planets.push(planet);
      this.scene.add(planet.object);
    }

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastMs) / 1000, 0.05);
      this.lastMs = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.starfield.dispose();
    this.sun.dispose();
    for (const planet of this.planets) planet.dispose();
    this.renderer.dispose();
  }

  private update(dt: number): void {
    this.starfield.update(dt);
    this.sun.update(dt);
    for (const planet of this.planets) {
      // Inline a temporarily boosted orbit by stepping with a scaled dt. The
      // Planet class advances internally, so we feed it the boosted dt instead
      // of mutating its private angle.
      planet.update(dt * ORBIT_SPEED_BOOST);
    }
    this.azimuth += (Math.PI * 2 * dt) / CAMERA_ORBIT_SECONDS;
    const sinPolar = Math.sin(CAMERA_POLAR);
    this.camera.position.set(
      CAMERA_RADIUS * sinPolar * Math.cos(this.azimuth),
      CAMERA_RADIUS * Math.cos(CAMERA_POLAR),
      CAMERA_RADIUS * sinPolar * Math.sin(this.azimuth)
    );
    this.camera.lookAt(0, 0, 0);
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private handleVisibility(): void {
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.rafId);
    } else if (!this.running) {
      this.start();
    }
  }

  // Planet doesn't expose a label-toggle, but the label is the last child of
  // its group (added after outline / mesh / optional ring in Planet.ts). Hide
  // it by walking the group for any THREE.Sprite children.
  private setPlanetLabelVisible(planet: Planet, visible: boolean): void {
    planet.object.traverse((child) => {
      if ((child as THREE.Sprite).isSprite) {
        child.visible = visible;
      }
    });
  }
}

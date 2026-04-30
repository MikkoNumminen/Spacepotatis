import * as THREE from "three";
import { getAllMissions } from "@/game/data/missions";
import { getSolarSystem } from "@/game/data/solarSystems";
import type { CelestialBody } from "./CelestialBody";
import { createSceneRig, type SceneRig } from "./SceneRig";

// Cinematic, non-interactive galaxy used as the landing-page backdrop.
// Distinct from GalaxyScene because it intentionally drops all input handling
// (raycaster, pointer/click, OrbitControls) and replaces them with an
// auto-orbiting camera. Reusing GalaxyScene would have meant either tearing
// out half its features or letting it eat hover state every frame on a page
// where there's nothing to hover.

const MISSIONS = getAllMissions();

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
  private readonly rig: SceneRig;
  private readonly camera: THREE.PerspectiveCamera;

  private running = false;
  private rafId = 0;
  private lastMs = 0;
  private azimuth = Math.random() * Math.PI * 2;

  private readonly onResize = () => this.resize();
  private readonly onVisibility = () => this.handleVisibility();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Borrow the tutorial sun for the landing visual — bright warm core reads
    // well as the focal point. We only ever show one sun; this isn't tied to
    // gameplay state.
    const system = getSolarSystem("tutorial");

    this.rig = createSceneRig(canvas, {
      // Cap DPR lower than the gameplay scene — this is decorative, not gameplay.
      dpr: 1.5,
      powerPreference: "low-power",
      sunColor: system.sunColor,
      sunSize: system.sunSize * 1.1,
      // Pull every planet from every system — the landing visual benefits from
      // a busier orbit field than any single system shows in gameplay.
      planets: MISSIONS
    });

    this.camera = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.applyViewOffset();

    // Hide the floating name labels; they'd compete with the SPACEPOTATIS
    // wordmark and tagline.
    for (const planet of this.rig.planets) {
      this.setPlanetLabelVisible(planet, false);
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
      this.rig.renderer.render(this.rig.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.rig.dispose();
  }

  private update(dt: number): void {
    this.rig.starfield.update(dt);
    this.rig.sun.update(dt);
    // Two-pass update so child-orbit bodies (orbitParentId, e.g. the Market
    // station orbits the Spurdospärdersi planet) read their parent's
    // up-to-date position rather than orbiting the sun. Mirrors the same
    // pattern in GalaxyScene. Roots first, children second.
    const boosted = dt * ORBIT_SPEED_BOOST;
    for (const planet of this.rig.planets) {
      if (planet.getDefinition().orbitParentId) continue;
      planet.update(boosted);
    }
    for (const planet of this.rig.planets) {
      const parentId = planet.getDefinition().orbitParentId;
      if (!parentId) continue;
      const parent = this.rig.planetsById.get(parentId);
      planet.update(boosted, parent ? parent.object.position : null);
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
    this.rig.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // Off-axis projection so the scene origin (sun) renders LEFT of screen
  // center instead of dead center. The SPACEPOTATIS title + button column
  // sit in the centered content area; without this offset the sun's bright
  // glow + the silhouettes of the inner planets passing through it wash
  // out the central column on every load. setViewOffset is the cleanest
  // tool for this — it shifts the projection in screen-space so the sun
  // stays at a fixed off-center position regardless of where the camera
  // is along its orbit.
  private applyViewOffset(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // Shift the rendered viewport's origin RIGHT by 22% of canvas width,
    // which moves the scene center LEFT on screen. The buttons get a clear
    // backdrop; the sun lives in the left third instead of dead-center.
    this.camera.setViewOffset(w, h, w * 0.22, 0, w, h);
  }

  private handleVisibility(): void {
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.rafId);
    } else if (!this.running) {
      this.start();
    }
  }

  // Neither Planet nor Station exposes a label-toggle, but the label is a
  // THREE.Sprite child of body.object. Walk the group and hide every sprite.
  private setPlanetLabelVisible(body: CelestialBody, visible: boolean): void {
    body.object.traverse((child) => {
      if ((child as THREE.Sprite).isSprite) {
        child.visible = visible;
      }
    });
  }
}

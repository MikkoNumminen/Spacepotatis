import * as THREE from "three";
import missionsData from "@/game/data/missions.json";
import { getSolarSystem } from "@/game/data/solarSystems";
import type { MissionDefinition, SolarSystemId } from "@/types/game";
import { Planet } from "./Planet";
import { Starfield } from "./Starfield";
import { CameraController } from "./CameraController";
import { Sun } from "./Sun";

export interface GalaxyOptions {
  onPlanetHover?: (mission: MissionDefinition | null) => void;
  onPlanetSelect?: (mission: MissionDefinition) => void;
  activeSystemId?: SolarSystemId;
}

const MISSIONS = missionsData.missions as readonly MissionDefinition[];

export class GalaxyScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: GalaxyOptions;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly cameraCtl: CameraController;
  private readonly starfield: Starfield;
  private readonly sun: Sun;
  private readonly planets: Planet[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2(10, 10); // off-screen at boot
  private readonly pickables: THREE.Mesh[] = [];

  private running = false;
  private rafId = 0;
  private lastMs = 0;
  private hovered: Planet | null = null;

  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerClick = (e: PointerEvent) => this.handlePointerClick(e);
  private readonly onResize = () => this.resize();

  constructor(canvas: HTMLCanvasElement, opts: GalaxyOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setClearColor(0x05060f, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05060f, 0.008);

    this.cameraCtl = new CameraController(canvas, canvas.clientWidth / canvas.clientHeight);

    this.starfield = new Starfield();
    this.scene.add(this.starfield.object);

    const activeSystemId: SolarSystemId = opts.activeSystemId ?? "tutorial";
    const activeSystem = getSolarSystem(activeSystemId);

    this.sun = new Sun({
      coreColor: activeSystem.sunColor,
      sizeScale: activeSystem.sunSize
    });
    this.scene.add(this.sun.object);

    const ambient = new THREE.AmbientLight(0x1a2440, 0.07);
    const rimLight = new THREE.DirectionalLight(0x3a5b8c, 0.10);
    rimLight.position.set(-10, -2, -8);
    this.scene.add(ambient, rimLight);

    for (const def of MISSIONS) {
      if (def.solarSystemId !== activeSystemId) continue;
      const planet = new Planet(def);
      this.planets.push(planet);
      this.pickables.push(planet.getMesh());
      this.scene.add(planet.object);
    }

    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("click", this.onPointerClick);
    window.addEventListener("resize", this.onResize);
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
      this.renderer.render(this.scene, this.cameraCtl.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("click", this.onPointerClick);
    window.removeEventListener("resize", this.onResize);
    this.cameraCtl.dispose();
    this.starfield.dispose();
    this.sun.dispose();
    for (const planet of this.planets) planet.dispose();
    this.renderer.dispose();
  }

  private update(dt: number): void {
    this.starfield.update(dt);
    this.sun.update(dt);
    for (const planet of this.planets) planet.update(dt);
    this.cameraCtl.update(dt);
    this.updateHover();
  }

  private updateHover(): void {
    this.raycaster.setFromCamera(this.pointerNdc, this.cameraCtl.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const firstHit = hits[0];
    const hitMesh = firstHit ? firstHit.object : null;
    const next = this.planets.find((p) => p.getMesh() === hitMesh) ?? null;

    if (next !== this.hovered) {
      this.hovered?.setHovered(false);
      next?.setHovered(true);
      this.hovered = next;
      this.canvas.style.cursor = next ? "pointer" : "default";
      this.opts.onPlanetHover?.(next ? next.getDefinition() : null);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerClick(_e: PointerEvent): void {
    if (this.hovered) {
      this.opts.onPlanetSelect?.(this.hovered.getDefinition());
    }
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.cameraCtl.resize(w / h);
  }
}

import * as THREE from "three";
import { getAllMissions } from "@/game/data/missions";
import { getSolarSystem } from "@/game/data/solarSystems";
import type { MissionDefinition, SolarSystemId } from "@/types/game";
import type { Planet } from "./Planet";
import { CameraController } from "./CameraController";
import { createSceneRig, type SceneRig } from "./SceneRig";

export interface GalaxyOptions {
  onPlanetHover?: (mission: MissionDefinition | null) => void;
  onPlanetSelect?: (mission: MissionDefinition) => void;
  activeSystemId?: SolarSystemId;
}

const MISSIONS = getAllMissions();

export class GalaxyScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: GalaxyOptions;

  private readonly rig: SceneRig;
  private readonly cameraCtl: CameraController;
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

    const activeSystemId: SolarSystemId = opts.activeSystemId ?? "tutorial";
    const activeSystem = getSolarSystem(activeSystemId);

    this.rig = createSceneRig(canvas, {
      dpr: 2,
      powerPreference: "high-performance",
      sunColor: activeSystem.sunColor,
      sunSize: activeSystem.sunSize,
      planets: MISSIONS.filter((def) => def.solarSystemId === activeSystemId)
    });

    this.cameraCtl = new CameraController(canvas, canvas.clientWidth / canvas.clientHeight);

    for (const planet of this.rig.planets) {
      this.pickables.push(planet.getMesh());
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
      this.rig.renderer.render(this.rig.scene, this.cameraCtl.camera);
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
    this.rig.dispose();
  }

  private update(dt: number): void {
    this.rig.starfield.update(dt);
    this.rig.sun.update(dt);
    for (const planet of this.rig.planets) planet.update(dt);
    this.cameraCtl.update(dt);
    this.updateHover();
  }

  private updateHover(): void {
    this.raycaster.setFromCamera(this.pointerNdc, this.cameraCtl.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    const firstHit = hits[0];
    const hitMesh = firstHit ? firstHit.object : null;
    const next = this.rig.planets.find((p) => p.getMesh() === hitMesh) ?? null;

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
    this.rig.renderer.setSize(w, h, false);
    this.cameraCtl.resize(w / h);
  }
}

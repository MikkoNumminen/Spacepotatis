import type * as THREE from "three";
import type { MissionDefinition, MissionId } from "@/types/game";

// Common shape for any orbiting body the galaxy scene tracks. Implemented by
// Planet (sphere with procedural surface) and Station (mechanical mesh group).
// Lets SceneRig and GalaxyScene treat "the things in orbit" uniformly while
// keeping the two visual representations as completely separate classes.
export interface CelestialBody {
  readonly object: THREE.Group;
  // dt in seconds. parentPosition shifts the orbit's center: when the body
  // declares orbitParentId, callers pass the parent's current world position
  // so the local-orbit math runs in the parent's frame.
  update(dt: number, parentPosition?: THREE.Vector3 | null): void;
  setHovered(hovered: boolean): void;
  getMissionId(): MissionId;
  getDefinition(): MissionDefinition;
  // The mesh registered in the GalaxyScene raycaster so hovers/clicks resolve
  // to this body. For Station this is an invisible bounding sphere; for
  // Planet it's the surface sphere itself.
  getMesh(): THREE.Mesh;
  // Updates the second line under the body's name. Pass null to clear it.
  setStatusLabel(status: string | null, color: string): void;
  dispose(): void;
}

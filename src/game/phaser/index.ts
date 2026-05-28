// PUBLIC API — anything exported here is the contract other modules depend on.
//   Stable. Breaking changes require a coordinated update of importers.
//   See ../../../docs/audit/02-target-architecture.md for the boundary rationale.
//
// INVARIANT: the phaser barrel intentionally re-exports ONLY the cross-module
//   surface (config, events, registry). Scenes / entities / systems are
//   INTERNAL — they're loaded by createPhaserGame at scene-instantiation
//   time. Re-exporting them through the barrel would expose Phaser DOM
//   side effects (canvas, WebGL context) to every consumer.

export { SCENE_KEYS, createPhaserGame } from "./config";
export type { CombatSummary, BootData } from "./config";
export { emit, on } from "./events";
export type { CombatEvent, CombatEventType } from "./events";
export { getSummary, setSummary, setBootData } from "./registry";

// INTERNAL — scenes, entities, systems are NOT re-exported here.
//   They are wired together inside createPhaserGame and consumed only
//   within src/game/phaser/. DO NOT import these from outside the module.

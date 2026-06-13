// PUBLIC API — anything exported here is the contract other modules depend on.
//   Stable. Breaking changes require a coordinated update of importers.
//   See ../../../docs/audit/02-target-architecture.md for the boundary rationale.
//
// INVARIANT: importing missions.ts triggers runDataIntegrityCheck at module
//   load. The barrel re-exporting from "./missions" preserves this contract —
//   any consumer that imports from "@/game/data" runs the integrity check at
//   boot. See ./integrityCheck.ts and the missions.ts module top.

export * from "./weapons";
export type * from "./weapons";
export * from "./enemies";
export type * from "./enemies";
export * from "./missions";
export type * from "./missions";
export * from "./perks";
export type * from "./perks";
export * from "./augments";
export type * from "./augments";
export * from "./lootPools";
export type * from "./lootPools";
export * from "./solarSystems";
export type * from "./solarSystems";
export * from "./story";
export type * from "./story";
export * from "./storyTriggers";
export type * from "./storyTriggers";
export * from "./missionWeaponRewards";
export type * from "./missionWeaponRewards";
export * from "./waves";
export type * from "./waves";
export * from "./obstacles";
export type * from "./obstacles";
export * from "./stats";
export type * from "./stats";
export * from "./upgrades";
export type * from "./upgrades";
export * from "./upgradeCurves";
export * from "./clearedState";
export type * from "./clearedState";
export * from "./systemUnlocks";
export * from "./integrityCheck";
export type * from "./integrityCheck";

// Thin barrel — the real state lives in stateCore.ts, persistence.ts,
// shipMutators.ts, and pricing.ts. Keep this file as a stable surface so
// `import * as GameState from "@/game/state/GameState"` (Phaser scenes,
// React UI, tests) continues to work without any consumer changes.

export * from "./stateCore";
export * from "./shipMutators";
export * from "./persistence";
export * from "./pricing";

// PUBLIC API — anything exported here is the contract other modules depend on.
//   Stable. Breaking changes require a coordinated update of importers.
//   See ../../../docs/audit/02-target-architecture.md for the boundary rationale.
//
// INVARIANT: every engine self-registers with `audioBus.register(category, this)`
//   in its constructor. The bus is the single source of truth for mute state —
//   never re-introduce a manual fan-out hub. See AudioBus.ts.

export * from "./AudioBus";
export type * from "./AudioBus";
export * from "./music";
export type * from "./music";
export * from "./story";
export type * from "./story";
export * from "./storyLogAudio";
export type * from "./storyLogAudio";
export * from "./menuBriefingAudio";
export type * from "./menuBriefingAudio";
export * from "./itemSfx";
export type * from "./itemSfx";
export * from "./leaderboardAudio";
export type * from "./leaderboardAudio";
export * from "./sfx";
export type * from "./sfx";
export * from "./clearedStateCue";
export type * from "./clearedStateCue";
export * from "./uiCues";
export type * from "./uiCues";
export * from "./userActivation";
export type * from "./userActivation";

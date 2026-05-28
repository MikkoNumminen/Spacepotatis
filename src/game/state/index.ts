// PUBLIC API — anything below this line is the contract other modules depend on.
//   Stable. Breaking changes require a coordinated update of importers.
//   See ../../../docs/audit/02-target-architecture.md for the boundary rationale.
//
// INVARIANT: importing this barrel triggers stateCore.ts's module-load side
//   effects (runDataIntegrityCheck via getAllMissions + SSR-guarded
//   localStorage read via readSeenStoriesLocal). This is the expected
//   behavior — the integrity check fires at boot so missing JSON refs throw
//   at startup instead of mid-game. See ./stateCore.ts.
//
// INVARIANT: this module owns the 8-layer save round-trip pipeline. Any
//   change to persistence.ts / sync.ts / saveQueue.ts / scoreQueue.ts /
//   syncCache.ts must run /save-roundtrip-audit before commit per
//   CLAUDE.md §18. The persistence/ sub-folder migrators are INTERNAL —
//   NOT re-exported here.

// GameState.ts is itself a barrel re-exporting from stateCore, shipMutators,
// persistence, and pricing. Re-export through it to avoid double-exporting
// those four files directly.
export * from "./GameState";
export type * from "./GameState";

// useGameState is not in the GameState.ts barrel.
export * from "./useGameState";
export type * from "./useGameState";

// ShipConfig is imported by stateCore/shipMutators but NOT re-exported by
// the GameState chain, so no conflict here.
export * from "./ShipConfig";
export type * from "./ShipConfig";

// rewards is standalone — no re-export conflicts.
export * from "./rewards";
export type * from "./rewards";

// sync.ts is the primary save-round-trip surface. It already re-exports a
// subset of syncCache (clearLoadSaveCache, isSaveCached, getSaveCache) and
// FlushResult from saveQueue. Re-export sync first, then add the remaining
// symbols from syncCache/saveQueue/scoreQueue individually to avoid duplicates.
export * from "./sync";
export type * from "./sync";

// syncCache exports not already covered by sync.ts's own re-exports:
// sync re-exports: clearLoadSaveCache, isSaveCached, getSaveCache
// Remaining syncCache exports:
export {
  isHydrationCompleted,
  markHydrationCompleted,
  resetHydrationCompleted,
  setSaveCache,
  getInflightLoad,
  setInflightLoad,
  getCurrentPlayerEmail,
  setCurrentPlayerEmail,
  getLastLoadResultValue,
  setLastLoadResult
} from "./syncCache";

// saveQueue exports not already covered by sync.ts's own re-exports:
// sync re-exports: FlushResult (type)
// Remaining saveQueue exports:
export {
  SAVE_QUEUED_MESSAGE,
  clearSaveQueue,
  markSavePending,
  readPendingSaveForTest,
  flushPendingSave
} from "./saveQueue";
export type {
  PendingSave,
  SavePostFn,
  FlushArgs
} from "./saveQueue";

// scoreQueue exports not already covered by sync.ts:
// sync defines its own drainScoreQueue wrapper — do NOT re-export scoreQueue's
// drainScoreQueue here to avoid the ambiguous-re-export error.
export {
  QUEUED_MESSAGE,
  clearScoreQueue,
  enqueueScore,
  readScoreQueueForTest
} from "./scoreQueue";
export type {
  QueuedScore,
  ScorePostInput,
  ScorePostFn,
  DrainResult
} from "./scoreQueue";

// seenStoriesLocal: readSeenStoriesLocal is already in the GameState chain via
// stateCore's re-export. Export only the remaining symbols.
export {
  SEEN_STORIES_LOCAL_KEY,
  writeSeenStoriesLocal
} from "./seenStoriesLocal";

// useOptimisticAuth moved here from infra in PR #248.
export * from "./useOptimisticAuth";
export type * from "./useOptimisticAuth";

// guestCache is standalone — no re-export conflicts.
export * from "./guestCache";
export type * from "./guestCache";

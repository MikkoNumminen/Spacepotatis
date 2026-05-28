// PUBLIC API — anything exported here is the contract other modules depend on.
//   Stable. Breaking changes require a coordinated update of importers.
//   See ../../docs/audit/02-target-architecture.md for the boundary rationale.
//
// NOTE: schemas/ has its own barrel at @/lib/schemas — do NOT re-export
//   from it here (would create a single barrel mixing API-boundary schemas
//   with DB/auth primitives).
//
// NOTE: useOptimisticAuth has moved to @/game/state/useOptimisticAuth —
//   it was the only lib → game backedge and now lives in the state module.

export * from "./auth";
export * from "./authCache";
export type * from "./authCache";
export * from "./authEmailVerified";
export * from "./db";
export type * from "./db";
export * from "./handle";
export type * from "./handle";
export * from "./leaderboard";
export type * from "./leaderboard";
export * from "./leaderboardMapper";
export type * from "./leaderboardMapper";
export * from "./neonRetry";
export type * from "./neonRetry";
export * from "./players";
export type * from "./players";
export * from "./routes";
export type * from "./routes";
export * from "./saveValidation";
export type * from "./saveValidation";
export * from "./securityHeaders";
export type * from "./securityHeaders";
export * from "./useHandle";
export type * from "./useHandle";
export * from "./useReliableSession";
export type * from "./useReliableSession";

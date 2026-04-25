// Re-export Kysely table shapes so callers can import DB types from a single
// `@/types/database` path without pulling in the Kysely runtime client.
export type { Database, PlayersTable, SaveGamesTable, LeaderboardTable } from "@/lib/db";

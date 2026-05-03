import { Kysely, PostgresDialect, type Generated } from "kysely";
import { Pool } from "@neondatabase/serverless";

/**
 * Kysely database interface — the canonical TypeScript shape of our schema.
 * Keep in lockstep with db/migrations/*.sql. When adding a migration, update
 * this type in the same commit.
 *
 * Tables are namespaced under the `spacepotatis` Postgres schema so this
 * project can share a Vercel/Neon database with other services without
 * stepping on table names.
 *
 * `Generated<T>` marks columns that are `NOT NULL DEFAULT ...` in SQL — they
 * are required on SELECT but optional on INSERT.
 *
 * Pool comes from Neon's serverless driver — API-compatible with `pg.Pool`
 * but uses WebSockets so it works in Vercel Edge runtime as well as Node.
 * The Edge data routes (/api/save, /api/leaderboard) and the Node auth
 * route share the same `getDb()` because of this.
 */
export interface Database {
  "spacepotatis.players": PlayersTable;
  "spacepotatis.save_games": SaveGamesTable;
  "spacepotatis.leaderboard": LeaderboardTable;
  "spacepotatis.save_audit": SaveAuditTable;
}

export interface PlayersTable {
  id: Generated<string>;
  email: string;
  name: string | null;
  // Public-facing alias the player picks the first time they play. Shown on
  // the leaderboard. Nullable until the player picks one; uniqueness is
  // enforced case-insensitively by a partial unique index in SQL.
  handle: string | null;
  created_at: Generated<Date>;
}

export interface SaveGamesTable {
  id: Generated<string>;
  player_id: string;
  slot: Generated<number>;
  credits: Generated<number>;
  current_planet: string | null;
  ship_config: Generated<Record<string, unknown>>;
  completed_missions: Generated<string[]>;
  unlocked_planets: Generated<string[]>;
  played_time_seconds: Generated<number>;
  seen_story_entries: Generated<string[]>;
  // Last-viewed solar system. NULL until the player warps for the first
  // time after the column shipped — hydrate() falls back to the first
  // unlocked system in that case.
  current_solar_system_id: string | null;
  updated_at: Generated<Date>;
}

export interface LeaderboardTable {
  id: Generated<string>;
  player_id: string;
  mission_id: string;
  score: number;
  time_seconds: number | null;
  created_at: Generated<Date>;
}

// Forensic audit log for /api/save POSTs. One row per attempt — success,
// validator rejection, or server error — capturing the request payload, the
// previous server-side row (so we can see what was about to be overwritten),
// and the response status + error code. See migration 20260503000000.
export interface SaveAuditTable {
  id: Generated<string>;
  player_id: string;
  slot: Generated<number>;
  request_payload: Record<string, unknown>;
  response_status: number;
  response_error: string | null;
  prev_snapshot: Record<string, unknown> | null;
  request_ip: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}

let _db: Kysely<Database> | null = null;

export function getDb(): Kysely<Database> {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  _db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 5,
        idleTimeoutMillis: 10_000
      })
    })
  });

  return _db;
}

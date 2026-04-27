import { unstable_cache } from "next/cache";
import { sql } from "kysely";
import { getDb } from "@/lib/db";
import type { MissionId } from "@/types/game";

// Tag used to invalidate every cached leaderboard slice when a new score
// lands. One coarse tag (rather than per-mission tags) is fine — the dataset
// is small and a fresh INSERT means at least one slice is stale anyway.
export const LEADERBOARD_CACHE_TAG = "leaderboard";

export interface LeaderboardEntry {
  readonly playerName: string;
  readonly score: number;
  readonly timeSeconds: number | null;
  readonly createdAt: string;
}

export interface PilotEntry {
  readonly handle: string;
  readonly clears: number;
  readonly playtimeSeconds: number;
  readonly bestScore: number;
}

async function fetchLeaderboardEntries(
  missionId: MissionId,
  limit: number
): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const rows = await db
    .selectFrom("spacepotatis.leaderboard as lb")
    .innerJoin("spacepotatis.players as p", "p.id", "lb.player_id")
    .select(["p.handle as player_handle", "lb.score", "lb.time_seconds", "lb.created_at"])
    .where("lb.mission_id", "=", missionId)
    .orderBy("lb.score", "desc")
    .orderBy("lb.created_at", "desc")
    .limit(limit)
    .execute();

  // Never expose email or Google profile name to other users. Players that
  // haven't picked a handle show as a generic "Pilot" label; once they pick
  // one, every previous score they posted reattributes automatically because
  // we join on handle through player_id.
  return rows.map((r) => ({
    playerName: r.player_handle ?? "Pilot",
    score: r.score,
    timeSeconds: r.time_seconds,
    createdAt: r.created_at.toISOString()
  }));
}

// Cached read. Same (missionId, limit) within the revalidate window gets
// served without touching Neon. revalidateTag(LEADERBOARD_CACHE_TAG) from
// the leaderboard POST flushes every cached slice so new scores show up
// on the next request.
export const getCachedLeaderboard = unstable_cache(
  fetchLeaderboardEntries,
  ["leaderboard-entries-v1"],
  { revalidate: 60, tags: [LEADERBOARD_CACHE_TAG] }
);

// "Top Pilots" composite ranking — a single board across the whole game,
// sitting above the per-mission grid on /leaderboard. Each row aggregates
// data the player already produces (cleared count from save_games, best
// score from leaderboard) so we don't need a new lifetime-stats schema.
//
// Anonymous players (no handle) are excluded — they'd all collapse to a
// "Pilot" row and confuse the ranking. They reappear once they pick a
// handle; the join is on player_id, so prior progress reattributes
// automatically.
//
// Sort: clears DESC (real progress signal), then best_score DESC (skill
// peak), then playtime ASC (faster runs win ties — punishes idling).
async function fetchTopPilots(limit: number): Promise<PilotEntry[]> {
  const db = getDb();
  const rows = await db
    .selectFrom("spacepotatis.players as p")
    .leftJoin(
      (eb) =>
        eb
          .selectFrom("spacepotatis.save_games")
          .select([
            "player_id",
            sql<number>`COALESCE(array_length(completed_missions, 1), 0)`.as("clears"),
            "played_time_seconds as playtime"
          ])
          .where("slot", "=", 1)
          .as("s"),
      (join) => join.onRef("s.player_id", "=", "p.id")
    )
    .leftJoin(
      (eb) =>
        eb
          .selectFrom("spacepotatis.leaderboard")
          .select(["player_id", sql<number>`MAX(score)`.as("best_score")])
          .groupBy("player_id")
          .as("lb"),
      (join) => join.onRef("lb.player_id", "=", "p.id")
    )
    .select([
      "p.handle",
      sql<number>`COALESCE(s.clears, 0)`.as("clears"),
      sql<number>`COALESCE(s.playtime, 0)`.as("playtime"),
      sql<number>`COALESCE(lb.best_score, 0)`.as("best_score")
    ])
    .where("p.handle", "is not", null)
    .where((eb) =>
      eb.or([
        eb(sql`COALESCE(s.clears, 0)`, ">", 0),
        eb(sql`COALESCE(lb.best_score, 0)`, ">", 0)
      ])
    )
    .orderBy(sql`COALESCE(s.clears, 0)`, "desc")
    .orderBy(sql`COALESCE(lb.best_score, 0)`, "desc")
    .orderBy(sql`COALESCE(s.playtime, 0)`, "asc")
    .limit(limit)
    .execute();

  return rows.map((r) => ({
    handle: r.handle ?? "Pilot",
    clears: Number(r.clears),
    playtimeSeconds: Number(r.playtime),
    bestScore: Number(r.best_score)
  }));
}

export const getCachedTopPilots = unstable_cache(
  fetchTopPilots,
  ["top-pilots-v1"],
  { revalidate: 60, tags: [LEADERBOARD_CACHE_TAG] }
);

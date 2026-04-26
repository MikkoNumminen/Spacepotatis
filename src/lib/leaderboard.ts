import { unstable_cache } from "next/cache";
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

async function fetchLeaderboardEntries(
  missionId: MissionId,
  limit: number
): Promise<LeaderboardEntry[]> {
  const db = getDb();
  const rows = await db
    .selectFrom("spacepotatis.leaderboard as lb")
    .innerJoin("spacepotatis.players as p", "p.id", "lb.player_id")
    .select([
      "p.name as player_name",
      "p.email as player_email",
      "lb.score",
      "lb.time_seconds",
      "lb.created_at"
    ])
    .where("lb.mission_id", "=", missionId)
    .orderBy("lb.score", "desc")
    .orderBy("lb.created_at", "desc")
    .limit(limit)
    .execute();

  return rows.map((r) => ({
    playerName: r.player_name ?? r.player_email.split("@")[0] ?? "pilot",
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

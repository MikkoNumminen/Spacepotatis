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

import { unstable_cache } from "next/cache";
import { PHASE_EXPORT, PHASE_PRODUCTION_BUILD } from "next/constants";
import { sql } from "kysely";
import { getDb } from "@/lib/db";
import type { MissionId } from "@/types/game";
import { mapRowToPilot } from "./leaderboardMapper";

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

// During the production build, Vercel gives each page a 60s wall budget.
// Neon's serverless WebSocket driver occasionally dangles a connection
// that the build worker can't unwind, killing the deploy with a generic
// "Connection terminated unexpectedly" trace and a "took more than 60
// seconds" timeout. The page renders fine at request time (the runtime
// path has its own retry + warmup behavior), so the safe move is to
// skip the Neon hit entirely during the static prerender and let the
// ISR refresh on the first real request fill in the data. The cost is
// up to ~60s of empty leaderboard immediately after a deploy, vs. a
// hung build that prevents the deploy from shipping at all.
//
// We match BOTH `PHASE_PRODUCTION_BUILD` (Next.js static page
// generation during a production build, the path we actually hit) and
// `PHASE_EXPORT` (the `next export` flow). The project doesn't use
// `next export` today, but defense-in-depth: if anyone ever flips on
// `output: "export"` they shouldn't have to rediscover this gotcha.
// Production runtime, dev, and test phases don't match.
//
// CRITICAL: this check runs at the PUBLIC ENTRY (getCachedLeaderboard /
// getCachedTopPilots) — BEFORE the `unstable_cache` wrapper sees the
// call. Putting it inside the wrapped fetcher would still skip Neon,
// but the empty `[]` would be persisted into Vercel's data cache (TTL
// 60s) and could outlive the build. Any runtime read within that window
// would hit the cached `[]` instead of querying Neon. By short-circuiting
// at the public entry, the data cache stays untouched during prerender
// and the first runtime read populates it cleanly with real data.
//
// Long-term alternatives if Neon's driver doesn't get more reliable:
//   1. Switch /leaderboard to `dynamic = "force-dynamic"`. Page renders
//      at request time; never touches Neon at build. Slight CPU cost per
//      request, still bounded by `unstable_cache(revalidate: 60)`.
//   2. Add a build-time fetch with a short hard timeout (~5s). Real data
//      ships in the prerender when Neon is fast; falls back to the
//      empty-build path otherwise. More moving parts than this fix.
//   3. Wait for Neon driver to ship a fix for the dangling-WebSocket
//      teardown.
export function isBuildPhase(): boolean {
  const phase = process.env.NEXT_PHASE;
  return phase === PHASE_PRODUCTION_BUILD || phase === PHASE_EXPORT;
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
const cachedFetchLeaderboardEntries = unstable_cache(
  fetchLeaderboardEntries,
  ["leaderboard-entries-v1"],
  { revalidate: 60, tags: [LEADERBOARD_CACHE_TAG] }
);

// Public entry: short-circuits BEFORE delegating to `unstable_cache` so
// build-phase prerenders never enter the data cache. See the long
// header on `isBuildPhase` for why that ordering matters.
export async function getCachedLeaderboard(
  missionId: MissionId,
  limit: number
): Promise<LeaderboardEntry[]> {
  if (isBuildPhase()) return [];
  return cachedFetchLeaderboardEntries(missionId, limit);
}

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

  return rows.map(mapRowToPilot);
}

const cachedFetchTopPilots = unstable_cache(
  fetchTopPilots,
  ["top-pilots-v1"],
  { revalidate: 60, tags: [LEADERBOARD_CACHE_TAG] }
);

// Same entry-level short-circuit as getCachedLeaderboard.
export async function getCachedTopPilots(limit: number): Promise<PilotEntry[]> {
  if (isBuildPhase()) return [];
  return cachedFetchTopPilots(limit);
}

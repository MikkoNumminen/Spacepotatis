import type { MissionId } from "@/types";
import { getCachedLeaderboard, isBuildPhase } from "@/lib/leaderboard";

// Server Component. Reads via the `unstable_cache`-wrapped helper so a fresh
// page render hits Neon at most once per revalidate window per (mission,
// limit) pair, and not at all when the cached entry is still warm. The
// previous client-side fetch hit /api/leaderboard on every mount because
// `next.revalidate` on browser fetch is a no-op.
export default async function Leaderboard({
  missionId,
  limit = 10
}: {
  missionId: MissionId;
  limit?: number;
}) {
  let entries;
  try {
    entries = await getCachedLeaderboard(missionId, limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return (
      <div className="rounded border border-space-border p-3 text-xs text-hud-red">
        Leaderboard unavailable ({message})
      </div>
    );
  }

  if (entries.length === 0) {
    // Distinguish "we skipped Neon at build time, real data lands after
    // ISR refresh" from "this mission genuinely has zero scores". The
    // build-phase render is baked into the static HTML for ~60s after
    // deploy — render a loading skeleton so it cannot be mistaken for an
    // empty leaderboard. The genuine empty case still gets the "be the
    // first" copy.
    if (isBuildPhase()) return <LeaderboardSkeleton />;
    return <div className="text-xs text-space-border">No scores yet — be the first.</div>;
  }

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[20rem] text-xs">
        <thead>
          <tr className="text-left text-space-border">
            <th className="py-1">#</th>
            <th>Pilot</th>
            <th className="text-right">Score</th>
            <th className="text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.playerName}-${e.createdAt}`} className="border-t border-space-border">
              <td className="py-1 text-hud-amber">{i + 1}</td>
              <td className="text-hud-green">{e.playerName}</td>
              <td className="text-right">{e.score}</td>
              <td className="text-right text-space-border">
                {e.timeSeconds !== null ? `${e.timeSeconds}s` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div
      className="-mx-1 space-y-2 text-xs"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading leaderboard…</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-t border-space-border/40 py-1 first:border-t-0"
        >
          <div className="h-3 w-4 animate-pulse rounded bg-space-border/30" />
          <div className="h-3 w-28 animate-pulse rounded bg-space-border/30" />
          <div className="ml-auto h-3 w-12 animate-pulse rounded bg-space-border/30" />
          <div className="h-3 w-10 animate-pulse rounded bg-space-border/30" />
        </div>
      ))}
    </div>
  );
}

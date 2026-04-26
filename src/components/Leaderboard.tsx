import type { MissionId } from "@/types/game";
import { getCachedLeaderboard } from "@/lib/leaderboard";

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
    return <div className="text-xs text-space-border">No scores yet — be the first.</div>;
  }

  return (
    <table className="w-full text-xs">
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
  );
}

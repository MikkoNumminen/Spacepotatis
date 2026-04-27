import { getCachedTopPilots } from "@/lib/leaderboard";

// "Top Pilots" composite leaderboard. Sits above the per-mission grid on
// /leaderboard. Server Component; reads via the cached helper so the page
// hits Neon at most once per revalidate window.
export default async function TopPilots({ limit = 10 }: { limit?: number }) {
  let entries;
  try {
    entries = await getCachedTopPilots(limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return (
      <div className="rounded border border-space-border p-3 text-xs text-hud-red">
        Top pilots unavailable ({message})
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded border border-space-border bg-space-panel/70 p-4 text-xs text-space-border">
        No pilots yet — clear a mission and you&apos;ll be the first.
      </div>
    );
  }

  return (
    <section className="rounded border border-space-border bg-space-panel/70 p-4">
      <h2 className="mb-1 font-display tracking-widest text-hud-green">TOP PILOTS</h2>
      <div className="mb-3 text-[11px] text-hud-amber">
        ranked by missions cleared, then best score, then fastest playtime
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-space-border">
            <th className="py-1">#</th>
            <th>Pilot</th>
            <th className="text-right">Cleared</th>
            <th className="text-right">Best score</th>
            <th className="text-right">Playtime</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.handle} className="border-t border-space-border">
              <td className="py-1 text-hud-amber">{i + 1}</td>
              <td className="text-hud-green">{e.handle}</td>
              <td className="text-right">{e.clears}</td>
              <td className="text-right">{e.bestScore}</td>
              <td className="text-right text-space-border">
                {formatPlaytime(e.playtimeSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// Show H:MM:SS for runs over an hour, M:SS otherwise. The leaderboard page
// is read by humans, not parsed — formatting wins over precision here.
function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

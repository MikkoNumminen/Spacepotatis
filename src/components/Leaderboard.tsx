"use client";

import { useEffect, useState } from "react";
import type { MissionId } from "@/types/game";

interface Entry {
  playerName: string;
  score: number;
  timeSeconds: number | null;
  createdAt: string;
}

interface LeaderboardResponse {
  missionId: MissionId;
  entries: Entry[];
}

export default function Leaderboard({
  missionId,
  limit = 10
}: {
  missionId: MissionId;
  limit?: number;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/leaderboard?mission=${encodeURIComponent(missionId)}&limit=${limit}`,
          { next: { revalidate: 60 } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LeaderboardResponse;
        if (!cancelled) setEntries(data.entries);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "unknown");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missionId, limit]);

  if (error) {
    return (
      <div className="rounded border border-space-border p-3 text-xs text-hud-red">
        Leaderboard unavailable ({error})
      </div>
    );
  }

  if (!entries) {
    return <div className="text-xs text-space-border">Loading leaderboard…</div>;
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

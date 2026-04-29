import Link from "next/link";
import { getCombatMissions } from "@/game/data/missions";
import Leaderboard from "@/components/Leaderboard";
import TopPilots from "@/components/TopPilots";
import { ROUTES } from "@/lib/routes";

// ISR: re-render at most every 60s. Each render goes through the cached
// leaderboard fn so worst case is one Neon roundtrip per mission tile per
// minute, and zero when the cache is warm.
export const revalidate = 60;

const COMBAT_MISSIONS = getCombatMissions();

export default function LeaderboardPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <Link
        href={ROUTES.page.home}
        className="fixed left-6 top-6 z-10 rounded border border-hud-green/60 px-3 py-1.5 font-mono text-xs text-hud-green/90 transition-colors hover:bg-hud-green/10"
      >
        ← Back
      </Link>
      <header>
        <h1 className="font-display text-3xl tracking-widest">LEADERBOARD</h1>
      </header>

      <TopPilots limit={10} />

      <div className="grid gap-6 md:grid-cols-2">
        {COMBAT_MISSIONS.map((m) => (
          <section key={m.id} className="rounded border border-space-border bg-space-panel/70 p-4">
            <h2 className="mb-1 font-display tracking-widest text-hud-green">{m.name}</h2>
            <div className="mb-3 text-[11px] text-hud-amber">
              difficulty {"★".repeat(m.difficulty)}
            </div>
            <Leaderboard missionId={m.id} limit={10} />
          </section>
        ))}
      </div>
    </main>
  );
}

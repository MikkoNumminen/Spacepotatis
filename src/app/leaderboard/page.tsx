import Link from "next/link";
import { getCombatMissions } from "@/game/data/missions";
import Leaderboard from "@/components/Leaderboard";
import LeaderboardBriefing from "@/components/LeaderboardBriefing";
import TopPilots from "@/components/TopPilots";
import { BUTTON_BACK } from "@/components/ui/buttonClasses";
import { ROUTES } from "@/lib/routes";

// ISR: re-render at most every 60s. Each render goes through the cached
// leaderboard fn so worst case is one Neon roundtrip per mission tile per
// minute, and zero when the cache is warm.
export const revalidate = 60;

const COMBAT_MISSIONS = getCombatMissions();

export default function LeaderboardPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <LeaderboardBriefing />
      <header className="flex flex-wrap items-center gap-4 sm:gap-5">
        <Link
          href={ROUTES.page.home}
          className={BUTTON_BACK}
        >
          ← Back
        </Link>
        <h1 className="font-display text-2xl tracking-widest sm:text-3xl">LEADERBOARD</h1>
      </header>

      <TopPilots limit={10} />

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {COMBAT_MISSIONS.map((m) => (
          <section key={m.id} className="rounded border border-space-border bg-space-panel/70 p-4">
            <h2 className="mb-1 font-display tracking-widest text-hud-green">{m.name}</h2>
            <div className="mb-3 text-xs text-hud-amber">
              difficulty {"★".repeat(m.difficulty)}
            </div>
            <Leaderboard missionId={m.id} limit={10} />
          </section>
        ))}
      </div>
    </main>
  );
}

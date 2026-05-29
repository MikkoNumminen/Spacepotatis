import { getCombatMissions } from "@/game/data";
import Leaderboard from "@/components/Leaderboard";
import LeaderboardBriefing from "@/components/LeaderboardBriefing";
import TopPilots from "@/components/TopPilots";
import StickyHeader from "@/components/ui/StickyHeader";
import { ROUTES } from "@/lib/routes";

// PER-REQUEST RENDER. Justification for the §13 checklist:
//   ISR with `revalidate: 60` was burning users for up to ~60s after
//   every deploy — the static prerender skipped Neon (build-phase guard
//   in lib/leaderboard.ts), so the cached HTML showed the loading card
//   until the first request after the revalidate window triggered a
//   background regen. Multiple shipped PRs in quick succession kept
//   resetting that window. "User must have the means to enter the
//   leaderboard" — so the page renders dynamically.
//
// Vercel cost is bounded by `unstable_cache(60)` around the Neon fetch
// in lib/leaderboard.ts: every request pays a server render (cheap), but
// at most one Neon roundtrip per 60s window per (mission, limit) pair.
// For the current ~10 leaderboard views/day this is well under the
// Hobby tier's 100k function invocations/month — by a factor of ~300×.
export const dynamic = "force-dynamic";

const COMBAT_MISSIONS = getCombatMissions();

export default function LeaderboardPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6 sm:pb-10">
      <LeaderboardBriefing />
      <StickyHeader backHref={ROUTES.page.home} title="LEADERBOARD" />

      <TopPilots limit={10} />

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {COMBAT_MISSIONS.map((m) => (
          <section
            key={m.id}
            className="rounded border border-space-border bg-space-panel/70 p-4"
          >
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

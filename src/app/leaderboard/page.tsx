import { getCombatMissions } from "@/game/data";
import Leaderboard from "@/components/Leaderboard";
import LeaderboardBriefing from "@/components/LeaderboardBriefing";
import TopPilots from "@/components/TopPilots";
import StickyHeader from "@/components/ui/StickyHeader";
import { ROUTES } from "@/lib/routes";
import { isBuildPhase } from "@/lib/leaderboard";

// ISR: re-render at most every 60s. Each render goes through the cached
// leaderboard fn so worst case is one Neon roundtrip per mission tile per
// minute, and zero when the cache is warm.
export const revalidate = 60;

const COMBAT_MISSIONS = getCombatMissions();

export default function LeaderboardPage() {
  // During build-phase prerender we skip every Neon read (the WebSocket
  // driver occasionally hangs the build worker — see lib/leaderboard.ts).
  // Rendering the per-mission grid in that mode would bake an empty board
  // into the static HTML and look indistinguishable from a wiped
  // leaderboard. Swap the entire data area for a single centered loading
  // card so the post-deploy ISR-warm window reads unambiguously as
  // "loading" rather than "empty". ISR replaces this with real data on
  // the first request after the 60s revalidate window expires.
  const warming = isBuildPhase();

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 px-4 pb-6 sm:gap-8 sm:px-6 sm:pb-10">
      <LeaderboardBriefing />
      <StickyHeader backHref={ROUTES.page.home} title="LEADERBOARD" />

      {warming ? (
        <LeaderboardLoadingScreen />
      ) : (
        <>
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
        </>
      )}
    </main>
  );
}

function LeaderboardLoadingScreen() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="flex flex-1 items-center justify-center py-16 sm:py-24"
    >
      <div className="select-none rounded border border-hud-green/40 bg-space-panel/80 p-6 shadow-[0_0_30px_rgba(94,255,167,0.15)] sm:p-8">
        <div className="font-display text-2xl tracking-widest text-hud-green animate-pulse sm:text-3xl">
          LOADING LEADERBOARD
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.3em] text-hud-amber/70">
          standby
        </div>
        <span className="sr-only">Loading leaderboard…</span>
      </div>
    </section>
  );
}

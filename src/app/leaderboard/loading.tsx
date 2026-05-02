import Splash from "@/components/Splash";

// Streamed Suspense fallback for /leaderboard. Next.js renders this
// immediately on full-page refresh and on client-side nav, then swaps
// in the real page once getCachedTopPilots + per-mission getCachedLeaderboard
// resolve. Without this, a refresh during a cold or invalidated cache stalls
// the browser on the previous page until the SSR finishes — feels like a
// dead F5. Same boot splash the home page uses, so the UX is consistent.
export default function LeaderboardLoading() {
  return (
    <main className="relative min-h-dvh">
      <Splash
        steps={[
          { label: "warm reactors", done: true },
          { label: "fetch leaderboard", done: false }
        ]}
      />
    </main>
  );
}

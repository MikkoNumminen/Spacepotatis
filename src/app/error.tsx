"use client";

import Link from "next/link";
import { ROUTES } from "@/lib/routes";

// Root segment error boundary. Lower-risk than /play and /shop because the
// landing page is mostly static + a few small client islands (LandingShell,
// MuteToggle, SignInButton, PlayButton), but a throw in any of those would
// otherwise fall through to Next.js's generic root error UI. Mirrors the
// /leaderboard, /play, /shop boundaries — branded recovery affordance with
// reset() + a Back-to-home link (which collapses to a same-page reset
// because home IS this segment).
export default function RootError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-space-bg p-4">
      <div className="select-none rounded border border-hud-red/40 bg-space-bg/80 p-5 shadow-[0_0_30px_rgba(255,94,94,0.15)] sm:p-6">
        <div className="font-display text-2xl tracking-widest text-hud-red sm:text-3xl">
          SIGNAL LOST
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-hud-amber/70">
          ground control offline
        </div>
        <p className="mt-5 max-w-sm font-mono text-sm text-hud-amber/80">
          Something went sideways. Try again or refresh.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 font-mono text-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-hud-green/60 px-3 py-1 text-hud-green transition hover:bg-hud-green/10"
          >
            Try again
          </button>
          <Link
            href={ROUTES.page.home}
            className="rounded border border-space-border px-3 py-1 text-space-border transition hover:text-hud-green"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

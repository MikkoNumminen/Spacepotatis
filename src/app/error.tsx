"use client";

// Root segment error boundary. Lower-risk than /play and /shop because the
// landing page is mostly static + a few small client islands (LandingShell,
// MuteToggle, SignInButton, PlayButton), but a throw in any of those would
// otherwise fall through to Next.js's generic root error UI.
//
// Two recovery affordances, intentionally distinct:
//   - "Try again" → reset() — re-mounts the segment with React state intact
//     elsewhere. Cheap, fast, fixes most transient render failures.
//   - "Reload page" → window.location.reload() — hard reload that re-runs
//     hydration from scratch. Escapes sticky React state where reset() loops
//     back into the same throw (e.g. a corrupt localStorage entry that the
//     client islands keep re-reading).
// A "Back to home" link would collapse to the same as reset() here because
// home IS this segment, so we offer a hard-reload escape hatch instead.
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
          Something went sideways. Try again — or hard-reload if it sticks.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 font-mono text-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-hud-green/60 px-3 py-1 text-hud-green transition hover:bg-hud-green/10"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-space-border px-3 py-1 text-space-border transition hover:text-hud-green"
          >
            Reload page
          </button>
        </div>
      </div>
    </main>
  );
}

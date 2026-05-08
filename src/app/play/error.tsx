"use client";

import Link from "next/link";
import { ROUTES } from "@/lib/routes";

// Segment-scoped error boundary for /play. Fires when the GameCanvas dynamic
// import fails (network blip after a deploy, cache miss on the chunk) or when
// any client-side throw bubbles past the GameCanvas's own splash. Without
// this, Next.js falls through to the root default error UI which is generic
// and offers no recovery affordance. The raw error.message is intentionally
// not surfaced (could leak internals); reset() re-mounts the segment so the
// user can retry without manually reloading.
export default function PlayError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-space-bg p-4">
      <div className="select-none rounded border border-hud-red/40 bg-space-bg/80 p-5 shadow-[0_0_30px_rgba(255,94,94,0.15)] sm:p-6">
        <div className="font-display text-2xl tracking-widest text-hud-red sm:text-3xl">
          MISSION ABORT
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-hud-amber/70">
          loader malfunction
        </div>
        <p className="mt-5 max-w-sm font-mono text-sm text-hud-amber/80">
          We couldn&apos;t boot the cockpit. Try again or head back to base.
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

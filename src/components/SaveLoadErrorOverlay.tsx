"use client";

// Full-screen overlay that takes priority over the galaxy canvas when
// `useCloudSaveSync` reports "load-failed". The pre-fix UX hid load
// failures behind the splash clear, leaving the player staring at
// INITIAL_STATE (0 credits, no missions) and thinking their save was wiped
// — they could panic-clear localStorage or sign out, indirectly destroying
// the actual server save (which was usually fine; the client just couldn't
// read or parse it).
//
// Visual treatment mirrors src/app/leaderboard/error.tsx for consistency:
// red border + amber sub-label + monospace body. raw error.message is
// intentionally NOT surfaced here (could leak internals — same rule we
// applied in PR #91 for the leaderboard error boundary).

import Link from "next/link";
import { ROUTES } from "@/lib/routes";
import type { LoadFailureReason } from "@/game/state/sync";

export interface SaveLoadErrorOverlayProps {
  readonly reason?: LoadFailureReason;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

// Coarse, human-readable mapping. We intentionally keep these vague — the
// player doesn't need (and can be confused by) a 500 vs 502 vs schema
// distinction. The console.error in sync.ts carries the diagnostic detail.
function reasonLabel(reason: LoadFailureReason | undefined): string {
  if (reason === "network_error") return "no connection";
  if (reason === "schema_rejected") return "save unreadable";
  if (reason === "http_error") return "server unreachable";
  return "load failed";
}

export default function SaveLoadErrorOverlay({
  reason,
  onRetry,
  onDismiss
}: SaveLoadErrorOverlayProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="save-load-error-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-space-bg/90 p-4 backdrop-blur-sm"
    >
      <div className="select-none rounded border border-hud-red/40 bg-space-bg/90 p-5 shadow-[0_0_30px_rgba(255,94,94,0.25)] sm:p-6">
        <div
          id="save-load-error-title"
          className="font-display text-2xl tracking-widest text-hud-red sm:text-3xl"
        >
          SAVE COULD NOT BE LOADED
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-hud-amber/70">
          {reasonLabel(reason)}
        </div>
        <p className="mt-5 max-w-sm font-mono text-sm text-hud-amber/90">
          We couldn&apos;t reach your saved progress. <strong>Do not play
          right now</strong> &mdash; starting a new run could risk what&apos;s
          already saved.
        </p>
        <p className="mt-3 max-w-sm font-mono text-xs text-hud-amber/60">
          Try retrying. If that keeps failing, sign out and back in, or
          come back in a few minutes.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 font-mono text-sm">
          <button
            type="button"
            onClick={onRetry}
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
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-hud-red/40 px-3 py-1 text-hud-red/80 transition hover:bg-hud-red/10"
          >
            I understand the risk
          </button>
        </div>
      </div>
    </div>
  );
}

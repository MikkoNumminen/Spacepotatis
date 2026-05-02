"use client";

import { signIn, signOut } from "next-auth/react";
import { clearAuthCache } from "@/lib/authCache";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";
import { clearHandleCache } from "@/lib/useHandle";
import { clearLoadSaveCache } from "@/game/state/syncCache";
import { clearSaveQueue } from "@/game/state/saveQueue";
import { BUTTON_NAV } from "./ui/buttonClasses";

// Simple auth control used on the landing page. Shows the handle (never the
// Google profile name) plus a sign-out affordance when authenticated, or a
// Google sign-in button otherwise. The richer UserMenu dropdown lives in
// the galaxy view where future profile actions (avatar, GDPR, etc.) will
// hang off the same trigger.
export default function SignInButton({ compact = false }: { compact?: boolean }) {
  const { status, handle, firstVisit } = useOptimisticAuth();

  function handleSignOut() {
    // Wipe every client-side cache before NextAuth begins its redirect dance,
    // otherwise the next mount (potentially a different account) would briefly
    // render the previous account's handle / save state from stale module
    // caches.
    //
    // Also wipe the durable save queue. Without this, a snapshot stamped for
    // the prior account would sit in localStorage; even though the email
    // stamp would prevent the next signed-in account from reading it, an
    // explicit sign-out is the user's "scrub this device" gesture and should
    // leave nothing behind. (See saveQueue.ts header for the cross-account
    // leak this defends against.)
    clearAuthCache();
    clearHandleCache();
    clearLoadSaveCache();
    clearSaveQueue();
    void signOut();
  }

  // Only show the loading placeholder on a true first visit. Returning
  // users render directly from the cached snapshot — no flash.
  if (firstVisit) {
    return <span className="text-xs text-space-border">…</span>;
  }

  if (status === "authenticated") {
    const label = handle ?? "Pilot";
    // Non-compact variant lives in the landing nav and must match the
    // BUTTON_NAV box (px-8 py-3 text-sm, block w-full text-center) so it
    // sits flush with PLAY/CONTINUE and Leaderboard. Hover stays red so
    // the destructive sign-out affordance reads distinctly from the rest.
    return (
      <button
        type="button"
        onClick={handleSignOut}
        className={`touch-manipulation select-none rounded border border-hud-amber/40 ${
          compact
            ? "px-2 py-1 text-xs"
            : "flex h-12 w-full items-center justify-center px-8 text-sm"
        } text-hud-green/90 hover:border-hud-red/60 hover:text-hud-red active:border-hud-red/80 active:text-hud-red`}
        title="Sign out"
      >
        {label} · sign out
      </button>
    );
  }

  // Sign-in (unauthenticated). Compact variant uses tighter padding for
  // HUD bars; the default uses BUTTON_NAV so it matches the rest of the
  // landing-page nav column.
  return (
    <button
      type="button"
      onClick={() => void signIn("google")}
      className={
        compact
          ? "touch-manipulation select-none rounded border border-hud-green/60 px-2 py-1 text-xs hover:bg-space-panel active:bg-space-panel/80"
          : BUTTON_NAV
      }
    >
      Sign in with Google
    </button>
  );
}

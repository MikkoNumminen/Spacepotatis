"use client";

import { signIn, signOut } from "next-auth/react";
import { clearAuthCache } from "@/lib/authCache";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";
import { clearHandleCache } from "@/lib/useHandle";
import { clearLoadSaveCache } from "@/game/state/sync";

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
    clearAuthCache();
    clearHandleCache();
    clearLoadSaveCache();
    void signOut();
  }

  // Only show the loading placeholder on a true first visit. Returning
  // users render directly from the cached snapshot — no flash.
  if (firstVisit) {
    return <span className="text-[11px] text-space-border">…</span>;
  }

  if (status === "authenticated") {
    const label = handle ?? "Pilot";
    return (
      <button
        type="button"
        onClick={handleSignOut}
        className={`rounded border border-hud-amber/40 ${
          compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
        } text-hud-green/90 hover:border-hud-red/60 hover:text-hud-red`}
        title="Sign out"
      >
        {label} · sign out
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void signIn("google")}
      className={`rounded border border-hud-green/60 ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      } hover:bg-hud-green/10`}
    >
      Sign in with Google
    </button>
  );
}

"use client";

import { signIn, signOut } from "next-auth/react";
import { clearAuthCache } from "@/lib/authCache";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";
import { clearHandleCache } from "@/lib/useHandle";
import { clearLoadSaveCache } from "@/game/state/syncCache";
import { clearSaveQueue } from "@/game/state/saveQueue";
import { clearGuestSnapshot } from "@/game/state/guestCache";
import { resetState } from "@/game/state/GameState";
import { BUTTON_NAV } from "./ui/buttonClasses";

// Simple auth control used on the landing page. Two states only:
//   - authenticated   → handle button that signs out
//   - unauthenticated → "Sign in with Google" button
//
// To switch accounts, the user signs out and signs in again — the sign-in
// flow always passes `prompt=select_account` so Google's account chooser
// appears every time, letting the user pick a different identity without
// any dedicated "switch account" affordance.
export default function SignInButton() {
  const { status, handle, firstVisit } = useOptimisticAuth();

  // Scrub-this-device cleanup before sign-out. The next mount must be
  // unable to render any sliver of the prior account's state. This:
  //
  //   - Wipes auth + handle caches (landing-page optimistic UI).
  //   - Wipes the loadSave result cache + hydration flag (so saveNow on
  //     the new account refuses to POST until a real load lands).
  //   - Wipes the durable saveQueue (no leftover stamped snapshot to be
  //     replayed on a future visit).
  //   - Wipes the guest-progress cache (so a future first-time sign-in on
  //     the same browser can't inadvertently inherit progress that this
  //     user accumulated POST-sign-out — see guestCache.ts INV-3).
  //   - Resets in-memory GameState (so the guest writer can't re-populate
  //     the cache from the still-resident, just-signed-out user's data
  //     during the brief window before the page navigates).
  function scrubLocalAccountState() {
    clearAuthCache();
    clearHandleCache();
    clearLoadSaveCache();
    clearSaveQueue();
    clearGuestSnapshot();
    resetState();
  }

  function handleSignOut() {
    scrubLocalAccountState();
    void signOut();
  }

  // Always force Google's account chooser via `prompt=select_account`.
  // Without this, a user already signed into a Google session gets
  // silently re-signed-in with the same identity — making it impossible
  // to switch accounts via this button alone.
  function handleSignIn() {
    void signIn("google", { callbackUrl: "/play" }, { prompt: "select_account" });
  }

  // Only show the loading placeholder on a true first visit. Returning
  // users render directly from the cached snapshot — no flash.
  if (firstVisit) {
    return <span className="text-xs text-space-border">…</span>;
  }

  if (status === "authenticated") {
    const label = handle ?? "Pilot";
    // Sits in the landing nav and matches the BUTTON_NAV box (px-8 py-3
    // text-sm, block w-full text-center) so it lines up with PLAY /
    // CONTINUE / Leaderboard. Hover stays red so the destructive sign-out
    // affordance reads distinctly from the rest.
    return (
      <button
        type="button"
        onClick={handleSignOut}
        className="flex h-12 w-full touch-manipulation select-none items-center justify-center rounded border border-hud-amber/40 px-8 text-sm text-hud-green/90 hover:border-hud-red/60 hover:text-hud-red active:border-hud-red/80 active:text-hud-red"
        title="Sign out"
      >
        {label} · sign out
      </button>
    );
  }

  // Sign-in (unauthenticated). Matches the rest of the landing-page nav
  // column via BUTTON_NAV.
  return (
    <button
      type="button"
      onClick={handleSignIn}
      className={BUTTON_NAV}
    >
      Sign in with Google
    </button>
  );
}

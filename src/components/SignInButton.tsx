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

// Simple auth control used on the landing page. Shows the handle (never the
// Google profile name) plus sign-out and switch-account affordances when
// authenticated, or a Google sign-in button otherwise. The richer UserMenu
// dropdown lives in the galaxy view where future profile actions (avatar,
// GDPR, etc.) will hang off the same trigger; sign-out and switch-account
// stay here on the landing page so the player can't trigger a destructive
// account change mid-mission.
export default function SignInButton({ compact = false }: { compact?: boolean }) {
  const { status, handle, firstVisit } = useOptimisticAuth();

  // Shared scrub-this-device cleanup. Both sign-out and switch-account end
  // the current account's session on this browser; the next mount must be
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

  // "Switch account" — sign out without redirect, then re-trigger the
  // OAuth flow with prompt=select_account so Google shows its account
  // picker even if the user's browser is already signed into a Google
  // session. Lands back at /play; useCloudSaveSync sees the new email and
  // runs loadSave for the destination account. setCurrentPlayerEmail's
  // own cleanup is the matching server-side guard — hydrationCompleted
  // resets to false so the new account's loadSave verifies before any
  // saveNow can POST.
  function handleSwitchAccount() {
    scrubLocalAccountState();
    void signOut({ redirect: false }).then(() =>
      signIn("google", { callbackUrl: "/play" }, { prompt: "select_account" })
    );
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
    //
    // The switch-account button is rendered as a smaller secondary
    // affordance below sign-out — discoverable but visually subordinate
    // so it doesn't compete with PLAY for attention.
    return (
      <div className={compact ? "flex items-center gap-2" : "flex w-full flex-col gap-2"}>
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
        <button
          type="button"
          onClick={handleSwitchAccount}
          className={`touch-manipulation select-none rounded border border-space-border ${
            compact
              ? "px-2 py-1 text-[11px]"
              : "flex h-9 w-full items-center justify-center px-8 text-xs"
          } text-hud-green/70 hover:border-hud-green/40 hover:text-hud-green active:border-hud-green/60`}
          title="Switch to a different Google account"
        >
          Switch account
        </button>
      </div>
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

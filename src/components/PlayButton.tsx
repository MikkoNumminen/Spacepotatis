"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HandlePrompt from "./HandlePrompt";
import { menuBriefingAudio } from "@/game/audio/menuBriefingAudio";
import { ROUTES } from "@/lib/routes";
import { useOptimisticAuth } from "@/lib/useOptimisticAuth";

// Auth-aware Play button on the landing page. The page itself is force-static,
// so this is a small client island that hydrates with the optimistic auth
// snapshot, flips the label, shows a guest warning when not signed in, and
// prompts for a public handle on the very first PLAY/CONTINUE click.
//
// State sources:
//   useOptimisticAuth() → status + handle + hasSave, optimistic from cache
//                          on returning visits; isVerified flips true once
//                          the real session round-trip completes.
//
// Handle gating: the player's email and Google profile name are never shown
// to other users. The first time an authenticated player presses the button,
// the HandlePrompt modal blocks navigation until they pick a public alias.
export default function PlayButton() {
  const router = useRouter();
  const { status, handle, hasSave, isVerified, firstVisit, refetchHandle } =
    useOptimisticAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  // Set when the user clicks PLAY before the real auth round-trip lands —
  // we intercept the click and decide what to do (open modal vs. navigate)
  // once the verification settles. Without this, a fast click before the
  // session resolves used to navigate straight to /play and skip the prompt.
  const [pendingClick, setPendingClick] = useState(false);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // The briefing voice is a menu-only artifact — kill it the moment the
    // player commits to entering, regardless of which branch we take below.
    menuBriefingAudio.stop();
    // Unauthenticated → guest play, let the link navigate normally.
    if (status !== "authenticated") return;
    // Always intercept when authenticated. We need to know the handle before
    // we can decide whether to navigate or prompt; defer everything until
    // the verification settles rather than racing the user.
    e.preventDefault();
    if (!isVerified) {
      setPendingClick(true);
      return;
    }
    if (handle === null) {
      setShowPrompt(true);
      return;
    }
    router.push(ROUTES.page.play);
  }

  // If the click came in before verification resolved, finish what the user
  // started as soon as we know which path to take.
  useEffect(() => {
    if (!pendingClick || !isVerified) return;
    setPendingClick(false);
    // Verified state may now be unauthenticated — let the link's default
    // navigation happen by simulating a fresh click.
    if (status !== "authenticated") {
      router.push(ROUTES.page.play);
      return;
    }
    if (handle === null) {
      setShowPrompt(true);
    } else {
      router.push(ROUTES.page.play);
    }
  }, [pendingClick, isVerified, status, handle, router]);

  function handlePromptSubmit() {
    refetchHandle();
    setShowPrompt(false);
    router.push(ROUTES.page.play);
  }

  // First visit (no cache yet): hold the label neutral so we don't flash
  // PLAY → CONTINUE for the first-ever sign-in. Returning users skip this
  // branch — the cached snapshot already tells us which label is correct.
  if (firstVisit) {
    return (
      <div className="flex flex-col items-center gap-2">
        <a
          href={ROUTES.page.play}
          className="rounded border border-space-border px-8 py-3 font-display tracking-widest text-space-border"
          aria-busy="true"
        >
          PLAY
        </a>
      </div>
    );
  }

  const label = status === "authenticated" && hasSave ? "CONTINUE" : "PLAY";
  const showGuestWarning = status === "unauthenticated";

  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href={ROUTES.page.play}
        onClick={handleClick}
        className="rounded border border-hud-green/60 px-8 py-3 font-display tracking-widest hover:bg-hud-green/10"
      >
        {label}
      </a>
      {showGuestWarning && (
        <span className="text-[11px] text-hud-amber/70">
          Playing as guest — progress won&apos;t be saved.
        </span>
      )}
      {showPrompt && (
        <HandlePrompt
          onSubmit={handlePromptSubmit}
          onCancel={() => setShowPrompt(false)}
        />
      )}
    </div>
  );
}

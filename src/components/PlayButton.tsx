"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import HandlePrompt from "./HandlePrompt";
import { useHandle } from "@/lib/useHandle";

// Auth-aware Play button on the landing page. The page itself is force-static,
// so this is a small client island that hydrates with the session state and
// flips the label, shows a guest warning when not signed in, and prompts for
// a public handle on the very first PLAY/CONTINUE click.
//
// Statuses:
//   "loading"         → neutral "PLAY" while NextAuth resolves the cookie.
//   "authenticated"   → fetches /api/save once; "CONTINUE" if a save exists,
//                        "PLAY" for fresh accounts that have never played.
//   "unauthenticated" → "PLAY" plus a small warning that progress won't persist.
//
// Handle gating: the player's email and Google profile name are never shown
// to other users. The first time an authenticated player presses the button,
// the HandlePrompt modal blocks navigation until they pick a public alias.
export default function PlayButton() {
  const router = useRouter();
  const { status } = useSession();
  const { handle, status: handleStatus, refetch: refetchHandle } = useHandle();
  const [hasSave, setHasSave] = useState<boolean | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  // Set when the user clicks PLAY while the handle fetch is still pending —
  // we intercept the click and decide what to do (open modal vs. navigate)
  // once the fetch lands. Without this, a fast click before the fetch
  // resolves used to navigate straight to /play and skip the prompt.
  const [pendingClick, setPendingClick] = useState(false);

  const handleLoading = handleStatus === "idle" || handleStatus === "loading";

  useEffect(() => {
    if (status !== "authenticated") {
      setHasSave(null);
      return;
    }
    let cancelled = false;
    fetch("/api/save", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = (await res.json()) as unknown;
        return body !== null;
      })
      .then((exists) => {
        if (!cancelled) setHasSave(exists);
      })
      .catch(() => {
        if (!cancelled) setHasSave(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Unauthenticated → guest play, let the link navigate normally.
    if (status !== "authenticated") return;
    // Always intercept when authenticated. We need to know the handle before
    // we can decide whether to navigate or prompt; defer everything until the
    // fetch resolves rather than racing the user.
    e.preventDefault();
    if (handleLoading) {
      setPendingClick(true);
      return;
    }
    if (handle === null) {
      setShowPrompt(true);
      return;
    }
    router.push("/play");
  }

  // If the click came in before the handle fetch resolved, finish what the
  // user started as soon as we know which path to take.
  useEffect(() => {
    if (!pendingClick || handleLoading) return;
    setPendingClick(false);
    if (handle === null) {
      setShowPrompt(true);
    } else {
      router.push("/play");
    }
  }, [pendingClick, handleLoading, handle, router]);

  function handlePromptSubmit() {
    refetchHandle();
    setShowPrompt(false);
    router.push("/play");
  }

  const label = status === "authenticated" && hasSave === true ? "CONTINUE" : "PLAY";
  const showGuestWarning = status === "unauthenticated";

  return (
    <div className="flex flex-col items-center gap-2">
      <a
        href="/play"
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import HandlePrompt from "./HandlePrompt";

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
  const [hasSave, setHasSave] = useState<boolean | null>(null);
  // undefined = not fetched yet (still loading), null = no handle on record,
  // string = picked handle. Distinguishing "loading" from "missing" matters
  // because we don't want to flash the prompt before we know.
  const [handle, setHandle] = useState<string | null | undefined>(undefined);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setHasSave(null);
      setHandle(undefined);
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
    fetch("/api/handle", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { handle: string | null };
        return body.handle;
      })
      .then((h) => {
        if (!cancelled) setHandle(h);
      })
      .catch(() => {
        if (!cancelled) setHandle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (status !== "authenticated") return;
    // Still loading the handle — don't intercept; let it through, the /play
    // page will work fine and we don't want to feel sluggish on first click.
    if (handle === undefined) return;
    if (handle === null) {
      e.preventDefault();
      setShowPrompt(true);
    }
  }

  function handlePromptSubmit(picked: string) {
    setHandle(picked);
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

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

// Auth-aware Play button on the landing page. The page itself is force-static,
// so this is a small client island that hydrates with the session state and
// flips the label + reveals a guest-mode warning when the user is not signed in.
//
// Statuses:
//   "loading"         → neutral "PLAY" while NextAuth resolves the cookie.
//   "authenticated"   → "CONTINUE" — implies their save will load on /play.
//   "unauthenticated" → "PLAY" plus a small warning that progress won't persist.
export default function PlayButton() {
  const { status } = useSession();
  const label = status === "authenticated" ? "CONTINUE" : "PLAY";
  const showGuestWarning = status === "unauthenticated";

  return (
    <div className="flex flex-col items-center gap-2">
      <Link
        href="/play"
        className="rounded border border-hud-green/60 px-8 py-3 font-display tracking-widest hover:bg-hud-green/10"
      >
        {label}
      </Link>
      {showGuestWarning && (
        <span className="text-[11px] text-hud-amber/70">
          Playing as guest — progress won&apos;t be saved.
        </span>
      )}
    </div>
  );
}

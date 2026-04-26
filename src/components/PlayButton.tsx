"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// Auth-aware Play button on the landing page. The page itself is force-static,
// so this is a small client island that hydrates with the session state and
// flips the label + reveals a guest-mode warning when the user is not signed in.
//
// Statuses:
//   "loading"         → neutral "PLAY" while NextAuth resolves the cookie.
//   "authenticated"   → fetches /api/save once; "CONTINUE" if a save exists,
//                        "PLAY" for fresh accounts that have never played.
//   "unauthenticated" → "PLAY" plus a small warning that progress won't persist.
export default function PlayButton() {
  const { status } = useSession();
  const [hasSave, setHasSave] = useState<boolean | null>(null);

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

  const label = status === "authenticated" && hasSave === true ? "CONTINUE" : "PLAY";
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

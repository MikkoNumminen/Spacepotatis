"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

// We never want to surface the Google profile name or email anywhere
// the player could mistake it for their public identity. The button always
// shows the handle (if set) or a neutral "Pilot" placeholder while the
// /api/handle GET is in flight, with a "set handle" hint when the account
// hasn't picked one yet.
export default function SignInButton({ compact = false }: { compact?: boolean }) {
  const { status } = useSession();
  const [handle, setHandle] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (status !== "authenticated") {
      setHandle(undefined);
      return;
    }
    let cancelled = false;
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

  if (status === "loading") {
    return <span className="text-[11px] text-space-border">…</span>;
  }

  if (status === "authenticated") {
    const label = handle ?? "Pilot";
    return (
      <button
        type="button"
        onClick={() => void signOut()}
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

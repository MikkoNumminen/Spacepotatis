"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function SignInButton({ compact = false }: { compact?: boolean }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-[11px] text-space-border">…</span>;
  }

  if (session?.user) {
    const label = session.user.name ?? session.user.email ?? "pilot";
    return (
      <button
        type="button"
        onClick={() => void signOut()}
        className={`${
          compact ? "text-[11px]" : "text-xs"
        } text-hud-green/80 hover:text-hud-red`}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useHandle } from "@/lib/useHandle";

// Top-right account control in the galaxy view (and any other in-game
// surface that wants the richer user dropdown). The simple sign-in/out
// button lives in SignInButton on the landing page.
//
// Three states:
//   loading         → "…" placeholder
//   unauthenticated → "Sign in with Google" button
//   authenticated   → handle button that opens a dropdown menu
//
// The dropdown is intentionally sparse for now (just sign-out + a "more
// soon" footer). Future profile actions (avatar, GDPR export/delete, etc.)
// will land here as additional <button role="menuitem"> children.
export default function UserMenu() {
  const { status } = useSession();
  const { handle } = useHandle();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click and Escape, plus when the auth status changes
  // (sign-out should never leave the menu lingering open).
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (status !== "authenticated") setOpen(false);
  }, [status]);

  if (status === "loading") {
    return <span className="text-[11px] text-space-border">…</span>;
  }

  if (status !== "authenticated") {
    return (
      <button
        type="button"
        onClick={() => void signIn("google")}
        className="rounded border border-hud-green/60 px-3 py-1.5 text-xs hover:bg-hud-green/10"
      >
        Sign in with Google
      </button>
    );
  }

  const label = handle ?? "Pilot";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded border border-hud-amber/40 px-3 py-1.5 text-xs text-hud-green/90 hover:bg-hud-amber/10"
      >
        {label} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-48 rounded border border-hud-amber/40 bg-space-bg shadow-[0_0_20px_rgba(255,204,51,0.15)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="block w-full px-3 py-2 text-left text-xs text-hud-green/90 hover:bg-hud-amber/10 hover:text-hud-red"
          >
            Sign out
          </button>
          <p className="border-t border-hud-amber/20 px-3 py-2 text-[11px] text-hud-amber/50">
            More options coming soon.
          </p>
        </div>
      )}
    </div>
  );
}

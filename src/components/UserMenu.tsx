"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useHandle } from "@/lib/useHandle";

// Top-right account control in the galaxy view (and any other in-game
// surface that wants the richer user dropdown). The simple sign-in/out
// button lives in SignInButton on the landing page; sign-out is
// intentionally NOT in this dropdown — account changes belong on the
// main menu so the player can't accidentally log out mid-mission.
//
// Three states:
//   loading         → "…" placeholder
//   unauthenticated → "Sign in with Google" button
//   authenticated   → handle button that opens an empty menu
//
// The dropdown is empty for now — future profile actions (avatar,
// GDPR export/delete, etc.) will land here as <button role="menuitem">
// children. The "more options coming soon" footer is the only content
// until then.
export default function UserMenu() {
  const { status } = useSession();
  const { handle } = useHandle();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click and Escape, plus when the auth status changes
  // (a sign-out from elsewhere shouldn't leave the menu lingering open).
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
          <p className="px-3 py-2 text-[11px] text-hud-amber/50">
            More options coming soon.
          </p>
        </div>
      )}
    </div>
  );
}

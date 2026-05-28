"use client";

import { useEffect } from "react";
import { bindGuestPersistenceOnce } from "@/game/state";

// Idempotent client-only mount that subscribes the guest-progress writer
// once per page lifetime AND restores any persisted anonymous snapshot on
// boot. See guestCache.ts for the full rationale.
//
// The hook is gated internally on `currentPlayerEmail === null`, so binding
// it for every visitor (including authenticated users) is safe — the writer
// callback short-circuits without doing any work.
//
// Static-page hydration trade-off (architectural, not fixable here):
//   /shop, /leaderboard, etc. are statically prerendered (Vercel CPU
//   budget, see CLAUDE.md §3). The server has no access to localStorage,
//   so static HTML always shows INITIAL_STATE (e.g. credits: 0). This
//   useEffect runs AFTER first paint, so a returning anonymous user
//   refreshing /shop briefly sees zero credits before the boot recovery
//   re-hydrates and React re-renders. The flicker is one frame (~16 ms).
//   Eliminating it would require either disabling static export (busts
//   the budget) or mirroring guest progress into a server-readable cookie
//   (heavy refactor). Accepted as-is for the canonical /play flow, where
//   SplashGate masks this entirely.
export default function GuestProgressMount() {
  useEffect(() => {
    const unbind = bindGuestPersistenceOnce();
    return () => unbind();
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";
import { bindGuestPersistenceOnce } from "@/game/state/guestCache";

// Idempotent client-only mount that subscribes the guest-progress writer
// once per page lifetime AND restores any persisted anonymous snapshot on
// boot. See guestCache.ts for the full rationale.
//
// The hook is gated internally on `currentPlayerEmail === null`, so binding
// it for every visitor (including authenticated users) is safe — the writer
// callback short-circuits without doing any work.
export default function GuestProgressMount() {
  useEffect(() => {
    const unbind = bindGuestPersistenceOnce();
    return () => unbind();
  }, []);
  return null;
}

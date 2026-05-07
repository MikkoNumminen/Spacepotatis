"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import GuestProgressMount from "@/components/GuestProgressMount";

// SessionProvider wraps the app so useSession() is available on every client
// component. Static pages stay static — the provider only fetches session
// data after hydration, via the /api/auth/session route.
//
// GuestProgressMount sits inside the SessionProvider so the guest-progress
// writer can read the resolved current-player email through syncCache. It
// renders nothing; it's a side-effectful boot hook.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <GuestProgressMount />
      {children}
    </SessionProvider>
  );
}

"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

// SessionProvider wraps the app so useSession() is available on every client
// component. Static pages stay static — the provider only fetches session
// data after hydration, via the /api/auth/session route.
export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

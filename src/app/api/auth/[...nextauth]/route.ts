import { handlers } from "@/lib/auth";

// NextAuth v5 handler. Runs on Node runtime (Google OAuth callbacks need it).
// Kept as the only non-Edge API route.
export const runtime = "nodejs";
export const { GET, POST } = handlers;

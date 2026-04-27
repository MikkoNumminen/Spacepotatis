// localStorage-backed snapshot of the last-known auth state. The landing
// page and galaxy HUD each show auth-dependent UI (PLAY vs CONTINUE,
// "Sign in" vs handle, etc.) and used to flicker through the unauthenticated
// default before NextAuth's useSession() resolved on the client. Pages are
// force-static for the Vercel budget, so server HTML can't carry the auth
// state — the cache lets repeat visitors render the correct UI synchronously
// on first paint, with the real session check reconciling in the background.

const STORAGE_KEY = "spacepotatis:auth";
const SCHEMA_VERSION = 1;

export interface AuthSnapshot {
  status: "authenticated" | "unauthenticated";
  handle: string | null;
  hasSave: boolean;
}

interface StoredSnapshot extends AuthSnapshot {
  v: number;
}

export function readAuthCache(): AuthSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSnapshot>;
    if (parsed.v !== SCHEMA_VERSION) return null;
    if (parsed.status !== "authenticated" && parsed.status !== "unauthenticated") {
      return null;
    }
    if (typeof parsed.hasSave !== "boolean") return null;
    if (parsed.handle !== null && typeof parsed.handle !== "string") return null;
    return {
      status: parsed.status,
      handle: parsed.handle,
      hasSave: parsed.hasSave
    };
  } catch {
    return null;
  }
}

export function writeAuthCache(snap: AuthSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredSnapshot = { v: SCHEMA_VERSION, ...snap };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Quota errors / private mode — silently skip; the optimistic cache is
    // a UX nicety, not a correctness requirement.
  }
}

export function clearAuthCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same rationale as writeAuthCache — never let storage failures crash
    // the auth flow.
  }
}

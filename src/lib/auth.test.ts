import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the NextAuth config without actually booting Auth.js (which expects
// a real Next.js request context). The handlers/auth/signIn/signOut surface is
// just shape we forward — the interesting logic lives in the callbacks and
// providers.

interface CapturedConfig {
  trustHost?: boolean;
  providers?: unknown[];
  session?: { strategy?: string };
  callbacks?: {
    jwt?: (args: { token: Record<string, unknown>; profile?: { email?: string } }) => Promise<Record<string, unknown>>;
    session?: (args: { session: { user: { email?: string | null } }; token: { email?: string } }) => Promise<{ user: { email?: string | null } }>;
  };
}

const captured: { config: CapturedConfig | null } = { config: null };
const googleCalls: Array<Record<string, unknown>> = [];

vi.mock("next-auth", () => ({
  default: (config: CapturedConfig) => {
    captured.config = config;
    return {
      handlers: { GET: () => undefined, POST: () => undefined },
      auth: () => Promise.resolve(null),
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve()
    };
  }
}));

vi.mock("next-auth/providers/google", () => ({
  default: (opts: Record<string, unknown>) => {
    googleCalls.push(opts);
    return { id: "google", name: "Google", type: "oauth", options: opts };
  }
}));

beforeEach(() => {
  captured.config = null;
  googleCalls.length = 0;
  vi.resetModules();
});

afterEach(() => {
  delete process.env.AUTH_GOOGLE_ID;
  delete process.env.AUTH_GOOGLE_SECRET;
});

async function loadAuth() {
  return await import("./auth");
}

describe("NextAuth config shape", () => {
  it("registers a Google provider with credentials read from env", async () => {
    process.env.AUTH_GOOGLE_ID = "id-123";
    process.env.AUTH_GOOGLE_SECRET = "secret-abc";
    await loadAuth();
    expect(googleCalls).toHaveLength(1);
    expect(googleCalls[0]).toEqual({ clientId: "id-123", clientSecret: "secret-abc" });
    expect(captured.config?.providers).toHaveLength(1);
  });

  it("uses JWT session strategy and trustHost", async () => {
    await loadAuth();
    expect(captured.config?.session?.strategy).toBe("jwt");
    expect(captured.config?.trustHost).toBe(true);
  });

  // Note: the NextAuth export surface (handlers/auth/signIn/signOut) is
  // enforced by TypeScript at compile time, not at runtime — a former
  // shape-only test here was dropped as redundant.
});

describe("NextAuth callbacks", () => {
  it("jwt callback copies profile.email onto the token", async () => {
    await loadAuth();
    const jwt = captured.config?.callbacks?.jwt;
    if (!jwt) throw new Error("expected jwt callback to be defined; fixture broken");
    const token = await jwt({ token: {}, profile: { email: "p@example.com" } });
    expect(token.email).toBe("p@example.com");
  });

  it("jwt callback leaves the token alone when no profile is provided (session refresh path)", async () => {
    await loadAuth();
    const jwt = captured.config?.callbacks?.jwt;
    if (!jwt) return;
    const token = await jwt({ token: { email: "kept@example.com", sub: "abc" } });
    expect(token.email).toBe("kept@example.com");
    expect(token.sub).toBe("abc");
  });

  it("jwt callback ignores a profile without email", async () => {
    await loadAuth();
    const jwt = captured.config?.callbacks?.jwt;
    if (!jwt) return;
    const token = await jwt({ token: {}, profile: {} });
    expect(token.email).toBeUndefined();
  });

  it("session callback projects token.email onto session.user.email", async () => {
    await loadAuth();
    const sessionCb = captured.config?.callbacks?.session;
    if (!sessionCb) throw new Error("expected session callback to be defined; fixture broken");
    const out = await sessionCb({
      session: { user: { email: null } },
      token: { email: "p@example.com" }
    });
    expect(out.user.email).toBe("p@example.com");
  });

  it("session callback leaves the session as-is when the token has no email", async () => {
    await loadAuth();
    const sessionCb = captured.config?.callbacks?.session;
    if (!sessionCb) return;
    const out = await sessionCb({
      session: { user: { email: "preexisting@example.com" } },
      token: {}
    });
    expect(out.user.email).toBe("preexisting@example.com");
  });
});

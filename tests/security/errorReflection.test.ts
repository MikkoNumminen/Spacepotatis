import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SEC-004 — Error-message reflection on GET /api/save and both /api/handle paths.
//
// Without the fix, three catch blocks leak `err.message` to the client:
//   GET /api/save  → { error: "server_error", message: "<db error text>" }
//   GET /api/handle → { error: "server_error", message: "<db error text>" }
//   POST /api/handle → { error: "server_error", message: "<db error text>" }
//
// Kysely / Neon errors can contain SQL fragments, table names, or column names.
// Leaking them to the client is an information-disclosure surface.
//
// With the fix:
//   All three paths return { error: "server_error" } with no `message` field.
//   The full error is still logged server-side via console.error.

// ── shared auth mock ────────────────────────────────────────────────────────
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

// ── shared upsert mock (will throw a DB-style error) ────────────────────────
const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

// ── db mock — always throws a Kysely-style error with an internal detail ────
const DB_INTERNAL_ERROR = new Error(
  'column "spacepotatis.save_games.secret_column" does not exist'
);
vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw DB_INTERNAL_ERROR;
  }
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  // Suppress console.error noise during the tests
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// ── GET /api/save ────────────────────────────────────────────────────────────
describe("SEC-004 — GET /api/save does not reflect err.message to the client", () => {
  it("returns { error: 'server_error' } with no message field when the DB throws", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com", name: null } });

    const { GET } = await import("../../src/app/api/save/route");
    const res = await GET();

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("server_error");
    expect(body).not.toHaveProperty("message");
  });
});

// ── GET /api/handle ──────────────────────────────────────────────────────────
describe("SEC-004 — GET /api/handle does not reflect err.message to the client", () => {
  it("returns { error: 'server_error' } with no message field when the DB throws", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com", name: null } });

    const { GET } = await import("../../src/app/api/handle/route");
    const res = await GET();

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("server_error");
    expect(body).not.toHaveProperty("message");
  });
});

// ── POST /api/handle ─────────────────────────────────────────────────────────
describe("SEC-004 — POST /api/handle does not reflect err.message to the client", () => {
  it("returns { error: 'server_error' } with no message field when the DB throws", async () => {
    authMock.mockResolvedValue({ user: { email: "user@example.com", name: null } });

    const { POST } = await import("../../src/app/api/handle/route");
    const res = await POST(
      new Request("http://x/api/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: "ValidHandle" })
      })
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("server_error");
    expect(body).not.toHaveProperty("message");
  });
});

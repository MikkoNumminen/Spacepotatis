import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));


const dbStub: {
  selectHandleRow: { handle: string | null } | undefined;
  conflictRow: { id: string } | undefined;
  updateImpl: () => Promise<unknown>;
  updateSpy: (v: Record<string, unknown>) => void;
  selectInvocations: number;
} = {
  selectHandleRow: undefined,
  conflictRow: undefined,
  updateImpl: async () => undefined,
  updateSpy: () => undefined,
  selectInvocations: 0
};

function selectChain(initial: () => Promise<unknown>) {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "executeTakeFirst") return initial;
        return () => selectChain(initial);
      }
    }
  );
}

function updateChain() {
  return {
    set: (v: Record<string, unknown>) => {
      dbStub.updateSpy(v);
      return updateChain();
    },
    where: () => updateChain(),
    execute: () => dbStub.updateImpl()
  };
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    selectFrom: () => {
      // First selectFrom in POST is the handle lookup (only used by GET).
      // But GET hits selectFrom("spacepotatis.players") with select("handle"),
      // and POST hits selectFrom for the conflict probe. We disambiguate by
      // call count — GET makes ONE select call; POST makes ONE select call.
      // The route bodies dictate the order. We expose .selectHandleRow for
      // GET and .conflictRow for POST; tests configure whichever they need.
      dbStub.selectInvocations += 1;
      return selectChain(async () =>
        dbStub.selectInvocations === 1 && dbStub.selectHandleRow !== undefined
          ? dbStub.selectHandleRow
          : dbStub.conflictRow
      );
    },
    updateTable: () => updateChain()
  })
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  dbStub.selectHandleRow = undefined;
  dbStub.conflictRow = undefined;
  dbStub.updateImpl = async () => undefined;
  dbStub.updateSpy = vi.fn();
  dbStub.selectInvocations = 0;
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("./route");
}

describe("GET /api/handle", () => {
  it("returns 401 unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns the player's existing handle", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: "Pat" } });
    dbStub.selectHandleRow = { handle: "spud" };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handle: "spud" });
  });

  it("returns null when the player has no handle yet", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.selectHandleRow = { handle: null };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handle: null });
  });

  it("returns 500 when the player upsert throws", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    upsertMock.mockRejectedValueOnce(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await loadRoute();
    const res = await GET();
    errSpy.mockRestore();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/handle", () => {
  it("returns 401 unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://x/api/handle", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: "{not-json" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_json" });
  });

  it("returns 400 validation_failed when the schema rejects (too short)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: JSON.stringify({ handle: "ab" }) })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { message: string }[] };
    expect(body.error).toBe("validation_failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 validation_failed when the handle field is missing", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("validation_failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 validation_failed when the handle contains disallowed characters", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", {
        method: "POST",
        body: JSON.stringify({ handle: "spud king!" })
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  it("returns 409 handle_taken when the case-insensitive probe finds a conflict", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.conflictRow = { id: "other-uuid" };
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: JSON.stringify({ handle: "spud" }) })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "handle_taken" });
  });

  it("returns 200 with the saved handle on the happy path", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const updateSpy = vi.fn();
    dbStub.updateSpy = updateSpy;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: JSON.stringify({ handle: "spud" }) })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handle: "spud" });
    expect(updateSpy).toHaveBeenCalledWith({ handle: "spud" });
  });

  it("translates a unique-index violation into 409 (race with another writer)", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.updateImpl = async () => {
      throw Object.assign(new Error("dup"), {
        code: "23505",
        constraint: "players_handle_lower_idx"
      });
    };
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: JSON.stringify({ handle: "spud" }) })
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "handle_taken" });
  });

  it("returns 500 on an unexpected error", async () => {
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    dbStub.updateImpl = async () => {
      throw new Error("network");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://x/api/handle", { method: "POST", body: JSON.stringify({ handle: "spud" }) })
    );
    errSpy.mockRestore();
    expect(res.status).toBe(500);
  });
});

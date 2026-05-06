import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The mock tracks every Kysely method call so tests can assert on the
// query shape without needing a live DB.
type CapturedCall = { method: string; args: unknown[] };
const captured: CapturedCall[] = [];
const stub: { returned: { id: string } } = {
  returned: { id: "player-uuid" }
};

function chain(returnId: () => string): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "executeTakeFirstOrThrow")
          return async () => ({ id: returnId() });
        if (prop === "executeTakeFirst")
          return async () => ({ id: returnId() });
        return (...args: unknown[]) => {
          captured.push({ method: prop, args });
          return chain(returnId);
        };
      }
    }
  );
}

vi.mock("./db", () => ({
  getDb: () => ({
    insertInto: (...args: unknown[]) => {
      captured.push({ method: "insertInto", args });
      return chain(() => stub.returned.id);
    }
  })
}));

beforeEach(() => {
  captured.length = 0;
  stub.returned = { id: "player-uuid" };
});

afterEach(() => {
  vi.resetModules();
});

describe("upsertPlayerId", () => {
  it("issues a single INSERT ... ON CONFLICT round-trip (no SELECT)", async () => {
    // SEC-018: the prior SELECT-then-INSERT caused a unique-constraint 500
    // on concurrent first visits. The fix collapses the operation to a single
    // INSERT ... ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    // RETURNING id — no SELECT is issued.
    stub.returned = { id: "minted-uuid" };
    const { upsertPlayerId } = await import("./players");
    const id = await upsertPlayerId("new@example.com", "Newbie");
    expect(id).toBe("minted-uuid");

    expect(captured.find((c) => c.method === "selectFrom")).toBeUndefined();
    const insert = captured.find((c) => c.method === "insertInto");
    expect(insert?.args[0]).toBe("spacepotatis.players");
    const values = captured.find((c) => c.method === "values");
    expect(values?.args[0]).toEqual({ email: "new@example.com", name: "Newbie" });
    const onConflict = captured.find((c) => c.method === "onConflict");
    expect(onConflict).toBeDefined();
    const returning = captured.find((c) => c.method === "returning");
    expect(returning?.args[0]).toBe("id");
  });

  it("resolves to the same id on a second call for the same email (ON CONFLICT path)", async () => {
    stub.returned = { id: "existing-uuid" };
    const { upsertPlayerId } = await import("./players");
    const id = await upsertPlayerId("p@example.com", "Pat");
    expect(id).toBe("existing-uuid");
    // Still no SELECT on the repeat path.
    expect(captured.find((c) => c.method === "selectFrom")).toBeUndefined();
  });

  it("forwards a null name when the auth profile lacks one", async () => {
    stub.returned = { id: "anon-uuid" };
    const { upsertPlayerId } = await import("./players");
    await upsertPlayerId("anon@example.com", null);
    const values = captured.find((c) => c.method === "values");
    expect(values?.args[0]).toEqual({ email: "anon@example.com", name: null });
  });
});

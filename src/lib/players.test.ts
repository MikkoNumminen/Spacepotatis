import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CapturedCall = { method: string; args: unknown[] };
const captured: CapturedCall[] = [];
const stub: { existing: { id: string } | undefined; created: { id: string } } = {
  existing: undefined,
  created: { id: "new-uuid" }
};

function chain(returnOnFirst: () => Promise<unknown>): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "executeTakeFirst") return returnOnFirst;
        if (prop === "executeTakeFirstOrThrow")
          return async () => {
            const v = await returnOnFirst();
            if (!v) throw new Error("no row");
            return v;
          };
        return (...args: unknown[]) => {
          captured.push({ method: prop, args });
          return chain(returnOnFirst);
        };
      }
    }
  );
}

vi.mock("./db", () => ({
  getDb: () => ({
    selectFrom: (...args: unknown[]) => {
      captured.push({ method: "selectFrom", args });
      return chain(async () => stub.existing);
    },
    insertInto: (...args: unknown[]) => {
      captured.push({ method: "insertInto", args });
      return chain(async () => stub.created);
    }
  })
}));

beforeEach(() => {
  captured.length = 0;
  stub.existing = undefined;
  stub.created = { id: "new-uuid" };
});

afterEach(() => {
  vi.resetModules();
});

describe("upsertPlayerId", () => {
  it("returns the existing id without inserting when the email is already known", async () => {
    stub.existing = { id: "existing-uuid" };
    const { upsertPlayerId } = await import("./players");
    const id = await upsertPlayerId("p@example.com", "Pat");
    expect(id).toBe("existing-uuid");

    const select = captured.find((c) => c.method === "selectFrom");
    expect(select?.args[0]).toBe("spacepotatis.players");
    const where = captured.find((c) => c.method === "where");
    expect(where?.args).toEqual(["email", "=", "p@example.com"]);
    expect(captured.find((c) => c.method === "insertInto")).toBeUndefined();
  });

  it("inserts a new player and returns the freshly minted id when the email is new", async () => {
    stub.existing = undefined;
    stub.created = { id: "minted-uuid" };
    const { upsertPlayerId } = await import("./players");
    const id = await upsertPlayerId("new@example.com", "Newbie");
    expect(id).toBe("minted-uuid");

    const insert = captured.find((c) => c.method === "insertInto");
    expect(insert?.args[0]).toBe("spacepotatis.players");
    const values = captured.find((c) => c.method === "values");
    expect(values?.args[0]).toEqual({ email: "new@example.com", name: "Newbie" });
    const returning = captured.find((c) => c.method === "returning");
    expect(returning?.args[0]).toBe("id");
  });

  it("forwards a null name when the auth profile lacks one", async () => {
    stub.existing = undefined;
    const { upsertPlayerId } = await import("./players");
    await upsertPlayerId("anon@example.com", null);
    const values = captured.find((c) => c.method === "values");
    expect(values?.args[0]).toEqual({ email: "anon@example.com", name: null });
  });
});

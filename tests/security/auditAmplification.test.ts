import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SavePayloadSchema } from "../../src/lib/schemas/save";

// SEC-011 — `seenStoryEntries` unbounded → audit-table storage DoS.
//
// Two layers of defense:
//   (1) Cap at the schema: `seenStoryEntries` is bounded at 200 entries x
//       64 chars each. Hand-crafted 4 MB payloads fail Zod validation
//       before ever reaching the route handler.
//   (2) Truncate `request_payload` in the audit insert: if the JSON
//       stringification of the payload exceeds 64 KB, the audit row stores
//       `{truncated: true, size: <length>}` instead of the full body. The
//       audit's purpose is forensic — a 64 KB cap is generous for legitimate
//       saves and forecloses the storage-amplification vector even if a
//       future schema change loosens layer (1).

describe("SEC-011 layer 1 — schema cap on seenStoryEntries", () => {
  it("rejects an array with more than 200 entries", () => {
    const tooMany = Array(201).fill("story-id");
    const result = SavePayloadSchema.safeParse({ seenStoryEntries: tooMany });
    expect(result.success).toBe(false);
    if (!result.success) {
      const seenIssue = result.error.issues.find((i) =>
        i.path.includes("seenStoryEntries")
      );
      expect(seenIssue).toBeDefined();
    }
  });

  it("accepts exactly 200 entries (boundary case)", () => {
    const ok = Array(200).fill("story-id");
    const result = SavePayloadSchema.safeParse({ seenStoryEntries: ok });
    expect(result.success).toBe(true);
  });

  it("rejects an entry longer than 64 chars", () => {
    const longString = "x".repeat(65);
    const result = SavePayloadSchema.safeParse({
      seenStoryEntries: [longString]
    });
    expect(result.success).toBe(false);
  });

  it("accepts a 64-char entry (boundary case)", () => {
    const ok = "x".repeat(64);
    const result = SavePayloadSchema.safeParse({ seenStoryEntries: [ok] });
    expect(result.success).toBe(true);
  });

  it("rejects the worst-case attack payload (10000 entries x 400 chars each)", () => {
    // The exact shape from the SEC-011 attack scenario: 10000 entries of
    // 400 chars apiece — ~4 MB body. Without the cap, Zod accepts this and
    // the route writes ~4 MB into save_audit per request.
    const attackBody = {
      credits: 0,
      playedTimeSeconds: 0,
      completedMissions: [],
      unlockedPlanets: [],
      seenStoryEntries: Array(10000).fill("x".repeat(400))
    };
    const result = SavePayloadSchema.safeParse(attackBody);
    expect(result.success).toBe(false);
  });
});

// Layer 2: oversized payloads that bypass the schema cap somehow (e.g.
// future loosening of layer 1, or a different field accidentally getting
// huge). Test the route's audit-write path directly: an oversized payload
// stored in audit's request_payload column is replaced by a truncation
// marker.

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock()
}));

const upsertMock = vi.fn();
vi.mock("@/lib/players", () => ({
  upsertPlayerId: (...args: unknown[]) => upsertMock(...args)
}));

const dbStub: {
  selectRow: Record<string, unknown> | undefined;
  saveInsertSpy: (values: Record<string, unknown>) => void;
  saveInsertImpl: () => Promise<unknown>;
  auditInsertSpy: (values: Record<string, unknown>) => void;
  auditInsertImpl: () => Promise<unknown>;
} = {
  selectRow: undefined,
  saveInsertSpy: () => undefined,
  // Route asserts numInsertedOrUpdatedRows > 0n on save_games + save_snapshots.
  saveInsertImpl: async () => [{ numInsertedOrUpdatedRows: 1n }],
  auditInsertSpy: () => undefined,
  auditInsertImpl: async () => undefined
};

function selectChain() {
  return {
    selectAll: () => selectChain(),
    select: () => selectChain(),
    where: () => selectChain(),
    forUpdate: () => selectChain(),
    executeTakeFirst: async () => dbStub.selectRow
  };
}

function insertChain(table: string) {
  const isAudit = table === "spacepotatis.save_audit";
  return {
    values: (v: Record<string, unknown>) => {
      if (isAudit) dbStub.auditInsertSpy(v);
      else dbStub.saveInsertSpy(v);
      return insertChain(table);
    },
    onConflict: () => insertChain(table),
    execute: () => (isAudit ? dbStub.auditInsertImpl() : dbStub.saveInsertImpl())
  };
}

function makeDbHandle() {
  return {
    selectFrom: () => selectChain(),
    insertInto: (table: string) => insertChain(table),
    transaction: () => ({
      execute: async <T>(cb: (trx: ReturnType<typeof makeDbHandle>) => Promise<T>): Promise<T> =>
        cb(makeDbHandle())
    })
  };
}

vi.mock("@/lib/db", () => ({
  getDb: () => makeDbHandle()
}));

beforeEach(() => {
  authMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue("player-uuid");
  dbStub.selectRow = undefined;
  dbStub.saveInsertSpy = vi.fn();
  dbStub.saveInsertImpl = async () => [{ numInsertedOrUpdatedRows: 1n }];
  dbStub.auditInsertSpy = vi.fn();
  dbStub.auditInsertImpl = async () => undefined;
});

afterEach(() => {
  vi.resetModules();
});

async function loadRoute() {
  return await import("../../src/app/api/save/route");
}

describe("SEC-011 layer 2 — audit-row request_payload truncated above 64 KB", () => {
  it("stores the truncation marker when validation_failed audit body would exceed 64 KB", async () => {
    // Use a Zod-rejected body with a giant unrelated field that survives
    // up to the audit write but trips the size cap. The schema rejects
    // the giant `seenStoryEntries` array (layer 1), and the audit path
    // — which receives the RAW body, not the parsed body — would
    // otherwise write the full 4 MB into save_audit.
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const giantBody = {
      credits: 0,
      seenStoryEntries: Array(10000).fill("x".repeat(400))
    };
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify(giantBody)
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const audit = auditSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const payload = audit.request_payload as Record<string, unknown>;
    // The full body was ~4 MB. The audit row must NOT contain the full
    // body — instead it carries the truncation marker so the audit table
    // never gets used as a storage-DoS amplifier.
    expect(payload.truncated).toBe(true);
    expect(typeof payload.size).toBe("number");
    expect(payload.size as number).toBeGreaterThan(64 * 1024);
    // The marker is small — under 1 KB.
    const markerSize = JSON.stringify(payload).length;
    expect(markerSize).toBeLessThan(1024);
  });

  it("preserves a normal-sized payload verbatim in the audit row", async () => {
    // A normal save POST sits well under 64 KB. The audit row must capture
    // the full body so forensics still work on legitimate writes.
    authMock.mockResolvedValue({ user: { email: "p@example.com", name: null } });
    const auditSpy = vi.fn();
    dbStub.auditInsertSpy = auditSpy;
    const { POST } = await loadRoute();
    const normalBody = {
      credits: 100,
      playedTimeSeconds: 30,
      completedMissions: [],
      unlockedPlanets: [],
      seenStoryEntries: ["great-potato-awakening", "tubernovae-arrival"]
    };
    const req = new Request("http://x/api/save", {
      method: "POST",
      body: JSON.stringify(normalBody)
    });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const audit = auditSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const payload = audit.request_payload as Record<string, unknown>;
    expect(payload.truncated).toBeUndefined();
    expect(payload.credits).toBe(100);
    expect(payload.seenStoryEntries).toEqual([
      "great-potato-awakening",
      "tubernovae-arrival"
    ]);
  });
});

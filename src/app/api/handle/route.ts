import { NextResponse } from "next/server";
import { sql } from "kysely";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { withNeonRetry } from "@/lib/neonRetry";
import { upsertPlayerId } from "@/lib/players";
import { HandlePayloadSchema } from "@/lib/schemas";

// Edge runtime — same reasoning as /api/save: Neon serverless + JWT auth().
export const runtime = "edge";

// SEC-022 — POST /api/handle accepts a tiny `{ handle: string }` body
// (HandlePayloadSchema caps the string at 16 chars). Reject any
// Content-Length above 4 KB early so a malicious caller can't waste
// edge-function CPU on JSON.parse of a multi-megabyte body. 4 KB is two
// orders of magnitude above any legitimate payload.
const MAX_REQUEST_BYTES = 4 * 1024;

// Postgres unique_violation. The Neon serverless driver surfaces pg-style
// errors with `code` and `constraint` (constraint name) properties; check
// both because the constraint name pin lets us only swallow OUR uniqueness
// violation, not some other unique index that might exist later.
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  if (e.code !== "23505") return false;
  if (typeof e.constraint === "string" && e.constraint === "players_handle_lower_idx") return true;
  // Older pg versions don't always populate `constraint`; fall back to the
  // index name appearing in the message.
  return typeof e.message === "string" && e.message.includes("players_handle_lower_idx");
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Hoist for retry closures so TS narrowings don't get lost.
  const sessionEmail = session.user.email;
  const sessionName = session.user.name ?? null;

  try {
    const db = getDb();
    const playerId = await withNeonRetry(
      () => upsertPlayerId(sessionEmail, sessionName),
      { label: "GET /api/handle:upsertPlayerId" }
    );
    const row = await withNeonRetry(
      () =>
        db
          .selectFrom("spacepotatis.players")
          .select("handle")
          .where("id", "=", playerId)
          .executeTakeFirst(),
      { label: "GET /api/handle:selectHandle" }
    );
    return NextResponse.json({ handle: row?.handle ?? null });
  } catch (err) {
    console.error("GET /api/handle failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sessionEmail = session.user.email;
  const sessionName = session.user.name ?? null;

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const declaredBytes = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const parsed = HandlePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const handle = parsed.data.handle;

  try {
    const db = getDb();
    const playerId = await withNeonRetry(
      () => upsertPlayerId(sessionEmail, sessionName),
      { label: "POST /api/handle:upsertPlayerId" }
    );

    // Case-insensitive collision check before update — gives a clean error
    // message instead of leaking the unique-index violation. Race with a
    // simultaneous insert is fine: the unique index still fires and we
    // surface that as a duplicate.
    const conflict = await withNeonRetry(
      () =>
        db
          .selectFrom("spacepotatis.players")
          .select("id")
          .where(sql`LOWER(handle)`, "=", handle.toLowerCase())
          .where("id", "!=", playerId)
          .executeTakeFirst(),
      { label: "POST /api/handle:conflictCheck" }
    );
    if (conflict) {
      return NextResponse.json({ error: "handle_taken" }, { status: 409 });
    }

    try {
      // The UPDATE itself isn't retried — a unique-violation (23505) must
      // bubble cleanly to the isUniqueViolation branch below.
      await db
        .updateTable("spacepotatis.players")
        .set({ handle })
        .where("id", "=", playerId)
        .execute();
    } catch (err) {
      // Race with another request setting the same handle in the gap between
      // the pre-check above and this UPDATE. The DB partial unique index is
      // the real source of truth — translate its violation back into a 409
      // so the client gets the same "handle taken" message either way.
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: "handle_taken" }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ handle });
  } catch (err) {
    console.error("POST /api/handle failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

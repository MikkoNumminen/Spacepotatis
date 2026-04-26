import { NextResponse } from "next/server";
import { sql } from "kysely";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { validateHandle } from "@/lib/handle";
import { upsertPlayerId } from "@/lib/players";

// Edge runtime — same reasoning as /api/save: Neon serverless + JWT auth().
export const runtime = "edge";

interface HandlePayload {
  handle?: unknown;
}

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

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);
    const row = await db
      .selectFrom("spacepotatis.players")
      .select("handle")
      .where("id", "=", playerId)
      .executeTakeFirst();
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

  let body: HandlePayload;
  try {
    body = (await request.json()) as HandlePayload;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const result = validateHandle(body.handle);
  if (!result.ok) {
    return NextResponse.json({ error: "invalid_handle", reason: result.reason }, { status: 400 });
  }

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);

    // Case-insensitive collision check before update — gives a clean error
    // message instead of leaking the unique-index violation. Race with a
    // simultaneous insert is fine: the unique index still fires and we
    // surface that as a duplicate.
    const conflict = await db
      .selectFrom("spacepotatis.players")
      .select("id")
      .where(sql`LOWER(handle)`, "=", result.handle.toLowerCase())
      .where("id", "!=", playerId)
      .executeTakeFirst();
    if (conflict) {
      return NextResponse.json({ error: "handle_taken" }, { status: 409 });
    }

    try {
      await db
        .updateTable("spacepotatis.players")
        .set({ handle: result.handle })
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

    return NextResponse.json({ handle: result.handle });
  } catch (err) {
    console.error("POST /api/handle failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

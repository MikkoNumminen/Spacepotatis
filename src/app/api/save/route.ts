import { NextResponse } from "next/server";
import { sql } from "kysely";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { upsertPlayerId } from "@/lib/players";
import { SavePayloadSchema } from "@/lib/schemas/save";

// Edge runtime — db.ts uses Neon's serverless WebSocket Pool (Edge-compatible)
// and NextAuth v5 `auth()` is JWT-cookie based here, so no Node primitives
// are needed. Cuts function duration ~5-10x vs the prior Node runtime.
export const runtime = "edge";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);

    const row = await db
      .selectFrom("spacepotatis.save_games")
      .selectAll()
      .where("player_id", "=", playerId)
      .where("slot", "=", 1)
      .executeTakeFirst();

    if (!row) return NextResponse.json(null);

    // Neon's Edge driver sometimes returns TIMESTAMPTZ as a string instead of
    // a Date — coerce defensively so we never crash on `.toISOString()`.
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at);

    return NextResponse.json({
      slot: row.slot,
      credits: row.credits,
      currentPlanet: row.current_planet,
      shipConfig: row.ship_config,
      completedMissions: row.completed_missions,
      unlockedPlanets: row.unlocked_planets,
      playedTimeSeconds: row.played_time_seconds,
      updatedAt
    });
  } catch (err) {
    console.error("GET /api/save failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const parsed = SavePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    // Surface only the issue list — Zod's full error object leaks internals
    // and makes the response harder for the client to log/inspect.
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);

    // Snapshot serialization sends the ship under `ship`; the legacy /api
    // contract calls it `shipConfig`. Accept both, prefer the explicit one.
    const shipPayload = body.shipConfig ?? body.ship;
    const shipConfig =
      shipPayload && typeof shipPayload === "object" ? (shipPayload as Record<string, unknown>) : {};

    await db
      .insertInto("spacepotatis.save_games")
      .values({
        player_id: playerId,
        slot: 1,
        credits: body.credits ?? 0,
        current_planet: body.currentPlanet ?? null,
        ship_config: shipConfig,
        completed_missions: body.completedMissions ?? [],
        unlocked_planets: body.unlockedPlanets ?? [],
        played_time_seconds: body.playedTimeSeconds ?? 0,
        updated_at: new Date()
      })
      .onConflict((oc) =>
        oc.columns(["player_id", "slot"]).doUpdateSet({
          credits: sql`EXCLUDED.credits`,
          current_planet: sql`EXCLUDED.current_planet`,
          ship_config: sql`EXCLUDED.ship_config`,
          completed_missions: sql`EXCLUDED.completed_missions`,
          unlocked_planets: sql`EXCLUDED.unlocked_planets`,
          played_time_seconds: sql`EXCLUDED.played_time_seconds`,
          updated_at: sql`EXCLUDED.updated_at`
        })
      )
      .execute();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("POST /api/save failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

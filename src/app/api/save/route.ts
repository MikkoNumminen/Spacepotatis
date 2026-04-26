import { NextResponse } from "next/server";
import { sql } from "kysely";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { upsertPlayerId } from "@/lib/players";

// Runtime: Node. The `pg` Pool is not yet Edge-compatible.
export const runtime = "nodejs";

interface SavePayload {
  credits?: unknown;
  currentPlanet?: unknown;
  shipConfig?: unknown;
  completedMissions?: unknown;
  unlockedPlanets?: unknown;
  playedTimeSeconds?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asInt(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
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
      .selectFrom("spacepotatis.save_games")
      .selectAll()
      .where("player_id", "=", playerId)
      .where("slot", "=", 1)
      .executeTakeFirst();

    if (!row) return NextResponse.json(null);

    return NextResponse.json({
      slot: row.slot,
      credits: row.credits,
      currentPlanet: row.current_planet,
      shipConfig: row.ship_config,
      completedMissions: row.completed_missions,
      unlockedPlanets: row.unlocked_planets,
      playedTimeSeconds: row.played_time_seconds,
      updatedAt: row.updated_at.toISOString()
    });
  } catch (err) {
    console.error("GET /api/save failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SavePayload;
  try {
    body = (await request.json()) as SavePayload;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);

    const shipConfig =
      body.shipConfig && typeof body.shipConfig === "object" && !Array.isArray(body.shipConfig)
        ? (body.shipConfig as Record<string, unknown>)
        : {};

    await db
      .insertInto("spacepotatis.save_games")
      .values({
        player_id: playerId,
        slot: 1,
        credits: asInt(body.credits, 0),
        current_planet: asString(body.currentPlanet),
        ship_config: shipConfig,
        completed_missions: asStringArray(body.completedMissions),
        unlocked_planets: asStringArray(body.unlockedPlanets),
        played_time_seconds: asInt(body.playedTimeSeconds, 0),
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

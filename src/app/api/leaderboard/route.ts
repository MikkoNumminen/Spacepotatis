import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { upsertPlayerId } from "@/lib/players";

export const runtime = "nodejs";
export const revalidate = 60;

interface ScorePayload {
  missionId?: unknown;
  score?: unknown;
  timeSeconds?: unknown;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const missionId = url.searchParams.get("mission");
  if (!missionId) {
    return NextResponse.json({ error: "mission_required" }, { status: 400 });
  }
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);

  try {
    const db = getDb();
    const rows = await db
      .selectFrom("leaderboard")
      .innerJoin("players", "players.id", "leaderboard.player_id")
      .select([
        "players.name as player_name",
        "players.email as player_email",
        "leaderboard.score",
        "leaderboard.time_seconds",
        "leaderboard.created_at"
      ])
      .where("leaderboard.mission_id", "=", missionId)
      .orderBy("leaderboard.score", "desc")
      .orderBy("leaderboard.created_at", "desc")
      .limit(limit)
      .execute();

    const entries = rows.map((r) => ({
      playerName: r.player_name ?? r.player_email.split("@")[0] ?? "pilot",
      score: r.score,
      timeSeconds: r.time_seconds,
      createdAt: r.created_at.toISOString()
    }));

    return NextResponse.json({ missionId, entries });
  } catch (err) {
    console.error("GET /api/leaderboard failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ScorePayload;
  try {
    body = (await request.json()) as ScorePayload;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const missionId = typeof body.missionId === "string" ? body.missionId : null;
  const score =
    typeof body.score === "number" && Number.isFinite(body.score) ? Math.trunc(body.score) : null;
  const timeSeconds =
    typeof body.timeSeconds === "number" && Number.isFinite(body.timeSeconds)
      ? Math.trunc(body.timeSeconds)
      : null;

  if (!missionId || score === null) {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);

    await db
      .insertInto("leaderboard")
      .values({
        player_id: playerId,
        mission_id: missionId,
        score,
        time_seconds: timeSeconds
      })
      .execute();

    return new NextResponse(null, { status: 201 });
  } catch (err) {
    console.error("POST /api/leaderboard failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

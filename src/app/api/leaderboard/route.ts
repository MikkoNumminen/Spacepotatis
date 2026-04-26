import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { LEADERBOARD_CACHE_TAG, getCachedLeaderboard } from "@/lib/leaderboard";
import { upsertPlayerId } from "@/lib/players";
import type { MissionId } from "@/types/game";

// Auth needed on POST (score submission), so this can't move to the Edge
// runtime today — auth() reads from the NextAuth session cookie which the
// `pg`-backed handler sees in Node.
export const runtime = "nodejs";

interface ScorePayload {
  missionId?: unknown;
  score?: unknown;
  timeSeconds?: unknown;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const missionIdParam = url.searchParams.get("mission");
  if (!missionIdParam) {
    return NextResponse.json({ error: "mission_required" }, { status: 400 });
  }
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);

  try {
    // Cast: MissionId is a string-literal union; the route accepts any string
    // here because the leaderboard table itself is the source of truth for
    // which mission ids exist (legacy ids from older deploys still resolve).
    const missionId = missionIdParam as MissionId;
    const entries = await getCachedLeaderboard(missionId, limit);
    return NextResponse.json({ missionId: missionIdParam, entries });
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
      .insertInto("spacepotatis.leaderboard")
      .values({
        player_id: playerId,
        mission_id: missionId,
        score,
        time_seconds: timeSeconds
      })
      .execute();

    // Flush the read cache so the new score is visible on the next GET.
    revalidateTag(LEADERBOARD_CACHE_TAG);

    return new NextResponse(null, { status: 201 });
  } catch (err) {
    console.error("POST /api/leaderboard failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

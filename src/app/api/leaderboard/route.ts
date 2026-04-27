import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { LEADERBOARD_CACHE_TAG, getCachedLeaderboard } from "@/lib/leaderboard";
import { upsertPlayerId } from "@/lib/players";
import { ScorePayloadSchema } from "@/lib/schemas/save";
import type { MissionId } from "@/types/game";

// Edge runtime — getDb() is now Neon serverless (Edge-compatible) and the
// NextAuth `auth()` call is JWT-cookie based, so no Node primitives needed.
export const runtime = "edge";

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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const parsed = ScorePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { missionId, score, timeSeconds = null } = parsed.data;

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

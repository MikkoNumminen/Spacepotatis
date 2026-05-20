import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { LEADERBOARD_CACHE_TAG, getCachedLeaderboard } from "@/lib/leaderboard";
import { withNeonRetry } from "@/lib/neonRetry";
import { upsertPlayerId } from "@/lib/players";
import { MissionIdSchema, ScorePayloadSchema } from "@/lib/schemas/save";
import { maxLegitScore } from "@/lib/saveValidation";

// Edge runtime — getDb() is now Neon serverless (Edge-compatible) and the
// NextAuth `auth()` call is JWT-cookie based, so no Node primitives needed.
export const runtime = "edge";

// INVARIANT: cap request body bytes before request.json() so an attacker
// can't tie up an Edge function streaming megabytes into a 16-byte schema.
// Leaderboard payloads are tiny ({missionId, score, timeSeconds}); 16 KB is
// orders of magnitude above any legitimate body and small enough that the
// rejection happens before JSON parsing burns CPU.
const MAX_REQUEST_BYTES = 16 * 1024;

// Permanent-error sentinels for the outer catch. A ZodError or JS-runtime
// error (SyntaxError / TypeError / RangeError / ReferenceError) indicates a
// permanent server-side bug, not a transient Neon flake. Distinguishing them
// lets scoreQueue drop the entry instead of retrying for 30 days.
function isPermanentServerError(err: unknown): boolean {
  if (err instanceof ZodError) return true;
  if (err instanceof SyntaxError) return true;
  if (err instanceof TypeError) return true;
  if (err instanceof RangeError) return true;
  if (err instanceof ReferenceError) return true;
  return false;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const missionIdParam = url.searchParams.get("mission");
  if (!missionIdParam) {
    return NextResponse.json({ error: "mission_required" }, { status: 400 });
  }
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);

  // TRUST-BOUNDARY: ?mission= query param becomes program input here; unknown ids 400 instead of polluting the unstable_cache key (SEC-003, INV-LB-3)
  const missionParsed = MissionIdSchema.safeParse(missionIdParam);
  if (!missionParsed.success) {
    return NextResponse.json({ error: "invalid_mission" }, { status: 400 });
  }

  try {
    const entries = await getCachedLeaderboard(missionParsed.data, limit);
    return NextResponse.json({ missionId: missionParsed.data, entries });
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
  const sessionEmail = session.user.email;
  const sessionName = session.user.name ?? null;

  // TRUST-BOUNDARY: cap body size BEFORE request.json() so an attacker can't
  // amplify a single auth'd request into megabytes of CPU spent parsing junk.
  // Honors Content-Length when the client sends it (browsers always do for
  // POSTs with bodies). Streaming clients that omit Content-Length get the
  // implicit Edge runtime body limit instead — not a regression vs prior.
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number.parseInt(contentLength, 10);
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

  const parsed = ScorePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { missionId, score, timeSeconds = null } = parsed.data;

  // SECURITY-CRITICAL: per-mission cap rejects fabricated scores (SEC-014, INV-LB-1)
  const cap = maxLegitScore(missionId);
  if (score > cap) {
    return NextResponse.json({ error: "score_implausible" }, { status: 422 });
  }

  try {
    const db = getDb();
    // upsertPlayerId stays OUTSIDE the transaction — it has its own
    // ON CONFLICT (email) DO UPDATE conflict handling and is idempotent
    // under retry. Mirrors the pattern in /api/save POST.
    const playerId = await withNeonRetry(
      () => upsertPlayerId(sessionEmail, sessionName),
      { label: "POST /api/leaderboard:upsertPlayerId" }
    );

    // INVARIANT: completed_missions SELECT + mission-completion guard + score INSERT run inside ONE tx with FOR UPDATE.
    // Mirrors SEC-013 from /api/save: a concurrent save POST mutating
    // completed_missions between our read and INSERT would otherwise let an
    // in-flight illegitimate score post against a future-snapshot mission
    // list. The `.forUpdate()` on save_games locks the row until our COMMIT,
    // so a concurrent save POST blocks until we finish.
    //
    // Returns one of:
    //   - { kind: "ok" } — INSERT committed
    //   - { kind: "reject", error: "mission_not_completed" } — guard fired
    type TxOutcome =
      | { kind: "ok" }
      | { kind: "reject"; error: "mission_not_completed" };

    const outcome = await withNeonRetry(
      () =>
        db.transaction().execute(async (trx): Promise<TxOutcome> => {
          // Mission-completion guard: only accept a score for a mission the
          // player has actually completed. The save POST runs before
          // submitScore (handleMissionComplete awaits saveNow first), so by
          // the time this lands the new mission is in completed_missions.
          const saveRow = await trx
            .selectFrom("spacepotatis.save_games")
            .select("completed_missions")
            .where("player_id", "=", playerId)
            .where("slot", "=", 1)
            .forUpdate()
            .executeTakeFirst();

          const completed = Array.isArray(saveRow?.completed_missions)
            ? (saveRow.completed_missions as readonly string[])
            : [];
          if (!completed.includes(missionId)) {
            console.warn(
              "[/api/leaderboard] score for uncompleted mission",
              sessionEmail,
              missionId
            );
            return { kind: "reject", error: "mission_not_completed" };
          }

          // Score INSERT inside the same tx. Trade-off acknowledged: a
          // transaction retry following a hypothetical "first commit silently
          // succeeded then driver raised" case lands a duplicate row, which
          // surfaces as the same (handle, score) appearing twice in the same
          // top-N panel. Worst-case visible artifact in an extremely rare
          // edge case — leaderboard sorts by (score DESC, created_at DESC),
          // so the duplicate sits next to its sibling and the player's
          // actual ranking isn't affected. Acceptable for a casual cohort
          // game; better than failing the user-facing submit.
          await trx
            .insertInto("spacepotatis.leaderboard")
            .values({
              player_id: playerId,
              mission_id: missionId,
              score,
              time_seconds: timeSeconds
            })
            .execute();

          return { kind: "ok" };
        }),
      { label: "POST /api/leaderboard:transaction" }
    );

    if (outcome.kind === "reject") {
      return NextResponse.json(
        { error: outcome.error },
        { status: 422 }
      );
    }

    // Flush the read cache so the new score is visible on the next GET.
    // Next 16 made the second arg required; "max" = full revalidation (the
    // pre-16 default). `updateTag` is the read-your-own-writes alternative but
    // is Server-Action-only, so we stay with `revalidateTag` here.
    revalidateTag(LEADERBOARD_CACHE_TAG, "max");

    return new NextResponse(null, { status: 201 });
  } catch (err) {
    console.error("POST /api/leaderboard failed:", err);
    // Distinguish PERMANENT bugs (ZodError, JS runtime errors) from
    // TRANSIENT Neon flakes. scoreQueue retries `server_error` indefinitely;
    // it must drop `server_error_permanent` like a 422 so a permanent bug
    // doesn't spin forever. See scoreQueue.ts isPermanent().
    if (isPermanentServerError(err)) {
      return NextResponse.json(
        { error: "server_error_permanent" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

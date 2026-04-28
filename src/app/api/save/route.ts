import { NextResponse } from "next/server";
import { sql } from "kysely";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { upsertPlayerId } from "@/lib/players";
import { SavePayloadSchema } from "@/lib/schemas/save";
import {
  computeCreditCapsForPlayer,
  validateCreditsDelta,
  validateMissionGraph,
  validatePlaytimeDelta
} from "@/lib/saveValidation";
import type { MissionId } from "@/types/game";

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
      seenStoryEntries: row.seen_story_entries ?? [],
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

  const completedMissions = body.completedMissions ?? [];
  const unlockedPlanets = body.unlockedPlanets ?? [];
  const credits = body.credits ?? 0;
  const playedTimeSeconds = body.playedTimeSeconds ?? 0;

  const graphResult = validateMissionGraph({
    completedMissions,
    unlockedPlanets
  });
  if (!graphResult.ok) {
    console.warn(
      "[/api/save] mission graph violation",
      session.user.email,
      graphResult.error
    );
    return NextResponse.json(
      { error: "mission_graph_invalid", message: graphResult.error },
      { status: 422 }
    );
  }

  try {
    const db = getDb();
    const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);

    // Read the previous save to bound the credits + playtime deltas. A
    // first save (no prior row) is allowed to claim only what the player's
    // playtime + completion count budgets — the credits bound is recomputed
    // against zero, and the playtime check is skipped.
    const prevRow = await db
      .selectFrom("spacepotatis.save_games")
      .select(["credits", "played_time_seconds", "completed_missions", "updated_at"])
      .where("player_id", "=", playerId)
      .where("slot", "=", 1)
      .executeTakeFirst();

    const prev = prevRow
      ? {
          credits: prevRow.credits,
          playedTimeSeconds: prevRow.played_time_seconds,
          completedMissionsCount: Array.isArray(prevRow.completed_missions)
            ? (prevRow.completed_missions as MissionId[]).length
            : 0
        }
      : null;

    // Playtime first: the credits cap depends on `playedTimeSeconds`, so
    // catching an inflated playtime here prevents the inflated value from
    // unlocking a bigger credits budget downstream.
    const playtimeResult = validatePlaytimeDelta({
      prev: prevRow
        ? { playedTimeSeconds: prevRow.played_time_seconds, updatedAt: prevRow.updated_at }
        : null,
      next: { playedTimeSeconds },
      nowMs: Date.now()
    });
    if (!playtimeResult.ok) {
      console.warn(
        "[/api/save] playtime delta violation",
        session.user.email,
        playtimeResult.error
      );
      return NextResponse.json(
        { error: "playtime_delta_invalid", message: playtimeResult.error },
        { status: 422 }
      );
    }

    // Per-player cap based on the trusted server-side completedMissions
    // (the post-mission-graph-validation list, so unlock-chain cheats
    // can't expand the cap). A brand-new player gets tutorial-only caps;
    // a tubernovae unlocker gets tutorial+tubernovae caps; future systems
    // light up the moment their gating mission is in completedMissions.
    const caps = computeCreditCapsForPlayer(completedMissions);

    const creditsResult = validateCreditsDelta({
      prev,
      next: {
        credits,
        playedTimeSeconds,
        completedMissionsCount: completedMissions.length
      },
      caps
    });
    if (!creditsResult.ok) {
      console.warn(
        "[/api/save] credits delta violation",
        session.user.email,
        creditsResult.error
      );
      return NextResponse.json(
        { error: "credits_delta_invalid", message: creditsResult.error },
        { status: 422 }
      );
    }

    // Snapshot serialization sends the ship under `ship`; the legacy /api
    // contract calls it `shipConfig`. Accept both, prefer the explicit one.
    const shipPayload = body.shipConfig ?? body.ship;
    const shipConfig =
      shipPayload && typeof shipPayload === "object" ? (shipPayload as Record<string, unknown>) : {};

    const seenStoryEntries = Array.isArray(body.seenStoryEntries) ? body.seenStoryEntries : [];

    await db
      .insertInto("spacepotatis.save_games")
      .values({
        player_id: playerId,
        slot: 1,
        credits,
        current_planet: body.currentPlanet ?? null,
        ship_config: shipConfig,
        completed_missions: completedMissions,
        unlocked_planets: unlockedPlanets,
        played_time_seconds: playedTimeSeconds,
        seen_story_entries: seenStoryEntries,
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
          seen_story_entries: sql`EXCLUDED.seen_story_entries`,
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

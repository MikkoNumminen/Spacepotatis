import { NextResponse } from "next/server";
import { sql, type Kysely } from "kysely";
import { auth } from "@/lib/auth";
import { getDb, type Database } from "@/lib/db";
import { upsertPlayerId } from "@/lib/players";
import { SavePayloadSchema } from "@/lib/schemas/save";
import {
  computeCreditCapsForPlayer,
  validateCreditsDelta,
  validateMissionGraph,
  validateNoRegression,
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
      currentSolarSystemId: row.current_solar_system_id,
      updatedAt
    });
  } catch (err) {
    console.error("GET /api/save failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}

// Forensic audit row written for every authenticated POST /api/save attempt
// — success, validator rejection, or server error. Designed so the next data
// loss incident has actual evidence to investigate instead of guesswork.
//
// Operator quick query (for diagnostics):
//   SELECT * FROM spacepotatis.save_audit
//   WHERE player_id = '<uuid>'
//   ORDER BY created_at DESC
//   LIMIT 50;
//
// Failure-mode contract: if the audit INSERT itself throws, the save MUST
// still proceed. The audit table is for diagnostics, not the critical path.
async function writeSaveAudit(
  db: Kysely<Database>,
  row: {
    playerId: string;
    requestPayload: Record<string, unknown>;
    responseStatus: number;
    responseError: string | null;
    prevSnapshot: Record<string, unknown> | null;
    requestIp: string | null;
    userAgent: string | null;
  }
): Promise<void> {
  try {
    await db
      .insertInto("spacepotatis.save_audit")
      .values({
        player_id: row.playerId,
        slot: 1,
        request_payload: row.requestPayload,
        response_status: row.responseStatus,
        response_error: row.responseError,
        prev_snapshot: row.prevSnapshot,
        request_ip: row.requestIp,
        user_agent: row.userAgent
      })
      .execute();
  } catch (err) {
    // Never let an audit-table problem (missing migration, transient Neon
    // outage, schema drift) block a save. Log and move on.
    console.error("[/api/save] save_audit insert failed (save itself proceeds):", err);
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
    // Malformed JSON has no usable body to record and no parsed payload to
    // audit; the route already 400s here. Skip audit for this path.
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // Hold onto the raw body so the audit row preserves exactly what the
  // client sent, even if Zod rejected it.
  const requestPayload: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : { _nonObjectBody: raw };

  const requestIp = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent");

  const parsed = SavePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    // Surface only the issue list — Zod's full error object leaks internals
    // and makes the response harder for the client to log/inspect.
    const response = NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 }
    );
    // Best-effort audit: we have a session so we can resolve player_id, but
    // if the upsert fails (network blip), still return the validation error.
    try {
      const db = getDb();
      const playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);
      await writeSaveAudit(db, {
        playerId,
        requestPayload,
        responseStatus: 400,
        responseError: "validation_failed",
        prevSnapshot: null,
        requestIp,
        userAgent
      });
    } catch (err) {
      console.error("[/api/save] failed to audit validation_failed response:", err);
    }
    return response;
  }
  const body = parsed.data;

  const completedMissions = body.completedMissions ?? [];
  const unlockedPlanets = body.unlockedPlanets ?? [];
  const credits = body.credits ?? 0;
  const playedTimeSeconds = body.playedTimeSeconds ?? 0;

  // Resolve player + previous row up front so every audit path has the
  // diagnostic context (prev_snapshot in particular). If this fails the
  // request becomes 500 and we audit that too.
  let db: Kysely<Database>;
  let playerId: string;
  let prevRow:
    | {
        credits: number;
        current_planet: string | null;
        ship_config: Record<string, unknown>;
        played_time_seconds: number;
        completed_missions: string[];
        unlocked_planets: string[];
        seen_story_entries: string[];
        updated_at: Date;
      }
    | undefined;
  try {
    db = getDb();
    playerId = await upsertPlayerId(session.user.email, session.user.name ?? null);
    prevRow = await db
      .selectFrom("spacepotatis.save_games")
      .select([
        "credits",
        "current_planet",
        "ship_config",
        "played_time_seconds",
        "completed_missions",
        "unlocked_planets",
        "seen_story_entries",
        "updated_at"
      ])
      .where("player_id", "=", playerId)
      .where("slot", "=", 1)
      .executeTakeFirst();
  } catch (err) {
    console.error("POST /api/save failed (pre-validation lookup):", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Snapshot serialized for prev_snapshot — JSON-friendly shape with the
  // updated_at field flattened to ISO string so the audit row is portable.
  const prevSnapshot: Record<string, unknown> | null = prevRow
    ? {
        credits: prevRow.credits,
        currentPlanet: prevRow.current_planet,
        shipConfig: prevRow.ship_config,
        completedMissions: prevRow.completed_missions,
        unlockedPlanets: prevRow.unlocked_planets,
        playedTimeSeconds: prevRow.played_time_seconds,
        seenStoryEntries: prevRow.seen_story_entries ?? [],
        updatedAt:
          prevRow.updated_at instanceof Date
            ? prevRow.updated_at.toISOString()
            : String(prevRow.updated_at)
      }
    : null;

  // All audit writes share the same context; build a small helper that
  // captures prevSnapshot + headers + payload once and just needs the
  // outcome at the call site.
  const recordAudit = (status: number, error: string | null): Promise<void> =>
    writeSaveAudit(db, {
      playerId,
      requestPayload,
      responseStatus: status,
      responseError: error,
      prevSnapshot,
      requestIp,
      userAgent
    });

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
    await recordAudit(422, "mission_graph_invalid");
    return NextResponse.json(
      { error: "mission_graph_invalid", message: graphResult.error },
      { status: 422 }
    );
  }

  try {
    const prev = prevRow
      ? {
          credits: prevRow.credits,
          playedTimeSeconds: prevRow.played_time_seconds,
          completedMissionsCount: Array.isArray(prevRow.completed_missions)
            ? (prevRow.completed_missions as MissionId[]).length
            : 0
        }
      : null;

    // Save-state regression guard. Catches the wipe pattern where a buggy
    // client POSTs INITIAL_STATE on top of an existing save (credits=0,
    // completedMissions=[], playtime=0). The cheat-delta guards below only
    // catch INFLATION, not regression — this is the matching defense.
    const prevForRegression = prevRow
      ? {
          playedTimeSeconds: prevRow.played_time_seconds,
          completedMissions: Array.isArray(prevRow.completed_missions)
            ? (prevRow.completed_missions as readonly MissionId[])
            : [],
          unlockedPlanets: Array.isArray(prevRow.unlocked_planets)
            ? (prevRow.unlocked_planets as readonly MissionId[])
            : []
        }
      : null;
    const regressionResult = validateNoRegression({
      prev: prevForRegression,
      next: {
        playedTimeSeconds,
        completedMissions,
        unlockedPlanets
      }
    });
    if (!regressionResult.ok) {
      console.warn(
        "[/api/save] regression rejected",
        session.user.email,
        regressionResult.error
      );
      await recordAudit(422, "save_regression");
      return NextResponse.json(
        { error: "save_regression", message: regressionResult.error },
        { status: 422 }
      );
    }

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
      await recordAudit(422, "playtime_delta_invalid");
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
      await recordAudit(422, "credits_delta_invalid");
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
    const currentSolarSystemId = body.currentSolarSystemId ?? null;

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
        current_solar_system_id: currentSolarSystemId,
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
          current_solar_system_id: sql`EXCLUDED.current_solar_system_id`,
          updated_at: sql`EXCLUDED.updated_at`
        })
      )
      .execute();

    await recordAudit(204, null);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("POST /api/save failed:", err);
    await recordAudit(500, "server_error");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

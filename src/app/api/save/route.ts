import { NextResponse } from "next/server";
import { sql, type Kysely } from "kysely";
import { auth } from "@/lib/auth";
import { getDb, type Database } from "@/lib/db";
import { withNeonRetry } from "@/lib/neonRetry";
import { upsertPlayerId } from "@/lib/players";
import { SavePayloadSchema } from "@/lib/schemas/save";
import {
  computeCreditCapsForPlayer,
  deriveCapInputMissions,
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
  // Hoist for the retry closures — TS narrowings on `session.user.email`
  // would otherwise be lost when the value is read inside the callback.
  const sessionEmail = session.user.email;
  const sessionName = session.user.name ?? null;

  try {
    const db = getDb();
    // Both calls retry on Neon control-plane flakes — see neonRetry.ts.
    // upsertPlayerId is idempotent (ON CONFLICT (email)); the SELECT is a
    // pure read. Safe to retry without side-effect concerns.
    const playerId = await withNeonRetry(
      () => upsertPlayerId(sessionEmail, sessionName),
      { label: "GET /api/save:upsertPlayerId" }
    );

    const row = await withNeonRetry(
      () =>
        db
          .selectFrom("spacepotatis.save_games")
          .selectAll()
          .where("player_id", "=", playerId)
          .where("slot", "=", 1)
          .executeTakeFirst(),
      { label: "GET /api/save:selectRow" }
    );

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
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// SECURITY-CRITICAL: 64 KB cap forecloses save_audit storage-DoS amplifier (SEC-011, INV-SAVE-6)
// SEC-011 — cap on request_payload bytes written to save_audit. The audit
// row stores the *pre-validation* request body for forensics; without a
// cap, an authenticated attacker could POST a 4 MB body and amplify it
// into 4 MB of Neon storage per request (see docs/security/02b-attack-cells.md
// §SEC-011). 64 KB is far above any legitimate save body and small enough
// that the table can't be exhausted by a scripted attacker faster than
// rate-limiting (SEC-002, separate fix) catches up.
const AUDIT_PAYLOAD_BYTE_CAP = 64 * 1024;

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
  // SEC-011 — truncate the payload BEFORE writing it. JSON.stringify is
  // cheap relative to a Neon round-trip, and a 64 KB cap is generous for
  // legitimate saves (a fully-decked-out shipConfig today sits well under
  // 4 KB). On overflow, store a small marker — the response status +
  // error code on the audit row still tell the operator which guard
  // rejected, and the request_ip + user_agent still identify the caller.
  let storedPayload: Record<string, unknown> = row.requestPayload;
  try {
    const serialized = JSON.stringify(row.requestPayload);
    if (serialized.length > AUDIT_PAYLOAD_BYTE_CAP) {
      storedPayload = { truncated: true, size: serialized.length };
    }
  } catch {
    // A circular-ref or BigInt-laden payload can't be JSON-stringified;
    // record that so the audit still lands without throwing.
    storedPayload = { truncated: true, reason: "unserializable" };
  }
  try {
    // Retry the audit INSERT on transient Neon flakes so a one-off control-
    // plane blip doesn't drop a forensic row. Each attempt generates a new
    // server-side UUID, so a hypothetical "first commit silently succeeded
    // then driver raised" case lands a duplicate audit row — acceptable for
    // a forensic table; better than missing the row entirely.
    //
    // The outer try/catch still catches the FINAL failure after retries
    // exhaust, preserving the failure-mode contract above.
    await withNeonRetry(
      () =>
        db
          .insertInto("spacepotatis.save_audit")
          .values({
            player_id: row.playerId,
            slot: 1,
            request_payload: storedPayload,
            response_status: row.responseStatus,
            response_error: row.responseError,
            prev_snapshot: row.prevSnapshot,
            request_ip: row.requestIp,
            user_agent: row.userAgent
          })
          .execute(),
      { label: "writeSaveAudit" }
    );
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
  // Hoist now so withNeonRetry closures don't lose the TS narrowing on
  // session.user.email when the email is read inside the retry callback.
  // The auth guard above proves both are populated.
  const sessionEmail = session.user.email;
  const sessionName = session.user.name ?? null;

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

  // TRUST-BOUNDARY: untrusted request body becomes program input here; everything after this point assumes parsed/validated (INV-SCHEMA-1)
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
      const playerId = await withNeonRetry(
        () => upsertPlayerId(sessionEmail, sessionName),
        { label: "POST /api/save:audit-validation-failed:upsertPlayerId" }
      );
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

  // Resolve player + DB handle. The prev-row SELECT moves into the
  // transaction below so a concurrent save can't slip a stale baseline past
  // the regression / credits / playtime guards. See SEC-013.
  let db: Kysely<Database>;
  let playerId: string;
  try {
    db = getDb();
    // Idempotent (ON CONFLICT (email) DO UPDATE), safe to retry on a Neon
    // control-plane flake. Same flake symptom as the leaderboard fan-out;
    // see neonRetry.ts.
    playerId = await withNeonRetry(
      () => upsertPlayerId(sessionEmail, sessionName),
      { label: "POST /api/save:upsertPlayerId" }
    );
  } catch (err) {
    console.error("POST /api/save failed (pre-validation lookup):", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // INVARIANT: prev-row read + validators + upsert run inside ONE tx with FOR UPDATE (SEC-013, INV-SAVE-1)
  // SEC-013 — wrap prev-row SELECT + validators + upsert in a single
  // Kysely transaction with `.forUpdate()` on the SELECT. The row lock is
  // held until COMMIT, so a second concurrent POST blocks until Tab A's
  // transaction commits, then re-reads the now-updated row. Without this
  // guard, two tabs (or a malicious local script firing parallel POSTs)
  // each read the same pre-write baseline; one tab's stale `completedMissions`
  // payload can overwrite the other tab's richer state because both passed
  // `validateNoRegression` against the stale prev row.
  //
  // The audit write happens OUTSIDE the transaction below — best-effort
  // diagnostic, never blocks the critical path. Snapshot capture stays
  // inside the transaction so the audit row reflects the FOR-UPDATE-locked
  // baseline rather than a fresh re-read after the upsert.
  type TxOutcome =
    | {
        kind: "ok";
        prevSnapshot: Record<string, unknown> | null;
      }
    | {
        kind: "reject";
        status: 422;
        error:
          | "mission_graph_invalid"
          | "save_regression"
          | "playtime_delta_invalid"
          | "credits_delta_invalid"
          | "solar_system_not_unlocked";
        // The validators return ValidationResult { ok, error? } where the
        // error string is optional; NextResponse.json drops undefined fields.
        message: string | undefined;
        prevSnapshot: Record<string, unknown> | null;
      };

  // SECURITY-RELATED: transaction-level retry is correctness-preserving — DO NOT remove without re-validating each bullet below
  //
  // Wrap the whole transaction in withNeonRetry. Safety reasoning (every
  // bullet here is load-bearing — a future "simplification" that removes
  // the wrapper without checking these would re-introduce the user-visible
  // 500 we're masking):
  //
  //   - Kysely's `transaction().execute()` auto-ROLLBACKs on any thrown
  //     error inside the callback, so a transient flake leaves the DB in
  //     its pre-BEGIN state before retry. Lock acquired by FOR UPDATE on
  //     prev_row is released as part of rollback.
  //   - The save upsert uses ON CONFLICT (player_id, slot) DO UPDATE, so
  //     even if a hypothetical first COMMIT silently committed and the
  //     driver still raised, the retry's re-upsert writes the same data.
  //   - Validators are pure functions of (prev_row, body); prev_row is
  //     re-SELECTed under FOR UPDATE on each attempt, so the second
  //     attempt sees fresh state and can't pass on a stale baseline. The
  //     2026-05-02 wipe-pattern guard (validateNoRegression, INV-SAVE-1)
  //     fires equally on each attempt.
  //   - Only known-transient errors retry. {kind: "reject"} is RETURNED,
  //     not thrown — validator rejections never trigger retry.
  let outcome: TxOutcome;
  try {
    outcome = await withNeonRetry(
      () => db.transaction().execute(async (trx): Promise<TxOutcome> => {
      const prevRow = await trx
        .selectFrom("spacepotatis.save_games")
        .select([
          "credits",
          "current_planet",
          "ship_config",
          "played_time_seconds",
          "completed_missions",
          "unlocked_planets",
          "seen_story_entries",
          "current_solar_system_id",
          "updated_at"
        ])
        .where("player_id", "=", playerId)
        .where("slot", "=", 1)
        .forUpdate()
        .executeTakeFirst();

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
            currentSolarSystemId: prevRow.current_solar_system_id,
            updatedAt:
              prevRow.updated_at instanceof Date
                ? prevRow.updated_at.toISOString()
                : String(prevRow.updated_at)
          }
        : null;

      const graphResult = validateMissionGraph({
        completedMissions,
        unlockedPlanets
      });
      if (!graphResult.ok) {
        console.warn(
          "[/api/save] mission graph violation",
          playerId,
          graphResult.error
        );
        return {
          kind: "reject",
          status: 422,
          error: "mission_graph_invalid",
          message: graphResult.error,
          prevSnapshot
        };
      }

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
          playerId,
          regressionResult.error
        );
        return {
          kind: "reject",
          status: 422,
          error: "save_regression",
          message: regressionResult.error,
          prevSnapshot
        };
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
          playerId,
          playtimeResult.error
        );
        return {
          kind: "reject",
          status: 422,
          error: "playtime_delta_invalid",
          message: playtimeResult.error,
          prevSnapshot
        };
      }

      // DO NOT INLINE: deriveCapInputMissions intentionally separates trusted-prev from user-submitted (SEC-017, INV-SAVE-4)
      // Per-player cap. SEC-017: the cap input is derived from
      // `prevRow.completed_missions` (the server-stored, FOR-UPDATE-locked
      // baseline) and grows ONLY by submitted missions whose `requires`
      // are entirely already-trusted. A future zero-prereq mission cannot
      // bootstrap inside the same request that also requests inflated
      // credits — the unlock chain must be grounded in the previously-
      // stored row.
      //
      // A brand-new player (prevRow=null) gets tutorial-only caps; a
      // tubernovae unlocker gets tutorial+tubernovae caps; future systems
      // light up only on the save AFTER their gating mission lands.
      const prevCompletedForCap: readonly MissionId[] = prevRow
        ? Array.isArray(prevRow.completed_missions)
          ? (prevRow.completed_missions as readonly MissionId[])
          : []
        : [];
      const capInputMissions = deriveCapInputMissions(
        prevCompletedForCap,
        completedMissions
      );
      const caps = computeCreditCapsForPlayer(capInputMissions);

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
          playerId,
          creditsResult.error
        );
        return {
          kind: "reject",
          status: 422,
          error: "credits_delta_invalid",
          message: creditsResult.error,
          prevSnapshot
        };
      }

      // SEC-027 — reject a save that parks the player in a solar system they
      // haven't unlocked. Impact is UI-cosmetic only (galaxy opens at the wrong
      // system), but the schema validates shape-not-state; this closes the gap.
      // The field is optional — absent means "no preference" and is always fine.
      const incomingSystemId = body.currentSolarSystemId;
      if (incomingSystemId !== undefined) {
        const unlockedSystems = Array.isArray(body.unlockedSolarSystems)
          ? body.unlockedSolarSystems
          : [];
        if (!unlockedSystems.includes(incomingSystemId)) {
          console.warn(
            "[/api/save] solar_system_not_unlocked",
            playerId,
            incomingSystemId
          );
          return {
            kind: "reject",
            status: 422,
            error: "solar_system_not_unlocked",
            message: `currentSolarSystemId "${incomingSystemId}" is not in unlockedSolarSystems`,
            prevSnapshot
          };
        }
      }

      // Snapshot serialization sends the ship under `ship`; the legacy /api
      // contract calls it `shipConfig`. Accept both, prefer the explicit one.
      const shipPayload = body.shipConfig ?? body.ship;
      const shipConfig =
        shipPayload && typeof shipPayload === "object"
          ? (shipPayload as Record<string, unknown>)
          : {};

      const seenStoryEntries = Array.isArray(body.seenStoryEntries) ? body.seenStoryEntries : [];
      const currentSolarSystemId = body.currentSolarSystemId ?? null;

      await trx
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

      return { kind: "ok", prevSnapshot };
      }),
      { label: "POST /api/save:transaction" }
    );
  } catch (err) {
    console.error("POST /api/save failed:", err);
    // Best-effort audit on the transaction-level failure path. We don't have
    // a prevSnapshot here (the SELECT itself or the upsert may have thrown);
    // record the attempt with prev_snapshot = null so the row still lands.
    await writeSaveAudit(db, {
      playerId,
      requestPayload,
      responseStatus: 500,
      responseError: "server_error",
      prevSnapshot: null,
      requestIp,
      userAgent
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // Audit write happens AFTER the transaction commits/rolls back. Failure
  // here never affects the user-visible outcome.
  if (outcome.kind === "reject") {
    // SEC-020 — collapse three of the four 422 codes to `save_rejected` in
    // the client-visible response body to remove the validator-ordering
    // side-channel. The specific code is preserved in save_audit.response_error
    // and console.warn for ops forensics.
    //
    // EXCEPTION: `save_regression` stays distinct because saveQueue.ts's
    // isPermanent() treats it as TRANSIENT — the queue holds the snapshot and
    // retries after a fresher loadSave reconciles state. Collapsing it to
    // `save_rejected` would flip isPermanent() to true (save_rejected is not
    // in the TRANSIENT list), causing the queue to drop the pending save and
    // breaking the save-durability contract.
    const clientError: string =
      outcome.error === "save_regression" ? "save_regression" : "save_rejected";
    await writeSaveAudit(db, {
      playerId,
      requestPayload,
      responseStatus: outcome.status,
      responseError: outcome.error,
      prevSnapshot: outcome.prevSnapshot,
      requestIp,
      userAgent
    });
    return NextResponse.json(
      { error: clientError, message: outcome.message },
      { status: outcome.status }
    );
  }

  await writeSaveAudit(db, {
    playerId,
    requestPayload,
    responseStatus: 204,
    responseError: null,
    prevSnapshot: outcome.prevSnapshot,
    requestIp,
    userAgent
  });
  return new NextResponse(null, { status: 204 });
}

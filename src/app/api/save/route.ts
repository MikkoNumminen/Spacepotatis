import { NextResponse } from "next/server";
import { sql, type Kysely } from "kysely";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { getDb, type Database } from "@/lib/db";
import { withNeonRetry } from "@/lib/neonRetry";
import { upsertPlayerId } from "@/lib/players";
import { MISSION_IDS, SavePayloadSchema } from "@/lib/schemas/save";
import {
  computeCreditCapsForPlayer,
  deriveCapInputMissions,
  deriveUnlockedSolarSystems,
  validateCreditsDelta,
  validateMissionGraph,
  validateNoRegression,
  validatePlaytimeDelta
} from "@/lib/saveValidation";
import type { MissionId } from "@/types/game";

// INVARIANT: 64 KB cap on the raw POST body — bound an unbounded JSON parse
// before Zod ever sees it (Edge runtime memory is per-invocation and a
// 10 MB body would still parse before failing schema validation). The
// audit-payload cap (AUDIT_PAYLOAD_BYTE_CAP) is the matching ceiling for
// what's stored in spacepotatis.save_audit; keeping the two equal means a
// legitimate save body never silently grows beyond what the audit row can
// preserve verbatim.
const MAX_REQUEST_BYTES = 64 * 1024;

// Permanent-error classifier. Anything thrown that matches one of these
// shapes points at a programmer bug or schema mismatch — replaying the
// request can never succeed. The route returns `server_error_permanent`
// for these so saveQueue.ts drops the pending blob instead of spinning.
// Transient errors (network blip, Neon control-plane hiccup, unknown)
// still return `server_error` so the queue retries.
function isPermanentError(err: unknown): boolean {
  if (err instanceof ZodError) return true;
  if (err instanceof Error) {
    return (
      err.name === "SyntaxError" ||
      err.name === "TypeError" ||
      err.name === "RangeError" ||
      err.name === "ReferenceError"
    );
  }
  return false;
}

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
    // upsertPlayerId is idempotent (ON CONFLICT (email)); reads are pure.
    // Safe to retry without side-effect concerns.
    const playerId = await withNeonRetry(
      () => upsertPlayerId(sessionEmail, sessionName),
      { label: "GET /api/save:upsertPlayerId" }
    );

    // v2 read-cutover: authoritative state comes from save_snapshots, the
    // latest row per (player_id, slot) ordered by created_at DESC. The v1
    // dual-write made every successful save POST write here atomically with
    // save_games, so any player who has saved post-v1 has at least one
    // snapshot row. The composite index (player_id, slot, created_at DESC)
    // makes the LIMIT 1 a constant-time scan.
    const snapshotRow = await withNeonRetry(
      () =>
        db
          .selectFrom("spacepotatis.save_snapshots")
          .select(["payload", "created_at"])
          .where("player_id", "=", playerId)
          .where("slot", "=", 1)
          .orderBy("created_at", "desc")
          .limit(1)
          .executeTakeFirst(),
      { label: "GET /api/save:selectSnapshot" }
    );

    if (snapshotRow) {
      // Neon's Edge driver sometimes returns TIMESTAMPTZ as a string instead
      // of a Date — coerce defensively so we never crash on `.toISOString()`.
      const updatedAt =
        snapshotRow.created_at instanceof Date
          ? snapshotRow.created_at.toISOString()
          : String(snapshotRow.created_at);
      // Spread the persisted payload into the response so the wire shape
      // stays stable. The save round-trip (toSnapshot → hydrate) consumes
      // the same fields regardless of which table provided them.
      return NextResponse.json({ ...snapshotRow.payload, updatedAt });
    }

    // Transitional fallback: pre-v1 saves only exist in save_games. The
    // first POST after v2 deploy will write a snapshot row; subsequent GETs
    // take the fast path above. This branch is removable once the operator
    // confirms every active player has saved at least once post-v2.
    const row = await withNeonRetry(
      () =>
        db
          .selectFrom("spacepotatis.save_games")
          .selectAll()
          .where("player_id", "=", playerId)
          .where("slot", "=", 1)
          .executeTakeFirst(),
      { label: "GET /api/save:selectFallback" }
    );

    if (!row) return NextResponse.json(null);

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

  // Reject oversize bodies BEFORE request.json() allocates them in Edge memory.
  // Content-Length is best-effort — chunked uploads omit it, in which case we
  // fall through to Zod, whose `.max()` array bounds (SEC-011) catch the same
  // amplification class once the body is parsed.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
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

  // Wrap the whole transaction in withNeonRetry. Safety reasoning — each
  // bullet here is load-bearing. A future "simplification" that removes
  // the wrapper without re-checking these would re-introduce the user-
  // visible 500 we're masking, so DO NOT remove without re-validating:
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

      // Runtime-filter prev completed_missions against the current MISSION_IDS
      // catalog. A legacy row containing a removed/renamed mission id would
      // otherwise slip past Zod (which only validates the BODY) into
      // validateNoRegression's setDifference and false-positive-reject a
      // legitimate save. The removed id is no longer trackable, so it
      // shouldn't gate persistence — and deriveCapInputMissions / the cap
      // computation walk a known-mission set, so anything not in MISSION_IDS
      // would be silently ignored downstream anyway.
      const knownMissionIds = MISSION_IDS as readonly string[];
      const knownPrevMissions: readonly MissionId[] =
        prevRow && Array.isArray(prevRow.completed_missions)
          ? prevRow.completed_missions.filter(
              (m): m is MissionId =>
                typeof m === "string" && knownMissionIds.includes(m)
            )
          : [];
      const knownPrevUnlocks: readonly MissionId[] =
        prevRow && Array.isArray(prevRow.unlocked_planets)
          ? prevRow.unlocked_planets.filter(
              (m): m is MissionId =>
                typeof m === "string" && knownMissionIds.includes(m)
            )
          : [];

      const prev = prevRow
        ? {
            credits: prevRow.credits,
            playedTimeSeconds: prevRow.played_time_seconds,
            completedMissionsCount: knownPrevMissions.length
          }
        : null;

      // Save-state regression guard. Catches the wipe pattern where a buggy
      // client POSTs INITIAL_STATE on top of an existing save (credits=0,
      // completedMissions=[], playtime=0). The cheat-delta guards below only
      // catch INFLATION, not regression — this is the matching defense.
      const prevSeenStoryEntries: readonly string[] =
        prevRow && Array.isArray(prevRow.seen_story_entries)
          ? prevRow.seen_story_entries.filter(
              (s): s is string => typeof s === "string"
            )
          : [];
      const prevForRegression = prevRow
        ? {
            playedTimeSeconds: prevRow.played_time_seconds,
            completedMissions: knownPrevMissions,
            unlockedPlanets: knownPrevUnlocks,
            seenStoryEntries: prevSeenStoryEntries
          }
        : null;
      const nextSeenStoryEntries = Array.isArray(body.seenStoryEntries)
        ? body.seenStoryEntries
        : [];
      const regressionResult = validateNoRegression({
        prev: prevForRegression,
        next: {
          playedTimeSeconds,
          completedMissions,
          unlockedPlanets,
          seenStoryEntries: nextSeenStoryEntries
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
      const capInputMissions = deriveCapInputMissions(
        knownPrevMissions,
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

      // SECURITY-CRITICAL: SEC-027 unlock check trusts server-derived state, NOT body.unlockedSolarSystems (mirrors SEC-017's deriveCapInputMissions pattern)
      // SEC-027 — reject a save that parks the player in a solar system they
      // haven't unlocked. Impact is UI-cosmetic only (galaxy opens at the wrong
      // system), but the schema validates shape-not-state; this closes the gap.
      // The field is optional — absent means "no preference" and is always fine.
      //
      // The unlocked-systems set is DERIVED server-side from
      // `capInputMissions` — the SEC-017 trust set built from
      // `prevRow.completed_missions` plus any submitted missions whose
      // prereqs are grounded in prev (same set the credits cap uses). The
      // body's `unlockedSolarSystems` field is IGNORED here; an attacker
      // can forge that list, so it must not participate in the guard. The
      // field stays on SavePayloadSchema for backwards wire compatibility
      // (older clients serialize the snapshot field-for-field) but the
      // guard reads `capInputMissions`.
      const incomingSystemId = body.currentSolarSystemId;
      if (incomingSystemId !== undefined) {
        const serverDerivedUnlocked = deriveUnlockedSolarSystems(capInputMissions);
        if (!serverDerivedUnlocked.has(incomingSystemId)) {
          console.warn(
            "[/api/save] solar_system_not_unlocked",
            playerId,
            incomingSystemId
          );
          return {
            kind: "reject",
            status: 422,
            error: "solar_system_not_unlocked",
            message: `currentSolarSystemId "${incomingSystemId}" is not in server-derived unlocked systems`,
            prevSnapshot
          };
        }
      }

      // Snapshot serialization sends the ship under `ship`; the legacy /api
      // contract calls it `shipConfig`. Accept both, prefer the explicit one.
      // The Zod-typed value flows straight through to Kysely — no widening
      // `as Record<string, unknown>` cast at the DB boundary (CLAUDE.md §9:
      // "no `as` casts at the network edge"). The `ship_config` column in
      // Database (src/lib/db.ts) is typed Record<string, unknown>; Kysely
      // accepts the Zod-narrowed object via structural compatibility.
      const shipPayload = body.shipConfig ?? body.ship ?? {};

      const seenStoryEntries = Array.isArray(body.seenStoryEntries) ? body.seenStoryEntries : [];
      const currentSolarSystemId = body.currentSolarSystemId ?? null;

      const upsertResult = await trx
        .insertInto("spacepotatis.save_games")
        .values({
          player_id: playerId,
          slot: 1,
          credits,
          current_planet: body.currentPlanet ?? null,
          ship_config: shipPayload,
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

      // Defend against the wipe-class shape where the upsert silently no-ops.
      // Kysely returns InsertResult[] with bigint numInsertedOrUpdatedRows;
      // PostgreSQL reports the affected row count for both INSERT and the
      // DO UPDATE branch. Throwing inside the transaction triggers the auto-
      // ROLLBACK and surfaces as a permanent server error (programmer bug or
      // schema drift, not a transient flake).
      const upsertRows = upsertResult[0]?.numInsertedOrUpdatedRows;
      if (upsertRows === undefined || upsertRows <= 0n) {
        throw new RangeError(
          `save_games upsert affected 0 rows (player_id=${playerId}, slot=1)`
        );
      }

      // Build the new-state JSON payload while the field values are in scope.
      // Same shape as the GET /api/save response, less `updatedAt` (re-derived
      // from save_snapshots.created_at on the read side now that v2 cutover
      // makes save_snapshots the authoritative read source).
      const newSnapshot: Record<string, unknown> = {
        slot: 1,
        credits,
        currentPlanet: body.currentPlanet ?? null,
        shipConfig: shipPayload,
        completedMissions,
        unlockedPlanets,
        playedTimeSeconds,
        seenStoryEntries,
        currentSolarSystemId
      };

      // INVARIANT: save_snapshots INSERT commits atomically with save_games (v2 read-cutover)
      // v2 promotion: the snapshot INSERT moved INSIDE the transaction so it
      // commits atomically with save_games. The v1 best-effort path would let
      // GET read a stale snapshot if the INSERT silently failed (snapshot
      // missing the latest state, save_games ahead). Now both write together
      // or neither does — the tx auto-rollbacks on any throw, and
      // withNeonRetry around the whole tx replays both writes on transient
      // flakes (BIGSERIAL PK + ON CONFLICT-less INSERT means a duplicate row
      // from "first commit silently succeeded then driver raised" is harmless
      // — one extra forensic row, never a corrupted current state).
      const snapshotResult = await trx
        .insertInto("spacepotatis.save_snapshots")
        .values({
          player_id: playerId,
          slot: 1,
          payload: newSnapshot,
          source: "post_api_save"
        })
        .execute();

      // The snapshot insert has no ON CONFLICT clause — it MUST land exactly
      // one row or the atomic dual-write contract (v2) is broken. A 0-row
      // result here would mean save_games committed without a matching
      // history row, which is the wipe-class shape we're guarding against.
      const snapshotRows = snapshotResult[0]?.numInsertedOrUpdatedRows;
      if (snapshotRows === undefined || snapshotRows <= 0n) {
        throw new RangeError(
          `save_snapshots insert affected 0 rows (player_id=${playerId}, slot=1)`
        );
      }

      return { kind: "ok", prevSnapshot };
      }),
      { label: "POST /api/save:transaction" }
    );
  } catch (err) {
    console.error("POST /api/save failed:", err);
    // Distinguish transient (DB unreachable, Neon retry exhausted, unknown)
    // from permanent (Zod / programmer bug / schema mismatch). saveQueue.ts
    // treats `server_error` as transient (keeps retrying) and
    // `server_error_permanent` as a drop signal — without this split, a
    // bug that throws on every request would spin the queue forever.
    const permanent = isPermanentError(err);
    const responseError = permanent ? "server_error_permanent" : "server_error";
    // Best-effort audit on the transaction-level failure path. We don't have
    // a prevSnapshot here (the SELECT itself or the upsert may have thrown);
    // record the attempt with prev_snapshot = null so the row still lands.
    await writeSaveAudit(db, {
      playerId,
      requestPayload,
      responseStatus: 500,
      responseError,
      prevSnapshot: null,
      requestIp,
      userAgent
    });
    return NextResponse.json({ error: responseError }, { status: 500 });
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

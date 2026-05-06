import { sql } from "kysely";
import { getDb } from "./db";

// Resolve the signed-in email to a `players.id`, inserting a new row on first
// sight. Idempotent — safe to call on every save / score submission.
//
// SEC-018: rewritten as a single INSERT ... ON CONFLICT round-trip.
// The prior SELECT-then-INSERT pattern caused two concurrent first-visit
// requests for a brand-new email to both miss the SELECT, both attempt an
// INSERT, and the second hit a unique-constraint violation (500). Postgres
// serializes concurrent INSERTs via the unique index on `email`, so both
// calls collapse to one insert + one no-op upsert and both return the same id.
export async function upsertPlayerId(email: string, name: string | null): Promise<string> {
  const db = getDb();
  const row = await db
    .insertInto("spacepotatis.players")
    .values({ email, name })
    .onConflict((oc) =>
      oc.column("email").doUpdateSet({ name: sql`EXCLUDED.name` })
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

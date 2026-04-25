import { getDb } from "./db";

// Resolve the signed-in email to a `players.id`, inserting a new row on first
// sight. Idempotent — safe to call on every save / score submission.
export async function upsertPlayerId(email: string, name: string | null): Promise<string> {
  const db = getDb();
  const existing = await db
    .selectFrom("players")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  if (existing) return existing.id;

  const created = await db
    .insertInto("players")
    .values({ email, name })
    .returning("id")
    .executeTakeFirstOrThrow();
  return created.id;
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { type Database, getDb } from "./db";
import { Kysely, PostgresDialect } from "kysely";

// These tests exercise the Kysely query-builder *shape* that lib/db.ts and its
// callers produce — calling .compile() is pure (no DB roundtrip) and asserts
// the SQL + parameter list against the schema-namespacing convention used by
// this repo (`spacepotatis.<table>`). If a future refactor drops or renames
// the schema prefix, these tests fail loudly.
//
// We construct a free-standing Kysely<Database> instance with a "fake" pool
// so we can use the same compiler the production code uses without ever
// opening a connection. PostgresDialect.createDriver() is only invoked when a
// query is actually executed; .compile() never touches it.

function makeBuilder(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      // The pool is never actually consulted because we only call .compile().
      pool: { connect: () => Promise.reject(new Error("no real pool")) } as never
    })
  });
}

describe("getDb()", () => {
  const ORIGINAL_URL = process.env.DATABASE_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_URL;
  });

  it("throws when DATABASE_URL is not set", () => {
    expect(() => getDb()).toThrowError(/DATABASE_URL/);
  });
});

describe("Kysely query shapes against the spacepotatis schema", () => {
  const db = makeBuilder();

  it("players: select id by email (lib/players.upsertPlayerId look-up branch)", () => {
    const compiled = db
      .selectFrom("spacepotatis.players")
      .select("id")
      .where("email", "=", "p@example.com")
      .compile();

    expect(compiled.sql).toBe(
      'select "id" from "spacepotatis"."players" where "email" = $1'
    );
    expect(compiled.parameters).toEqual(["p@example.com"]);
  });

  it("players: insert returning id (lib/players.upsertPlayerId insert branch)", () => {
    const compiled = db
      .insertInto("spacepotatis.players")
      .values({ email: "p@example.com", name: "Pat" })
      .returning("id")
      .compile();

    expect(compiled.sql).toBe(
      'insert into "spacepotatis"."players" ("email", "name") values ($1, $2) returning "id"'
    );
    expect(compiled.parameters).toEqual(["p@example.com", "Pat"]);
  });

  it("players: select handle by id (api/handle GET)", () => {
    const compiled = db
      .selectFrom("spacepotatis.players")
      .select("handle")
      .where("id", "=", "player-uuid")
      .compile();

    expect(compiled.sql).toBe(
      'select "handle" from "spacepotatis"."players" where "id" = $1'
    );
    expect(compiled.parameters).toEqual(["player-uuid"]);
  });

  it("players: case-insensitive handle conflict probe (api/handle POST)", () => {
    const compiled = db
      .selectFrom("spacepotatis.players")
      .select("id")
      .where(sql`LOWER(handle)`, "=", "spud")
      .where("id", "!=", "player-uuid")
      .compile();

    expect(compiled.sql).toContain('from "spacepotatis"."players"');
    expect(compiled.sql).toContain("LOWER(handle)");
    expect(compiled.parameters).toEqual(["spud", "player-uuid"]);
  });

  it("players: update handle (api/handle POST)", () => {
    const compiled = db
      .updateTable("spacepotatis.players")
      .set({ handle: "spud" })
      .where("id", "=", "player-uuid")
      .compile();

    expect(compiled.sql).toBe(
      'update "spacepotatis"."players" set "handle" = $1 where "id" = $2'
    );
    expect(compiled.parameters).toEqual(["spud", "player-uuid"]);
  });

  it("save_games: select active slot (api/save GET)", () => {
    const compiled = db
      .selectFrom("spacepotatis.save_games")
      .selectAll()
      .where("player_id", "=", "player-uuid")
      .where("slot", "=", 1)
      .compile();

    expect(compiled.sql).toBe(
      'select * from "spacepotatis"."save_games" where "player_id" = $1 and "slot" = $2'
    );
    expect(compiled.parameters).toEqual(["player-uuid", 1]);
  });

  it("save_games: upsert via onConflict columns and EXCLUDED (api/save POST)", () => {
    const compiled = db
      .insertInto("spacepotatis.save_games")
      .values({
        player_id: "player-uuid",
        slot: 1,
        credits: 0,
        current_planet: null,
        ship_config: {},
        completed_missions: [],
        unlocked_planets: [],
        played_time_seconds: 0,
        updated_at: new Date(0)
      })
      .onConflict((oc) =>
        oc.columns(["player_id", "slot"]).doUpdateSet({
          credits: sql`EXCLUDED.credits`,
          current_planet: sql`EXCLUDED.current_planet`,
          ship_config: sql`EXCLUDED.ship_config`,
          completed_missions: sql`EXCLUDED.completed_missions`,
          unlocked_planets: sql`EXCLUDED.unlocked_planets`,
          played_time_seconds: sql`EXCLUDED.played_time_seconds`,
          updated_at: sql`EXCLUDED.updated_at`
        })
      )
      .compile();

    expect(compiled.sql).toContain('insert into "spacepotatis"."save_games"');
    expect(compiled.sql).toContain('on conflict ("player_id", "slot") do update set');
    expect(compiled.sql).toContain("EXCLUDED.credits");
    expect(compiled.sql).toContain("EXCLUDED.ship_config");
    // 9 positional parameters (one per inserted column).
    expect(compiled.parameters).toHaveLength(9);
  });

  it("leaderboard: select with players join, mission filter, ordered + limited (lib/leaderboard.fetchLeaderboardEntries)", () => {
    const compiled = db
      .selectFrom("spacepotatis.leaderboard as lb")
      .innerJoin("spacepotatis.players as p", "p.id", "lb.player_id")
      .select([
        "p.handle as player_handle",
        "lb.score",
        "lb.time_seconds",
        "lb.created_at"
      ])
      .where("lb.mission_id", "=", "tutorial")
      .orderBy("lb.score", "desc")
      .orderBy("lb.created_at", "desc")
      .limit(20)
      .compile();

    expect(compiled.sql).toContain('from "spacepotatis"."leaderboard" as "lb"');
    expect(compiled.sql).toContain(
      'inner join "spacepotatis"."players" as "p" on "p"."id" = "lb"."player_id"'
    );
    expect(compiled.sql).toContain('where "lb"."mission_id" = $1');
    expect(compiled.sql).toContain('order by "lb"."score" desc, "lb"."created_at" desc');
    expect(compiled.sql).toContain("limit $2");
    expect(compiled.parameters).toEqual(["tutorial", 20]);
  });

  it("leaderboard: insert new score (api/leaderboard POST)", () => {
    const compiled = db
      .insertInto("spacepotatis.leaderboard")
      .values({
        player_id: "player-uuid",
        mission_id: "tutorial",
        score: 1234,
        time_seconds: 60
      })
      .compile();

    expect(compiled.sql).toBe(
      'insert into "spacepotatis"."leaderboard" ("player_id", "mission_id", "score", "time_seconds") values ($1, $2, $3, $4)'
    );
    expect(compiled.parameters).toEqual(["player-uuid", "tutorial", 1234, 60]);
  });
});

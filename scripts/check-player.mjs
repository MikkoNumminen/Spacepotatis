// Read-only check of one player's save row + leaderboard entries. Used to
// diagnose "I won but my score isn't on the board" — confirms whether the
// server's stored completed_missions actually has the mission, which is
// what /api/leaderboard's mission-completion guard checks against.
//
// Usage: node --env-file=.env.local scripts/check-player.mjs <email>
import { Pool } from "@neondatabase/serverless";

const email = process.argv[2];
if (!email) {
  console.error("usage: check-player.mjs <email>");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

try {
  const { rows: players } = await pool.query(
    "SELECT id, email, name, handle, created_at FROM spacepotatis.players WHERE email = $1",
    [email]
  );
  if (players.length === 0) {
    console.log(`no player with email ${email}`);
    process.exit(0);
  }
  const player = players[0];
  console.log("player:", player);

  const { rows: saves } = await pool.query(
    `SELECT slot, credits, completed_missions, unlocked_planets,
            played_time_seconds, updated_at, seen_story_entries
     FROM spacepotatis.save_games WHERE player_id = $1`,
    [player.id]
  );
  console.log("\nsave rows:", saves.length);
  for (const s of saves) {
    console.log("  slot", s.slot);
    console.log("    credits:", s.credits);
    console.log("    completed:", s.completed_missions);
    console.log("    unlocked:", s.unlocked_planets);
    console.log("    playtime:", s.played_time_seconds);
    console.log("    updated_at:", s.updated_at);
    console.log("    seen_story_entries:", s.seen_story_entries);
  }

  const { rows: scores } = await pool.query(
    `SELECT mission_id, score, time_seconds, created_at
     FROM spacepotatis.leaderboard WHERE player_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [player.id]
  );
  console.log("\nleaderboard rows:", scores.length);
  for (const r of scores) {
    console.log(
      `  ${r.created_at.toISOString?.() ?? r.created_at}  ${r.mission_id}  score=${r.score}  time=${r.time_seconds}s`
    );
  }
} finally {
  await pool.end();
}

// One-off restore for the 2026-05-02 wipe. Restores spacepotatis.save_games
// for the given email to a conservative reconstruction derived from the
// player's surviving leaderboard rows.
//
// What this CAN restore (verified from leaderboard history):
//   - completed_missions: every mission with a leaderboard score implies
//     it was cleared
//   - unlocked_planets: derived from completions + INITIAL_UNLOCKED
//
// What this CANNOT recover (the wiped POST overwrote them, and Postgres
// has no per-row history without Neon PITR):
//   - exact credits (set to a generous compensation amount)
//   - exact playtime (set to a conservative starting value)
//   - ship_config (left as default; player rebuilds via shop)
//
// Usage: node --env-file=.env.local scripts/restore-player.mjs <email>
//
// Idempotent: re-running with the same email re-applies the same values.
// The new server-side regression guard (PR #94) will accept the write
// because the prevRow is the empty wipe state.

import { Pool } from "@neondatabase/serverless";

const email = process.argv[2];
if (!email) {
  console.error("usage: restore-player.mjs <email>");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

// Compensation for the lost ship_config + actual-credits value. The player
// lost weapons, upgrades, reactor levels, and augments — none of which are
// derivable. 10000 credits is enough to re-buy a couple of weapons + a slot
// upgrade + some upgrades. Generous but not absurd; the credits-delta guard
// scales caps off completedMissions so future earned credits are bounded
// normally from this baseline.
const RESTORE_CREDITS = 10000;
const RESTORE_PLAYTIME = 1800; // 30 minutes — conservative starting point
const RESTORE_COMPLETED = ["tutorial", "combat-1", "boss-1", "pirate-beacon"];
// Derived: INITIAL_UNLOCKED ('tutorial', 'shop', 'market', 'pirate-beacon',
// 'tubernovae-outpost') + every completed mission + everything the
// completion chain unlocks (combat-1's clear unlocks boss-1; pirate-beacon
// clear unlocks ember-run).
const RESTORE_UNLOCKED = [
  "tutorial",
  "combat-1",
  "boss-1",
  "shop",
  "market",
  "pirate-beacon",
  "tubernovae-outpost",
  "ember-run"
];

try {
  const { rows: players } = await pool.query(
    "SELECT id FROM spacepotatis.players WHERE email = $1",
    [email]
  );
  if (players.length === 0) {
    console.error(`no player with email ${email}`);
    process.exit(1);
  }
  const playerId = players[0].id;
  console.log(`player_id: ${playerId}`);

  // Show before state for the audit trail.
  const before = await pool.query(
    `SELECT credits, completed_missions, unlocked_planets, played_time_seconds, updated_at
     FROM spacepotatis.save_games WHERE player_id = $1 AND slot = 1`,
    [playerId]
  );
  console.log("\nBEFORE:", before.rows[0]);

  const result = await pool.query(
    `UPDATE spacepotatis.save_games
     SET credits = $1,
         completed_missions = $2,
         unlocked_planets = $3,
         played_time_seconds = $4,
         updated_at = NOW()
     WHERE player_id = $5 AND slot = 1
     RETURNING credits, completed_missions, unlocked_planets, played_time_seconds, updated_at`,
    [
      RESTORE_CREDITS,
      RESTORE_COMPLETED,
      RESTORE_UNLOCKED,
      RESTORE_PLAYTIME,
      playerId
    ]
  );
  console.log("\nAFTER:", result.rows[0]);

  if (result.rowCount !== 1) {
    console.error(`expected 1 row updated, got ${result.rowCount}`);
    process.exit(1);
  }
  console.log("\nrestore complete");
} finally {
  await pool.end();
}

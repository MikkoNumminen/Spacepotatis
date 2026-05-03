// Second-pass restore that fills in the ship_config gap left by the first
// restore-player.mjs run. The first pass set credits + completed_missions +
// unlocked_planets + playtime but left ship_config at the wipe-default
// (starter weapon, single slot, no upgrades). A player who cleared boss-1
// and pirate-beacon would have had a real loadout; rebuilding from
// scratch on top of the wipe was the wrong call.
//
// What this changes vs. the first pass:
//   - credits: 10000 → 15000 (closer to leaderboard-derived earnings minus
//     plausible shop spend)
//   - ship_config: default → mid-tier Tubernovae-ready loadout matching
//     the player's actual progression (3 slots, three weapons, reactor +
//     shield + armor upgrades, one augment in inventory)
//
// Idempotent: re-running with the same email re-applies the same values.
// Direct DB write — bypasses /api/save and the regression guard. Be
// careful.
//
// Usage: node --env-file=.env.local scripts/improve-restore.mjs <email>

import { Pool } from "@neondatabase/serverless";
import path from "node:path";
import { writeBackup } from "./_lib/dbWriteSafety.mjs";

// Absolute path to <repo>/db-backups, resolved from this script's directory
// rather than process.cwd(). Operators running from a subdirectory still
// land snapshots in the same gitignored location.
const BACKUP_DIR = path.resolve(import.meta.dirname, "../db-backups");

const email = process.argv[2];
if (!email) {
  console.error("usage: improve-restore.mjs <email>");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

// 15000 credits = leaderboard-derived earnings (~16K total credits earned
// from kill rewards summed across 29 mission runs) minus a plausible shop
// spend (~5K on slots + weapons + upgrades). Generous-but-fair.
const CREDITS = 15000;

// Pre-built mid-tier loadout. Three slots, three weapons covering crowd
// clear (spread-shot), single-target (heavy-cannon), and steady DPS
// (rapid-fire) — what a boss-1 + pirate-beacon clear-tier player would
// realistically be running. Levels 2-3 reflect the upgrades they'd have
// bought along the way.
const SHIP_CONFIG = {
  slots: [
    { id: "rapid-fire", level: 3, augments: [] },
    { id: "heavy-cannon", level: 2, augments: [] },
    { id: "spread-shot", level: 2, augments: [] }
  ],
  inventory: [],
  augmentInventory: ["damage-up"],
  shieldLevel: 3,
  armorLevel: 3,
  reactor: { capacityLevel: 2, rechargeLevel: 2 }
};

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

  const before = await pool.query(
    `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
            ship_config, seen_story_entries, updated_at
     FROM spacepotatis.save_games
     WHERE player_id = $1 AND slot = 1`,
    [playerId]
  );
  if (before.rows.length === 0) {
    console.error(`no save_games row for player_id=${playerId} slot=1`);
    process.exit(1);
  }
  console.log("BEFORE credits:", before.rows[0].credits);
  console.log("BEFORE ship_config:", JSON.stringify(before.rows[0].ship_config));

  // Capture the prevRow as a JSON snapshot BEFORE the UPDATE. If this throws
  // (disk full, permission denied), bail out — running the UPDATE without a
  // recoverable snapshot defeats the purpose of the safety helper.
  try {
    const backupPath = await writeBackup({
      prevRow: { ...before.rows[0], player_id: playerId, email },
      scriptName: "improve-restore",
      flags: { email, backupDir: BACKUP_DIR },
    });
    console.log(`prevRow snapshot: ${backupPath}`);
  } catch (backupErr) {
    console.error(
      `error: writeBackup failed (${backupErr.message}) — refusing to UPDATE without a recoverable snapshot.`
    );
    process.exit(1);
  }

  const result = await pool.query(
    `UPDATE spacepotatis.save_games
     SET credits = $1,
         ship_config = $2,
         updated_at = NOW()
     WHERE player_id = $3 AND slot = 1
     RETURNING credits, ship_config`,
    [CREDITS, SHIP_CONFIG, playerId]
  );
  console.log("\nAFTER credits:", result.rows[0]?.credits);
  console.log("AFTER ship_config:", JSON.stringify(result.rows[0]?.ship_config, null, 2));

  if (result.rowCount !== 1) {
    console.error(`expected 1 row updated, got ${result.rowCount}`);
    process.exit(1);
  }
  console.log("\nimprove-restore complete");
} finally {
  await pool.end();
}

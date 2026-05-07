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
// SAFETY CONTRACT (mirrors restore-player.mjs):
//   1. Default mode is dry-run. You must pass --confirm to write anything.
//   2. --confirm requires --player-email=<email> matching the positional email.
//   3. Full BEFORE/AFTER diff is printed in BOTH modes.
//   4. The UPDATE runs inside a BEGIN … COMMIT transaction; the BEFORE row is
//      read with SELECT … FOR UPDATE inside the same transaction so a concurrent
//      operator cannot race the read-then-write window (SEC-021).
//   5. writeBackup() runs INSIDE the transaction, AFTER the FOR UPDATE read,
//      BEFORE the UPDATE. If writeBackup throws, ROLLBACK + exit 1.
//   6. This header. If you're modifying the script, you've read this.
//
// USAGE
//   Dry run (default — safe, prints diff, exits 0):
//     node --env-file=.env.local scripts/improve-restore.mjs <email>
//
//   Apply (requires explicit --confirm + --player-email cross-check):
//     node --env-file=.env.local scripts/improve-restore.mjs <email> \
//       --confirm --player-email=<email>

import { Pool } from "@neondatabase/serverless";
import path from "node:path";
import { parseFlags, requireConfirm, writeBackup } from "./_lib/dbWriteSafety.mjs";

// Absolute path to <repo>/db-backups, resolved from this script's directory
// rather than process.cwd(). Operators running from a subdirectory still
// land snapshots in the same gitignored location.
const BACKUP_DIR = path.resolve(import.meta.dirname, "../db-backups");

const flags = parseFlags(process.argv);

// --player-email cross-check: when --confirm is requested, the operator must
// also pass --player-email=<email> matching the positional email. This mirrors
// restore-player.mjs:261-269 — a single transposed character in the positional
// arg must be caught before the DB opens.
if (flags.confirm) {
  const playerEmail = process.argv
    .slice(2)
    .find((a) => a.startsWith("--player-email="))
    ?.slice("--player-email=".length) ?? null;

  if (!playerEmail) {
    console.error(
      "\nrefusing: --confirm requires --player-email=<email> matching the positional email."
    );
    process.exit(2);
  }
  if (playerEmail !== flags.email) {
    console.error(
      `\nrefusing: --player-email (${playerEmail}) does not match positional email (${flags.email}).`
    );
    process.exit(2);
  }
  // Stash for later reference
  flags.playerEmail = playerEmail;
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
    [flags.email]
  );
  if (players.length === 0) {
    console.error(`no player with email ${flags.email}`);
    process.exit(1);
  }
  const playerId = players[0].id;

  // Dry-run path: pool-read without a transaction is fine — no write, no need
  // to lock the row.
  const beforeDry = await pool.query(
    `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
            ship_config, seen_story_entries, updated_at
     FROM spacepotatis.save_games
     WHERE player_id = $1 AND slot = 1`,
    [playerId]
  );
  if (beforeDry.rows.length === 0) {
    console.error(`no save_games row for player_id=${playerId} slot=1`);
    process.exit(1);
  }
  const beforeRow = beforeDry.rows[0];

  console.log("\n--- DIFF (BEFORE -> AFTER) ---");
  console.log("BEFORE credits:    ", beforeRow.credits);
  console.log("AFTER  credits:    ", CREDITS);
  console.log("BEFORE ship_config:", JSON.stringify(beforeRow.ship_config));
  console.log("AFTER  ship_config:", JSON.stringify(SHIP_CONFIG));
  console.log("--- END DIFF ---\n");

  // Gate: if dry-run (--confirm not passed), print the diff and exit 0.
  requireConfirm(flags);

  // --confirm path: open a dedicated client for BEGIN/FOR UPDATE/COMMIT.
  const client = await pool.connect();
  let txOpen = false;
  try {
    await client.query("BEGIN");
    txOpen = true;

    const beforeRes = await client.query(
      `SELECT credits, completed_missions, unlocked_planets, played_time_seconds,
              ship_config, seen_story_entries, updated_at
       FROM spacepotatis.save_games
       WHERE player_id = $1 AND slot = 1
       FOR UPDATE`,
      [playerId]
    );
    if (beforeRes.rows.length === 0) {
      await client.query("ROLLBACK");
      txOpen = false;
      console.error(`no save_games row for player_id=${playerId} slot=1`);
      process.exit(1);
    }
    const before = beforeRes.rows[0];
    console.log(
      `BEFORE (read at ${new Date().toISOString()}, row LOCKED FOR UPDATE):`
    );
    console.log(JSON.stringify(before, null, 2));

    // Capture the prevRow as a JSON snapshot BEFORE the UPDATE. If this throws
    // (disk full, permission denied), ROLLBACK and bail out — running the UPDATE
    // without a recoverable snapshot defeats the purpose of the safety helper.
    // SECURITY-CRITICAL: writeBackup must run BEFORE the destructive op (CLAUDE.md §15, INV-SCRIPT-1)
    try {
      const backupPath = await writeBackup({
        prevRow: { ...before, player_id: playerId, email: flags.email },
        scriptName: "improve-restore",
        flags: { email: flags.email, backupDir: BACKUP_DIR },
      });
      console.log(`prevRow snapshot: ${backupPath}`);
    } catch (backupErr) {
      await client.query("ROLLBACK");
      txOpen = false;
      console.error(
        `error: writeBackup failed (${backupErr.message}) — refusing to UPDATE without a recoverable snapshot.`
      );
      process.exit(1);
    }

    const result = await client.query(
      `UPDATE spacepotatis.save_games
       SET credits = $1,
           ship_config = $2,
           updated_at = NOW()
       WHERE player_id = $3 AND slot = 1
       RETURNING credits, ship_config`,
      [CREDITS, SHIP_CONFIG, playerId]
    );

    if (result.rowCount !== 1) {
      await client.query("ROLLBACK");
      txOpen = false;
      console.error(`expected 1 row updated, got ${result.rowCount} — rolled back`);
      process.exit(1);
    }

    await client.query("COMMIT");
    txOpen = false;

    console.log("\nAFTER credits:", result.rows[0]?.credits);
    console.log("AFTER ship_config:", JSON.stringify(result.rows[0]?.ship_config, null, 2));
    console.log("\nimprove-restore complete");
  } catch (err) {
    if (txOpen) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure — original error is what matters
      }
    }
    throw err;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
